import { useCallback, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select, type SelectOption } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  HTTP_METHODS,
  TRIGGER_TYPES,
  type CurlParseResult,
  type ScheduleTrigger,
} from '@/services/api/scheduledTasks';
import { getErrorMessage } from '@/utils/helpers';
import {
  applyCurlRequest,
  draftToCurl,
  emptyTaskDraft,
  splitCurlCommands,
  taskDraftFromJson,
  taskDraftToJson,
  validateGroupDraft,
  validateTaskDraft,
  type BodyMode,
  type DraftError,
  type GroupDraft,
  type TaskDraft,
  type TriggerDraft,
  type TriggerMode,
} from './scheduleForm';
import styles from './TaskEditorModal.module.scss';

export const EDITOR_TABS = ['form', 'curl', 'json'] as const;
export type EditorTab = (typeof EDITOR_TABS)[number];

type CommonProps = {
  open: boolean;
  isNew: boolean;
  submitting: boolean;
  /** Submission failure text, already localized. */
  error: string;
  onClose: () => void;
};

export type TaskEditorModalProps =
  | (CommonProps & {
      mode: 'task';
      task: TaskDraft;
      groupTrigger: ScheduleTrigger | null;
      onSubmitTask: (draft: TaskDraft) => void;
      parseCurl: (text: string) => Promise<CurlParseResult>;
    })
  | (CommonProps & {
      mode: 'group';
      group: GroupDraft;
      onSubmitGroup: (draft: GroupDraft) => void;
    });

const BODY_MODES: BodyMode[] = ['none', 'body', 'form'];

function TriggerFields({
  trigger,
  variant,
  groupTrigger,
  disabled,
  onChange,
}: {
  trigger: TriggerDraft;
  /** `group` edits the group timer, `task` edits a task that may inherit it. */
  variant: 'task' | 'group';
  groupTrigger?: ScheduleTrigger | null;
  disabled: boolean;
  onChange: (trigger: TriggerDraft) => void;
}) {
  const { t } = useTranslation();
  const options: SelectOption[] = useMemo(
    () => [
      { value: 'none', label: t('scheduled_tasks.trigger_type.none') },
      ...TRIGGER_TYPES.map((type) => ({
        value: type,
        label: t(`scheduled_tasks.trigger_type.${type}`),
      })),
    ],
    [t]
  );
  return (
    <div className={styles.triggerRow}>
      <span className={styles.fieldLabel}>{t('scheduled_tasks.field.trigger')}</span>
      <div className={styles.triggerControls}>
        <Select
          value={trigger.mode}
          options={options}
          disabled={disabled}
          ariaLabel={t('scheduled_tasks.field.trigger_type')}
          onChange={(mode) => onChange({ mode: mode as TriggerMode, value: trigger.value })}
        />
        {trigger.mode !== 'none' && (
          <Input
            aria-label={t('scheduled_tasks.field.trigger_value')}
            value={trigger.value}
            disabled={disabled}
            spellCheck={false}
            autoComplete="off"
            placeholder={trigger.mode === 'cron' ? '0 9 * * *' : '30s'}
            onChange={(event) => onChange({ mode: trigger.mode, value: event.target.value })}
          />
        )}
      </div>
      <p className={styles.hint}>
        {trigger.mode === 'none'
          ? variant === 'group'
            ? t('scheduled_tasks.group.per_task')
            : groupTrigger
              ? t('scheduled_tasks.trigger.inherit_hint', { value: groupTrigger.value })
              : t('scheduled_tasks.trigger.manual_hint')
          : t(`scheduled_tasks.trigger.hint.${trigger.mode}`)}
      </p>
    </div>
  );
}

function idFieldHint(isNew: boolean): string {
  return isNew ? 'scheduled_tasks.field.id_hint_new' : 'scheduled_tasks.field.id_hint_locked';
}

