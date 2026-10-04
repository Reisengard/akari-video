import { QuickExportCodec, QuickExportEncoder, QuickExportEngine, QuickExportQuality } from './quick-export-cli';

export interface ExportSettings {
    readonly quality: QuickExportQuality;
    readonly engine: QuickExportEngine;
    readonly encoder: QuickExportEncoder;
    readonly codec: QuickExportCodec;
    readonly fps: number | undefined;
    readonly resolution: ExportResolution;
    readonly customWidth?: number;
    readonly outputDirectoryUri: string | undefined;
    readonly rerunLint: boolean;
    readonly saveAsDefault: boolean;
}

export type ExportResolution = 'native' | '720p' | '1440p' | '4k' | 'custom';
export type OutputScaleMode = 'up' | 'down' | 'none';

export interface ResolvedOutputResolution {
    readonly width: number;
    readonly height: number;
    readonly mode: OutputScaleMode;
}

export interface ExportQualityChoice {
    readonly id: Exclude<QuickExportQuality, 'master'>;
    readonly label: string;
    readonly description: string;
    readonly recommended?: boolean;
    readonly crf: number;
    readonly hardwareMbps: number;
}

export interface ExportSettingSeat {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly available: boolean;
    readonly tooltip?: string;
    readonly exit?: string;
}

export interface OutputDescriptionLine {
    readonly label: 'Format' | 'Resolution' | 'Audio' | 'Color';
    readonly value: string;
}

const CONTAINERS = Object.freeze({
    h264: Object.freeze({ ext: 'mp4' as const, kind: 'file' as const }),
    hevc: Object.freeze({ ext: 'mp4' as const, kind: 'file' as const }),
    prores422: Object.freeze({ ext: 'mov' as const, kind: 'file' as const }),
    png: Object.freeze({ ext: null, kind: 'directory' as const })
});

export function containerForCodec(codec: QuickExportCodec): { ext: 'mp4' | 'mov' | null; kind: 'file' | 'directory' } {
    return { ...CONTAINERS[codec] };
}

export const EXPORT_QUALITY_CHOICES: readonly ExportQualityChoice[] = Object.freeze([
    {
        id: 'standard', label: 'Standard', recommended: true,
        description: 'Suitable for posting and sharing. Recommended for most exports.', crf: 23, hardwareMbps: 8
    },
    {
        id: 'high', label: 'High quality',
        description: 'For delivery and archiving. Takes longer but offers the best quality.', crf: 18, hardwareMbps: 12
    },
    {
        id: 'light', label: 'Lightweight',
        description: 'A quick, lightweight draft for review.', crf: 26, hardwareMbps: 5
    }
]);

export const EXPORT_FORMAT_SEATS: readonly ExportSettingSeat[] = Object.freeze([
    { id: 'h264', label: 'MP4 · H.264', description: 'Social media, web, and standard delivery', available: true, exit: 'Direct GPU' },
    { id: 'hevc', label: 'MP4 · H.265(HEVC)', description: 'About half the size. Unsupported by X', available: true, exit: 'Direct GPU retained', tooltip: 'H.265: About half the size with direct GPU encoding. Unsupported by X.' },
    { id: 'prores422', label: 'MOV · ProRes 422 HQ', description: 'Master for production companies and TV', available: true, exit: 'Render on GPU → package with ffmpeg', tooltip: 'ProRes 422 HQ: High-quality delivery format for production companies.' },
    { id: 'prores4444', label: 'MOV · ProRes 4444 (alpha)', description: 'Captions with transparency', available: false, exit: 'Render on GPU → package with ffmpeg', tooltip: 'ProRes 4444: Export video with transparency. Coming soon' },
    { id: 'vp9', label: 'WebM · VP9 (alpha)', description: 'Transparent video for the web', available: false, exit: 'Render on GPU → package with ffmpeg', tooltip: 'WebM VP9: Export transparent video for the web. Coming soon' },
    { id: 'png', label: 'PNG sequence', description: 'For VFX and After Effects', available: true, exit: 'OSR', tooltip: 'PNG sequence: Export each frame as an image.' }
]);

