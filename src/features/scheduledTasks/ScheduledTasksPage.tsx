import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { apiClient } from '@/services/api/client';
import {
  batchRejection,
  scheduledTasksApi,
  type BatchAddResult,
  type BatchRejection,
  type RuntimeSummary,
  type ScheduleGroup,
  type ScheduleStatus,
  type ScheduleTask,
  type ScheduleTrigger,
} from '@/services/api/scheduledTasks';
import { useAuthStore, useNotificationStore } from '@/stores';
import { getErrorMessage, isRecord } from '@/utils/helpers';
import { TaskEditorModal, type TaskEditorModalProps } from './TaskEditorModal';
import {
  addedImportTasks,
  describeBatchSkips,
  durationMessage,
  emptyGroupDraft,
  emptyTaskDraft,
  groupDraftToInput,
  normalizeCurlBlob,
  planCurlImport,
  runStatusMessage,
  snippetPreview,
  taskDraftToInput,
  toGroupDraft,
  toTaskDraft,
  triggerSourceMessage,
  triggerSummary,
  type CurlImportIssue,
  type CurlSkipReport,
  type GroupDraft,
  type Message,
  type TaskDraft,
} from './scheduleForm';
import styles from './ScheduledTasksPage.module.scss';

interface Session {
  apiBase: string;
  managementKey: string;
  revision: number;
  signal: AbortSignal;
}

type EditorTarget =
  | {
      key: string;
      mode: 'group';
      isNew: boolean;
      group: GroupDraft;
      groupId: string;
    }
  | {
      key: string;
      mode: 'task';
      isNew: boolean;
      groupId: string;
      taskId: string;
      task: TaskDraft;
      groupTrigger: ScheduleTrigger | null;
    };

interface BatchReport {
  added: { id: string; name: string }[];
  skipped: CurlSkipReport[];
  parseIssues: CurlImportIssue[];
}

interface BatchTarget {
  groupId: string;
  groupName: string;
  text: string;
  running: boolean;
  error: string;
  report: BatchReport | null;
}

export interface ScheduledTasksViewProps {
  connected: boolean;
  loading: boolean;
  unsupported: boolean;
  loadError: string | null;
  statusError: string | null;
  actionError: string;
  status: ScheduleStatus | null;
  groups: ScheduleGroup[];
  busy: string | null;
  onRefresh: () => void;
  onCreateGroup: () => void;
  onEditGroup: (group: ScheduleGroup) => void;
  onDeleteGroup: (group: ScheduleGroup) => void;
  onAddTask: (group: ScheduleGroup) => void;
  onEditTask: (group: ScheduleGroup, task: ScheduleTask) => void;
  onDeleteTask: (group: ScheduleGroup, task: ScheduleTask) => void;
  onRunTask: (group: ScheduleGroup, task: ScheduleTask) => void;
  onBatchAdd: (group: ScheduleGroup) => void;
}

interface RuntimeRowProps {
  runtime: RuntimeSummary | null;
  formatTime: (value: string) => string;
  message: (message: Message) => string;
  showHistory: boolean;
}