function GroupEditor(props: Extract<TaskEditorModalProps, { mode: 'group' }>) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<GroupDraft>(() => props.group);
  const [invalid, setInvalid] = useState<DraftError | null>(null);
  const disabled = props.submitting;

  const submit = () => {
    const problem = validateGroupDraft(draft);
    if (problem) {
      setInvalid(problem);
      return;
    }
    setInvalid(null);
    props.onSubmitGroup(draft);
  };

  return (
    <Modal
      open={props.open}
      width={640}
      closeDisabled={props.submitting}
      onClose={props.onClose}
      title={t(
        props.isNew
          ? 'scheduled_tasks.group_editor.create_title'
          : 'scheduled_tasks.group_editor.edit_title'
      )}
      footer={
        <>
          <Button variant="ghost" disabled={props.submitting} onClick={props.onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={props.submitting} onClick={submit}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className={styles.grid}>
          <Input
            label={t('scheduled_tasks.field.id')}
            hint={t(idFieldHint(props.isNew))}
            value={draft.id}
            disabled={disabled || !props.isNew}
            spellCheck={false}
            autoComplete="off"
            error={invalid?.field === 'id' ? t(`scheduled_tasks.error.${invalid.key}`) : undefined}
            onChange={(event) => setDraft({ ...draft, id: event.target.value })}
          />
          <Input
            label={t('scheduled_tasks.field.name')}
            value={draft.name}
            disabled={disabled}
            error={
              invalid?.field === 'name' ? t(`scheduled_tasks.error.${invalid.key}`) : undefined
            }
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </div>
        <div className="form-group">
          <label htmlFor="scheduled-group-description">
            {t('scheduled_tasks.field.description')}
          </label>
          <textarea
            id="scheduled-group-description"
            className="input"
            rows={2}
            value={draft.description}
            disabled={disabled}
            aria-invalid={invalid?.field === 'description'}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
          {invalid?.field === 'description' && (
            <div className="error-box">{t(`scheduled_tasks.error.${invalid.key}`)}</div>
          )}
        </div>
        <ToggleSwitch
          checked={draft.enabled}
          disabled={disabled}
          label={t('scheduled_tasks.field.enabled')}
          ariaLabel={t('scheduled_tasks.field.group_enabled')}
          onChange={(enabled) => setDraft({ ...draft, enabled })}
        />
        <TriggerFields
          trigger={draft.trigger}
          variant="group"
          disabled={disabled}
          onChange={(trigger) => setDraft({ ...draft, trigger })}
        />
        {invalid?.field === 'trigger' && (
          <p className="error-box">{t(`scheduled_tasks.error.${invalid.key}`)}</p>
        )}
        {props.error && (
          <p className="error-box" role="alert">
            {props.error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function TaskEditor(props: Extract<TaskEditorModalProps, { mode: 'task' }>) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<TaskDraft>(() => props.task ?? emptyTaskDraft());
  const [tab, setTab] = useState<EditorTab>('form');
  const [curlText, setCurlText] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [textError, setTextError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [invalid, setInvalid] = useState<DraftError | null>(null);
  const panelId = useId();
  const disabled = props.submitting || parsing;
  const request = draft.request;

  const patchRequest = (patch: Partial<TaskDraft['request']>) =>
    setDraft({ ...draft, request: { ...draft.request, ...patch } });

  /** Reads the curl tab back into the draft, preserving what curl cannot express. */
  const commitCurl = useCallback(async (): Promise<{ error: string } | { next: TaskDraft }> => {
    const commands = splitCurlCommands(curlText);
    if (commands.length === 0) return { error: t('scheduled_tasks.editor.curl_empty') };
    if (commands.length > 1) {
      return { error: t('scheduled_tasks.editor.curl_multiple', { count: commands.length }) };
    }
    if (curlText.trim() === draftToCurl(draft).trim()) return { next: draft };
    setParsing(true);
    try {
      const parsed = await props.parseCurl(commands[0]);
      if (parsed.requests.length !== 1) {
        const message = parsed.errors[0]?.message;
        return { error: message || t('scheduled_tasks.editor.curl_failed') };
      }
      return { next: applyCurlRequest(draft, parsed.requests[0].request) };
    } catch (failure: unknown) {
      return { error: getErrorMessage(failure, t('scheduled_tasks.editor.curl_failed')) };
    } finally {
      setParsing(false);
    }
  }, [curlText, draft, props, t]);

  const commitJson = useCallback((): { error: string } | { next: TaskDraft } => {
    if (jsonText.trim() === taskDraftToJson(draft).trim()) return { next: draft };
    const parsed = taskDraftFromJson(jsonText);
    if (parsed.ok) return { next: parsed.value };
    return {
      error: t(`scheduled_tasks.json_error.${parsed.key}`, { detail: parsed.detail ?? '' }),
    };
  }, [draft, jsonText, t]);

  const openTab = async (next: EditorTab) => {
    if (next === tab) return;
    setTextError('');
    let current = draft;
    if (tab === 'curl') {
      const outcome = await commitCurl();
      if ('error' in outcome) {
        setTextError(outcome.error);
        return;
      }
      current = outcome.next;
    } else if (tab === 'json') {
      const outcome = commitJson();
      if ('error' in outcome) {
        setTextError(outcome.error);
        return;
      }
      current = outcome.next;
    }
    setDraft(current);
    setTab(next);
    if (next === 'curl') setCurlText(draftToCurl(current));
    if (next === 'json') setJsonText(taskDraftToJson(current));
  };

  const submit = () => {
    const problem = validateTaskDraft(draft);
    if (problem) {
      setInvalid(problem);
      // The offending field only exists in the form tab, so point at it.
      setTab('form');
      return;
    }
    setInvalid(null);
    props.onSubmitTask(draft);
  };

  const methodOptions: SelectOption[] = useMemo(() => {
    const values = (HTTP_METHODS as readonly string[]).includes(request.method)
      ? [...HTTP_METHODS]
      : [request.method, ...HTTP_METHODS];
    return values.filter(Boolean).map((method) => ({ value: method, label: method }));
  }, [request.method]);

  const tabLabel = (id: EditorTab) => t(`scheduled_tasks.editor.tab.${id}`);
  const idError = invalid?.field === 'id';

  return (
    <Modal
      open={props.open}
      width={760}
      closeDisabled={props.submitting}
      onClose={props.onClose}
      title={t(
        props.isNew
          ? 'scheduled_tasks.task_editor.create_title'
          : 'scheduled_tasks.task_editor.edit_title'
      )}
      footer={
        <>
          <Button variant="ghost" disabled={props.submitting} onClick={props.onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={props.submitting} disabled={parsing} onClick={submit}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div
        className={styles.tabs}
        role="tablist"
        aria-label={t('scheduled_tasks.editor.tabs_label')}
      >
        {EDITOR_TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${panelId}-${id}-tab`}
            aria-selected={tab === id}
            aria-controls={`${panelId}-${id}-panel`}
            className={tab === id ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            disabled={disabled}
            onClick={() => {
              void openTab(id);
            }}
          >
            {tabLabel(id)}
          </button>
        ))}
      </div>
      <div className={styles.panel} id={`${panelId}-${tab}-panel`} role="tabpanel">
        {tab === 'form' && (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className={styles.grid}>
              <Input
                label={t('scheduled_tasks.field.id')}
                hint={t(idFieldHint(props.isNew))}
                value={draft.id}
                disabled={disabled || !props.isNew}
                spellCheck={false}
                autoComplete="off"
                error={idError ? t(`scheduled_tasks.error.${invalid.key}`) : undefined}
                onChange={(event) => setDraft({ ...draft, id: event.target.value })}
              />
              <Input
                label={t('scheduled_tasks.field.name')}
                value={draft.name}
                disabled={disabled}
                error={
                  invalid?.field === 'name' ? t(`scheduled_tasks.error.${invalid.key}`) : undefined
                }
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </div>
            <ToggleSwitch
              checked={draft.enabled}
              disabled={disabled}
              label={t('scheduled_tasks.field.enabled')}
              ariaLabel={t('scheduled_tasks.field.task_enabled')}
              onChange={(enabled) => setDraft({ ...draft, enabled })}
            />
            <TriggerFields
              trigger={draft.trigger}
              variant="task"
              groupTrigger={props.groupTrigger}
              disabled={disabled}
              onChange={(trigger) => setDraft({ ...draft, trigger })}
            />
            <div className={styles.grid}>
              <div className="form-group">
                <label htmlFor={`${panelId}-method`}>{t('scheduled_tasks.field.method')}</label>
                <Select
                  id={`${panelId}-method`}
                  value={request.method}
                  options={methodOptions}
                  disabled={disabled}
                  ariaLabel={t('scheduled_tasks.field.method')}
                  onChange={(method) => patchRequest({ method })}
                />
              </div>
              <Input
                label={t('scheduled_tasks.field.url')}
                value={request.url}
                disabled={disabled}
                spellCheck={false}
                autoComplete="off"
                placeholder={t('scheduled_tasks.field.url_placeholder')}
                error={
                  invalid?.field === 'url' ? t(`scheduled_tasks.error.${invalid.key}`) : undefined
                }
                onChange={(event) => patchRequest({ url: event.target.value })}
              />
            </div>
            <fieldset className={styles.fieldset} disabled={disabled}>
              <legend>{t('scheduled_tasks.field.headers')}</legend>
              {request.headers.map((header, index) => (
                <div className={styles.headerRow} key={index}>
                  <Input
                    aria-label={t('scheduled_tasks.field.header_name', { number: index + 1 })}
                    placeholder="Authorization"
                    value={header.key}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) =>
                      patchRequest({
                        headers: request.headers.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, key: event.target.value } : row
                        ),
                      })
                    }
                  />
                  <Input
                    aria-label={t('scheduled_tasks.field.header_value', { number: index + 1 })}
                    placeholder="Bearer …"
                    value={header.value}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) =>
                      patchRequest({
                        headers: request.headers.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, value: event.target.value } : row
                        ),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={t('scheduled_tasks.field.remove_header', { number: index + 1 })}
                    onClick={() =>
                      patchRequest({
                        headers: request.headers.filter((_, rowIndex) => rowIndex !== index),
                      })
                    }
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  patchRequest({ headers: [...request.headers, { key: '', value: '' }] })
                }
              >
                {t('scheduled_tasks.field.add_header')}
              </Button>
              {invalid?.field === 'headers' && (
                <p className="error-box">{t(`scheduled_tasks.error.${invalid.key}`)}</p>
              )}
            </fieldset>
            <div className={styles.grid}>
              <div className="form-group">
                <label htmlFor={`${panelId}-body`}>{t('scheduled_tasks.field.body_mode')}</label>
                <Select
                  id={`${panelId}-body`}
                  value={request.bodyMode}
                  options={BODY_MODES.map((mode) => ({
                    value: mode,
                    label: t(`scheduled_tasks.body_mode.${mode}`),
                  }))}
                  disabled={disabled}
                  ariaLabel={t('scheduled_tasks.field.body_mode')}
                  onChange={(mode) => patchRequest({ bodyMode: mode as BodyMode })}
                />
              </div>
              <Input
                label={t('scheduled_tasks.field.timeout')}
                hint={t('scheduled_tasks.field.timeout_hint')}
                value={request.timeoutMs}
                disabled={disabled}
                inputMode="numeric"
                error={
                  invalid?.field === 'timeout'
                    ? t(`scheduled_tasks.error.${invalid.key}`)
                    : undefined
                }
                onChange={(event) => patchRequest({ timeoutMs: event.target.value })}
              />
            </div>
            {request.bodyMode === 'body' && (
              <div className="form-group">
                <label htmlFor={`${panelId}-payload`}>{t('scheduled_tasks.field.body')}</label>
                <textarea
                  id={`${panelId}-payload`}
                  className="input"
                  rows={4}
                  value={request.body}
                  spellCheck={false}
                  onChange={(event) => patchRequest({ body: event.target.value })}
                />
              </div>
            )}
            {request.bodyMode === 'form' && (
              <fieldset className={styles.fieldset} disabled={disabled}>
                <legend>{t('scheduled_tasks.field.form')}</legend>
                <p className={styles.hint}>{t('scheduled_tasks.field.form_hint')}</p>
                {request.form.map((field, index) => (
                  <div className={styles.headerRow} key={index}>
                    <Input
                      aria-label={t('scheduled_tasks.field.form_name', { number: index + 1 })}
                      placeholder="name"
                      value={field.name}
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) =>
                        patchRequest({
                          form: request.form.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, name: event.target.value } : row
                          ),
                        })
                      }
                    />
                    <Input
                      aria-label={t('scheduled_tasks.field.form_value', { number: index + 1 })}
                      placeholder="value"
                      value={field.value}
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) =>
                        patchRequest({
                          form: request.form.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, value: event.target.value } : row
                          ),
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={t('scheduled_tasks.field.remove_form', { number: index + 1 })}
                      onClick={() =>
                        patchRequest({
                          form: request.form.filter((_, rowIndex) => rowIndex !== index),
                        })
                      }
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => patchRequest({ form: [...request.form, { name: '', value: '' }] })}
                >
                  {t('scheduled_tasks.field.add_form')}
                </Button>
                {invalid?.field === 'form' && (
                  <p className="error-box">{t(`scheduled_tasks.error.${invalid.key}`)}</p>
                )}
              </fieldset>
            )}
            <ToggleSwitch
              checked={request.followRedirects}
              disabled={disabled}
              label={t('scheduled_tasks.field.follow_redirects')}
              ariaLabel={t('scheduled_tasks.field.follow_redirects')}
              onChange={(followRedirects) => patchRequest({ followRedirects })}
            />
            {invalid && (
              <p className="error-box" role="alert">
                {t(`scheduled_tasks.error.${invalid.key}`)}
              </p>
            )}
          </form>
        )}
        {tab === 'curl' && (
          <div className={styles.textTab}>
            <p className={styles.hint}>{t('scheduled_tasks.editor.curl_hint')}</p>
            <textarea
              className="input"
              rows={8}
              spellCheck={false}
              aria-label={t('scheduled_tasks.editor.tab.curl')}
              value={curlText}
              disabled={disabled}
              onChange={(event) => setCurlText(event.target.value)}
            />
            <div className={styles.textActions}>
              <Button
                variant="secondary"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  setCurlText(draftToCurl(draft));
                  setTextError('');
                }}
              >
                {t('scheduled_tasks.editor.curl_reset')}
              </Button>
              {parsing && (
                <span className={styles.hint}>{t('scheduled_tasks.editor.parsing')}</span>
              )}
            </div>
          </div>
        )}
        {tab === 'json' && (
          <div className={styles.textTab}>
            <p className={styles.hint}>{t('scheduled_tasks.editor.json_hint')}</p>
            <textarea
              className="input"
              rows={12}
              spellCheck={false}
              aria-label={t('scheduled_tasks.editor.tab.json')}
              value={jsonText}
              disabled={disabled}
              onChange={(event) => setJsonText(event.target.value)}
            />
            <div className={styles.textActions}>
              <Button
                variant="secondary"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  setJsonText(taskDraftToJson(draft));
                  setTextError('');
                }}
              >
                {t('scheduled_tasks.editor.json_reset')}
              </Button>
            </div>
          </div>
        )}
        {textError && (
          <p className="error-box" role="alert">
            {textError}
          </p>
        )}
        {props.error && (
          <p className="error-box" role="alert">
            {props.error}
          </p>
        )}
      </div>
    </Modal>
  );
}

export function TaskEditorModal(props: TaskEditorModalProps) {
  return props.mode === 'group' ? <GroupEditor {...props} /> : <TaskEditor {...props} />;
}
