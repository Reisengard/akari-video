import { PreferenceContribution, PreferenceSchema } from '@theia/core/lib/common/preferences';
import { OS } from '@theia/core/lib/common/os';
import { injectable } from '@theia/core/shared/inversify';
import { buildQuickExportEncoderChoices } from '../common/quick-export-cli';

export const AKARI_EXPORT_QUALITY = 'akari.export.quality';
export const AKARI_EXPORT_ENCODER = 'akari.export.encoder';
export const AKARI_EXPORT_CODEC = 'akari.export.codec';
export const AKARI_EXPORT_FPS = 'akari.export.fps';
export const AKARI_EXPORT_OUTPUT_DIRECTORY = 'akari.export.outputDirectory';

const platform = OS.type() === OS.Type.OSX
    ? 'darwin'
    : OS.type() === OS.Type.Windows ? 'win32' : 'linux';
const encoderValues = buildQuickExportEncoderChoices(platform).map(choice => choice.value);

const AKARI_EXPORT_PREFERENCE_SCHEMA: PreferenceSchema = {
    properties: {
        [AKARI_EXPORT_QUALITY]: {
            type: 'string',
            enum: ['standard', 'high', 'light', 'master'],
            default: 'standard',
            description: 'Export quality. Choose Standard, High quality, or Lightweight.'
        },
        [AKARI_EXPORT_ENCODER]: {
            type: 'string',
            enum: encoderValues,
            default: 'auto',
            description: 'Export encoder. Auto prefers available hardware.'
        },
        [AKARI_EXPORT_CODEC]: {
            type: 'string',
            enum: ['h264', 'hevc', 'prores422', 'png'],
            default: 'h264',
            description: 'Export format. Choose H.264, H.265 (HEVC), ProRes 422 HQ, or PNG sequence.'
        },
        [AKARI_EXPORT_FPS]: {
            type: 'number',
            enum: [24, 30, 60],
            description: 'Export frame rate. Leave unset to use the output settings in edit.json.'
        },
        [AKARI_EXPORT_OUTPUT_DIRECTORY]: {
            type: 'string',
            default: '',
            description: 'Export folder URI. Leave blank to use the project\'s exports/ folder.'
        }
    }
};

@injectable()
export class AkariExportPreferenceContribution implements PreferenceContribution {
    readonly schema = AKARI_EXPORT_PREFERENCE_SCHEMA;
}
