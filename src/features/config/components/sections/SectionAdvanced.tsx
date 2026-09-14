import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapsible } from '@/components/ui/Collapsible';
import { Input } from '@/components/ui/Input';
import type {
  PluginStoreAuthRule,
  PromptReplacementRuleEntry,
} from '@/types/visualConfig';
import { CONFIG_TAB_ICONS, SECTION_INDEX_LABELS } from '../../constants';
import type { ConfigSectionProps } from '../../types';
import { SectionCard } from '../SectionCard';
import {
  Divider,
  FieldAnchor,
  FieldGrid,
  FieldGroup,
  FieldGroupHeading,
  FieldHint,
  FieldShell,
  FieldStack,
  ToggleRow,
} from '../fields/FieldPrimitives';
import { PluginStoreAuthEditor } from '../blocks/PluginStoreAuthEditor';
import { PromptReplacementRulesEditor } from '../blocks/PromptReplacementRulesEditor';
import { StringListEditor } from '../blocks/StringListEditor';

const Icon = CONFIG_TAB_ICONS.advanced;

/** 06 高级与实验：插件源、供应商敏感词、签名缓存与请求头默认值。 */
export function SectionAdvanced({ values, disabled, animateIn, onChange }: ConfigSectionProps) {
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
      <FieldStack>
        <Collapsible
          label={t('config_management.visual.sections.advanced.plugins_title')}
          defaultOpen={false}
        >
          <FieldStack>
            <FieldGrid>
              <FieldAnchor fieldId="pluginsEnabled">
                <ToggleRow
                  title={t('config_management.visual.sections.system.plugins_enabled')}
                  description={t('config_management.visual.sections.system.plugins_enabled_desc')}
                  checked={values.pluginsEnabled}
                  disabled={disabled}
                  onChange={(pluginsEnabled) => onChange({ pluginsEnabled })}
                />
              </FieldAnchor>
            </FieldGrid>

            <FieldAnchor fieldId="pluginStoreSources">
              <FieldGroup
                title={t('config_management.visual.sections.system.plugin_store_sources')}
                description={t(
                  'config_management.visual.sections.system.plugin_store_sources_desc'
                )}
              >
                <FieldShell
                  label={t('config_management.visual.sections.system.plugin_store_sources_label')}
                  hint={t('config_management.visual.sections.system.plugin_store_sources_hint')}
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
                </FieldShell>
              </FieldGroup>
            </FieldAnchor>

            <FieldAnchor fieldId="pluginStoreAuth">
              <FieldGroup
                title={t('config_management.visual.sections.system.plugin_store_auth')}
                description={t('config_management.visual.sections.system.plugin_store_auth_desc')}
              >
                <FieldHint>
                  {t('config_management.visual.sections.system.plugin_store_auth_hint')}
                </FieldHint>
                <PluginStoreAuthEditor
                  value={values.pluginStoreAuth}
                  disabled={disabled}
                  onChange={handlePluginStoreAuthChange}
                />
              </FieldGroup>
            </FieldAnchor>
          </FieldStack>
        </Collapsible>

        <Collapsible
          label={t('config_management.visual.sections.advanced.antigravity_title')}
          defaultOpen={false}
        >
          <FieldStack>
            <FieldAnchor fieldId="antigravitySensitiveWords">
              <FieldGroup
                title={t('config_management.visual.sections.system.antigravity_sensitive_words')}
                description={t(
                  'config_management.visual.sections.system.antigravity_sensitive_words_desc'
                )}
              >
                <FieldShell
                  label={t(
                    'config_management.visual.sections.system.antigravity_sensitive_words_label'
                  )}
                  hint={t(
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
                </FieldShell>
              </FieldGroup>
            </FieldAnchor>

            <Divider />
            <FieldGroupHeading
              title={t('config_management.visual.sections.advanced.signature_title')}
            />
            <FieldGrid>
              <FieldAnchor fieldId="antigravitySignatureCacheEnabled">
                <ToggleRow
                  title={t('config_management.visual.sections.system.antigravity_signature_cache')}
                  description={t(
                    'config_management.visual.sections.system.antigravity_signature_cache_desc'
                  )}
                  checked={values.antigravitySignatureCacheEnabled}
                  disabled={disabled}
                  onChange={(antigravitySignatureCacheEnabled) =>
                    onChange({ antigravitySignatureCacheEnabled })
                  }
                />
              </FieldAnchor>
              <FieldAnchor fieldId="antigravitySignatureBypassStrict">
                <ToggleRow
                  title={t('config_management.visual.sections.system.antigravity_signature_strict')}
                  description={t(
                    'config_management.visual.sections.system.antigravity_signature_strict_desc'
                  )}
                  checked={values.antigravitySignatureBypassStrict}
                  disabled={disabled}
                  onChange={(antigravitySignatureBypassStrict) =>
                    onChange({ antigravitySignatureBypassStrict })
                  }
                />
              </FieldAnchor>
            </FieldGrid>
          </FieldStack>
        </Collapsible>

        <Collapsible
          label={t('config_management.visual.sections.advanced.devin_title')}
          defaultOpen={false}
        >
          <FieldStack>
            <FieldAnchor fieldId="devinSensitiveWords">
              <FieldGroup
                title={t('config_management.visual.sections.system.devin_sensitive_words')}
                description={t(
                  'config_management.visual.sections.system.devin_sensitive_words_desc'
                )}
              >
                <FieldShell
                  label={t('config_management.visual.sections.system.devin_sensitive_words_label')}
                  hint={t('config_management.visual.sections.system.devin_sensitive_words_hint')}
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
                </FieldShell>
              </FieldGroup>
            </FieldAnchor>
          </FieldStack>
        </Collapsible>

        <Collapsible
          label={t('config_management.visual.sections.advanced.system_prompt_override_title')}
          defaultOpen={false}
        >
          <FieldStack>
            <FieldAnchor fieldId="systemPromptOverride">
              <ToggleRow
                title={t('config_management.visual.sections.system_prompt_override.enabled')}
                description={t(
                  'config_management.visual.sections.system_prompt_override.enabled_desc'
                )}
                checked={values.systemPromptOverride.enabled}
                disabled={disabled}
                onChange={(enabled) => onChange({ systemPromptOverride: { ...values.systemPromptOverride, enabled } })}
              />
            </FieldAnchor>

            <FieldAnchor fieldId="systemPromptOverride">
              <FieldShell
                label={t('config_management.visual.sections.system_prompt_override.prompt')}
                hint={t('config_management.visual.sections.system_prompt_override.prompt_hint')}
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
              </FieldShell>
            </FieldAnchor>

            <FieldAnchor fieldId="systemPromptOverride">
              <Input
                label={t('config_management.visual.sections.system_prompt_override.prompt_file')}
                placeholder="/path/to/prompt-inject.md"
                value={values.systemPromptOverride.promptFile}
                onChange={(e) =>
                  onChange({
                    systemPromptOverride: {
                      ...values.systemPromptOverride,
                      promptFile: e.target.value,
                    },
                  })
                }
                disabled={disabled}
                hint={t(
                  'config_management.visual.sections.system_prompt_override.prompt_file_hint'
                )}
              />
            </FieldAnchor>

            <FieldGroup
              title={t('config_management.visual.sections.system_prompt_override.scope_title')}
              description={t(
                'config_management.visual.sections.system_prompt_override.scope_desc'
              )}
            >
              <FieldHint>
                {t('config_management.visual.sections.system_prompt_override.scope_hint')}
              </FieldHint>
              <FieldAnchor fieldId="systemPromptOverride">
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
              </FieldAnchor>
              <FieldAnchor fieldId="systemPromptOverride">
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
              </FieldAnchor>
              <FieldAnchor fieldId="systemPromptOverride">
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
              </FieldAnchor>
            </FieldGroup>

            <FieldGroup
              title={t('config_management.visual.sections.system_prompt_override.replacements_title')}
              description={t(
                'config_management.visual.sections.system_prompt_override.replacements_desc'
              )}
            >
              <FieldHint>
                {t('config_management.visual.sections.system_prompt_override.replacements_hint')}
              </FieldHint>
              <FieldAnchor fieldId="systemPromptOverride">
                <FieldShell
                  label={t('config_management.visual.sections.system_prompt_override.rule_find')}
                  hint={t('config_management.visual.sections.system_prompt_override.rule_replace_hint')}
                >
                  <PromptReplacementRulesEditor
                    value={values.systemPromptOverride.replacements}
                    disabled={disabled}
                    onChange={handleOverrideReplacementsChange}
                  />
                </FieldShell>
              </FieldAnchor>
            </FieldGroup>

            <FieldGroup
              title={t(
                'config_management.visual.sections.system_prompt_override.tool_replacements_title'
              )}
              description={t(
                'config_management.visual.sections.system_prompt_override.tool_replacements_desc'
              )}
            >
              <FieldHint>
                {t(
                  'config_management.visual.sections.system_prompt_override.tool_replacements_hint'
                )}
              </FieldHint>
              <FieldAnchor fieldId="systemPromptOverride">
                <FieldShell
                  label={t('config_management.visual.sections.system_prompt_override.rule_find')}
                  hint={t('config_management.visual.sections.system_prompt_override.rule_replace_hint')}
                >
                  <PromptReplacementRulesEditor
                    value={values.systemPromptOverride.toolDescriptionReplacements}
                    disabled={disabled}
                    onChange={handleOverrideToolReplacementsChange}
                  />
                </FieldShell>
              </FieldAnchor>
            </FieldGroup>
          </FieldStack>
        </Collapsible>

        <Collapsible
          label={t('config_management.visual.sections.headers.title')}
          hint={t('config_management.visual.sections.headers.description')}
          defaultOpen={false}
        >
          <FieldStack>
            <FieldGroupHeading
              title={t('config_management.visual.sections.headers.claude_title')}
            />
            <FieldGrid>
              <FieldAnchor fieldId="claudeHeaderUserAgent">
                <Input
                  label={t('config_management.visual.sections.headers.user_agent')}
                  placeholder="claude-cli/2.1.44 (external, sdk-cli)"
                  value={values.claudeHeaderUserAgent}
                  onChange={(e) => onChange({ claudeHeaderUserAgent: e.target.value })}
                  disabled={disabled}
                />
              </FieldAnchor>
              <FieldAnchor fieldId="claudeHeaderPackageVersion">
                <Input
                  label={t('config_management.visual.sections.headers.package_version')}
                  placeholder="0.74.0"
                  value={values.claudeHeaderPackageVersion}
                  onChange={(e) => onChange({ claudeHeaderPackageVersion: e.target.value })}
                  disabled={disabled}
                />
              </FieldAnchor>
              <FieldAnchor fieldId="claudeHeaderRuntimeVersion">
                <Input
                  label={t('config_management.visual.sections.headers.runtime_version')}
                  placeholder="v24.3.0"
                  value={values.claudeHeaderRuntimeVersion}
                  onChange={(e) => onChange({ claudeHeaderRuntimeVersion: e.target.value })}
                  disabled={disabled}
                />
              </FieldAnchor>
              <FieldAnchor fieldId="claudeHeaderOs">
                <Input
                  label={t('config_management.visual.sections.headers.os')}
                  placeholder="MacOS"
                  value={values.claudeHeaderOs}
                  onChange={(e) => onChange({ claudeHeaderOs: e.target.value })}
                  disabled={disabled}
                />
              </FieldAnchor>
              <FieldAnchor fieldId="claudeHeaderArch">
                <Input
                  label={t('config_management.visual.sections.headers.arch')}
                  placeholder="arm64"
                  value={values.claudeHeaderArch}
                  onChange={(e) => onChange({ claudeHeaderArch: e.target.value })}
                  disabled={disabled}
                />
              </FieldAnchor>
              <FieldAnchor fieldId="claudeHeaderTimeout">
                <Input
                  label={t('config_management.visual.sections.headers.timeout')}
                  placeholder="600"
                  value={values.claudeHeaderTimeout}
                  onChange={(e) => onChange({ claudeHeaderTimeout: e.target.value })}
                  disabled={disabled}
                />
              </FieldAnchor>
            </FieldGrid>
            <FieldGrid>
              <FieldAnchor fieldId="claudeHeaderStabilizeDeviceProfile">
                <ToggleRow
                  title={t('config_management.visual.sections.headers.stabilize_device')}
                  description={t('config_management.visual.sections.headers.stabilize_device_desc')}
                  checked={values.claudeHeaderStabilizeDeviceProfile}
                  disabled={disabled}
                  onChange={(claudeHeaderStabilizeDeviceProfile) =>
                    onChange({ claudeHeaderStabilizeDeviceProfile })
                  }
                />
              </FieldAnchor>
            </FieldGrid>
            <Divider />
            <FieldGroupHeading title={t('config_management.visual.sections.headers.codex_title')} />
            <FieldGrid>
              <FieldAnchor fieldId="codexHeaderUserAgent">
                <Input
                  label={t('config_management.visual.sections.headers.user_agent')}
                  placeholder="codex_cli_rs/0.114.0 (Mac OS 14.2.0; x86_64) vscode/1.111.0"
                  value={values.codexHeaderUserAgent}
                  onChange={(e) => onChange({ codexHeaderUserAgent: e.target.value })}
                  disabled={disabled}
                />
              </FieldAnchor>
              <FieldAnchor fieldId="codexHeaderBetaFeatures">
                <Input
                  label={t('config_management.visual.sections.headers.beta_features')}
                  placeholder="multi_agent"
                  value={values.codexHeaderBetaFeatures}
                  onChange={(e) => onChange({ codexHeaderBetaFeatures: e.target.value })}
                  disabled={disabled}
                />
              </FieldAnchor>
            </FieldGrid>
          </FieldStack>
        </Collapsible>
      </FieldStack>
    </SectionCard>
  );
}
