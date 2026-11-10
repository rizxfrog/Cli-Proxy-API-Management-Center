// 定时任务页面：纯逻辑（草稿/校验/curl 拆分）、API 归一化与序列化、以及关键状态的服务端渲染。

import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import {
  batchRejection,
  normalizeCurlParse,
  normalizeGroup,
  normalizeRequest,
  normalizeStatus,
  normalizeTask,
  serializeGroup,
  serializeRequest,
  serializeTask,
  scheduledTasksApi,
} from '@/services/api/scheduledTasks';
import {
  ScheduledTasksView,
  type ScheduledTasksViewProps,
} from '@/features/scheduledTasks/ScheduledTasksPage';
import {
  addedImportTasks,
  applyCurlRequest,
  describeBatchSkips,
  draftToCurl,
  emptyGroupDraft,
  emptyTaskDraft,
  groupDraftToInput,
  nextTaskId,
  normalizeCurlBlob,
  parseGoDuration,
  parseTimeoutMs,
  planCurlImport,
  requestToDraft,
  snippetPreview,
  splitCurlCommands,
  taskDraftFromJson,
  taskDraftToInput,
  taskDraftToJson,
  toGroupDraft,
  toTaskDraft,
  triggerSummary,
  validateCron,
  validateGroupDraft,
  validateId,
  validateRequestDraft,
  validateTaskDraft,
  validateUrl,
  type TaskDraft,
} from '@/features/scheduledTasks/scheduleForm';
import { apiClient } from '@/services/api/client';
import en from '@/i18n/locales/en.json';

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en } } });

const noop = () => {};

const rawGroup = {
  id: 'daily-report',
  name: 'Daily report',
  description: 'Nightly exports',
  enabled: true,
  schedule: { type: 'cron', value: '0 9 * * *' },
  runtime: {
    scheduled: true,
    trigger_source: 'group',
    next_run: '2026-11-11T01:00:00Z',
    last_run: '2026-11-10T01:00:00Z',
    last_status: 'success',
    last_status_code: 200,
    last_duration_ms: 132,
    last_error: '',
    run_count: 4,
    failure_count: 1,
    runs: [
      {
        started_at: '2026-11-10T01:00:00Z',
        finished_at: '2026-11-10T01:00:00Z',
        status: 'success',
        status_code: 200,
        duration_ms: 132,
        error: '',
        response_snippet: '{"ok":true}',
      },
    ],
  },
  tasks: [
    {
      id: 't_7f3a91',
      name: 'Generate report',
      enabled: true,
      schedule: null,
      request: {
        method: 'POST',
        url: 'https://example.com/api/report',
        headers: { Authorization: 'Bearer REDACTED' },
        body: '{"date":"today"}',
        form: null,
        timeout_ms: 30000,
        follow_redirects: false,
      },
      runtime: {
        scheduled: true,
        trigger_source: 'group',
        next_run: '2026-11-11T01:00:00Z',
        last_run: '2026-11-10T01:00:00Z',
        last_status: 'failed',
        last_status_code: 500,
        last_duration_ms: 1500,
        last_error: 'upstream refused',
        run_count: 2,
        failure_count: 1,
        runs: [
          {
            started_at: '2026-11-10T01:00:00Z',
            finished_at: '2026-11-10T01:00:01Z',
            status: 'failed',
            status_code: 500,
            duration_ms: 1500,
            error: 'upstream refused',
            response_snippet: `{"error":"${'x'.repeat(400)}"}`,
          },
        ],
      },
    },
  ],
};

const statusFixture = normalizeStatus({
  configured: true,
  dir: './schedules',
  scheduler_running: true,
  server_time: '2026-11-10T00:00:00Z',
  group_count: 1,
  task_count: 1,
  enabled_task_count: 1,
});

const viewProps = (override: Partial<ScheduledTasksViewProps> = {}): ScheduledTasksViewProps => ({
  connected: true,
  loading: false,
  unsupported: false,
  loadError: null,
  statusError: null,
  actionError: '',
  status: statusFixture,
  groups: [],
  busy: null,
  onRefresh: noop,
  onCreateGroup: noop,
  onEditGroup: noop,
  onDeleteGroup: noop,
  onAddTask: noop,
  onEditTask: noop,
  onDeleteTask: noop,
  onRunTask: noop,
  onBatchAdd: noop,
  ...override,
});

