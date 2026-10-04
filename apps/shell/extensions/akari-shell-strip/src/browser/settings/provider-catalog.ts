import { PROVIDER_BALANCE_SUPPORT } from '../../common/akari-connections-protocol';
import { PROVIDER_LOGOS } from './provider-logos';

/**
 * 接続と API キーの表示用の表（グループ・一言の説明）。並びとラベルの正は credentials-file.ts の formatConnections。
 *
 * 説明文の上書きはここ 1 か所だけ（creator-root の notes.description は工程番号入りの内部向けの文なので、
 * 設定画面では利用者向けの一言に差し替える）。表に無いプロバイダーは creator-root の説明をそのまま出す。
 * OpenRouter は「つなぐと Akari Vibe（声で話しかけて動画を編集）が使える」ことを伝える（2026-09-22 裁定）。
 */
export type ProviderGroup = 'generate' | 'transcribe';

export const PROVIDER_GROUP_LABELS: Record<ProviderGroup, string> = {
    generate: 'Generation services',
    transcribe: 'Transcription'
};

export const PROVIDER_DISPLAY: Readonly<Record<string, { group: ProviderGroup; description: string; highlight?: string }>> = {
    fal: { group: 'generate', description: 'Recommended · One key for images, video, speech, and BGM' },
    openrouter: {
        group: 'generate', description: 'Models from multiple providers with one key.',
        highlight: 'Connect to use Akari Vibe and edit videos by voice'
    },
    replicate: { group: 'generate', description: 'Access a range of image, video, and audio models' },
    elevenlabs: { group: 'generate', description: 'Generate Narration and audio. Connect to see this month\'s remaining credits' },
    groq: { group: 'transcribe', description: 'Fast cloud transcription. No official balance API; a link to the dashboard is provided' }
};

export function providerGroup(id: string): ProviderGroup {
    return PROVIDER_DISPLAY[id]?.group ?? 'generate';
}

export function providerLogo(id: string): string | undefined {
    return PROVIDER_LOGOS[id];
}

export function providerBillingUrl(id: string): string | undefined {
    return PROVIDER_BALANCE_SUPPORT[id]?.billing_url;
}

/** 頭文字のプレースホルダ（公式ロゴが無いとき）。 */
export function providerInitial(label: string): string {
    return (label.trim()[0] ?? '?').toUpperCase();
}
