/**
 * Pure logic for the Scheduled tasks page: drafts, draft↔payload conversion,
 * validation, trigger summaries, and curl-paste planning.
 *
 * Nothing here talks to the network. `curl` text is parsed by the backend
 * (`POST /automation/schedule/parse-curl`); this module only splits pasted text
 * tolerantly so a rejected command can be attributed to its own line, and merges
 * the backend's per-command answers back onto those lines.
 */

import {
  DEFAULT_TIMEOUT_MS,
  ID_PATTERN,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  RESPONSE_SNIPPET_LIMIT,
  isTriggerType,
  type BatchSkip,
  type CurlParseResult,
  type ScheduleGroup,
  type ScheduleGroupInput,
  type ScheduleRequest,
  type ScheduleTask,
  type ScheduleTaskInput,
  type ScheduleTrigger,
  type TriggerSource,
} from '@/services/api/scheduledTasks';

/** A localizable message: the component resolves `key` through i18n. */
export interface Message {
  key: string;
  params?: Record<string, string | number>;
}

export type DraftField =
  | 'id'
  | 'name'
  | 'description'
  | 'trigger'
  | 'method'
  | 'url'
  | 'headers'
  | 'form'
  | 'timeout'
  | 'body';

export interface DraftError {
  field: DraftField;
  key: string;
}

export type ParseFailure = { ok: false; key: string; detail?: string };

/* ------------------------------------------------------------------ drafts */

export type TriggerMode = 'none' | 'fixed_rate' | 'fixed_delay' | 'cron';
export type BodyMode = 'none' | 'body' | 'form';

export interface TriggerDraft {
  mode: TriggerMode;
  value: string;
}

export interface HeaderDraft {
  key: string;
  value: string;
}

export interface FormRowDraft {
  name: string;
  value: string;
}

export interface RequestDraft {
  method: string;
  url: string;
  headers: HeaderDraft[];
  bodyMode: BodyMode;
  body: string;
  form: FormRowDraft[];
  timeoutMs: string;
  followRedirects: boolean;
}

export interface TaskDraft {
  id: string;
  name: string;
  enabled: boolean;
  trigger: TriggerDraft;
  request: RequestDraft;
}

export interface GroupDraft {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: TriggerDraft;
  /** Carried through untouched: the group form never edits tasks. */
  tasks: ScheduleTaskInput[];
}

export const emptyTriggerDraft = (): TriggerDraft => ({ mode: 'none', value: '' });

export const emptyRequestDraft = (): RequestDraft => ({
  method: 'GET',
  url: '',
  headers: [],
  bodyMode: 'none',
  body: '',
  form: [],
  timeoutMs: String(DEFAULT_TIMEOUT_MS),
  followRedirects: false,
});

export function emptyTaskDraft(id = ''): TaskDraft {
  return {
    id,
    name: '',
    enabled: true,
    trigger: emptyTriggerDraft(),
    request: emptyRequestDraft(),
  };
}

export function emptyGroupDraft(): GroupDraft {
  return {
    id: '',
    name: '',
    description: '',
    enabled: true,
    trigger: emptyTriggerDraft(),
    tasks: [],
  };
}

export const triggerToDraft = (trigger: ScheduleTrigger | null): TriggerDraft =>
  trigger ? { mode: trigger.type, value: trigger.value } : emptyTriggerDraft();

export function draftToTrigger(draft: TriggerDraft): ScheduleTrigger | null {
  if (draft.mode === 'none') return null;
  return { type: draft.mode, value: draft.value.trim() };
}

export function requestToDraft(request: ScheduleRequest): RequestDraft {
  const form = request.form ?? [];
  const bodyMode: BodyMode = form.length > 0 ? 'form' : request.body.trim() ? 'body' : 'none';
  return {
    method: request.method || 'GET',
    url: request.url,
    headers: Object.entries(request.headers).map(([key, value]) => ({ key, value })),
    bodyMode,
    body: bodyMode === 'body' ? request.body : '',
    form: form.map((field) => ({ name: field.name, value: field.value })),
    timeoutMs: String(request.timeoutMs || DEFAULT_TIMEOUT_MS),
    followRedirects: request.followRedirects,
  };
}