const render = (override: Partial<ScheduledTasksViewProps> = {}) =>
  renderToStaticMarkup(
    createElement(I18nextProvider, { i18n }, createElement(ScheduledTasksView, viewProps(override)))
  );

const draft = (override: Partial<TaskDraft> = {}): TaskDraft => ({
  ...emptyTaskDraft('t_1'),
  name: 'Generate report',
  request: {
    method: 'POST',
    url: 'https://example.com/api/report',
    headers: [{ key: 'Authorization', value: 'Bearer REDACTED' }],
    bodyMode: 'body',
    body: '{"date":"today"}',
    form: [],
    timeoutMs: '30000',
    followRedirects: true,
  },
  ...override,
});

describe('identifiers', () => {
  test('accepts the documented pattern', () => {
    expect(validateId('daily-report')).toBeNull();
    expect(validateId('t_7f3a91')).toBeNull();
    expect(validateId('a.1-2_3')).toBeNull();
    expect(validateId('A'.repeat(64))).toBeNull();
  });

  test('rejects empty, reserved, unsafe and over-long ids', () => {
    expect(validateId('')).toBe('id_required');
    expect(validateId('   ')).toBe('id_required');
    expect(validateId('.')).toBe('id_pattern');
    expect(validateId('..')).toBe('id_pattern');
    expect(validateId('-leading')).toBe('id_pattern');
    expect(validateId('has space')).toBe('id_pattern');
    expect(validateId('slash/name')).toBe('id_pattern');
    expect(validateId('A'.repeat(65))).toBe('id_pattern');
  });

  test('generates deterministic ids that avoid what is taken', () => {
    const first = nextTaskId('https://example.com|GET|0', new Set());
    expect(first).toBe(nextTaskId('https://example.com|GET|0', new Set()));
    expect(validateId(first)).toBeNull();
    expect(nextTaskId('https://example.com|GET|0', new Set([first]))).not.toBe(first);
  });
});

describe('request validation', () => {
  test('accepts absolute http(s) urls only', () => {
    expect(validateUrl('https://example.com/api')).toBeNull();
    expect(validateUrl('http://127.0.0.1:8317/x')).toBeNull();
    expect(validateUrl('')).toBe('url_required');
    expect(validateUrl('/relative')).toBe('url_invalid');
    expect(validateUrl('ftp://example.com/x')).toBe('url_invalid');
    expect(validateUrl('example.com')).toBe('url_invalid');
  });

  test('bounds the timeout to 1–600000 whole milliseconds', () => {
    expect(parseTimeoutMs('1')).toBe(1);
    expect(parseTimeoutMs('600000')).toBe(600000);
    expect(parseTimeoutMs('0')).toBeNull();
    expect(parseTimeoutMs('-5')).toBeNull();
    expect(parseTimeoutMs('600001')).toBeNull();
    expect(parseTimeoutMs('1.5')).toBeNull();
    expect(parseTimeoutMs('abc')).toBeNull();
    expect(parseTimeoutMs('')).toBeNull();
  });

  test('reports the first offending request field', () => {
    expect(validateRequestDraft(draft().request)).toBeNull();
    expect(validateRequestDraft({ ...draft().request, url: '' })).toEqual({
      field: 'url',
      key: 'url_required',
    });
    expect(validateRequestDraft({ ...draft().request, method: '' })).toEqual({
      field: 'method',
      key: 'method_required',
    });
    expect(validateRequestDraft({ ...draft().request, method: 'GE T' })).toEqual({
      field: 'method',
      key: 'method_invalid',
    });
    expect(validateRequestDraft({ ...draft().request, timeoutMs: '0' })).toEqual({
      field: 'timeout',
      key: 'timeout_range',
    });
  });

  test('rejects duplicate and malformed headers and empty form names', () => {
    expect(
      validateRequestDraft({
        ...draft().request,
        headers: [
          { key: 'X-A', value: '1' },
          { key: 'x-a', value: '2' },
        ],
      })
    ).toEqual({ field: 'headers', key: 'header_duplicate' });
    expect(
      validateRequestDraft({ ...draft().request, headers: [{ key: 'Bad Header', value: 'x' }] })
    ).toEqual({ field: 'headers', key: 'header_name_invalid' });
    expect(
      validateRequestDraft({ ...draft().request, headers: [{ key: 'X-A', value: 'a\nb' }] })
    ).toEqual({ field: 'headers', key: 'header_line_break' });
    expect(
      validateRequestDraft({
        ...draft().request,
        form: [{ name: '', value: 'orphan' }],
      })
    ).toEqual({ field: 'form', key: 'form_name_required' });
  });
});

