/**
 * Scheduled tasks domain API (`/v8/management/automation/schedule`).
 *
 * Every backend document is snake_case; reads normalize to camelCase and writes
 * serialize back, so raw backend field names never reach a component. Runtime
 * state (`runtime`) is read-only: it is dropped on write.
 */

import { isRecord } from '@/utils/helpers';
import { apiClient } from './client';

const SCHEDULE_BASE = '/automation/schedule';

const encodeId = (value: string): string => encodeURIComponent(value);

export const TRIGGER_TYPES = ['fixed_rate', 'fixed_delay', 'cron'] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const TRIGGER_SOURCES = ['group', 'task', 'none'] as const;
export type TriggerSource = (typeof TRIGGER_SOURCES)[number];

export const KNOWN_RUN_STATUSES = ['never', 'success', 'failed', 'skipped'] as const;
export type KnownRunStatus = (typeof KNOWN_RUN_STATUSES)[number];

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export const MIN_TIMEOUT_MS = 1;
export const MAX_TIMEOUT_MS = 600_000;
export const DEFAULT_TIMEOUT_MS = 30_000;
export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const MAX_NAME_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const RESPONSE_SNIPPET_LIMIT = 2048;

export interface ScheduleTrigger {
  type: TriggerType;
  value: string;
}

export interface FormField {
  name: string;
  value: string;
}

export interface ScheduleRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  form: FormField[] | null;
  timeoutMs: number;
  followRedirects: boolean;
}

export interface RunEntry {
  startedAt: string;
  finishedAt: string;
  status: string;
  statusCode: number;
  durationMs: number;
  error: string;
  responseSnippet: string;
}

export interface RuntimeSummary {
  scheduled: boolean;
  triggerSource: TriggerSource;
  nextRun: string;
  lastRun: string;
  lastStatus: string;
  lastStatusCode: number;
  lastDurationMs: number;
  lastError: string;
  runCount: number;
  failureCount: number;
  runs: RunEntry[];
}

export interface ScheduleTaskInput {
  id: string;
  name: string;
  enabled: boolean;
  schedule: ScheduleTrigger | null;
  request: ScheduleRequest;
}

export interface ScheduleTask extends ScheduleTaskInput {
  runtime: RuntimeSummary | null;
}

export interface ScheduleGroupInput {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  schedule: ScheduleTrigger | null;
  tasks: ScheduleTaskInput[];
}

export interface ScheduleGroup extends Omit<ScheduleGroupInput, 'tasks'> {
  tasks: ScheduleTask[];
  runtime: RuntimeSummary | null;
}

export interface ScheduleStatus {
  configured: boolean;
  dir: string;
  schedulerRunning: boolean;
  serverTime: string;
  groupCount: number;
  taskCount: number;
  enabledTaskCount: number;
}

export interface BatchSkip {
  index: number;
  reason: string;
}

export interface BatchAddResult {
  tasks: ScheduleTask[];
  skipped: BatchSkip[];
}

/** Body of a 400 from batch add, where every entry was skipped. */
export interface BatchRejection {
  message: string;
  skipped: BatchSkip[];
}

export interface ParsedCurlRequest {
  name: string;
  request: ScheduleRequest;
}

export interface CurlParseError {
  index: number;
  message: string;
}

export interface CurlParseResult {
  requests: ParsedCurlRequest[];
  errors: CurlParseError[];
}

/* ------------------------------------------------------------------ raw shapes */

interface RawTrigger {
  type?: unknown;
  value?: unknown;
}

interface RawFormField {
  name?: unknown;
  value?: unknown;
}

interface RawRequest {
  method?: unknown;
  url?: unknown;
  headers?: unknown;
  body?: unknown;
  form?: unknown;
  timeout_ms?: unknown;
  follow_redirects?: unknown;
}