export function taskDraftToInput(draft: TaskDraft): ScheduleTaskInput {
  const trimmedBody = draft.request.bodyMode === 'body' ? draft.request.body : '';
  const form = draft.request.bodyMode === 'form' ? draft.request.form : [];
  return {
    id: draft.id.trim(),
    name: draft.name.trim(),
    enabled: draft.enabled,
    schedule: draftToTrigger(draft.trigger),
    request: {
      method: draft.request.method.trim().toUpperCase(),
      url: draft.request.url.trim(),
      headers: Object.fromEntries(
        draft.request.headers
          .filter((header) => header.key.trim() !== '')
          .map((header) => [header.key.trim(), header.value])
      ),
      body: trimmedBody,
      form: form.map((field) => ({ name: field.name.trim(), value: field.value })),
      timeoutMs: parseTimeoutMs(draft.request.timeoutMs) ?? DEFAULT_TIMEOUT_MS,
      followRedirects: draft.request.followRedirects,
    },
  };
}

export function toTaskDraft(task: ScheduleTask | ScheduleTaskInput): TaskDraft {
  return {
    id: task.id,
    name: task.name,
    enabled: task.enabled,
    trigger: triggerToDraft(task.schedule),
    request: requestToDraft(task.request),
  };
}

export function toGroupDraft(group: ScheduleGroup): GroupDraft {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    enabled: group.enabled,
    trigger: triggerToDraft(group.schedule),
    tasks: group.tasks.map((task) => taskDraftToInput(toTaskDraft(task))),
  };
}