describe('trigger validation', () => {
  test('parses Go durations and rejects zero or negative intervals', () => {
    expect(parseGoDuration('30s')).toBe(30_000);
    expect(parseGoDuration('5m')).toBe(300_000);
    expect(parseGoDuration('1h30m')).toBe(5_400_000);
    expect(parseGoDuration('1.5s')).toBe(1500);
    expect(parseGoDuration(' 250ms ')).toBe(250);
    expect(parseGoDuration('0')).toBe(0);
    expect(parseGoDuration('30')).toBeNull();
    expect(parseGoDuration('-30s')).toBeNull();
    expect(parseGoDuration('30s5')).toBeNull();
    expect(parseGoDuration('')).toBeNull();
  });

  test('accepts a five-field cron expression and rejects malformed ones', () => {
    expect(validateCron('0 9 * * *')).toBeNull();
    expect(validateCron('*/15 0-6 1,15 JAN MON-FRI')).toBeNull();
    expect(validateCron('0 0 * * 7')).toBeNull();
    expect(validateCron('')).toBe('required');
    expect(validateCron('0 9 * *')).toBe('field_count');
    expect(validateCron('0 9 * * * *')).toBe('field_count');
    expect(validateCron('60 9 * * *')).toBe('field');
    expect(validateCron('0 24 * * *')).toBe('field');
    expect(validateCron('0 9 0 * *')).toBe('field');
    expect(validateCron('0 9 * 13 *')).toBe('field');
    expect(validateCron('0 9 * * 8')).toBe('field');
    expect(validateCron('*/0 9 * * *')).toBe('field');
    expect(validateCron('5-1 9 * * *')).toBe('field');
    expect(validateCron('@daily')).toBe('field_count');
  });

  test('surfaces the trigger reason through the draft validator', () => {
    expect(validateTaskDraft(draft({ trigger: { mode: 'fixed_rate', value: '0s' } }))).toEqual({
      field: 'trigger',
      key: 'duration_positive',
    });
    expect(validateTaskDraft(draft({ trigger: { mode: 'fixed_delay', value: '30' } }))).toEqual({
      field: 'trigger',
      key: 'duration_invalid',
    });
    expect(validateTaskDraft(draft({ trigger: { mode: 'cron', value: 'nope' } }))).toEqual({
      field: 'trigger',
      key: 'cron_field_count',
    });
    expect(validateTaskDraft(draft({ trigger: { mode: 'cron', value: '' } }))).toEqual({
      field: 'trigger',
      key: 'trigger_value_required',
    });
    expect(validateTaskDraft(draft({ trigger: { mode: 'fixed_rate', value: '30s' } }))).toBeNull();
  });

  test('summarizes a trigger for display, including the inherited case', () => {
    expect(triggerSummary(null)).toEqual({ key: 'scheduled_tasks.trigger.none' });
    expect(triggerSummary({ type: 'fixed_rate', value: '30s' })).toEqual({
      key: 'scheduled_tasks.trigger.fixed_rate',
      params: { value: '30s' },
    });
    expect(triggerSummary({ type: 'cron', value: '0 9 * * *' })).toEqual({
      key: 'scheduled_tasks.trigger.cron',
      params: { value: '0 9 * * *' },
    });
  });

  test('validates group drafts, including the description limit', () => {
    const base = emptyGroupDraft();
    expect(validateGroupDraft({ ...base, id: 'g1', name: 'Group' })).toBeNull();
    expect(validateGroupDraft({ ...base, id: 'g 1', name: 'Group' })).toEqual({
      field: 'id',
      key: 'id_pattern',
    });
    expect(validateGroupDraft({ ...base, id: 'g1', name: '' })).toEqual({
      field: 'name',
      key: 'name_required',
    });
    expect(
      validateGroupDraft({ ...base, id: 'g1', name: 'Group', description: 'x'.repeat(1001) })
    ).toEqual({ field: 'description', key: 'description_too_long' });
  });
});