interface RawRunEntry {
  started_at?: unknown;
  finished_at?: unknown;
  status?: unknown;
  status_code?: unknown;
  duration_ms?: unknown;
  error?: unknown;
  response_snippet?: unknown;
}

interface RawRuntime {
  scheduled?: unknown;
  trigger_source?: unknown;
  next_run?: unknown;
  last_run?: unknown;
  last_status?: unknown;
  last_status_code?: unknown;
  last_duration_ms?: unknown;
  last_error?: unknown;
  run_count?: unknown;
  failure_count?: unknown;
  runs?: unknown;
}

interface RawTask extends RawRequest {
  id?: unknown;
  name?: unknown;
  enabled?: unknown;
  schedule?: unknown;
  request?: unknown;
  runtime?: unknown;
}

interface RawGroup {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  enabled?: unknown;
  schedule?: unknown;
  tasks?: unknown;
  runtime?: unknown;
}

interface RawStatus {
  configured?: unknown;
  dir?: unknown;
  scheduler_running?: unknown;
  server_time?: unknown;
  group_count?: unknown;
  task_count?: unknown;
  enabled_task_count?: unknown;
}

/* ------------------------------------------------------------------ readers */

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const isTriggerType = (value: string): value is TriggerType =>
  (TRIGGER_TYPES as readonly string[]).includes(value);

export const isKnownRunStatus = (value: string): value is KnownRunStatus =>
  (KNOWN_RUN_STATUSES as readonly string[]).includes(value);

export const normalizeTriggerSource = (value: unknown): TriggerSource =>
  typeof value === 'string' && (TRIGGER_SOURCES as readonly string[]).includes(value)
    ? (value as TriggerSource)
    : 'none';

export function normalizeTrigger(value: unknown): ScheduleTrigger | null {
  if (!isRecord(value) || value.type === null || value.type === undefined) return null;
  const type = asString((value as RawTrigger).type);
  if (!isTriggerType(type)) return null;
  const raw = asString((value as RawTrigger).value);
  return { type, value: raw };
}

export function normalizeHeaders(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const headers: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') headers[key] = entry;
    else if (typeof entry === 'number' || typeof entry === 'boolean') headers[key] = String(entry);
  }
  return headers;
}

export function normalizeForm(value: unknown): FormField[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter(isRecord).map((entry) => ({
    name: asString((entry as RawFormField).name),
    value: asString((entry as RawFormField).value),
  }));
}

export function normalizeRequest(value: unknown): ScheduleRequest {
  const raw = isRecord(value) ? (value as RawRequest) : {};
  const method = asString(raw.method, 'GET').trim();
  const timeout = asNumber(raw.timeout_ms, DEFAULT_TIMEOUT_MS);
  return {
    method: method ? method.toUpperCase() : 'GET',
    url: asString(raw.url),
    headers: normalizeHeaders(raw.headers),
    body: asString(raw.body),
    form: normalizeForm(raw.form),
    timeoutMs: Math.round(timeout),
    followRedirects: asBoolean(raw.follow_redirects),
  };
}

export function normalizeRun(value: unknown): RunEntry {
  const raw = isRecord(value) ? (value as RawRunEntry) : {};
  return {
    startedAt: asString(raw.started_at),
    finishedAt: asString(raw.finished_at),
    status: asString(raw.status),
    statusCode: asNumber(raw.status_code),
    durationMs: asNumber(raw.duration_ms),
    error: asString(raw.error),
    responseSnippet: asString(raw.response_snippet).slice(0, RESPONSE_SNIPPET_LIMIT),
  };
}

export function normalizeRuntime(value: unknown): RuntimeSummary | null {
  if (!isRecord(value)) return null;
  const raw = value as RawRuntime;
  return {
    scheduled: asBoolean(raw.scheduled),
    triggerSource: normalizeTriggerSource(raw.trigger_source),
    nextRun: asString(raw.next_run),
    lastRun: asString(raw.last_run),
    lastStatus: asString(raw.last_status, 'never') || 'never',
    lastStatusCode: asNumber(raw.last_status_code),
    lastDurationMs: asNumber(raw.last_duration_ms),
    lastError: asString(raw.last_error),
    runCount: asNumber(raw.run_count),
    failureCount: asNumber(raw.failure_count),
    runs: asArray(raw.runs).map(normalizeRun),
  };
}

