import { MaterialPreviewSlot } from './material-preview-slot';
import { CommandContribution } from '@theia/core/lib/common';
import { WidgetFactory } from '@theia/core/lib/browser';
import { AkariAudioMeterWidget } from './akari-audio-meter-widget';
import { AkariAudioMeterContribution } from './akari-audio-meter-contribution';
import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, OpenHandler, WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { PreferenceContribution } from '@theia/core/lib/common/preferences';
import { FileResourceResolver } from '@theia/filesystem/lib/browser/file-resource';
import { AkariPreviewService, AKARI_PREVIEW_SERVICE_PATH } from '../common/akari-preview-protocol';
import { AkariAudioOpenHandler } from './akari-audio-open-handler';
import { AkariFileResourceResolver } from './akari-file-resource-resolver';
import { AkariFragmentPreviewOpenHandler } from './akari-fragment-preview-open-handler';
import { AkariFontSpecimenOpenHandler } from './akari-font-specimen-open-handler';
import { AkariImageOpenHandler } from './akari-image-open-handler';
import { AkariGpuPreferenceContribution } from './akari-gpu-preference-contribution';
import { AkariOutputPreviewOpenHandler, AkariPreviewOpenHandler } from './akari-preview-open-handler';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(AkariAudioMeterWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: AkariAudioMeterWidget.FACTORY_ID,
        createWidget: async () => context.container.get(AkariAudioMeterWidget)
    })).inSingletonScope();
    bind(AkariAudioMeterContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(AkariAudioMeterContribution);

    rebind(FileResourceResolver).to(AkariFileResourceResolver).inSingletonScope();

    bind(AkariPreviewService).toDynamicValue(context =>
        WebSocketConnectionProvider.createProxy(context.container, AKARI_PREVIEW_SERVICE_PATH)
    ).inSingletonScope();

    bind(MaterialPreviewSlot).toSelf().inSingletonScope();
    bind(AkariPreviewOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(AkariPreviewOpenHandler);
    bind(AkariOutputPreviewOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(AkariOutputPreviewOpenHandler);
    bind(AkariAudioOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(AkariAudioOpenHandler);
    bind(AkariImageOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(AkariImageOpenHandler);
    bind(AkariFragmentPreviewOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(AkariFragmentPreviewOpenHandler);
    bind(AkariFontSpecimenOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(AkariFontSpecimenOpenHandler);
    bind(FrontendApplicationContribution).toService(AkariPreviewOpenHandler);
    bind(FrontendApplicationContribution).toService(AkariAudioOpenHandler);
    bind(AkariGpuPreferenceContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(AkariGpuPreferenceContribution);
    bind(PreferenceContribution).toConstantValue({
        schema: {
            type: 'object',
            properties: {
                'akari.preview.frameEngine': {
                    type: 'boolean',
                    default: true,
                    description: 'Use the frame-engine product preview (false keeps the previous video preview).'
                },
                'akari.preview.scrubAudio': {
                    type: 'boolean',
                    default: true,
                    description: 'When you drag the timeline (scrub), play a short burst of audio at that position (output preview).'
                },
                'akari.preview.exportLook': {
                    type: 'boolean',
                    default: false,
                    description: 'Show the preview the way export looks (hides generated-clip tags, bands, shimmer, and the edit-region outline). The export result does not change.'
                },
                'akari.preview.renderScale': {
                    type: 'string',
                    enum: ['auto', '1', '0.5', '0.25'],
                    default: 'auto',
                    description: 'Pixels drawn per edge of the composite. auto follows the display size, then redraws at 1x after playback stops. Preview only. It does not change export or image position and size.'
                },
                'akari.preview.highPerformanceGpu': {
                    type: 'boolean',
                    default: false,
                    description: 'Run preview decode and drawing on the high-performance GPU. Writes the Windows per-app GPU setting and applies on the next launch. The whole app then uses the high-performance GPU.'
                }
            }
        }
    });
});
