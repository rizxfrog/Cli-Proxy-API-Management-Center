import type { BuiltInOAuthProvider } from '@/services/api';
import { getPluginTitle, resolvePluginAssetURL } from '@/features/plugins/pluginResources';
import {
  KIMI_CHINESE_AFFILIATE_URL,
  KIMI_INTERNATIONAL_AFFILIATE_URL,
} from '@/features/providers/kimi';
import type { PluginListEntry } from '@/types';
import iconMeta from '@/assets/icons/meta.svg';
import iconCodex from '@/assets/icons/codex.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconAntigravity from '@/assets/icons/antigravity.svg';
// 赞助卡用的 App 图标版：K 与蓝点等比内缩进方块，蓝点不再顶出圆角
import iconKimiTileBlack from '@/assets/icons/kimi-tile-black.svg';
import iconKimiTileWhite from '@/assets/icons/kimi-tile-white.svg';
import iconGrok from '@/assets/icons/grok.svg';
import iconGrokDark from '@/assets/icons/grok-dark.svg';
import iconDevin from '@/assets/icons/devin.svg';
import iconDevinDark from '@/assets/icons/devin-dark.svg';
import iconCodeBuddy from '@/assets/icons/codebuddy.svg';
import iconMinimax from '@/assets/icons/minimax.svg';
import iconQoder from '@/assets/icons/qoder.svg';
import iconCline from '@/assets/icons/cline.png';
import iconTrae from '@/assets/icons/trae.png';
import iconXiaohuanxiong from '@/assets/icons/xiaohuanxiong.svg';
import iconCodeArts from '@/assets/icons/codearts.svg';
import iconFloatboat from '@/assets/icons/floatboat.svg';
import iconLobsteraiServer from '@/assets/icons/lobsterai.svg';
import iconLoomy from '@/assets/icons/loomy.svg';

export type ThemedIcon = string | { light: string; dark: string };

/** 设备码流程会返回 user_code；浏览器流程依赖回调（本地自动 / 远程手动粘贴）。
 * `sms` 是 Loomy 专属：无 URL 流程，手机号 + 短信验证码两步登录。 */
export type OAuthFlowKind = 'device' | 'browser' | 'sms';

export interface BuiltInOAuthProviderCard {
  kind: 'builtin';
  id: BuiltInOAuthProvider;
  /** 磁贴短名：品牌名是常量（与仪表盘 providerLabel 一致），区域站点走 i18n。 */
  label: string | { key: string };
  /** 对话框标题，沿用 `auth_login.<id>_oauth_title`。 */
  titleKey: string;
  icon: ThemedIcon;
  flow: OAuthFlowKind;
  /** 区分同品牌的不同站点，磁贴副行展示。 */
  domain?: string;
  /**
   * 赞助商：同品牌的各站点合并进画廊首行的一张品牌卡，每站一个登录入口 + 开放平台注册链接
   * （目前是 Kimi 国内站 / 国际站）。`siteKey` 是卡内站点短名（品牌名由卡片标题承载）。
   */
  sponsor?: SponsorSite;
}

export interface SponsorSite {
  signUpUrl: string;
  siteKey: string;
}

export interface PluginOAuthProviderCard {
  kind: 'plugin';
  id: string;
  title: string;
  icon: string;
}

export type OAuthProviderCard = BuiltInOAuthProviderCard | PluginOAuthProviderCard;

