import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Collapsible } from '@/components/ui/Collapsible';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  EMPTY_MODEL_DRAFT_INPUT,
  hasModelDraftErrors,
  validateModelDraft,
  type ModelDraftError,
  type ModelDraftInput,
} from '../logic';

export type ProviderModelEditorProps = {
  open: boolean;
  provider: string;
  /** 编辑已有自定义定义；null 表示新增。 */
  input: ModelDraftInput | null;
  /** 用于重复校验的既有自定义 id 列表。 */
  customIds: string[];
  /** 被覆盖的原始 id（编辑时重命名要删除旧定义）。 */
  originalId?: string;
  /** 该条目上游仍有定义：删除自定义定义会回到默认，而不是消失。 */
  needsRestoreNote: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (input: ModelDraftInput) => void;
};

/**
 * 自定义模型编辑器。
 *
 * v1 只编辑**真实上游模型 ID**，不做别名 —— 别名已有独立页面
 * （认证文件 → OAuth 模型别名），这里混进来只会让两处语义打架。
 */
export function ProviderModelEditor(props: ProviderModelEditorProps) {
  const {
    open,
    provider,
    input,
    customIds,
    originalId,
    needsRestoreNote,
    saving,
    onClose,
    onSave,
  } = props;
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ModelDraftInput>(EMPTY_MODEL_DRAFT_INPUT);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // 每次打开都以传入的输入为准重置，避免上一次的编辑残留到下一次。
  useEffect(() => {
    if (!open) return;
    setDraft(input ?? EMPTY_MODEL_DRAFT_INPUT);
    setAdvancedOpen(false);
    setSubmitted(false);
  }, [open, input]);

  const isEditing = Boolean(input && originalId);
  const errors = validateModelDraft(draft, { customIds, originalId });
  const showErrors = submitted && hasModelDraftErrors(errors);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (hasModelDraftErrors(errors)) return;
    onSave(draft);
  };

  /** id 字段只会出现这三种错误；'number' 属于数值字段。 */
  const errorText = (
    kind: Exclude<ModelDraftError, 'number'> | undefined
  ): string | undefined => {
    if (!showErrors || !kind) return undefined;
    if (kind === 'required') return t('model_management.error_id_required');
    if (kind === 'duplicate') return t('model_management.error_id_duplicate');
    return t('model_management.error_id_invalid');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        isEditing
          ? t('model_management.edit_title', { provider })
          : t('model_management.add_title', { provider })
      }
      closeDisabled={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="provider-model-editor-form" loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="provider-model-editor-form" onSubmit={handleSubmit} noValidate>
        <Input
          label={t('model_management.field_id')}
          value={draft.id}
          onChange={(event) => setDraft({ ...draft, id: event.target.value })}
          placeholder={t('model_management.field_id_placeholder')}
          hint={t('model_management.field_id_hint')}
          error={errorText(errors.id === 'number' ? 'invalid' : errors.id)}
          autoFocus
        />

        <Input
          label={t('model_management.field_display_name')}
          value={draft.displayName}
          onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
          placeholder={t('model_management.field_display_name_placeholder')}
          hint={t('model_management.field_display_name_hint')}
        />

        {needsRestoreNote && (
          <div className="hint">{t('model_management.restore_note')}</div>
        )}

        <Collapsible
          label={t('model_management.advanced')}
          hint={t('model_management.advanced_hint')}
          open={advancedOpen}
          onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
        >
          <Input
            label={t('model_management.field_context_length')}
            value={draft.contextLength}
            onChange={(event) => setDraft({ ...draft, contextLength: event.target.value })}
            inputMode="numeric"
            placeholder="200000"
            error={showErrors && errors.contextLength ? t('model_management.error_number') : undefined}
            hint={t('model_management.field_context_length_hint')}
          />

          <Input
            label={t('model_management.field_max_completion')}
            value={draft.maxCompletionTokens}
            onChange={(event) => setDraft({ ...draft, maxCompletionTokens: event.target.value })}
            inputMode="numeric"
            placeholder="8192"
            error={
              showErrors && errors.maxCompletionTokens ? t('model_management.error_number') : undefined
            }
            hint={t('model_management.field_max_completion_hint')}
          />

          <Input
            label={t('model_management.field_thinking_min')}
            value={draft.thinkingMin}
            onChange={(event) => setDraft({ ...draft, thinkingMin: event.target.value })}
            inputMode="numeric"
            placeholder="0"
            error={showErrors && errors.thinking ? t('model_management.error_thinking_range') : undefined}
          />

          <Input
            label={t('model_management.field_thinking_max')}
            value={draft.thinkingMax}
            onChange={(event) => setDraft({ ...draft, thinkingMax: event.target.value })}
            inputMode="numeric"
            placeholder="32768"
          />

          <Input
            label={t('model_management.field_thinking_levels')}
            value={draft.thinkingLevels}
            onChange={(event) => setDraft({ ...draft, thinkingLevels: event.target.value })}
            placeholder="low, medium, high"
            hint={t('model_management.field_thinking_levels_hint')}
          />

          <div className="form-group">
            <ToggleSwitch
              checked={draft.thinkingZeroAllowed}
              onChange={(value) => setDraft({ ...draft, thinkingZeroAllowed: value })}
              label={t('model_management.field_thinking_zero')}
            />
          </div>

          <div className="form-group">
            <ToggleSwitch
              checked={draft.thinkingDynamicAllowed}
              onChange={(value) => setDraft({ ...draft, thinkingDynamicAllowed: value })}
              label={t('model_management.field_thinking_dynamic')}
            />
          </div>
        </Collapsible>
      </form>
    </Modal>
  );
}