describe('draft ↔ payload', () => {
  test('round-trips every task field through the API model', () => {
    const input = taskDraftToInput(draft());
    expect(input).toEqual({
      id: 't_1',
      name: 'Generate report',
      enabled: true,
      schedule: null,
      request: {
        method: 'POST',
        url: 'https://example.com/api/report',
        headers: { Authorization: 'Bearer REDACTED' },
        body: '{"date":"today"}',
        form: [],
        timeoutMs: 30000,
        followRedirects: true,
      },
    });
    const back = toTaskDraft(input);
    expect(back).toEqual(draft());
    expect(taskDraftToInput(back)).toEqual(input);
  });

  test('keeps form fields exclusive of the raw body', () => {
    const formDraft = draft({
      request: {
        ...draft().request,
        bodyMode: 'form',
        body: '',
        form: [
          { name: 'a', value: '1' },
          { name: 'b', value: '2' },
        ],
      },
    });
    const input = taskDraftToInput(formDraft);
    expect(input.request.body).toBe('');
    expect(input.request.form).toEqual([
      { name: 'a', value: '1' },
      { name: 'b', value: '2' },
    ]);
    expect(requestToDraft(input.request).bodyMode).toBe('form');
    expect(toTaskDraft(input)).toEqual(formDraft);
  });

  test('carries a saved task through the group draft untouched', () => {
    const group = normalizeGroup(rawGroup);
    const groupDraft = toGroupDraft(group);
    expect(groupDraft.trigger).toEqual({ mode: 'cron', value: '0 9 * * *' });
    // The group form never edits tasks, so a save must re-emit them byte for byte.
    expect(groupDraft.tasks).toEqual(group.tasks.map(toTaskDraft).map(taskDraftToInput));
    const input = groupDraftToInput(groupDraft);
    expect(input.id).toBe('daily-report');
    expect(input.tasks).toHaveLength(1);
    expect(input.tasks[0].id).toBe('t_7f3a91');
  });

  test('an empty group draft serializes without tasks', () => {
    const input = groupDraftToInput({ ...emptyGroupDraft(), id: 'g1', name: 'G' });
    expect(input).toEqual({
      id: 'g1',
      name: 'G',
      description: '',
      enabled: true,
      schedule: null,
      tasks: [],
    });
  });
});

describe('curl text handling', () => {
  test('splits blank-line, semicolon and && separated commands', () => {
    expect(splitCurlCommands('curl https://a.example\n\ncurl https://b.example')).toEqual([
      'curl https://a.example',
      'curl https://b.example',
    ]);
    expect(splitCurlCommands('curl https://a.example; curl https://b.example')).toEqual([
      'curl https://a.example',
      'curl https://b.example',
    ]);
    expect(splitCurlCommands('curl https://a.example && curl https://b.example')).toEqual([
      'curl https://a.example',
      'curl https://b.example',
    ]);
    expect(splitCurlCommands('curl https://a.example\ncurl https://b.example')).toHaveLength(2);
  });

  test('keeps continuations, quotes and new bodies inside one command', () => {
    const continued =
      "curl -X POST https://a.example \\\n  -H 'X-A: b; c' \\\n  --data-raw 'a;b&&c'";
    expect(splitCurlCommands(continued)).toHaveLength(1);
    const separated = splitCurlCommands("curl https://a.example -d 'x;y'\ncurl https://b.example");
    expect(separated).toEqual(["curl https://a.example -d 'x;y'", 'curl https://b.example']);
  });

  test('recognizes a % marker as a new command and strips it before sending', () => {
    const blob = '% curl https://a.example\n% curl https://b.example';
    expect(splitCurlCommands(blob)).toEqual(['curl https://a.example', 'curl https://b.example']);
    expect(normalizeCurlBlob(blob)).toBe('curl https://a.example\n\ncurl https://b.example');
    expect(normalizeCurlBlob('curl https://a.example')).toBe('curl https://a.example');
  });

  test('plans one task per command and reports the backend rejections per command', () => {
    const blob = 'curl https://a.example\n\ncurl https://b.example\n\ncurl https://c.example';
    const parsed = normalizeCurlParse({
      requests: [
        { name: 'GET a.example', request: { method: 'GET', url: 'https://a.example' } },
        { name: 'POST b.example', request: { method: 'POST', url: 'https://b.example' } },
      ],
      errors: [{ index: 2, message: 'unknown flag "--bogus"' }],
    });
    const plan = planCurlImport(blob, parsed, []);
    expect(plan.commands).toHaveLength(3);
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[0].command).toBe('curl https://a.example');
    expect(plan.issues).toEqual([
      {
        index: 2,
        command: 'curl https://c.example',
        reason: 'rejected_by_server',
        serverMessage: 'unknown flag "--bogus"',
      },
    ]);
    expect(new Set(plan.tasks.map((task) => task.draft.id)).size).toBe(2);
  });

  test('reports an empty paste and maps batch skips back to the command', () => {
    const empty = planCurlImport('   ', normalizeCurlParse({ requests: [], errors: [] }), []);
    expect(empty.tasks).toHaveLength(0);
    expect(empty.issues[0].reason).toBe('empty');

    const blob = 'curl https://a.example\n\ncurl https://b.example';
    const parsed = normalizeCurlParse({
      requests: [
        { name: 'GET a.example', request: { method: 'GET', url: 'https://a.example' } },
        { name: 'GET b.example', request: { method: 'GET', url: 'https://b.example' } },
      ],
    });
    const plan = planCurlImport(blob, parsed, []);
    const skipped = describeBatchSkips(plan, [{ index: 1, reason: 'duplicate id "t_1"' }]);
    expect(skipped).toEqual([
      {
        index: 1,
        name: 'GET b.example',
        command: 'curl https://b.example',
        reason: 'duplicate id "t_1"',
      },
    ]);
    expect(addedImportTasks(plan, [{ index: 1, reason: 'x' }]).map((task) => task.index)).toEqual([
      0,
    ]);
  });
});