/** 展示顺序即数组顺序：赞助商（Kimi 两站）置首，其余沿用原有次序。 */
export const OAUTH_PROVIDERS: BuiltInOAuthProviderCard[] = [
  {
    kind: 'builtin',
    id: 'kimi',
    label: { key: 'auth_login.kimi_oauth_name' },
    titleKey: 'auth_login.kimi_oauth_title',
    icon: { light: iconKimiTileBlack, dark: iconKimiTileWhite },
    flow: 'device',
    domain: 'kimi.com',
    sponsor: { signUpUrl: KIMI_CHINESE_AFFILIATE_URL, siteKey: 'auth_login.sponsor_site_china' },
  },
  {
    kind: 'builtin',
    id: 'kimi-ai',
    label: { key: 'auth_login.kimi_ai_oauth_name' },
    titleKey: 'auth_login.kimi_ai_oauth_title',
    icon: { light: iconKimiTileBlack, dark: iconKimiTileWhite },
    flow: 'device',
    domain: 'kimi.ai',
    sponsor: {
      signUpUrl: KIMI_INTERNATIONAL_AFFILIATE_URL,
      siteKey: 'auth_login.sponsor_site_international',
    },
  },
  {
    kind: 'builtin',
    id: 'meta',
    label: 'Muse (Meta)',
    titleKey: 'auth_login.meta_oauth_title',
    icon: iconMeta,
    flow: 'device',
  },
  {
    kind: 'builtin',
    id: 'codex',
    label: 'Codex',
    titleKey: 'auth_login.codex_oauth_title',
    icon: iconCodex,
    flow: 'browser',
  },
  {
    kind: 'builtin',
    id: 'anthropic',
    label: 'Claude',
    titleKey: 'auth_login.anthropic_oauth_title',
    icon: iconClaude,
    flow: 'browser',
  },
  {
    kind: 'builtin',
    id: 'antigravity',
    label: 'Antigravity',
    titleKey: 'auth_login.antigravity_oauth_title',
    icon: iconAntigravity,
    flow: 'browser',
  },
  {
    kind: 'builtin',
    id: 'xai',
    label: 'xAI',
    titleKey: 'auth_login.xai_oauth_title',
    icon: { light: iconGrok, dark: iconGrokDark },
    flow: 'browser',
  },
  {
    kind: 'builtin',
    id: 'devin',
    label: 'Devin',
    titleKey: 'auth_login.devin_oauth_title',
    icon: { light: iconDevin, dark: iconDevinDark },
    flow: 'browser',
  },
  {
    kind: 'builtin',
    id: 'codebuddy-cn',
    label: 'CodeBuddy CN',
    titleKey: 'auth_login.codebuddy_cn_oauth_title',
    icon: iconCodeBuddy,
    flow: 'browser',
  },
  {
    kind: 'builtin',
    id: 'codebuddy-ai',
    label: 'CodeBuddy AI',
    titleKey: 'auth_login.codebuddy_ai_oauth_title',
    icon: iconCodeBuddy,
    flow: 'browser',
  },
  {
    kind: 'builtin',
    id: 'minimax',
    label: 'MiniMax Code',
    titleKey: 'auth_login.minimax_oauth_title',
    icon: iconMinimax,
    flow: 'browser',
  },
  {
    kind: 'builtin',
    id: 'minimax-cn',
    label: 'MiniMax Code (CN)',
    titleKey: 'auth_login.minimax_cn_oauth_title',
    icon: iconMinimax,
    flow: 'browser',
  },
  {
    kind: 'builtin',
    id: 'qoder-cn',
    label: 'Qoder CN',
    titleKey: 'auth_login.qoder_cn_oauth_title',
    icon: iconQoder,
    flow: 'browser',
  },
  {
    kind: 'builtin',
    id: 'qoder-ai',
    label: 'Qoder AI',
    titleKey: 'auth_login.qoder_ai_oauth_title',
    icon: iconQoder,
    flow: 'browser',
  },
  {
    kind: 'builtin',
    id: 'cline',
    label: 'Cline',
    titleKey: 'auth_login.cline_oauth_title',
    icon: iconCline,
    flow: 'browser',
  },
  {
    kind: 'builtin',
    id: 'trae',
    label: 'TRAE',
    titleKey: 'auth_login.trae_oauth_title',
    icon: iconTrae,
    flow: 'browser',
  },
  {
    kind: 'builtin',
    id: 'xiaohuanxiong',
    label: 'Xiaohuanxiong',
    titleKey: 'auth_login.xiaohuanxiong_oauth_title',
    icon: iconXiaohuanxiong,
    flow: 'browser',
  },
  {
    kind: 'builtin',
    id: 'codearts',
    label: 'CodeArts',
    titleKey: 'auth_login.codearts_oauth_title',
    icon: iconCodeArts,
    flow: 'browser',
  },
  {
    kind: 'builtin',
    id: 'floatboat',
    label: 'FloatBoat',
    titleKey: 'auth_login.floatboat_oauth_title',
    icon: iconFloatboat,
    flow: 'browser',
  },
  {
    kind: 'builtin',
    id: 'lobsterai-server',
    label: 'LobsterAI',
    titleKey: 'auth_login.lobsterai_server_oauth_title',
    icon: iconLobsteraiServer,
    flow: 'browser',
  },
  {
    kind: 'builtin',
    id: 'loomy',
    label: 'Loomy',
    titleKey: 'auth_login.loomy_oauth_title',
    icon: iconLoomy,
    flow: 'sms',
  },
];

