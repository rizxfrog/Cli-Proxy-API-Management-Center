import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapsible } from '@/components/ui/Collapsible';
import { Input } from '@/components/ui/Input';
import type { PluginStoreAuthRule, PromptReplacementRuleEntry } from '@/types/visualConfig';
import { CONFIG_TAB_ICONS, SECTION_INDEX_LABELS } from '../../constants';
import type { ConfigSectionProps } from '../../types';
import { SectionCard } from '../SectionCard';
import {
  BlockSetting,
  FieldHint,
  FieldShell,
  FieldStack,
  SettingCell,
  SettingList,
  TextSetting,
  ToggleSetting,
} from '../fields/FieldPrimitives';
import { PluginStoreAuthEditor } from '../blocks/PluginStoreAuthEditor';
import { PromptReplacementRulesEditor } from '../blocks/PromptReplacementRulesEditor';
import { StringListEditor } from '../blocks/StringListEditor';
import { getValidationMessage } from '../blocks/shared';
import { SectionOAuthBehavior } from './SectionOAuthBehavior';

const Icon = CONFIG_TAB_ICONS.advanced;

/** 05 高级与实验：插件源、供应商敏感词、签名缓存与请求头默认值。 */
export function SectionAdvanced({
  values,
  validationErrors,
  disabled,
  animateIn,
  onChange,
}: ConfigSectionProps) {
  const { t } = useTranslation();

  const handlePluginStoreSourcesChange = useCallback(
    (pluginStoreSources: string[]) => onChange({ pluginStoreSources }),
    [onChange]
  );
  const handlePluginStoreAuthChange = useCallback(
    (pluginStoreAuth: PluginStoreAuthRule[]) => onChange({ pluginStoreAuth }),
    [onChange]
  );
  const handleAntigravitySensitiveWordsChange = useCallback(
    (antigravitySensitiveWords: string[]) => onChange({ antigravitySensitiveWords }),
    [onChange]
  );
  const handleDevinSensitiveWordsChange = useCallback(
    (devinSensitiveWords: string[]) => onChange({ devinSensitiveWords }),
    [onChange]
  );
  const handleOverrideProvidersChange = useCallback(
    (providers: string[]) =>
      onChange({ systemPromptOverride: { ...values.systemPromptOverride, providers } }),
    [onChange, values.systemPromptOverride]
  );
  const handleOverrideExcludedProvidersChange = useCallback(
    (excludedProviders: string[]) =>
      onChange({
        systemPromptOverride: { ...values.systemPromptOverride, excludedProviders },
      }),
    [onChange, values.systemPromptOverride]
  );
  const handleOverrideModelsChange = useCallback(
    (models: string[]) =>
      onChange({ systemPromptOverride: { ...values.systemPromptOverride, models } }),
    [onChange, values.systemPromptOverride]
  );
  const handleOverrideReplacementsChange = useCallback(
    (replacements: PromptReplacementRuleEntry[]) =>
      onChange({ systemPromptOverride: { ...values.systemPromptOverride, replacements } }),
    [onChange, values.systemPromptOverride]
  );
  const handleOverrideToolReplacementsChange = useCallback(
    (toolDescriptionReplacements: PromptReplacementRuleEntry[]) =>
      onChange({
        systemPromptOverride: { ...values.systemPromptOverride, toolDescriptionReplacements },
      }),
    [onChange, values.systemPromptOverride]
  );

  return (
    <SectionCard
      indexLabel={SECTION_INDEX_LABELS.advanced}
      icon={<Icon size={16} />}
      title={t('config_management.visual.sections.advanced.title')}
      description={t('config_management.visual.sections.advanced.description')}
      animateIn={animateIn}
    >
      <SectionOAuthBehavior
        values={values}
        validationErrors={validationErrors}
        disabled={disabled}
        onChange={onChange}
      />

      <Collapsible
        label={t('config_management.visual.sections.advanced.plugins_title')}
        defaultOpen={false}
      >
        <FieldStack>
          <SettingList>
            <ToggleSetting
              fieldId="pluginsEnabled"
              label={t('config_management.visual.sections.system.plugins_enabled')}
              description={t('config_management.visual.sections.system.plugins_enabled_desc')}
              checked={values.pluginsEnabled}
              disabled={disabled}
              onChange={(pluginsEnabled) => onChange({ pluginsEnabled })}
            />
          </SettingList>

          <SettingList
            title={t('config_management.visual.sections.system.plugin_store_sources')}
            description={t('config_management.visual.sections.system.plugin_store_sources_desc')}
          >
            <BlockSetting
              fieldId="pluginStoreSources"
              label={t('config_management.visual.sections.system.plugin_store_sources_label')}
              description={t('config_management.visual.sections.system.plugin_store_sources_hint')}
            >
              <StringListEditor
                value={values.pluginStoreSources}
                disabled={disabled}
                placeholder={t(
                  'config_management.visual.sections.system.plugin_store_sources_placeholder'
                )}
                inputAriaLabel={t(
                  'config_management.visual.sections.system.plugin_store_sources_label'
                )}
                onChange={handlePluginStoreSourcesChange}
              />
            </BlockSetting>
          </SettingList>

          <SettingList
            title={t('config_management.visual.sections.system.plugin_store_auth')}
            description={t('config_management.visual.sections.system.plugin_store_auth_desc')}
          >
            <SettingCell fieldId="pluginStoreAuth">
              <FieldStack>
                <FieldHint>
                  {t('config_management.visual.sections.system.plugin_store_auth_hint')}
                </FieldHint>
                <PluginStoreAuthEditor
                  value={values.pluginStoreAuth}
                  disabled={disabled}
                  onChange={handlePluginStoreAuthChange}
                />
              </FieldStack>
            </SettingCell>
          </SettingList>
        </FieldStack>
      </Collapsible>

      <Collapsible
        label={t('config_management.visual.sections.advanced.antigravity_title')}
        defaultOpen={false}
      >
        <FieldStack>
          <SettingList>
            <ToggleSetting
              fieldId="quotaAntigravityCredits"
              label={t('config_management.visual.sections.advanced.antigravity_credits')}
              checked={values.quotaAntigravityCredits}
              disabled={disabled}
              onChange={(quotaAntigravityCredits) => onChange({ quotaAntigravityCredits })}
            />
          </SettingList>
          <SettingList
            title={t('config_management.visual.sections.system.antigravity_sensitive_words')}
            description={t(
              'config_management.visual.sections.system.antigravity_sensitive_words_desc'
            )}
          >
            <BlockSetting
              fieldId="antigravitySensitiveWords"
              label={t(
                'config_management.visual.sections.system.antigravity_sensitive_words_label'
              )}
              description={t(
                'config_management.visual.sections.system.antigravity_sensitive_words_hint'
              )}
            >
              <StringListEditor
                value={values.antigravitySensitiveWords}
                disabled={disabled}
                placeholder={t(
                  'config_management.visual.sections.system.antigravity_sensitive_words_placeholder'
                )}
                inputAriaLabel={t(
                  'config_management.visual.sections.system.antigravity_sensitive_words_label'
                )}
                onChange={handleAntigravitySensitiveWordsChange}
              />
            </BlockSetting>
          </SettingList>

          <SettingList title={t('config_management.visual.sections.advanced.signature_title')}>
            <ToggleSetting
              fieldId="antigravitySignatureCacheEnabled"
              label={t('config_management.visual.sections.system.antigravity_signature_cache')}
              description={t(
                'config_management.visual.sections.system.antigravity_signature_cache_desc'
              )}
              checked={values.antigravitySignatureCacheEnabled}
              disabled={disabled}
              onChange={(antigravitySignatureCacheEnabled) =>
                onChange({ antigravitySignatureCacheEnabled })
              }
            />
            <ToggleSetting
              fieldId="antigravitySignatureBypassStrict"
              label={t('config_management.visual.sections.system.antigravity_signature_strict')}
              description={t(
                'config_management.visual.sections.system.antigravity_signature_strict_desc'
              )}
              checked={values.antigravitySignatureBypassStrict}
              disabled={disabled}
              onChange={(antigravitySignatureBypassStrict) =>
                onChange({ antigravitySignatureBypassStrict })
              }
            />
          </SettingList>
        </FieldStack>
      </Collapsible>

      <Collapsible
        label={t('config_management.visual.sections.advanced.devin_title')}
        defaultOpen={false}
      >
        <SettingList
          title={t('config_management.visual.sections.system.devin_sensitive_words')}
          description={t('config_management.visual.sections.system.devin_sensitive_words_desc')}
        >
          <BlockSetting
            fieldId="devinSensitiveWords"
            label={t('config_management.visual.sections.system.devin_sensitive_words_label')}
            description={t('config_management.visual.sections.system.devin_sensitive_words_hint')}
          >
            <StringListEditor
              value={values.devinSensitiveWords}
              disabled={disabled}
              placeholder={t(
                'config_management.visual.sections.system.devin_sensitive_words_placeholder'
              )}
              inputAriaLabel={t(
                'config_management.visual.sections.system.devin_sensitive_words_label'
              )}
              onChange={handleDevinSensitiveWordsChange}
            />
          </BlockSetting>
        </SettingList>
      </Collapsible>

      <Collapsible
        label={t('config_management.visual.sections.advanced.system_prompt_override_title')}
        defaultOpen={false}
      >
        <FieldStack>
          <SettingList>
            <ToggleSetting
              fieldId="systemPromptOverride"
              label={t('config_management.visual.sections.system_prompt_override.enabled')}
              description={t(
                'config_management.visual.sections.system_prompt_override.enabled_desc'
              )}
              checked={values.systemPromptOverride.enabled}
              disabled={disabled}
              onChange={(enabled) =>
                onChange({ systemPromptOverride: { ...values.systemPromptOverride, enabled } })
              }
            />
          </SettingList>

          <SettingList>
            <BlockSetting
              fieldId="systemPromptOverride"
              label={t('config_management.visual.sections.system_prompt_override.prompt')}
              description={t(
                'config_management.visual.sections.system_prompt_override.prompt_hint'
              )}
            >
              <textarea
                className="input"
                style={{ minHeight: 96, resize: 'vertical', width: '100%' }}
                value={values.systemPromptOverride.prompt}
                disabled={disabled}
                rows={4}
                placeholder={t(
                  'config_management.visual.sections.system_prompt_override.prompt_placeholder'
                )}
                onChange={(e) =>
                  onChange({
                    systemPromptOverride: {
                      ...values.systemPromptOverride,
                      prompt: e.target.value,
                    },
                  })
                }
              />
            </BlockSetting>
            <BlockSetting
              fieldId="systemPromptOverride"
              label={t('config_management.visual.sections.system_prompt_override.prompt_file')}
              description={t(
                'config_management.visual.sections.system_prompt_override.prompt_file_hint'
              )}
            >
              <Input
                placeholder="/path/to/prompt-inject.md"
                value={values.systemPromptOverride.promptFile}
                disabled={disabled}
                onChange={(e) =>
                  onChange({
                    systemPromptOverride: {
                      ...values.systemPromptOverride,
                      promptFile: e.target.value,
                    },
                  })
                }
              />
            </BlockSetting>
          </SettingList>

          <SettingList
            title={t('config_management.visual.sections.system_prompt_override.scope_title')}
            description={t('config_management.visual.sections.system_prompt_override.scope_desc')}
          >
            <SettingCell fieldId="systemPromptOverride">
              <FieldStack>
                <FieldHint>
                  {t('config_management.visual.sections.system_prompt_override.scope_hint')}
                </FieldHint>
                <FieldShell
                  label={t('config_management.visual.sections.system_prompt_override.providers')}
                  hint={t(
                    'config_management.visual.sections.system_prompt_override.providers_hint'
                  )}
                >
                  <StringListEditor
                    value={values.systemPromptOverride.providers}
                    disabled={disabled}
                    placeholder="claude"
                    inputAriaLabel={t(
                      'config_management.visual.sections.system_prompt_override.providers'
                    )}
                    onChange={handleOverrideProvidersChange}
                  />
                </FieldShell>
                <FieldShell
                  label={t(
                    'config_management.visual.sections.system_prompt_override.excluded_providers'
                  )}
                  hint={t(
                    'config_management.visual.sections.system_prompt_override.excluded_providers_hint'
                  )}
                >
                  <StringListEditor
                    value={values.systemPromptOverride.excludedProviders}
                    disabled={disabled}
                    placeholder="codex"
                    inputAriaLabel={t(
                      'config_management.visual.sections.system_prompt_override.excluded_providers'
                    )}
                    onChange={handleOverrideExcludedProvidersChange}
                  />
                </FieldShell>
                <FieldShell
                  label={t('config_management.visual.sections.system_prompt_override.models')}
                  hint={t('config_management.visual.sections.system_prompt_override.models_hint')}
                >
                  <StringListEditor
                    value={values.systemPromptOverride.models}
                    disabled={disabled}
                    placeholder="gemini-*"
                    inputAriaLabel={t(
                      'config_management.visual.sections.system_prompt_override.models'
                    )}
                    onChange={handleOverrideModelsChange}
                  />
                </FieldShell>
              </FieldStack>
            </SettingCell>
          </SettingList>

          <SettingList
            title={t('config_management.visual.sections.system_prompt_override.replacements_title')}
            description={t(
              'config_management.visual.sections.system_prompt_override.replacements_desc'
            )}
          >
            <SettingCell fieldId="systemPromptOverride">
              <FieldStack>
                <FieldHint>
                  {t('config_management.visual.sections.system_prompt_override.replacements_hint')}
                </FieldHint>
                <FieldShell
                  label={t('config_management.visual.sections.system_prompt_override.rule_find')}
                  hint={t(
                    'config_management.visual.sections.system_prompt_override.rule_replace_hint'
                  )}
                >
                  <PromptReplacementRulesEditor
                    value={values.systemPromptOverride.replacements}
                    disabled={disabled}
                    onChange={handleOverrideReplacementsChange}
                  />
                </FieldShell>
              </FieldStack>
            </SettingCell>
          </SettingList>

          <SettingList
            title={t(
              'config_management.visual.sections.system_prompt_override.tool_replacements_title'
            )}
            description={t(
              'config_management.visual.sections.system_prompt_override.tool_replacements_desc'
            )}
          >
            <SettingCell fieldId="systemPromptOverride">
              <FieldStack>
                <FieldHint>
                  {t(
                    'config_management.visual.sections.system_prompt_override.tool_replacements_hint'
                  )}
                </FieldHint>
                <FieldShell
                  label={t('config_management.visual.sections.system_prompt_override.rule_find')}
                  hint={t(
                    'config_management.visual.sections.system_prompt_override.rule_replace_hint'
                  )}
                >
                  <PromptReplacementRulesEditor
                    value={values.systemPromptOverride.toolDescriptionReplacements}
                    disabled={disabled}
                    onChange={handleOverrideToolReplacementsChange}
                  />
                </FieldShell>
              </FieldStack>
            </SettingCell>
          </SettingList>
        </FieldStack>
      </Collapsible>

      <Collapsible
        label={t('config_management.visual.sections.headers.title')}
        hint={t('config_management.visual.sections.headers.description')}
        defaultOpen={false}
      >
        <FieldStack>
          <SettingList title={t('config_management.visual.sections.headers.claude_title')}>
            <TextSetting
              fieldId="claudeHeaderUserAgent"
              size="lg"
              label={t('config_management.visual.sections.headers.user_agent')}
              placeholder="claude-cli/2.1.44 (external, sdk-cli)"
              value={values.claudeHeaderUserAgent}
              onChange={(claudeHeaderUserAgent) => onChange({ claudeHeaderUserAgent })}
              disabled={disabled}
            />
            <TextSetting
              fieldId="claudeHeaderPackageVersion"
              size="sm"
              label={t('config_management.visual.sections.headers.package_version')}
              placeholder="0.74.0"
              value={values.claudeHeaderPackageVersion}
              onChange={(claudeHeaderPackageVersion) => onChange({ claudeHeaderPackageVersion })}
              disabled={disabled}
            />
            <TextSetting
              fieldId="claudeHeaderRuntimeVersion"
              size="sm"
              label={t('config_management.visual.sections.headers.runtime_version')}
              placeholder="v24.3.0"
              value={values.claudeHeaderRuntimeVersion}
              onChange={(claudeHeaderRuntimeVersion) => onChange({ claudeHeaderRuntimeVersion })}
              disabled={disabled}
            />
            <TextSetting
              fieldId="claudeHeaderOs"
              size="sm"
              label={t('config_management.visual.sections.headers.os')}
              placeholder="MacOS"
              value={values.claudeHeaderOs}
              onChange={(claudeHeaderOs) => onChange({ claudeHeaderOs })}
              disabled={disabled}
            />
            <TextSetting
              fieldId="claudeHeaderArch"
              size="sm"
              label={t('config_management.visual.sections.headers.arch')}
              placeholder="arm64"
              value={values.claudeHeaderArch}
              onChange={(claudeHeaderArch) => onChange({ claudeHeaderArch })}
              disabled={disabled}
            />
            <TextSetting
              fieldId="claudeHeaderTimezone"
              label={t('config_management.visual.additions.claudeHeaderTimezone.label')}
              description={t('config_management.visual.additions.claudeHeaderTimezone.hint')}
              value={values.claudeHeaderTimezone}
              onChange={(claudeHeaderTimezone) => onChange({ claudeHeaderTimezone })}
              disabled={disabled}
              error={getValidationMessage(t, validationErrors?.claudeHeaderTimezone)}
            />
            <TextSetting
              fieldId="claudeHeaderTimeout"
              size="sm"
              label={t('config_management.visual.sections.headers.timeout')}
              placeholder="600"
              value={values.claudeHeaderTimeout}
              onChange={(claudeHeaderTimeout) => onChange({ claudeHeaderTimeout })}
              disabled={disabled}
            />
            <ToggleSetting
              fieldId="claudeHeaderStabilizeDeviceProfile"
              label={t('config_management.visual.sections.headers.stabilize_device')}
              description={t('config_management.visual.sections.headers.stabilize_device_desc')}
              checked={values.claudeHeaderStabilizeDeviceProfile}
              disabled={disabled}
              onChange={(claudeHeaderStabilizeDeviceProfile) =>
                onChange({ claudeHeaderStabilizeDeviceProfile })
              }
            />
          </SettingList>

          <SettingList title={t('config_management.visual.sections.headers.codex_title')}>
            <TextSetting
              fieldId="codexHeaderUserAgent"
              size="lg"
              label={t('config_management.visual.sections.headers.user_agent')}
              placeholder="codex_cli_rs/0.114.0 (Mac OS 14.2.0; x86_64) vscode/1.111.0"
              value={values.codexHeaderUserAgent}
              onChange={(codexHeaderUserAgent) => onChange({ codexHeaderUserAgent })}
              disabled={disabled}
            />
            <TextSetting
              fieldId="codexHeaderBetaFeatures"
              label={t('config_management.visual.sections.headers.beta_features')}
              placeholder="multi_agent"
              value={values.codexHeaderBetaFeatures}
              onChange={(codexHeaderBetaFeatures) => onChange({ codexHeaderBetaFeatures })}
              disabled={disabled}
            />
          </SettingList>
        </FieldStack>
      </Collapsible>
    </SectionCard>
  );
}