describe('editor tabs', () => {
  test('renders the draft as a single curl command the parser accepts', () => {
    const curl = draftToCurl(draft());
    expect(curl.startsWith("curl -X POST 'https://example.com/api/report' ")).toBe(true);
    expect(curl).toContain("-H 'Authorization: Bearer REDACTED'");
    expect(curl).toContain('--data-raw \'{"date":"today"}\'');
    expect(curl).toContain('-L');
    // curl cannot express these, so they must not be emitted as unsupported flags.
    expect(curl).not.toContain('--max-time');
    expect(curl).not.toContain('--timeout');
  });

  test('renders form fields as -F entries', () => {
    const curl = draftToCurl(
      draft({
        trigger: { mode: 'fixed_rate', value: '1h' },
        request: {
          ...draft().request,
          bodyMode: 'form',
          body: '',
          form: [{ name: 'k', value: "v'q" }],
        },
      })
    );
    expect(curl).toContain(`-F 'k=v'\\''q'`);
    expect(curl).not.toContain('--data-raw');
  });

  test('applies a parsed curl without dropping what curl cannot express', () => {
    const before = draft({
      name: 'Kept name',
      enabled: false,
      trigger: { mode: 'cron', value: '0 9 * * *' },
      request: { ...draft().request, timeoutMs: '9000' },
    });
    const after = applyCurlRequest(
      before,
      normalizeRequest({
        method: 'PUT',
        url: 'https://other.example/x',
        headers: { 'X-A': 'b' },
        body: 'next',
        follow_redirects: true,
        timeout_ms: 30000,
      })
    );
    expect(after.name).toBe('Kept name');
    expect(after.enabled).toBe(false);
    expect(after.trigger).toEqual({ mode: 'cron', value: '0 9 * * *' });
    expect(after.request.timeoutMs).toBe('9000');
    expect(after.request.method).toBe('PUT');
    expect(after.request.url).toBe('https://other.example/x');
    expect(after.request.headers).toEqual([{ key: 'X-A', value: 'b' }]);
    expect(after.request.body).toBe('next');
    expect(after.request.followRedirects).toBe(true);
  });

  test('round-trips the JSON tab and reports unconvertible text', () => {
    const source = draft({ trigger: { mode: 'fixed_delay', value: '5m' } });
    const text = taskDraftToJson(source);
    expect(text).not.toContain('timeout_ms');
    expect(text).not.toContain('follow_redirects');
    const parsed = taskDraftFromJson(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual(source);

    expect(taskDraftFromJson('{')).toMatchObject({ ok: false, key: 'json_syntax' });
    expect(taskDraftFromJson('[]')).toMatchObject({ ok: false, key: 'json_shape' });
    expect(taskDraftFromJson(JSON.stringify({ ...taskDraftToInput(source), schedule: 3 }))).toEqual(
      {
        ok: false,
        key: 'json_field',
        detail: 'schedule',
      }
    );
    expect(
      taskDraftFromJson(JSON.stringify({ ...taskDraftToInput(source), request: null }))
    ).toEqual({ ok: false, key: 'json_field', detail: 'request' });
    const badUrl = {
      ...taskDraftToInput(source),
      request: { ...taskDraftToInput(source).request, url: 'nope' },
    };
    expect(taskDraftFromJson(JSON.stringify(badUrl))).toEqual({ ok: false, key: 'url_invalid' });
  });
});

describe('runtime display helpers', () => {
  test('truncates a response snippet and marks it', () => {
    expect(snippetPreview('{"ok":true}')).toEqual({ preview: '{"ok":true}', truncated: false });
    expect(snippetPreview('a\n\n b')).toEqual({ preview: 'a b', truncated: false });
    const long = snippetPreview('x'.repeat(400));
    expect(long.truncated).toBe(true);
    expect(long.preview).toHaveLength(240);
  });
});

describe('API normalization', () => {
  test('normalizes a group with runtime and nested tasks', () => {
    const group = normalizeGroup(rawGroup);
    expect(group.id).toBe('daily-report');
    expect(group.schedule).toEqual({ type: 'cron', value: '0 9 * * *' });
    expect(group.runtime?.triggerSource).toBe('group');
    expect(group.runtime?.nextRun).toBe('2026-11-11T01:00:00Z');
    expect(group.runtime?.lastStatusCode).toBe(200);
    const task = group.tasks[0];
    expect(task.schedule).toBeNull();
    expect(task.request).toEqual({
      method: 'POST',
      url: 'https://example.com/api/report',
      headers: { Authorization: 'Bearer REDACTED' },
      body: '{"date":"today"}',
      form: null,
      timeoutMs: 30000,
      followRedirects: false,
    });
    expect(task.runtime?.lastStatus).toBe('failed');
    expect(task.runtime?.lastDurationMs).toBe(1500);
    expect(task.runtime?.lastError).toBe('upstream refused');
    expect(task.runtime?.runs[0].responseSnippet).toContain('"error"');
    expect(task.runtime?.failureCount).toBe(1);
  });

  test('falls back to safe defaults for missing or malformed fields', () => {
    expect(normalizeRequest(null)).toEqual({
      method: 'GET',
      url: '',
      headers: {},
      body: '',
      form: null,
      timeoutMs: 30000,
      followRedirects: false,
    });
    expect(normalizeTask({ id: 5, request: { method: 'post', timeout_ms: 10.4 } })).toMatchObject({
      id: '',
      enabled: true,
      schedule: null,
      request: { method: 'POST', timeoutMs: 10 },
    });
    const unknown = normalizeGroup({ id: 'g', schedule: { type: 'sometimes', value: 'x' } });
    expect(unknown.schedule).toBeNull();
    expect(
      normalizeGroup({ id: 'g', runtime: { trigger_source: 'weird' } }).runtime?.triggerSource
    ).toBe('none');
    expect(normalizeStatus({}).configured).toBe(false);
    expect(normalizeStatus({ configured: true, group_count: '3' }).groupCount).toBe(0);
  });

  test('serializes back to the backend field names and drops runtime', () => {
    const input = taskDraftToInput(draft());
    const raw = serializeTask(input) as Record<string, unknown>;
    expect(raw).toEqual({
      id: 't_1',
      name: 'Generate report',
      enabled: true,
      schedule: null,
      request: {
        method: 'POST',
        url: 'https://example.com/api/report',
        headers: { Authorization: 'Bearer REDACTED' },
        body: '{"date":"today"}',
        form: null,
        timeout_ms: 30000,
        follow_redirects: true,
      },
    });
    expect('runtime' in raw).toBe(false);
    expect(serializeGroup({ ...groupInput(), tasks: [input] }).tasks).toHaveLength(1);
    expect(serializeRequest(input.request).form).toBeNull();
  });

  test('normalizes batch skips, parse errors and 400 bodies', () => {
    const result = normalizeGroup(rawGroup);
    expect(result.tasks).toHaveLength(1);
    const parsed = normalizeCurlParse({
      requests: [{ name: 'GET x', request: { url: 'https://x.example' } }],
      errors: [
        { index: '0', message: 5 },
        { index: 1, message: 'bad' },
      ],
    });
    expect(parsed.requests[0].request.method).toBe('GET');
    expect(parsed.errors).toEqual([{ index: 1, message: 'bad' }]);
    expect(batchRejection(new Error('nope'))).toBeNull();
    const rejection = batchRejection({
      status: 400,
      details: {
        error: 'no tasks were added',
        added: 0,
        skipped: [{ index: 0, reason: 'duplicate id "a"' }],
      },
    });
    expect(rejection).toEqual({
      message: 'no tasks were added',
      skipped: [{ index: 0, reason: 'duplicate id "a"' }],
    });
  });
});

describe('batch add request', () => {
  const spies: Array<{ mockRestore(): void }> = [];
  afterEach(() => spies.splice(0).forEach((spy) => spy.mockRestore()));

  test('sends every parsed command as one request and reports skips', async () => {
    const blob = 'curl https://a.example\n\ncurl https://b.example\n\ncurl https://c.example';
    const parsed = normalizeCurlParse({
      requests: [
        { name: 'GET a', request: { method: 'GET', url: 'https://a.example' } },
        { name: 'GET b', request: { method: 'GET', url: 'https://b.example' } },
        { name: 'GET c', request: { method: 'GET', url: 'https://c.example' } },
      ],
    });
    const plan = planCurlImport(blob, parsed, []);
    const post = spyOn(apiClient, 'post').mockResolvedValue({
      tasks: [],
      skipped: [{ index: 2, reason: 'duplicate id "t_x"' }],
    } as never);
    spies.push(post);

    const result = await scheduledTasksApi.addTasks(
      'daily-report',
      plan.tasks.map((entry) => taskDraftToInput(entry.draft))
    );
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/automation/schedule/groups/daily-report/tasks', {
      tasks: plan.tasks.map((entry) => serializeTask(taskDraftToInput(entry.draft))),
    });
    expect(describeBatchSkips(plan, result.skipped)).toEqual([
      {
        index: 2,
        name: 'GET c',
        command: 'curl https://c.example',
        reason: 'duplicate id "t_x"',
      },
    ]);
    expect(addedImportTasks(plan, result.skipped).map((entry) => entry.name)).toEqual([
      'GET a',
      'GET b',
    ]);
  });

  test('escapes ids in the request path', async () => {
    const del = spyOn(apiClient, 'delete').mockResolvedValue({ deleted: true } as never);
    spies.push(del);
    expect(await scheduledTasksApi.deleteGroup('a/b c')).toBe(true);
    expect(del).toHaveBeenCalledWith('/automation/schedule/groups/a%2Fb%20c');
  });

  test('serializes a group create request with its tasks', async () => {
    const post = spyOn(apiClient, 'post').mockResolvedValue({} as never);
    spies.push(post);
    const input = { ...groupInput(), tasks: [taskDraftToInput(draft())] };
    await scheduledTasksApi.createGroup(input);
    expect(post).toHaveBeenCalledWith('/automation/schedule/groups', serializeGroup(input));
  });
});

