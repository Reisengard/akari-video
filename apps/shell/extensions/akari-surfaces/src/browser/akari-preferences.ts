import { PreferenceContribution, PreferenceSchema } from '@theia/core/lib/common/preferences';
import { injectable } from '@theia/core/shared/inversify';

import { TRANSCRIBE_BACKENDS } from 'akari-shell-strip/lib/common/akari-connections-protocol';

export const AKARI_TRANSCRIBE_MODE = 'akari.transcribe.mode';
export const AKARI_TRANSCRIBE_BACKEND = 'akari.transcribe.backend';
export const AKARI_TRANSCRIBE_COMPARE_SET = 'akari.transcribe.compareSet';
export const AKARI_TRANSCRIBE_AUTO_CUTS = 'akari.transcribe.autoCuts';
export const AKARI_NARRATION_ENGINE = 'akari.narration.engine';
export const AKARI_NARRATION_VOICE = 'akari.narration.voice';
export const AKARI_NARRATION_IRODORI_URL = 'akari.narration.irodoriUrl';

export const AKARI_QUALITY_TIER = 'akari.qualityTier';
export const AKARI_TIMELINE_VISUAL_THUMBNAILS = 'akari.timeline.visualThumbnails';
// 読む側の文字列ミラー。スキーマは akari-project/src/browser/akari-project-frontend-module.ts が所有する。
export const AKARI_DEVELOPER_MODE = 'akari.developerMode';
// パートナー PTY（Claude Code 等）の応答完了 OS 通知（読む側: akari-partner の
// PartnerTurnNotifier — スキーマはここが所有し読む側は文字列ミラー）。
export const AKARI_AGENT_TURN_END_NOTIFICATION = 'akari.notifications.agentTurnEnd';

const AKARI_PREFERENCE_SCHEMA: PreferenceSchema = {
    properties: {
        [AKARI_NARRATION_ENGINE]: { type: 'string', default: 'voicevox', description: 'Default narration engine' },
        [AKARI_NARRATION_VOICE]: { type: 'object', default: {}, description: 'Narration voices by engine' },
        [AKARI_NARRATION_IRODORI_URL]: { type: 'string', default: 'http://127.0.0.1:8088', description: 'Irodori server URL' },
        [AKARI_TRANSCRIBE_MODE]: {
            type: 'string', enum: ['simple', 'advanced'], default: 'simple',
            description: 'Transcription mode (Simple / Advanced)'
        },
        [AKARI_TRANSCRIBE_BACKEND]: {
            type: 'string', enum: ['auto', ...TRANSCRIBE_BACKENDS], default: 'auto',
            description: 'Default transcription engine (automatic prefers local)'
        },
        [AKARI_TRANSCRIBE_COMPARE_SET]: {
            type: 'array', items: { type: 'string', enum: [...TRANSCRIBE_BACKENDS] }, default: [], uniqueItems: true,
            description: 'Engines to compare for transcription (empty disables comparison)'
        },
        [AKARI_TRANSCRIBE_AUTO_CUTS]: {
            type: 'boolean', default: true,
            description: 'Automatically create cut candidates for fillers, retakes, and silence (without adding them to the timeline)'
        },
        [AKARI_QUALITY_TIER]: {
            type: 'string',
            enum: ['draft', 'final'],
            default: 'draft',
            description: 'AKARI Video export quality tier'
        },
        [AKARI_TIMELINE_VISUAL_THUMBNAILS]: {
            type: 'boolean', default: false,
            description: 'Show HTML / 3D footage thumbnails in the timeline (off shows type colors and names only)'
        },
        [AKARI_AGENT_TURN_END_NOTIFICATION]: {
            type: 'boolean',
            default: true,
            description: 'Send an OS notification when your AI partner finishes (only when the window is in the background)'
        }
    }
};

@injectable()
export class AkariPreferenceContribution implements PreferenceContribution {
    readonly schema = AKARI_PREFERENCE_SCHEMA;
}