export function groupDraftToInput(draft: GroupDraft): ScheduleGroupInput {
  return {
    id: draft.id.trim(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    enabled: draft.enabled,
    schedule: draftToTrigger(draft.trigger),
    tasks: draft.tasks,
  };
}

/**
 * Replaces only what `curl` can express, so name, enabled state, timeout and
 * trigger survive a paste that came from the curl tab.
 */
export function applyCurlRequest(draft: TaskDraft, request: ScheduleRequest): TaskDraft {
  const parsed = requestToDraft(request);
  return {
    ...draft,
    request: {
      ...parsed,
      timeoutMs: draft.request.timeoutMs,
    },
  };
}

/* ------------------------------------------------------------------ validation */

const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const METHOD_TOKEN = /^[A-Za-z!#$%&'*+\-.^_`|~0-9]+$/;
const DURATION_UNITS: Record<string, number> = {
  ns: 1e-6,
  us: 1e-3,
  µs: 1e-3,
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
};

const CRON_BOUNDS: Array<[number, number]> = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

const MONTH_NAMES = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Milliseconds for a Go duration literal such as `1h30m`, or null when malformed. */
export function parseGoDuration(value: string): number | null {
  const text = value.trim();
  if (!text || text === '0') return text === '0' ? 0 : null;
  const token = /(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g;
  let total = 0;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(text)) !== null) {
    if (match.index !== cursor) return null;
    total += Number(match[1]) * DURATION_UNITS[match[2]];
    cursor = match.index + match[0].length;
  }
  return cursor === text.length ? total : null;
}

export function validateId(value: string): string | null {
  const text = value.trim();
  if (!text) return 'id_required';
  return ID_PATTERN.test(text) ? null : 'id_pattern';
}

export function validateName(value: string): string | null {
  const text = value.trim();
  if (!text) return 'name_required';
  return text.length > MAX_NAME_LENGTH ? 'name_too_long' : null;
}

export function validateUrl(value: string): string | null {
  const text = value.trim();
  if (!text) return 'url_required';
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return 'url_invalid';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'url_invalid';
  return parsed.hostname ? null : 'url_invalid';
}

export function validateMethod(value: string): string | null {
  const text = value.trim();
  if (!text) return 'method_required';
  return METHOD_TOKEN.test(text) ? null : 'method_invalid';
}

export function parseTimeoutMs(value: string): number | null {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return parsed >= MIN_TIMEOUT_MS && parsed <= MAX_TIMEOUT_MS ? parsed : null;
}

const cronTokenValue = (token: string, fieldIndex: number): number | null => {
  if (/^\d+$/.test(token)) return Number(token);
  const names = fieldIndex === 3 ? MONTH_NAMES : fieldIndex === 4 ? DAY_NAMES : null;
  if (!names) return null;
  const found = names.indexOf(token.toLowerCase());
  if (found < 0) return null;
  return fieldIndex === 3 ? found + 1 : found;
};

const cronItemValid = (item: string, fieldIndex: number): boolean => {
  const slash = item.split('/');
  if (slash.length > 2) return false;
  const [spec, step] = slash;
  if (step !== undefined && (!/^\d+$/.test(step) || Number(step) === 0)) return false;
  if (spec === '*') return true;
  const dash = spec.split('-');
  if (dash.length > 2) return false;
  const [low, high] = CRON_BOUNDS[fieldIndex];
  const start = cronTokenValue(dash[0], fieldIndex);
  if (start === null || start < low || start > high) return false;
  if (dash.length === 1) return true;
  const end = cronTokenValue(dash[1], fieldIndex);
  return end !== null && end >= start && end <= high;
};

/**
 * Five-field cron (`min hour dom month dow`), the grammar `internal/schedule/cron.go`
 * accepts: `*`, single values, `a-b` ranges, an optional `/n` step on any of
 * those, comma lists, and three-letter month/day names. Semantics (the Vixie
 * day-of-month OR day-of-week rule, DST) are the backend's.
 */
export function validateCron(value: string): string | null {
  const text = value.trim();
  if (!text) return 'required';
  const fields = text.split(/\s+/);
  if (fields.length !== 5) return 'field_count';
  for (let index = 0; index < 5; index += 1) {
    const items = fields[index].split(',');
    if (items.some((item) => item === '' || !cronItemValid(item, index))) return 'field';
  }
  return null;
}

export function validateTriggerDraft(draft: TriggerDraft): DraftError | null {
  if (draft.mode === 'none') return null;
  const value = draft.value.trim();
  if (!value) return { field: 'trigger', key: 'trigger_value_required' };
  if (draft.mode === 'cron') {
    const reason = validateCron(value);
    return reason ? { field: 'trigger', key: `cron_${reason}` } : null;
  }
  const ms = parseGoDuration(value);
  if (ms === null) return { field: 'trigger', key: 'duration_invalid' };
  return ms > 0 ? null : { field: 'trigger', key: 'duration_positive' };
}

export function validateHeaderDrafts(headers: HeaderDraft[]): DraftError | null {
  const seen = new Set<string>();
  for (const header of headers) {
    const key = header.key.trim();
    const value = header.value;
    if (!key && !value.trim()) continue;
    if (!HEADER_NAME.test(key)) return { field: 'headers', key: 'header_name_invalid' };
    if (/[\r\n]/.test(value)) return { field: 'headers', key: 'header_line_break' };
    const lower = key.toLowerCase();
    if (seen.has(lower)) return { field: 'headers', key: 'header_duplicate' };
    seen.add(lower);
  }
  return null;
}

function validateFormDrafts(form: FormRowDraft[]): DraftError | null {
  for (const field of form) {
    if (!field.name.trim() && !field.value.trim()) continue;
    if (!field.name.trim()) return { field: 'form', key: 'form_name_required' };
    if (/[\r\n]/.test(field.name)) return { field: 'form', key: 'form_name_invalid' };
  }
  return null;
}

export function validateRequestDraft(request: RequestDraft): DraftError | null {
  const method = validateMethod(request.method);
  if (method) return { field: 'method', key: method };
  const url = validateUrl(request.url);
  if (url) return { field: 'url', key: url };
  if (parseTimeoutMs(request.timeoutMs) === null) {
    return { field: 'timeout', key: 'timeout_range' };
  }
  return validateHeaderDrafts(request.headers) ?? validateFormDrafts(request.form);
}

export function validateTaskDraft(draft: TaskDraft): DraftError | null {
  const id = validateId(draft.id);
  if (id) return { field: 'id', key: id };
  const name = validateName(draft.name);
  if (name) return { field: 'name', key: name };
  const trigger = validateTriggerDraft(draft.trigger);
  if (trigger) return trigger;
  return validateRequestDraft(draft.request);
}

export function validateGroupDraft(draft: GroupDraft): DraftError | null {
  const id = validateId(draft.id);
  if (id) return { field: 'id', key: id };
  const name = validateName(draft.name);
  if (name) return { field: 'name', key: name };
  if (draft.description.trim().length > MAX_DESCRIPTION_LENGTH) {
    return { field: 'description', key: 'description_too_long' };
  }
  return validateTriggerDraft(draft.trigger);
}

/* ------------------------------------------------------------------ summaries */

export function triggerSummary(trigger: ScheduleTrigger | null): Message {
  if (!trigger) return { key: 'scheduled_tasks.trigger.none' };
  switch (trigger.type) {
    case 'fixed_rate':
      return {
        key: 'scheduled_tasks.trigger.fixed_rate',
        params: { value: trigger.value },
      };
    case 'fixed_delay':
      return {
        key: 'scheduled_tasks.trigger.fixed_delay',
        params: { value: trigger.value },
      };
    default:
      return { key: 'scheduled_tasks.trigger.cron', params: { value: trigger.value } };
  }
}

export function triggerSourceMessage(source: TriggerSource): Message {
  return { key: `scheduled_tasks.source.${source}` };
}

export function runStatusMessage(status: string): Message {
  const known = ['never', 'success', 'failed', 'skipped'];
  return known.includes(status)
    ? { key: `scheduled_tasks.runtime.status_${status}` }
    : { key: 'scheduled_tasks.runtime.status_other', params: { status } };
}

export function durationMessage(ms: number): Message {
  if (!Number.isFinite(ms) || ms <= 0) return { key: 'scheduled_tasks.runtime.duration_none' };
  if (ms < 1000)
    return { key: 'scheduled_tasks.runtime.duration_ms', params: { value: Math.round(ms) } };
  return {
    key: 'scheduled_tasks.runtime.duration_s',
    params: { value: Number((ms / 1000).toFixed(1)) },
  };
}

export const SNIPPET_PREVIEW_LENGTH = 240;

/** Collapses a response body to one line and marks whether it was cut short. */
export function snippetPreview(text: string): { preview: string; truncated: boolean } {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= SNIPPET_PREVIEW_LENGTH) {
    return { preview: collapsed, truncated: false };
  }
  return { preview: collapsed.slice(0, SNIPPET_PREVIEW_LENGTH), truncated: true };
}