describe('page states', () => {
  test('an unconfigured scheduler shows the configuration hint instead of an empty list', () => {
    const markup = render({
      status: normalizeStatus({ configured: false, dir: '', group_count: 0, task_count: 0 }),
      groups: [],
    });
    expect(markup).toContain('data-state="not-configured"');
    expect(markup).toContain('automation.schedule.dir');
    expect(markup).toContain(en.scheduled_tasks.not_configured.title);
    expect(markup).not.toContain(en.scheduled_tasks.empty.title);
  });

  test('a configured scheduler with no groups shows the empty state', () => {
    const markup = render();
    expect(markup).toContain(en.scheduled_tasks.empty.title);
    expect(markup).toContain(en.scheduled_tasks.group.create);
    expect(markup).toContain(en.scheduled_tasks.status.running);
    expect(markup).toContain('./schedules');
    expect(markup).not.toContain('data-state="not-configured"');
  });

  test('renders groups, tasks, trigger sources and runtime', () => {
    const groups = [normalizeGroup(rawGroup)];
    const markup = render({ groups });
    expect(markup).toContain('Daily report');
    expect(markup).toContain('Generate report');
    expect(markup).toContain('POST https://example.com/api/report');
    expect(markup).toContain(en.scheduled_tasks.source.group);
    expect(markup).toContain('0 9 * * *');
    expect(markup).toContain(en.scheduled_tasks.task.inherited.replace('{{value}}', '0 9 * * *'));
    expect(markup).toContain(en.scheduled_tasks.runtime.next_run);
    expect(markup).toContain(en.scheduled_tasks.runtime.last_run);
    expect(markup).toContain('500');
    expect(markup).toContain('1.5 s');
    expect(markup).toContain('upstream refused');
    expect(markup).toContain(en.scheduled_tasks.runtime.history.replace('{{count}}', '1'));
    expect(markup).toContain(en.scheduled_tasks.runtime.snippet_truncated);
  });

  test('renders a manual-only task with no trigger of its own', () => {
    const group = normalizeGroup({
      ...rawGroup,
      schedule: null,
      runtime: { ...rawGroup.runtime, trigger_source: 'none', scheduled: false },
      tasks: [
        {
          ...rawGroup.tasks[0],
          schedule: null,
          runtime: { ...rawGroup.tasks[0].runtime, trigger_source: 'none', scheduled: false },
        },
      ],
    });
    const markup = render({ groups: [group] });
    expect(markup).toContain(en.scheduled_tasks.source.none);
    expect(markup).toContain(en.scheduled_tasks.task.manual_only);
    expect(markup).toContain(en.scheduled_tasks.runtime.not_scheduled);
  });

  test('renders a task trigger as its own source', () => {
    const task = normalizeTask({
      ...rawGroup.tasks[0],
      schedule: { type: 'fixed_rate', value: '30s' },
      runtime: { ...rawGroup.tasks[0].runtime, trigger_source: 'task' },
    });
    expect(task.runtime?.triggerSource).toBe('task');
    const markup = render({ groups: [{ ...normalizeGroup(rawGroup), tasks: [task] }] });
    expect(markup).toContain(en.scheduled_tasks.source.task);
    expect(markup).toContain('Every 30s');
    expect(markup).not.toContain(en.scheduled_tasks.task.manual_only);
  });

  test('shows the connection notice and the loading state while disconnected', () => {
    const markup = render({
      connected: false,
      loading: true,
      status: null,
      groups: [],
    });
    expect(markup).toContain(en.notification.connection_required);
    expect(markup).toContain(en.common.loading);
    expect(markup).not.toContain(en.scheduled_tasks.empty.title);
  });

  test('a failed load reports the error with a refresh action', () => {
    const markup = render({ loadError: 'boom', groups: [] });
    expect(markup).toContain(en.scheduled_tasks.load_failed);
    expect(markup).toContain('boom');
    expect(markup).toContain(en.common.refresh);
  });
});