export function normalizeTask(value: unknown): ScheduleTask {
  const raw = isRecord(value) ? (value as RawTask) : {};
  return {
    id: asString(raw.id),
    name: asString(raw.name),
    enabled: asBoolean(raw.enabled, true),
    schedule: normalizeTrigger(raw.schedule),
    request: normalizeRequest(raw.request),
    runtime: normalizeRuntime(raw.runtime),
  };
}

export function normalizeGroup(value: unknown): ScheduleGroup {
  const raw = isRecord(value) ? (value as RawGroup) : {};
  return {
    id: asString(raw.id),
    name: asString(raw.name),
    description: asString(raw.description),
    enabled: asBoolean(raw.enabled, true),
    schedule: normalizeTrigger(raw.schedule),
    tasks: asArray(raw.tasks).map(normalizeTask),
    runtime: normalizeRuntime(raw.runtime),
  };
}

export function normalizeStatus(value: unknown): ScheduleStatus {
  const raw = isRecord(value) ? (value as RawStatus) : {};
  return {
    configured: asBoolean(raw.configured),
    dir: asString(raw.dir),
    schedulerRunning: asBoolean(raw.scheduler_running),
    serverTime: asString(raw.server_time),
    groupCount: asNumber(raw.group_count),
    taskCount: asNumber(raw.task_count),
    enabledTaskCount: asNumber(raw.enabled_task_count),
  };
}

export function normalizeBatchResult(value: unknown): BatchAddResult {
  const raw = isRecord(value) ? value : {};
  const skipped = asArray(raw.skipped)
    .filter(isRecord)
    .map((entry) => ({
      index: asNumber(entry.index, -1),
      reason: asString(entry.reason),
    }))
    .filter((entry) => entry.index >= 0);
  return { tasks: asArray(raw.tasks).map(normalizeTask), skipped };
}

export function normalizeCurlParse(value: unknown): CurlParseResult {
  const raw = isRecord(value) ? value : {};
  const requests = asArray(raw.requests)
    .filter(isRecord)
    .map((entry) => ({ name: asString(entry.name), request: normalizeRequest(entry.request) }));
  const errors = asArray(raw.errors)
    .filter(isRecord)
    .map((entry) => ({ index: asNumber(entry.index, -1), message: asString(entry.message) }))
    .filter((entry) => entry.index >= 0);
  return { requests, errors };
}

/* ------------------------------------------------------------------ writers */

export function serializeTrigger(trigger: ScheduleTrigger | null): RawTrigger | null {
  if (!trigger) return null;
  return { type: trigger.type, value: trigger.value };
}

export function serializeRequest(request: ScheduleRequest): RawRequest {
  return {
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: request.body,
    form: request.form && request.form.length > 0 ? request.form : null,
    timeout_ms: request.timeoutMs,
    follow_redirects: request.followRedirects,
  };
}

export function serializeTask(task: ScheduleTaskInput): RawTask {
  return {
    id: task.id,
    name: task.name,
    enabled: task.enabled,
    schedule: serializeTrigger(task.schedule),
    request: serializeRequest(task.request),
  };
}

export function serializeGroup(group: ScheduleGroupInput): RawGroup {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    enabled: group.enabled,
    schedule: serializeTrigger(group.schedule),
    tasks: group.tasks.map(serializeTask),
  };
}

/* ------------------------------------------------------------------ unwrapping */

const unwrap = (value: unknown, key: string): unknown =>
  isRecord(value) && key in value ? value[key] : value;