export const isSnippetAtServerLimit = (text: string): boolean =>
  text.length >= RESPONSE_SNIPPET_LIMIT;

/* ------------------------------------------------------------------ curl import */

export interface CurlImportTask {
  index: number;
  command: string;
  name: string;
  draft: TaskDraft;
}

export interface CurlImportIssue {
  index: number;
  command: string;
  /** i18n suffix under `scheduled_tasks.import.reason`. */
  reason: 'empty' | 'rejected_by_server';
  /** Verbatim backend message, when the backend produced one. */
  serverMessage?: string;
}

export interface CurlImportPlan {
  commands: string[];
  tasks: CurlImportTask[];
  issues: CurlImportIssue[];
}

export interface CurlSkipReport {
  index: number;
  name: string;
  command: string;
  reason: string;
}

const startsNewCommand = (line: string): boolean => {
  const text = line.trimStart();
  if (!text) return false;
  const first = text.split(/\s+/)[0];
  return first === 'curl' || first.startsWith('curl-') || text.startsWith('%');
};

/**
 * Splits pasted terminal text into commands the way the backend parser does —
 * `;`, `&&`, or a new line that starts another `curl`/`%` invocation — while
 * tolerating blank lines and `\` continuations. Quotes protect separators.
 */
export function splitCurlCommands(text: string): string[] {
  const source = text.replace(/\r\n?/g, '\n');
  const commands: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  const flush = () => {
    const trimmed = current.trim().replace(/^%+\s*/, '');
    if (trimmed) commands.push(trimmed);
    current = '';
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      else if (char === '\\' && quote === '"') {
        current += source[index + 1] ?? '';
        index += 1;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === '\\' && source[index + 1] === '\n') {
      current += char + '\n';
      index += 1;
      continue;
    }
    if (char === ';') {
      flush();
      continue;
    }
    if (char === '&' && source[index + 1] === '&') {
      flush();
      index += 1;
      continue;
    }
    if (char === '\n') {
      const rest = source.slice(index + 1);
      const nextLine = rest.split('\n').find((line) => line.trim() !== '');
      if (nextLine === undefined || startsNewCommand(nextLine)) {
        flush();
        continue;
      }
      current += char;
      continue;
    }
    current += char;
  }
  flush();
  return commands;
}

