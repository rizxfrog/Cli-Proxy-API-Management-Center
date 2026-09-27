/**
 * 模型管理页契约测试（静态标记 + 源码扫描）。
 *
 * 这里锁定的是**不能回退的诚实语义**：
 * - Home 只读时不得渲染任何修改入口；
 * - 页面不得声称“已生效”（后端 runtime_status 恒为 unverified）；
 * - 单文件构建约束下不引入浏览器专属依赖；
 * - 四个语言的文案齐全。
 *
 * 浏览器交互不在覆盖范围内（仓库无 DOM 测试环境）。
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { ProviderModelsHeader } from '@/features/models/components/ProviderModelsHeader';
import { ProviderModelsTable } from '@/features/models/components/ProviderModelsTable';
import { buildModelRows } from '@/features/models/logic';
import type { ProviderCatalog } from '@/services/api/providerModels';

const LOCALES = ['en', 'zh-CN', 'zh-TW', 'ru'];

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const headerSource = read('src/features/models/components/ProviderModelsHeader.tsx');
const tableSource = read('src/features/models/components/ProviderModelsTable.tsx');
const pageSource = read('src/features/models/ProviderModelsPage.tsx');
const editorSource = read('src/features/models/components/ProviderModelEditor.tsx');
const apiSource = read('src/services/api/providerModels.ts');
const routesSource = read('src/router/MainRoutes.tsx');
const layoutSource = read('src/components/layout/MainLayout.tsx');

const catalog: ProviderCatalog = {
  provider: 'trae',
  override: { disabled: ['glm-5.2'], custom: [] },
  models: [
    {
      id: 'glm-5.2',
      displayName: 'GLM 5.2',
      source: 'default',
      enabled: false,
      registeredAccountCount: 3,
      inactiveReasons: ['provider-disabled'],
      definition: null,
    },
    {
      id: 'glm-5.4',
      displayName: 'GLM 5.4',
      source: 'custom',
      enabled: true,
      registeredAccountCount: 0,
      inactiveReasons: ['not-registered'],
      definition: { contextLength: 200000 },
    },
  ],
  readOnly: false,
  runtimeStatus: 'unverified',
  catalogScope: 'local',
};

describe('page and API wiring', () => {
  test('the route and sidebar entry exist beside the other gateway pages', () => {
    expect(routesSource).toContain("{ path: '/models', element: <ProviderModelsPage /> }");
    expect(routesSource).toContain("from '@/features/models/ProviderModelsPage'");
    expect(layoutSource).toContain("path: '/models'");
    expect(layoutSource).toContain("labelKey: 'nav.models'");
    expect(layoutSource).toContain("metaKey: 'nav_meta.models'");
  });

  test('the API module goes through apiClient and hits the documented routes', () => {
    expect(apiSource).toContain("from './client'");
    expect(apiSource).toContain("'/provider-models'");
    expect(apiSource).toContain('PROVIDER_MODELS_ENDPOINT}/${encodeURIComponent(provider)}');
    // 不允许绕过 apiClient 自己发请求。
    expect(apiSource).not.toContain('fetch(');
    expect(apiSource).not.toContain('axios');
  });

  test('the page never polls or claims the change is already live', () => {
    expect(pageSource).not.toContain('setInterval');
    expect(pageSource).not.toContain('setTimeout');
    // runtime_status 是 unverified：不得出现“已生效”式表述。
    expect(pageSource).not.toContain('applied');
  });

  test('locale keys are complete in all four locales', async () => {
    for (const locale of LOCALES) {
      const messages = JSON.parse(read(`src/i18n/locales/${locale}.json`)) as Record<
        string,
        unknown
      >;
      const nav = messages.nav as Record<string, string>;
      const navMeta = messages.nav_meta as Record<string, string>;
      const mm = messages.model_management as Record<string, string>;

      expect(typeof nav.models).toBe('string');
      expect(nav.models.length).toBeGreaterThan(0);
      expect(typeof navMeta.models).toBe('string');
      expect(Object.keys(mm).length).toBeGreaterThan(50);
      for (const key of Object.keys(mm)) {
        expect(typeof mm[key]).toBe('string');
        expect(mm[key].length).toBeGreaterThan(0);
      }
    }
  });
});

describe('honest state semantics in the UI', () => {
  test('enabled-with-no-account is rendered as such, not as available', async () => {
    const original = i18n.language;
    await i18n.changeLanguage('en');
    const markup = renderToStaticMarkup(
      createElement(ProviderModelsTable, {
        rows: buildModelRows(catalog),
        showProvider: false,
        readOnly: false,
        disableControls: false,
        busy: false,
        onToggleEnabled: () => undefined,
        onEdit: () => undefined,
        onDelete: () => undefined,
      })
    );

    // 停用行 + 「已启用但无账号」行必须在同一张表里各自成态。
    expect(markup).toContain(i18n.t('model_management.availability_disabled'));
    expect(markup).toContain(i18n.t('model_management.availability_no_account'));
    expect(markup).toContain('glm-5.2');
    expect(markup).toContain('glm-5.4');
    // 每行都有可访问的开关名称。
    expect(markup).toContain('aria-label="Enable or disable glm-5.2"');
    expect(markup).toContain('aria-label="Enable or disable glm-5.4"');
    await i18n.changeLanguage(original);
  });

  test('read-only rows render no mutation affordances at all', async () => {
    const original = i18n.language;
    await i18n.changeLanguage('en');
    const markup = renderToStaticMarkup(
      createElement(ProviderModelsTable, {
        rows: buildModelRows({ ...catalog, readOnly: true }),
        showProvider: false,
        readOnly: true,
        disableControls: false,
        busy: false,
        onToggleEnabled: () => undefined,
        onEdit: () => undefined,
        onDelete: () => undefined,
      })
    );

    // Home 托管：开关与删除按钮必须不存在，而不是“存在但灰掉”。
    expect(markup).not.toContain('<input');
    expect(markup).not.toContain(i18n.t('model_management.delete_definition', { name: 'glm-5.2' }));
    expect(markup).toContain(i18n.t('model_management.availability_disabled'));
    await i18n.changeLanguage(original);
  });

  test('the header hides the add button in read-only mode', async () => {
    const original = i18n.language;
    await i18n.changeLanguage('en');
    const base = {
      counts: { total: 2, enabled: 1, disabled: 1 },
      overrideCount: 1,
      loading: false,
      refreshing: false,
      disableControls: false,
      addModelDisabled: false,
      onAddModel: () => undefined,
      onRefresh: () => undefined,
    };

    const writable = renderToStaticMarkup(
      createElement(ProviderModelsHeader, { ...base, readOnly: false })
    );
    const readOnly = renderToStaticMarkup(
      createElement(ProviderModelsHeader, { ...base, readOnly: true })
    );

    expect(writable).toContain(i18n.t('model_management.add_model'));
    expect(readOnly).not.toContain(i18n.t('model_management.add_model'));
    // 头部把「配置视图」这件事说清楚。
    expect(writable).toContain(i18n.t('model_management.legend_configured_vs_runtime'));
    await i18n.changeLanguage(original);
  });

  test('the Home banner and the not-yet-applied note exist as explicit copy', () => {
    expect(pageSource).toContain("t('model_management.home_read_only_banner')");
    expect(pageSource).toContain('role="status"');
    expect(headerSource).toContain("t('model_management.legend_configured_vs_runtime')");
    // 检查 pending 提示确实由 lastSavedAt 驱动，而不是无条件显示。
    expect(pageSource).toContain('showPending={lastSavedAt !== null}');
  });

  test('the editor keeps aliasing out of scope and validates ids', () => {
    expect(editorSource).toContain('validateModelDraft');
    expect(editorSource).not.toContain('alias');
    expect(tableSource).toContain('ariaLabel={t(');
  });
});