export const EXPORT_RESOLUTION_SEATS: readonly ExportSettingSeat[] = Object.freeze([
    { id: 'source', label: 'Original', description: 'Keep the resolution from edit.json', available: true },
    { id: '720p', label: '720p', description: '1280 × 720', available: true, tooltip: 'Set the short edge to 720 px, preserving aspect ratio.' },
    { id: '1440p', label: '1440p', description: '2560 × 1440', available: true, tooltip: 'Set the short edge to 1440 px, preserving aspect ratio.' },
    { id: '4k', label: '4K', description: '3840 × 2160', available: true, tooltip: 'Set the short edge to 2160 px, preserving aspect ratio.' },
    { id: 'custom', label: 'Custom', description: 'Calculate height from width', available: true, tooltip: 'Set the width and calculate height, preserving aspect ratio.' },
    { id: 'unlock-aspect', label: 'Unlock aspect ratio', description: 'Requires padding or cropping', available: false, tooltip: 'Unlock aspect ratio: Set width and height separately. Coming soon' }
]);

export const EXPORT_AUDIO_SEATS: readonly ExportSettingSeat[] = Object.freeze([
    { id: 'aac', label: 'AAC 48 kHz', description: 'Standard for video delivery', available: true },
    { id: 'lufs-14', label: '−14 LUFS', description: 'For YouTube and streaming', available: false, tooltip: 'Set loudness to −14 LUFS in the UI. Coming soon' },
    { id: 'lufs-16', label: '−16 LUFS', description: 'For Apple streaming services', available: false, tooltip: 'Select loudness of −16 LUFS. Coming soon' },
    { id: 'lufs-23', label: '−23 LUFS', description: 'For broadcast', available: false, tooltip: 'Select loudness of −23 LUFS. Coming soon' },
    { id: 'noise-reduction', label: 'Noise reduction', description: 'Choose Low or High', available: false, tooltip: 'Select noise reduction strength. Coming soon' },
    { id: 'bitrate', label: 'Bitrate', description: '128〜320 kbps', available: false, tooltip: 'Select audio bitrate. Coming soon' }
]);

export const EXPORT_COLOR_SEATS: readonly ExportSettingSeat[] = Object.freeze([
    { id: 'rec709', label: '8-bit · Rec.709 · tv', description: 'Current fixed output', available: true },
    { id: '10bit', label: '10-bit', description: 'Preserve more tonal detail', available: false, tooltip: '10-bit: Available for high-precision formats such as ProRes. Coming soon' },
    { id: 'full-range', label: 'Full range', description: 'PC range', available: false, tooltip: 'Full range: Export video in PC range. Coming soon' },
    { id: 'hdr-hlg', label: 'HDR · HLG', description: 'Rec.2020 HLG', available: false, tooltip: 'HDR HLG: Wide-gamut output for streaming. Coming soon' },
    { id: 'hdr-pq', label: 'HDR · PQ', description: 'Rec.2020 PQ', available: false, tooltip: 'HDR PQ: Wide-gamut output for masters. Coming soon' }
]);

export const EXPORT_SETTING_SEATS: readonly ExportSettingSeat[] = Object.freeze([
    ...EXPORT_FORMAT_SEATS,
    ...EXPORT_RESOLUTION_SEATS,
    ...EXPORT_AUDIO_SEATS,
    ...EXPORT_COLOR_SEATS
]);

export function qualityChoiceForCli(value: QuickExportQuality): ExportQualityChoice | undefined {
    return EXPORT_QUALITY_CHOICES.find(choice => choice.id === value);
}

export function isMasterSelectable(encoder: QuickExportEncoder): boolean {
    return encoder === 'x264';
}

export function isFormatSelectable(id: string): id is QuickExportCodec {
    return (id === 'h264' || id === 'hevc' || id === 'prores422' || id === 'png')
        && EXPORT_FORMAT_SEATS.some(seat => seat.id === id && seat.available);
}