describe('component contract', () => {
  test('no component or pure module carries a raw backend field name', async () => {
    const files = [
      'src/features/scheduledTasks/ScheduledTasksPage.tsx',
      'src/features/scheduledTasks/ScheduledTasksPage.module.scss',
      'src/features/scheduledTasks/TaskEditorModal.tsx',
      'src/features/scheduledTasks/TaskEditorModal.module.scss',
      'src/features/scheduledTasks/scheduleForm.ts',
    ];
    // Components may hold underscores only inside quoted i18n keys, comments and
    // SCREAMING constants, so any lowercase snake_case token left afterwards is a
    // leaked backend field name.
    const stringLiteral = /'[^'\n]*'|"[^"\n]*"|`[^`\n]*`/g;
    const comment = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
    const snakeCase = /\b[a-z][a-z0-9]*_[a-z0-9]+\b/;
    for (const file of files) {
      const source = (await Bun.file(file).text())
        .replace(stringLiteral, 'LITERAL')
        .replace(comment, '');
      const leaked = source
        .split('\n')
        .filter((line) => snakeCase.test(line))
        .map((line) => line.trim());
      expect(`${file}: ${leaked.join(' | ')}`).toBe(`${file}: `);
    }
    // The API module is the one place those names are allowed to exist.
    const api = await Bun.file('src/services/api/scheduledTasks.ts').text();
    for (const field of ['timeout_ms', 'follow_redirects', 'trigger_source', 'response_snippet']) {
      expect(api).toContain(field);
    }
  });

  test('the page calls the contract endpoints through the domain module only', async () => {
    const source = await Bun.file('src/features/scheduledTasks/ScheduledTasksPage.tsx').text();
    expect(source).not.toContain('fetch(');
    expect(source).toContain('scheduledTasksApi.');
    expect(source).toContain("from '@/services/api/scheduledTasks'");
  });
});

function groupInput() {
  return {
    id: 'daily-report',
    name: 'Daily report',
    description: '',
    enabled: true,
    schedule: { type: 'cron' as const, value: '0 9 * * *' },
    tasks: [],
  };
}