/** Batch add rejects the whole call when every entry was skipped; the reasons still arrive. */
export function batchRejection(error: unknown): BatchRejection | null {
  if (!isRecord(error)) return null;
  const details = isRecord(error.details) ? error.details : null;
  if (!details || !('skipped' in details)) return null;
  return {
    message: typeof details.error === 'string' ? details.error : '',
    skipped: normalizeBatchResult(details).skipped,
  };
}

/* ------------------------------------------------------------------ endpoints */

export const scheduledTasksApi = {
  async status(signal?: AbortSignal): Promise<ScheduleStatus> {
    return normalizeStatus(await apiClient.get<unknown>(`${SCHEDULE_BASE}/status`, { signal }));
  },

  async groups(signal?: AbortSignal): Promise<ScheduleGroup[]> {
    const data = await apiClient.get<unknown>(`${SCHEDULE_BASE}/groups`, { signal });
    const raw = isRecord(data) ? data.groups : null;
    return asArray(raw).map(normalizeGroup);
  },

  async group(id: string, signal?: AbortSignal): Promise<ScheduleGroup> {
    return normalizeGroup(
      unwrap(
        await apiClient.get<unknown>(`${SCHEDULE_BASE}/groups/${encodeId(id)}`, { signal }),
        'group'
      )
    );
  },

  async createGroup(group: ScheduleGroupInput): Promise<ScheduleGroup> {
    return normalizeGroup(
      unwrap(
        await apiClient.post<unknown>(`${SCHEDULE_BASE}/groups`, serializeGroup(group)),
        'group'
      )
    );
  },

  async updateGroup(id: string, group: ScheduleGroupInput): Promise<ScheduleGroup> {
    return normalizeGroup(
      unwrap(
        await apiClient.put<unknown>(
          `${SCHEDULE_BASE}/groups/${encodeId(id)}`,
          serializeGroup(group)
        ),
        'group'
      )
    );
  },

  async deleteGroup(id: string): Promise<boolean> {
    const data = await apiClient.delete<unknown>(`${SCHEDULE_BASE}/groups/${encodeId(id)}`);
    return isRecord(data) ? asBoolean(data.deleted, true) : true;
  },

  async addTasks(groupId: string, tasks: ScheduleTaskInput[]): Promise<BatchAddResult> {
    const data = await apiClient.post<unknown>(
      `${SCHEDULE_BASE}/groups/${encodeId(groupId)}/tasks`,
      { tasks: tasks.map(serializeTask) }
    );
    return normalizeBatchResult(data);
  },

  async updateTask(
    groupId: string,
    taskId: string,
    task: ScheduleTaskInput
  ): Promise<ScheduleTask> {
    const data = await apiClient.put<unknown>(
      `${SCHEDULE_BASE}/groups/${encodeId(groupId)}/tasks/${encodeId(taskId)}`,
      serializeTask(task)
    );
    return normalizeTask(unwrap(data, 'task'));
  },

  async deleteTask(groupId: string, taskId: string): Promise<boolean> {
    const data = await apiClient.delete<unknown>(
      `${SCHEDULE_BASE}/groups/${encodeId(groupId)}/tasks/${encodeId(taskId)}`
    );
    return isRecord(data) ? asBoolean(data.deleted, true) : true;
  },

  async runTask(groupId: string, taskId: string): Promise<RunEntry> {
    const data = await apiClient.post<unknown>(
      `${SCHEDULE_BASE}/groups/${encodeId(groupId)}/tasks/${encodeId(taskId)}/run`
    );
    return normalizeRun(isRecord(data) ? data.run : data);
  },

  async parseCurl(curl: string, signal?: AbortSignal): Promise<CurlParseResult> {
    return normalizeCurlParse(
      await apiClient.post<unknown>(`${SCHEDULE_BASE}/parse-curl`, { curl }, { signal })
    );
  },
};

export type ScheduledTasksApi = typeof scheduledTasksApi;
