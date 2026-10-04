import type { AkariToolCheckResult, AkariToolId } from './akari-new-project-protocol';

type ToolAvailability = Pick<AkariToolCheckResult, 'available' | 'unsupported' | 'needs'>
    & Partial<Pick<AkariToolCheckResult, 'id'>>;

/** 道具行の状態札。通常行は初回セットアップの既存文言を保つ。 */
export function describeToolAvailabilityLabel(tool: ToolAvailability): string {
    if (tool.unsupported) {
        return 'Unavailable on this OS';
    }
    if (tool.needs?.length) {
        return `Setup required (${tool.needs.join('・')}）`;
    }
    if (tool.id && TOOL_UI[tool.id].osProvided) {
        return tool.available ? 'Available' : 'Setup required';
    }
    return tool.available ? 'Installed' : 'Not installed';
}

/** DOM に依存しない行描画の判定。unsupported は available より優先する。 */
export function deriveToolRowState(tool: ToolAvailability): { label: string; showCheckbox: boolean } {
    return { label: describeToolAvailabilityLabel(tool), showCheckbox: !tool.unsupported && !tool.available };
}

/** 利用条件の案内は準備できたら隠し、利用時の注意書きは残す。 */
export function shouldShowToolNote(tool: Pick<AkariToolCheckResult, 'id' | 'available'>): boolean {
    const info = TOOL_UI[tool.id];
    return Boolean(info.note) && !(info.hideNoteWhenAvailable && tool.available);
}

export const SPEECH_ANALYZER_MANUAL_INSTALL_GUIDANCE =
    'SpeechAnalyzer requires macOS 26 or later. If Command Line Tools are missing, run xcode-select --install in the terminal to install them manually. Check again when finished.';

export interface ToolUiInfo {
    name: string;
    badge: string;
    purpose: string;
    /** ダウンロード容量の目安（表示用）。「約 300MB」形式。実装時に公式配布物の実サイズで確定してよい。 */
    sizeLabel: string;
    note?: string;
    /** OS 付属の機能であり、自動導入せず利用条件を案内する。 */
    osProvided?: true;
    /** 利用可能になったら準備用の案内を非表示にする。 */
    hideNoteWhenAvailable?: true;
}

/** whisper 行のモデルサブ行の表示用サイズ（`tool-install.ts` の `WHISPER_MODEL_FILENAME` 実測サイズ）。 */
export const WHISPER_MODEL_SIZE_LABEL = 'About 574 MB';

/**
 * 検知結果と分離した、UI に表示する案内の正本。
 * 自動導入は `src/node/tool-install.ts` のインストールエンジンが担当する。
 * 手動導入の案内もここに集約し、インストール結果と共有する。
 */
export const TOOL_UI: Record<AkariToolId, ToolUiInfo> = {
    ffmpeg: {
        name: 'FFmpeg', badge: 'Basic · Usually required', purpose: 'Used to convert, preview, and export video and audio.',
        sizeLabel: 'About 300 MB'
    },
    whisper: {
        name: 'Whisper（whisper.cpp）', badge: 'Basic', purpose: 'Used to transcribe footage. The model is required separately from the executable.',
        sizeLabel: 'About 20 MB (+ separate model)'
    },
    'yt-dlp': {
        name: 'yt-dlp', badge: 'Advanced · Enabled by default', purpose: 'Used to download authorized video footage.',
        sizeLabel: 'About 35 MB'
    },
    voicevox: {
        name: 'VOICEVOX', badge: 'Advanced', purpose: 'Used to generate Japanese narration locally.',
        sizeLabel: 'About 1.5 GB',
        note: 'Attribution is required according to each voice library license.'
    },
    blender: {
        name: 'Blender CLI', badge: 'Advanced', purpose: 'Used to prerender advanced 3D footage.',
        sizeLabel: 'About 700 MB'
    },
    'speech-analyzer': {
        osProvided: true,
        hideNoteWhenAvailable: true,
        name: 'SpeechAnalyzer', badge: 'Recommended', purpose: 'Fast transcription on this Mac.',
        sizeLabel: 'Included with macOS', note: SPEECH_ANALYZER_MANUAL_INSTALL_GUIDANCE
    },
    'xcode-clt': {
        hideNoteWhenAvailable: true,
        name: 'macOS: Command Line Tools', badge: 'Recommended', purpose: 'Used for project history, diffs, snapshots, and AI analysis: fast transcription, gaze bars, finger framing, and person mattes.',
        sizeLabel: 'About 2 GB',
        note: 'You can make videos without it. After installation, it is enabled automatically for history and AI analysis.'
    }
};