/**
 * The backend splits on its own rules and cannot know the `%` marker some shells
 * prepend, so text containing one is re-emitted from the split commands.
 */
export function normalizeCurlBlob(text: string): string {
  const source = text.replace(/\r\n?/g, '\n');
  if (!/(^|\n)[ \t]*%/.test(source)) return source;
  return splitCurlCommands(source).join('\n\n');
}

const idSeed = (text: string): string => {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
};

/** Deterministic `t_…` id, unique against `taken` (the ids already in the group). */
export function nextTaskId(seed: string, taken: ReadonlySet<string>): string {
  const base = `t_${idSeed(seed)}`;
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

export function planCurlImport(
  blob: string,
  parsed: CurlParseResult,
  existingIds: readonly string[] = []
): CurlImportPlan {
  const commands = splitCurlCommands(blob);
  const issues: CurlImportIssue[] = parsed.errors.map((error) => ({
    index: error.index,
    command: commands[error.index] ?? '',
    reason: 'rejected_by_server',
    serverMessage: error.message,
  }));
  if (commands.length === 0) {
    issues.push({ index: 0, command: '', reason: 'empty' });
  }
  const taken = new Set(existingIds);
  const tasks = parsed.requests.map((entry, index) => {
    const id = nextTaskId(`${entry.request.url}|${entry.request.method}|${index}`, taken);
    taken.add(id);
    const name = (entry.name || entry.request.url || id).slice(0, MAX_NAME_LENGTH);
    const draft: TaskDraft = {
      id,
      name,
      enabled: true,
      trigger: emptyTriggerDraft(),
      request: requestToDraft(entry.request),
    };
    return { index, command: commands[index] ?? '', name, draft };
  });
  return { commands, tasks, issues };
}

/** Maps the batch endpoint's skipped indexes back onto the pasted commands. */
export function describeBatchSkips(plan: CurlImportPlan, skipped: BatchSkip[]): CurlSkipReport[] {
  return skipped.map((entry) => {
    const task = plan.tasks.find((candidate) => candidate.index === entry.index);
    return {
      index: entry.index,
      name: task?.name ?? '',
      command: task?.command ?? plan.commands[entry.index] ?? '',
      reason: entry.reason,
    };
  });
}

export const addedImportTasks = (plan: CurlImportPlan, skipped: BatchSkip[]): CurlImportTask[] => {
  const skippedIndexes = new Set(skipped.map((entry) => entry.index));
  return plan.tasks.filter((task) => !skippedIndexes.has(task.index));
};

/* ------------------------------------------------------------------ text views */

const shellQuote = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

/**
 * Renders the draft as one `curl` command, using only the flags the backend
 * parser accepts. `curl` cannot express name, enabled, timeout or trigger, so
 * those stay in the form tab (see the curl tab hint).
 */
export function draftToCurl(draft: TaskDraft): string {
  const input = taskDraftToInput(draft);
  const lines = [`curl -X ${input.request.method} ${shellQuote(input.request.url)}`];
  for (const [key, value] of Object.entries(input.request.headers)) {
    lines.push(`-H ${shellQuote(`${key}: ${value}`)}`);
  }
  if (input.request.body) lines.push(`--data-raw ${shellQuote(input.request.body)}`);
  if (input.request.form) {
    for (const field of input.request.form) {
      lines.push(`-F ${shellQuote(`${field.name}=${field.value}`)}`);
    }
  }
  if (input.request.followRedirects) lines.push('-L');
  if (lines.length === 1) return lines[0];
  return [lines[0], ...lines.slice(1).map((line) => `  ${line}`)].join(' \\\n');
}

export function taskDraftToJson(draft: TaskDraft): string {
  return JSON.stringify(taskDraftToInput(draft), null, 2);
}

function readTriggerJson(value: unknown): TriggerDraft | null {
  if (value === null || value === undefined) return emptyTriggerDraft();
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as { type?: unknown; value?: unknown };
  if (typeof record.type !== 'string' || !isTriggerType(record.type)) return null;
  if (typeof record.value !== 'string') return null;
  return { mode: record.type, value: record.value };
}

function readRequestJson(value: unknown): RequestDraft | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { method, url, headers, body, form, timeoutMs, followRedirects } = record;
  if (typeof method !== 'string' || typeof url !== 'string') return null;
  if (typeof body !== 'string' || typeof timeoutMs !== 'number') return null;
  if (typeof followRedirects !== 'boolean') return null;
  if (headers !== null && (typeof headers !== 'object' || Array.isArray(headers))) return null;
  const headerRows: HeaderDraft[] = [];
  for (const [key, headerValue] of Object.entries((headers ?? {}) as Record<string, unknown>)) {
    if (typeof headerValue !== 'string') return null;
    headerRows.push({ key, value: headerValue });
  }
  const formRows: FormRowDraft[] = [];
  if (form !== null) {
    if (!Array.isArray(form)) return null;
    for (const entry of form) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const field = entry as { name?: unknown; value?: unknown };
      if (typeof field.name !== 'string' || typeof field.value !== 'string') return null;
      formRows.push({ name: field.name, value: field.value });
    }
  }
  return {
    method,
    url,
    headers: headerRows,
    bodyMode: formRows.length > 0 ? 'form' : body.trim() ? 'body' : 'none',
    body,
    form: formRows,
    timeoutMs: String(timeoutMs),
    followRedirects,
  };
}

export type TaskDraftParse =
  { ok: true; value: TaskDraft } | { ok: false; key: string; detail?: string };

/**
 * Parses the JSON tab. The text uses the panel's camelCase model, so the tab
 * never exposes a raw backend field name; the API layer applies snake_case on save.
 */
export function taskDraftFromJson(text: string): TaskDraftParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      key: 'json_syntax',
      detail: error instanceof Error ? error.message : '',
    };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, key: 'json_shape' };
  }
  const record = raw as Record<string, unknown>;
  const trigger = readTriggerJson(record.schedule);
  if (trigger === null) return { ok: false, key: 'json_field', detail: 'schedule' };
  const request = readRequestJson(record.request);
  if (request === null) return { ok: false, key: 'json_field', detail: 'request' };
  const draft: TaskDraft = {
    id: typeof record.id === 'string' ? record.id : '',
    name: typeof record.name === 'string' ? record.name : '',
    enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
    trigger,
    request,
  };
  const invalid = validateTaskDraft(draft);
  if (invalid) return { ok: false, key: invalid.key };
  return { ok: true, value: draft };
}