function RuntimeRow({ runtime, formatTime, message, showHistory }: RuntimeRowProps) {
  const { t } = useTranslation();
  if (!runtime) {
    return <span className={styles.muted}>{t('scheduled_tasks.runtime.unavailable')}</span>;
  }
  return (
    <div className={styles.runtime}>
      <div className={styles.runtimeLine}>
        <span className={styles.muted}>{t('scheduled_tasks.runtime.next_run')}</span>{' '}
        {runtime.scheduled
          ? formatTime(runtime.nextRun)
          : t('scheduled_tasks.runtime.not_scheduled')}
      </div>
      <div className={styles.runtimeLine}>
        <span className={styles.muted}>{t('scheduled_tasks.runtime.last_run')}</span>{' '}
        {formatTime(runtime.lastRun)}
        <span
          className={styles.status}
          data-status={runtime.lastStatus}
          title={t('scheduled_tasks.runtime.last_status')}
        >
          {message(runStatusMessage(runtime.lastStatus))}
        </span>
        {runtime.lastStatus !== 'never' && runtime.lastStatusCode > 0 && (
          <span className={styles.muted}>{runtime.lastStatusCode}</span>
        )}
        {runtime.lastStatus !== 'never' && (
          <span className={styles.muted}>{message(durationMessage(runtime.lastDurationMs))}</span>
        )}
      </div>
      {runtime.lastError && <div className={styles.failure}>{runtime.lastError}</div>}
      <div className={styles.runtimeLine}>
        <span className={styles.muted}>
          {t('scheduled_tasks.runtime.counts', {
            runs: runtime.runCount,
            failures: runtime.failureCount,
          })}
        </span>
      </div>
      {showHistory && runtime.runs.length > 0 && (
        <details className={styles.history}>
          <summary>{t('scheduled_tasks.runtime.history', { count: runtime.runs.length })}</summary>
          <ul className={styles.runList}>
            {runtime.runs.map((run, index) => {
              const snippet = snippetPreview(run.responseSnippet);
              return (
                <li key={`${run.startedAt}-${index}`}>
                  <div className={styles.runtimeLine}>
                    <span className={styles.muted}>{formatTime(run.startedAt)}</span>
                    <span className={styles.status} data-status={run.status}>
                      {message(runStatusMessage(run.status))}
                    </span>
                    {run.statusCode > 0 && <span className={styles.muted}>{run.statusCode}</span>}
                    <span className={styles.muted}>{message(durationMessage(run.durationMs))}</span>
                  </div>
                  {run.error && <div className={styles.failure}>{run.error}</div>}
                  {snippet.preview && (
                    <p className={styles.snippet}>
                      {snippet.preview}
                      {snippet.truncated && (
                        <span className={styles.muted}>
                          {' '}
                          {t('scheduled_tasks.runtime.snippet_truncated')}
                        </span>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}

function TaskItem({
  task,
  groupTrigger,
  busy,
  formatTime,
  message,
  onEdit,
  onDelete,
  onRun,
}: {
  task: ScheduleTask;
  groupTrigger: ScheduleTrigger | null;
  busy: string | null;
  formatTime: (value: string) => string;
  message: (message: Message) => string;
  onEdit: () => void;
  onDelete: () => void;
  onRun: () => void;
}) {
  const { t } = useTranslation();
  const source = task.runtime?.triggerSource ?? 'none';
  const effectiveTrigger = task.schedule ?? (source === 'group' ? groupTrigger : null);
  return (
    <li className={styles.task} data-enabled={task.enabled}>
      <div className={styles.taskHead}>
        <div className={styles.taskTitle}>
          <h3>{task.name || task.id}</h3>
          <span className={styles.muted}>{task.id}</span>
          {!task.enabled && (
            <span className={styles.badge}>{t('scheduled_tasks.task.disabled')}</span>
          )}
        </div>
        <div className={styles.taskActions}>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            loading={busy === `run:${task.id}`}
            aria-label={t('scheduled_tasks.task.run_now_label', { name: task.name || task.id })}
            onClick={onRun}
          >
            {t('scheduled_tasks.task.run_now')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            aria-label={t('scheduled_tasks.task.edit_label', { name: task.name || task.id })}
            onClick={onEdit}
          >
            {t('common.edit')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            aria-label={t('scheduled_tasks.task.delete_label', { name: task.name || task.id })}
            onClick={onDelete}
          >
            {t('common.delete')}
          </Button>
        </div>
      </div>
      <div className={styles.taskMeta}>
        <code className={styles.request}>
          {task.request.method} {task.request.url}
        </code>
      </div>
      <div className={styles.runtimeLine}>
        <span className={styles.badge} data-source={source}>
          {message(triggerSourceMessage(source))}
        </span>
        <span className={styles.muted}>{message(triggerSummary(effectiveTrigger))}</span>
        {source === 'group' && groupTrigger && (
          <span className={styles.muted}>
            {t('scheduled_tasks.task.inherited', { value: groupTrigger.value })}
          </span>
        )}
        {source === 'none' && (
          <span className={styles.muted}>{t('scheduled_tasks.task.manual_only')}</span>
        )}
      </div>
      <RuntimeRow runtime={task.runtime} formatTime={formatTime} message={message} showHistory />
    </li>
  );
}

export function ScheduledTasksView(props: ScheduledTasksViewProps) {
  const { t, i18n } = useTranslation();
  const message = useCallback((entry: Message) => t(entry.key, { ...entry.params }), [t]);
  const formatTime = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'short',
      timeStyle: 'medium',
    });
    return (value: string) => {
      if (!value) return '—';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : formatter.format(date);
    };
  }, [i18n.language]);
  const { status, groups } = props;
  const hasGroups = groups.length > 0;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>{t('scheduled_tasks.title')}</h1>
        <p>{t('scheduled_tasks.description')}</p>
        <p>{t('scheduled_tasks.memory_hint')}</p>
      </header>
      {!props.connected && (
        <div className={styles.notice} role="status">
          {t('notification.connection_required')}
        </div>
      )}
      {props.loading && <p role="status">{t('common.loading')}</p>}
      {(props.loadError !== null || props.unsupported) && (
        <div className="error-box" role="alert">
          <p>
            {t(props.unsupported ? 'scheduled_tasks.unsupported' : 'scheduled_tasks.load_failed')}
          </p>
          {!props.unsupported && props.loadError && <p>{props.loadError}</p>}
          <Button variant="secondary" disabled={!props.connected} onClick={props.onRefresh}>
            {t('common.refresh')}
          </Button>
        </div>
      )}
      {props.statusError && (
        <div className="error-box" role="alert">
          {t('scheduled_tasks.status_failed')} {props.statusError}
        </div>
      )}
      {props.actionError && (
        <div className="error-box" role="alert">
          {props.actionError}
        </div>
      )}
      {status && !status.configured && (
        <div className={styles.notice} role="status" data-state="not-configured">
          <p>{t('scheduled_tasks.not_configured.title')}</p>
          <p>{t('scheduled_tasks.not_configured.body')}</p>
          <p>
            <code>automation.schedule.dir</code>
          </p>
          <p className={styles.muted}>{t('scheduled_tasks.not_configured.hint')}</p>
        </div>
      )}
      {status?.configured && (
        <>
          <div className={styles.statusBar}>
            <span className={styles.statusItem}>
              <span className={styles.muted}>{t('scheduled_tasks.status.scheduler')}</span>
              <strong>
                {status.schedulerRunning
                  ? t('scheduled_tasks.status.running')
                  : t('scheduled_tasks.status.stopped')}
              </strong>
            </span>
            <span className={styles.statusItem}>
              <span className={styles.muted}>{t('scheduled_tasks.status.counts')}</span>
              <strong>
                {t('scheduled_tasks.status.count_values', {
                  groups: status.groupCount,
                  tasks: status.taskCount,
                  enabled: status.enabledTaskCount,
                })}
              </strong>
            </span>
            <span className={styles.statusItem}>
              <span className={styles.muted}>{t('scheduled_tasks.status.dir')}</span>
              <code>{status.dir || t('scheduled_tasks.status.dir_unset')}</code>
            </span>
            <span className={styles.statusItem}>
              <span className={styles.muted}>{t('scheduled_tasks.status.server_time')}</span>
              <strong>{formatTime(status.serverTime)}</strong>
            </span>
            <div className={styles.statusActions}>
              <Button
                variant="secondary"
                size="sm"
                disabled={!props.connected}
                loading={props.busy === 'refresh'}
                onClick={props.onRefresh}
              >
                {t('common.refresh')}
              </Button>
              <Button size="sm" disabled={!props.connected} onClick={props.onCreateGroup}>
                {t('scheduled_tasks.group.create')}
              </Button>
            </div>
          </div>
          {!hasGroups && (
            <EmptyState
              title={t('scheduled_tasks.empty.title')}
              description={t('scheduled_tasks.empty.description')}
              action={
                <Button disabled={!props.connected} onClick={props.onCreateGroup}>
                  {t('scheduled_tasks.group.create')}
                </Button>
              }
            />
          )}
          {groups.map((group) => {
            const groupBusy = props.busy === `group:${group.id}`;
            return (
              <Card
                key={group.id}
                title={
                  <h2 className={styles.groupTitle}>
                    {group.name || group.id}
                    {!group.enabled && (
                      <span className={styles.badge}>{t('scheduled_tasks.group.disabled')}</span>
                    )}
                  </h2>
                }
                extra={
                  <div className={styles.taskActions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={props.busy !== null}
                      onClick={() => props.onBatchAdd(group)}
                    >
                      {t('scheduled_tasks.group.import_curl')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={props.busy !== null}
                      onClick={() => props.onAddTask(group)}
                    >
                      {t('scheduled_tasks.task.create')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={props.busy !== null}
                      onClick={() => props.onEditGroup(group)}
                    >
                      {t('common.edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={props.busy !== null}
                      loading={groupBusy}
                      onClick={() => props.onDeleteGroup(group)}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                }
              >
                {group.description && <p className={styles.muted}>{group.description}</p>}
                <div className={styles.runtimeLine}>
                  <span className={styles.muted}>{t('scheduled_tasks.group.trigger')}</span>
                  <span className={styles.badge}>{message(triggerSummary(group.schedule))}</span>
                  {!group.schedule && (
                    <span className={styles.muted}>{t('scheduled_tasks.group.per_task')}</span>
                  )}
                </div>
                <RuntimeRow
                  runtime={group.runtime}
                  formatTime={formatTime}
                  message={message}
                  showHistory={false}
                />
                {group.tasks.length === 0 ? (
                  <p className={styles.muted}>{t('scheduled_tasks.group.no_tasks')}</p>
                ) : (
                  <ul className={styles.taskList}>
                    {group.tasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        groupTrigger={group.schedule}
                        busy={props.busy}
                        formatTime={formatTime}
                        message={message}
                        onEdit={() => props.onEditTask(group, task)}
                        onDelete={() => props.onDeleteTask(group, task)}
                        onRun={() => props.onRunTask(group, task)}
                      />
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

function BatchAddModal({
  target,
  onTextChange,
  onSubmit,
  onClose,
}: {
  target: BatchTarget | null;
  onTextChange: (text: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  if (!target) return null;
  return (
    <Modal
      open
      width={720}
      closeDisabled={target.running}
      onClose={onClose}
      title={t('scheduled_tasks.import.title', { name: target.groupName })}
      footer={
        <>
          <Button variant="ghost" disabled={target.running} onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button loading={target.running} onClick={onSubmit} disabled={!target.text.trim()}>
            {t('scheduled_tasks.import.submit')}
          </Button>
        </>
      }
    >
      <p className={styles.hint}>{t('scheduled_tasks.import.hint')}</p>
      <textarea
        className="input"
        rows={8}
        spellCheck={false}
        aria-label={t('scheduled_tasks.import.label')}
        value={target.text}
        disabled={target.running}
        onChange={(event) => onTextChange(event.target.value)}
      />
      {target.error && (
        <p className="error-box" role="alert">
          {target.error}
        </p>
      )}
      {target.report && (
        <div className={styles.report}>
          <p role="status">
            {t('scheduled_tasks.import.added', { count: target.report.added.length })}
          </p>
          {target.report.added.length > 0 && (
            <ul className={styles.reportList}>
              {target.report.added.map((entry) => (
                <li key={entry.id}>
                  <code>{entry.id}</code> {entry.name}
                </li>
              ))}
            </ul>
          )}
          {target.report.skipped.length > 0 && (
            <>
              <p className={styles.failure}>{t('scheduled_tasks.import.skipped_title')}</p>
              <ul className={styles.reportList} data-state="skipped">
                {target.report.skipped.map((entry) => (
                  <li key={`${entry.index}-${entry.name}`}>
                    {t('scheduled_tasks.import.command_number', { number: entry.index + 1 })}{' '}
                    {entry.name || entry.command} — {entry.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          {target.report.parseIssues.length > 0 && (
            <>
              <p className={styles.failure}>{t('scheduled_tasks.import.rejected_title')}</p>
              <ul className={styles.reportList} data-state="rejected">
                {target.report.parseIssues.map((issue) => (
                  <li key={`${issue.index}-${issue.reason}`}>
                    {issue.reason === 'empty'
                      ? t('scheduled_tasks.import.reason.empty')
                      : t('scheduled_tasks.import.reason.rejected_by_server')}{' '}
                    {t('scheduled_tasks.import.command_number', { number: issue.index + 1 })}
                    {issue.serverMessage ? ` — ${issue.serverMessage}` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

export function ScheduledTasksPage() {
  const { t } = useTranslation();
  const pageLayer = usePageTransitionLayer();
  const isCurrentLayer = pageLayer?.isCurrentLayer ?? true;
  const currentLayerRef = useRef(isCurrentLayer);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const apiBase = useAuthStore((state) => state.apiBase);
  const managementKey = useAuthStore((state) => state.managementKey);
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const connected = connectionStatus === 'connected';
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<ScheduleStatus | null>(null);
  const [groups, setGroups] = useState<ScheduleGroup[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [batch, setBatch] = useState<BatchTarget | null>(null);
  const connectionKey = `${apiBase}\u0000${managementKey}\u0000${apiClient.getConnectionRevision()}`;
  const connectionRef = useRef(connectionKey);

  useEffect(() => {
    currentLayerRef.current = isCurrentLayer;
  }, [isCurrentLayer]);

  useEffect(() => {
    const controller = new AbortController();
    const revision = apiClient.getConnectionRevision();
    const changed = connectionRef.current !== connectionKey;
    if (changed) {
      connectionRef.current = connectionKey;
      setGroups(null);
      setStatus(null);
      setLoadError(null);
      setStatusError(null);
      setUnsupported(false);
      setActionError('');
      setEditor(null);
      setBatch(null);
    }
    const current = () => {
      const auth = useAuthStore.getState();
      return (
        !controller.signal.aborted &&
        auth.connectionStatus === 'connected' &&
        auth.apiBase === apiBase &&
        auth.managementKey === managementKey &&
        revision === apiClient.getConnectionRevision()
      );
    };
    let pollTimer: number | undefined;
    let inFlight = false;
    let sequence = 0;
    const loaded = { current: false };

    const poll = async () => {
      if (!current() || document.hidden || !currentLayerRef.current || inFlight) return;
      const request = ++sequence;
      inFlight = true;
      try {
        const [nextStatus, nextGroups] = await Promise.all([
          scheduledTasksApi.status(controller.signal),
          scheduledTasksApi.groups(controller.signal),
        ]);
        if (!current() || document.hidden || !currentLayerRef.current || request !== sequence) {
          return;
        }
        loaded.current = true;
        setStatus(nextStatus);
        setGroups(nextGroups);
        setLoadError(null);
        setStatusError(null);
      } catch (error: unknown) {
        if (!current() || request !== sequence) return;
        // A later failure keeps the last snapshot; only the first load is fatal.
        setUnsupported(
          isRecord(error) && (error.status === 404 || error.status === 405 || error.status === 501)
        );
        if (loaded.current) setStatusError(getErrorMessage(error, ''));
        else setLoadError(getErrorMessage(error, ''));
      } finally {
        if (request === sequence) inFlight = false;
      }
    };

    const visibility = () => {
      if (document.hidden || !currentLayerRef.current) {
        sequence += 1;
        inFlight = false;
      } else {
        void poll();
      }
    };

    if (connected) {
      setSession({ apiBase, managementKey, revision, signal: controller.signal });
      void (async () => {
        await poll();
        if (current()) {
          pollTimer = window.setInterval(() => {
            void poll();
          }, 5000);
        }
      })();
    } else {
      setSession(null);
    }
    document.addEventListener('visibilitychange', visibility);
    return () => {
      controller.abort();
      window.clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [connected, apiBase, managementKey, connectionKey, revision]);

  const sessionActive = (candidate: Session | null): candidate is Session =>
    candidate !== null &&
    !candidate.signal.aborted &&
    candidate.revision === apiClient.getConnectionRevision() &&
    useAuthStore.getState().connectionStatus === 'connected';

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  const findGroup = (groupId: string) => (groups ?? []).find((group) => group.id === groupId);

  const saveGroup = async (draft: GroupDraft, groupId: string, isNew: boolean) => {
    if (!sessionActive(session) || busy !== null || submitting) return;
    setEditorError('');
    setSubmitting(true);
    try {
      const input = groupDraftToInput(draft);
      if (isNew) await scheduledTasksApi.createGroup(input);
      else await scheduledTasksApi.updateGroup(groupId, input);
      setEditor(null);
      reload();
      showNotification(t('scheduled_tasks.group.saved'), 'success');
    } catch (error: unknown) {
      setEditorError(getErrorMessage(error, t('scheduled_tasks.error.save_failed')));
    } finally {
      setSubmitting(false);
    }
  };

  const saveTask = async (draft: TaskDraft, groupId: string, taskId: string, isNew: boolean) => {
    if (!sessionActive(session) || busy !== null || submitting) return;
    setEditorError('');
    setSubmitting(true);
    try {
      const input = taskDraftToInput(draft);
      if (isNew) {
        const result = await scheduledTasksApi.addTasks(groupId, [input]);
        if (result.skipped.length > 0 || result.tasks.length === 0) {
          setEditorError(
            t('scheduled_tasks.error.batch_skip', {
              reason: result.skipped[0]?.reason || '',
            })
          );
          return;
        }
      } else {
        await scheduledTasksApi.updateTask(groupId, taskId, input);
      }
      setEditor(null);
      reload();
      showNotification(t('scheduled_tasks.task.saved'), 'success');
    } catch (error: unknown) {
      const rejection = batchRejection(error);
      const reason = rejection?.skipped.find((entry) => entry.index === 0)?.reason;
      setEditorError(
        reason
          ? t('scheduled_tasks.error.batch_skip', { reason })
          : getErrorMessage(error, t('scheduled_tasks.error.save_failed'))
      );
    } finally {
      setSubmitting(false);
    }
  };

  const removeGroup = (group: ScheduleGroup) => {
    if (!sessionActive(session)) return;
    showConfirmation({
      title: t('scheduled_tasks.confirm.delete_group_title'),
      message: t('scheduled_tasks.confirm.delete_group', { name: group.name || group.id }),
      confirmText: t('common.delete'),
      variant: 'danger',
      onConfirm: async () => {
        setActionError('');
        setBusy(`group:${group.id}`);
        try {
          await scheduledTasksApi.deleteGroup(group.id);
          reload();
          showNotification(t('scheduled_tasks.group.deleted'), 'success');
        } catch (error: unknown) {
          setActionError(getErrorMessage(error, t('scheduled_tasks.error.delete_failed')));
        } finally {
          setBusy(null);
        }
      },
    });
  };

  const removeTask = (group: ScheduleGroup, task: ScheduleTask) => {
    if (!sessionActive(session)) return;
    showConfirmation({
      title: t('scheduled_tasks.confirm.delete_task_title'),
      message: t('scheduled_tasks.confirm.delete_task', { name: task.name || task.id }),
      confirmText: t('common.delete'),
      variant: 'danger',
      onConfirm: async () => {
        setActionError('');
        setBusy(`task:${group.id}:${task.id}`);
        try {
          await scheduledTasksApi.deleteTask(group.id, task.id);
          reload();
          showNotification(t('scheduled_tasks.task.deleted'), 'success');
        } catch (error: unknown) {
          setActionError(getErrorMessage(error, t('scheduled_tasks.error.delete_failed')));
        } finally {
          setBusy(null);
        }
      },
    });
  };

  const runTask = async (group: ScheduleGroup, task: ScheduleTask) => {
    if (!sessionActive(session) || busy !== null) return;
    setActionError('');
    setBusy(`run:${task.id}`);
    try {
      const run = await scheduledTasksApi.runTask(group.id, task.id);
      const entry = runStatusMessage(run.status);
      showNotification(
        t('scheduled_tasks.task.run_finished', {
          name: task.name || task.id,
          status: t(entry.key, { ...entry.params }),
        }),
        run.status === 'failed' ? 'error' : 'success'
      );
      reload();
    } catch (error: unknown) {
      setActionError(getErrorMessage(error, t('scheduled_tasks.error.run_failed')));
    } finally {
      setBusy(null);
    }
  };

  const submitBatch = async () => {
    const target = batch;
    const group = target ? findGroup(target.groupId) : undefined;
    if (!target || !group || !sessionActive(session) || target.running) return;
    setBatch({ ...target, running: true, error: '' });
    try {
      const blob = normalizeCurlBlob(target.text);
      const parsed = await scheduledTasksApi.parseCurl(blob, session.signal);
      const plan = planCurlImport(
        blob,
        parsed,
        group.tasks.map((task) => task.id)
      );
      if (plan.tasks.length === 0) {
        setBatch({
          ...target,
          running: false,
          error: t('scheduled_tasks.import.nothing'),
          report: { added: [], skipped: [], parseIssues: plan.issues },
        });
        return;
      }
      let result: BatchAddResult | null = null;
      let rejection: BatchRejection | null = null;
      try {
        result = await scheduledTasksApi.addTasks(
          group.id,
          plan.tasks.map((entry) => taskDraftToInput(entry.draft))
        );
      } catch (error: unknown) {
        rejection = batchRejection(error);
        if (!rejection) throw error;
      }
      const skipped = result?.skipped ?? rejection?.skipped ?? [];
      setBatch({
        ...target,
        running: false,
        error: '',
        report: {
          added: addedImportTasks(plan, skipped).map((entry) => ({
            id: entry.draft.id,
            name: entry.name,
          })),
          skipped: describeBatchSkips(plan, skipped),
          parseIssues: plan.issues,
        },
      });
      reload();
    } catch (error: unknown) {
      setBatch({
        ...target,
        running: false,
        error: getErrorMessage(error, t('scheduled_tasks.import.failed')),
      });
    }
  };

  const activeSession = sessionActive(session) ? session : null;
  const viewProps: ScheduledTasksViewProps = {
    connected: connected && isCurrentLayer,
    loading: connected && groups === null && loadError === null,
    unsupported,
    loadError,
    statusError,
    actionError,
    status,
    groups: groups ?? [],
    busy,
    onRefresh: reload,
    onCreateGroup: () => {
      setEditorError('');
      setEditor({
        key: `group:new:${revision}`,
        mode: 'group',
        isNew: true,
        group: emptyGroupDraft(),
        groupId: '',
      });
    },
    onEditGroup: (group) => {
      setEditorError('');
      setEditor({
        key: `group:${group.id}:${revision}`,
        mode: 'group',
        isNew: false,
        group: toGroupDraft(group),
        groupId: group.id,
      });
    },
    onDeleteGroup: removeGroup,
    onAddTask: (group) => {
      setEditorError('');
      setEditor({
        key: `task:${group.id}:new:${group.tasks.length}:${revision}`,
        mode: 'task',
        isNew: true,
        groupId: group.id,
        taskId: '',
        task: emptyTaskDraft(),
        groupTrigger: group.schedule,
      });
    },
    onEditTask: (group, task) => {
      setEditorError('');
      setEditor({
        key: `task:${group.id}:${task.id}:${revision}`,
        mode: 'task',
        isNew: false,
        groupId: group.id,
        taskId: task.id,
        task: toTaskDraft(task),
        groupTrigger: group.schedule,
      });
    },
    onDeleteTask: removeTask,
    onRunTask: (group, task) => {
      void runTask(group, task);
    },
    onBatchAdd: (group) => {
      setBatch({
        groupId: group.id,
        groupName: group.name || group.id,
        text: '',
        running: false,
        error: '',
        report: null,
      });
    },
  };

  const editorProps: TaskEditorModalProps | null = editor
    ? editor.mode === 'group'
      ? {
          mode: 'group',
          open: true,
          isNew: editor.isNew,
          submitting,
          error: editorError,
          group: editor.group,
          onClose: () => setEditor(null),
          onSubmitGroup: (draft) => {
            void saveGroup(draft, editor.groupId, editor.isNew);
          },
        }
      : {
          mode: 'task',
          open: true,
          isNew: editor.isNew,
          submitting,
          error: editorError,
          task: editor.task,
          groupTrigger: editor.groupTrigger,
          onClose: () => setEditor(null),
          onSubmitTask: (draft) => {
            void saveTask(draft, editor.groupId, editor.taskId, editor.isNew);
          },
          parseCurl: (text) =>
            scheduledTasksApi.parseCurl(text, activeSession?.signal ?? undefined),
        }
    : null;

  return (
    <>
      <ScheduledTasksView {...viewProps} />
      {editor && editorProps && <TaskEditorModal key={editor.key} {...editorProps} />}
      <BatchAddModal
        target={batch}
        onTextChange={(text) => setBatch((current) => (current ? { ...current, text } : current))}
        onSubmit={() => {
          void submitBatch();
        }}
        onClose={() => setBatch(null)}
      />
    </>
  );
}
