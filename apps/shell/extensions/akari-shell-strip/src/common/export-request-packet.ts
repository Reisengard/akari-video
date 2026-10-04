/**
 * 「書き出し」ボタンの設定ダイアログが確定した値から、パートナーへ注入する
 * 依頼パケットを組み立てる純関数。task.md に一字一句固定の文言があるため、
 * akari-project の agent-context-packet.ts（【targetKind】主語（詳細）について:
 * 依頼文 という汎用形）とは別の専用テンプレートとして持つ（フィールド構造が
 * 合わないため流用しない）。
 */

export interface ExportResolutionPreset {
    id: string;
    label: string;
}

export const EXPORT_RESOLUTION_PRESETS: readonly ExportResolutionPreset[] = [
    { id: 'landscape-1080p', label: '1080p Landscape' },
    { id: 'portrait-1080p', label: '1080p Portrait' },
    { id: 'square-1080p', label: 'Square' }
];

export const DEFAULT_EXPORT_OUTPUT_NAME = 'final.mp4';

export function defaultExportOutputNameForCodec(codec: 'h264' | 'hevc' | 'prores422' | 'png'): string {
    if (codec === 'prores422') return 'final.mov';
    if (codec === 'png') return 'final';
    return DEFAULT_EXPORT_OUTPUT_NAME;
}

export interface ExportRequestSettings {
    resolutionLabel: string;
    outputName: string;
    rerunLint: boolean;
}

export function composeExportRequestPacket(settings: ExportRequestSettings): string {
    const lintLabel = settings.rerunLint ? 'Yes' : 'No';
    return `[Export request] Export edit.json using the render-cut skill. `
        + `Settings: Resolution ${settings.resolutionLabel}; output name ${settings.outputName}; rerun lint ${lintLabel}`
        + `. `
        + `The user confirmed these settings in the export dialog (explicitly approved; no additional chat confirmation needed). `
        + `Keep .akari/render.json updated with progress as you proceed`;
}