function finitePositive(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function even(value: number): number {
    return Math.max(2, Math.round(value / 2) * 2);
}

function customWidth(value: number | undefined, fallback: number): number {
    const clamped = Math.min(7680, Math.max(320, finitePositive(value) ?? fallback));
    return Math.min(7680, Math.max(320, even(clamped)));
}

export function resolveOutputResolution(
    video: { readonly width?: number; readonly height?: number },
    settings: Pick<ExportSettings, 'resolution' | 'customWidth'>
): ResolvedOutputResolution {
    const sourceWidth = even(finitePositive(video.width) ?? 1920);
    const sourceHeight = even(finitePositive(video.height) ?? 1080);
    const resolution = settings.resolution ?? 'native';
    let width = sourceWidth;
    let height = sourceHeight;
    if (resolution === 'custom') {
        width = customWidth(settings.customWidth, sourceWidth);
        height = even(width * sourceHeight / sourceWidth);
    } else if (resolution !== 'native') {
        const shortEdge = resolution === '720p' ? 720 : resolution === '1440p' ? 1440 : 2160;
        if (sourceWidth >= sourceHeight) {
            height = shortEdge;
            width = even(shortEdge * sourceWidth / sourceHeight);
        } else {
            width = shortEdge;
            height = even(shortEdge * sourceHeight / sourceWidth);
        }
    }
    const sourcePixels = sourceWidth * sourceHeight;
    const outputPixels = width * height;
    return {
        width,
        height,
        mode: outputPixels > sourcePixels ? 'up' : outputPixels < sourcePixels ? 'down' : 'none'
    };
}

export function describeOutput(settings: ExportSettings, edit: unknown): readonly OutputDescriptionLine[] {
    const output = edit && typeof edit === 'object' && 'output' in edit
        ? (edit as { output?: unknown }).output
        : undefined;
    const outputRecord = output && typeof output === 'object' ? output as Record<string, unknown> : {};
    const width = finitePositive(outputRecord.width);
    const height = finitePositive(outputRecord.height);
    const sourceFps = finitePositive(outputRecord.fps);
    const dimensions = width && height ? `${width} × ${height}` : 'As defined in edit.json';
    const fps = settings.fps ?? sourceFps;
    const resolved = resolveOutputResolution({ width, height }, settings);
    const resolutionLabel: Readonly<Record<ExportResolution, string>> = {
        native: 'Original', '720p': '720p', '1440p': '1440p', '4k': '4K', custom: 'Custom'
    };
    const modeLabel: Readonly<Record<OutputScaleMode, string>> = {
        up: 'Upscale', down: 'Downscale', none: 'Original'
    };
    const pixelValue = (settings.resolution ?? 'native') === 'native'
        ? `Original(${dimensions}${fps ? ` · ${fps} fps` : ''})`
        : `${resolved.width} × ${resolved.height}(${resolutionLabel[settings.resolution]} · ${modeLabel[resolved.mode]}${fps ? ` · ${fps} fps` : ''})`;
    const formatValue: Readonly<Record<QuickExportCodec, string>> = {
        h264: 'MP4 · H.264 / AAC 48 kHz',
        hevc: 'MP4 · H.265(HEVC) / AAC 48 kHz',
        prores422: 'MOV · ProRes 422 HQ / PCM 48 kHz',
        png: 'PNG sequence / WAV 48 kHz'
    };
    return [
        { label: 'Format', value: formatValue[settings.codec] },
        { label: 'Resolution', value: pixelValue },
        { label: 'Audio', value: `${settings.codec === 'h264' || settings.codec === 'hevc' ? 'AAC' : settings.codec === 'png' ? 'WAV' : 'PCM'} 48 kHz · Loudness −14 LUFS (default)` },
        { label: 'Color', value: settings.codec === 'prores422' ? '10-bit · Rec.709' : '8-bit · Rec.709' }
    ];
}