const BUILTIN_PROVIDER_IDS = new Set<string>(OAUTH_PROVIDERS.map((provider) => provider.id));

/** 后端接受手动回调提交的内置提供商；插件提供商一律允许。 */
export const CALLBACK_SUPPORTED = new Set<string>([
  'codex',
  'anthropic',
  'antigravity',
  'xai',
  'trae',
  'devin',
  // Xiaohuanxiong redirects to an office-raccoon:// deep link that the browser
  // cannot hand to the proxy, so the user pastes the final callback URL.
  'xiaohuanxiong',
  // CodeArts redirects to a 127.0.0.1 loopback URL owned by the desktop client,
  // so the proxy never receives the code; the user pastes the callback URL.
  'codearts',
  // Cline forces a 127.0.0.1 loopback callback_url and embeds the credential
  // bundle in the pasted code, so the user pastes the callback URL.
  'cline',
  // FloatBoat returns the code on the desktop app's aoe:// deep link, which the
  // proxy cannot receive, so the user pastes the callback URL.
  'floatboat',
  // LobsterAI redirects to a 127.0.0.1 loopback URL owned by the desktop client;
  // the proxy's own loopback port is unreachable from a remote operator's
  // browser, so the user pastes the callback URL.
  'lobsterai-server',
]);

export const supportsManualCallback = (provider: OAuthProviderCard): boolean =>
  provider.kind === 'plugin' || CALLBACK_SUPPORTED.has(provider.id);

export const isSponsor = (
  provider: OAuthProviderCard
): provider is BuiltInOAuthProviderCard & { sponsor: SponsorSite } =>
  provider.kind === 'builtin' && Boolean(provider.sponsor);

export const resolveThemedIcon = (icon: ThemedIcon, theme: 'light' | 'dark'): string =>
  typeof icon === 'string' ? icon : icon[theme];

/**
 * 一个插件可能声明多个登录入口（各自带标题与图标），每个入口一张卡；
 * v8.0.49 之前只有单个 `oauth_provider`，那时仍然只出一张卡。
 */
export const buildPluginOAuthProviderCards = (
  plugins: PluginListEntry[],
  apiBase: string
): PluginOAuthProviderCard[] => {
  const seenProviders = new Set(BUILTIN_PROVIDER_IDS);
  return plugins.flatMap((plugin) => {
    if (!plugin.supportsOAuth || !plugin.effectiveEnabled) return [];
    const declared = plugin.oauthProviders?.length
      ? plugin.oauthProviders
      : plugin.oauthProvider
        ? [plugin.oauthProvider]
        : [];
    const pluginTitle = getPluginTitle(plugin);
    const pluginLogo = plugin.logo || plugin.metadata?.logo || '';
    return declared.flatMap((provider) => {
      if (seenProviders.has(provider)) return [];
      seenProviders.add(provider);
      const entry = plugin.oauthProviderEntries?.find((item) => item.identifier === provider);
      return [
        {
          kind: 'plugin' as const,
          id: provider,
          title: entry?.name?.trim() || pluginTitle,
          icon: resolvePluginAssetURL(entry?.logo?.trim() || pluginLogo, apiBase),
        },
      ];
    });
  });
};
