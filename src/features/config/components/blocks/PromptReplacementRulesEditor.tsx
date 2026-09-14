import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { makeClientId } from '@/types/visualConfig';
import type { PromptReplacementRuleEntry } from '@/types/visualConfig';
import { ExpandableInput } from './ExpandableInput';
import styles from './Blocks.module.scss';

const createPromptReplacementRule = (): PromptReplacementRuleEntry => ({
  id: makeClientId(),
  find: '',
  replace: '',
});

/** find→replace rule list editor for system-prompt-override replacements. */
export const PromptReplacementRulesEditor = memo(function PromptReplacementRulesEditor({
  value,
  disabled,
  onChange,
}: {
  value: PromptReplacementRuleEntry[];
  disabled?: boolean;
  onChange: (next: PromptReplacementRuleEntry[]) => void;
}) {
  const { t } = useTranslation();

  const updateRule = useCallback(
    (id: string, patch: Partial<PromptReplacementRuleEntry>) => {
      onChange(value.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
    },
    [onChange, value]
  );
  const addRule = useCallback(() => onChange([...value, createPromptReplacementRule()]), [
    onChange,
    value,
  ]);
  const removeRule = useCallback(
    (id: string) => onChange(value.filter((rule) => rule.id !== id)),
    [onChange, value]
  );

  return (
    <div className={styles.storeAuthEditor}>
      {value.map((rule) => (
        <div key={rule.id} className={styles.storeAuthRule}>
          <div className={styles.storeAuthRuleFields}>
            <ExpandableInput
              value={rule.find}
              placeholder={t('config_management.visual.sections.system_prompt_override.rule_find_placeholder')}
              ariaLabel={t('config_management.visual.sections.system_prompt_override.rule_find')}
              disabled={disabled}
              onChange={(find) => updateRule(rule.id, { find })}
            />
            <ExpandableInput
              value={rule.replace}
              placeholder={t('config_management.visual.sections.system_prompt_override.rule_replace_placeholder')}
              ariaLabel={t('config_management.visual.sections.system_prompt_override.rule_replace')}
              disabled={disabled}
              onChange={(replace) => updateRule(rule.id, { replace })}
            />
          </div>
          <Button
            variant="danger"
            size="sm"
            disabled={disabled}
            onClick={() => removeRule(rule.id)}
            aria-label={t('config_management.visual.sections.system_prompt_override.rule_remove')}
          >
            {t('common.delete')}
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={addRule}
      >
        {t('config_management.visual.sections.system_prompt_override.rule_add')}
      </Button>
    </div>
  );
});
