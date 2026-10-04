import type { AkariAnnotationsService, ImageAiInspection, ImageAiResult } from '../../common/akari-annotations-protocol';
import { createInspectorIcon } from './icons';

export interface ImageAiPanelState {
    itemId: string;
    inspection?: ImageAiInspection;
    result?: ImageAiResult;
    phase: 'closed' | 'loading' | 'confirm' | 'running' | 'ready' | 'error';
    error?: string;
    jobId?: string;
}

function button(label: string, action: () => void, primary = false): HTMLButtonElement {
    const node = document.createElement('button');
    node.type = 'button'; node.textContent = label;
    node.className = primary ? 'theia-button main' : 'theia-button secondary';
    node.addEventListener('click', action);
    return node;
}

function cloudButton(label: string, action: () => void, primary = false): HTMLButtonElement {
    const node = button(label, action, primary);
    node.className += ' akari-inspector-image-ai-action';
    const cloud = createInspectorIcon('cloud');
    cloud.className += ' akari-inspector-cloud';
    cloud.setAttribute('title', 'Takes time and may cost money');
    node.append(cloud);
    return node;
}

/** No secret or temporary URL enters browser state or edit.json. */
export function appendImageAiPanel(parent: HTMLElement, options: {
    projectRootUri: string; itemId: string; state: ImageAiPanelState; service: AkariAnnotationsService;
    adopt: (result: ImageAiResult) => Promise<{ ok: boolean; message?: string }>;
    openSettings: () => void;
}): { open: () => void } {
    const { state, service, projectRootUri, itemId } = options;
    const panel = document.createElement('div');
    panel.className = 'akari-inspector-image-ai-tools';
    panel.setAttribute('data-akari-image-ai-panel', itemId);
    parent.append(panel);
    const line = (value: string): void => { const p = document.createElement('p'); p.textContent = value; panel.append(p); };
    const render = (): void => {
        if (!panel.isConnected) return;
        panel.replaceChildren();
        if (state.phase === 'closed') {
            panel.append(cloudButton('Enhance quality', open));
        } else if (state.phase === 'loading') {
            line('Checking the image…');
        } else if (state.phase === 'confirm' && state.inspection) {
            const info = state.inspection;
            line(`Image to send: ${info.width && info.height ? `${info.width} × ${info.height} px · ` : ''}${(info.bytes / 1024 / 1024).toFixed(2)} MB`);
            line(`Sent to: ${info.provider} · Estimated price: ${info.priceUsd === null ? 'image size could not be determined' : `$${info.priceUsd.toFixed(4)}`}`);
            if (info.alternatives.length) {
                line('Saved alternatives');
                info.alternatives.forEach((alternative, index) => {
                    panel.append(button(info.alternatives.length === 1 ? 'Use this one'
                        : `Use option ${index + 1}`, () => void adopt(alternative)));
                });
            }
            if (!info.configured) {
                line('Set a key to use this.');
                panel.append(button('Open settings', options.openSettings));
            }
            const send = cloudButton('Send and enhance', () => void run(), true);
            send.disabled = !info.configured || info.priceUsd === null;
            panel.append(send, button('Back', () => { state.phase = 'closed'; render(); }));
        } else if (state.phase === 'running') {
            line('Enhancing quality…');
            panel.append(button('Cancel', () => void cancel()));
        } else if (state.phase === 'ready' && state.result) {
            line('Alternative saved. Your original photo is kept.');
            panel.append(button('Use this one', () => void adopt(state.result!), true), button('Redo', open));
        } else if (state.phase === 'error') {
            line(state.error || 'Could not complete the request. Check the service usage history for billing.');
            if (/キーが無効|キーを確認|key is invalid|invalid key/i.test(state.error ?? '')) panel.append(button('Open settings', options.openSettings));
            panel.append(button('Retry', open));
        }
    };
    const open = (): void => {
        state.phase = 'loading'; state.error = undefined; render();
        void service.imageAiInspect(projectRootUri, itemId).then(info => {
            if (state.itemId !== itemId) return;
            state.inspection = info; state.phase = 'confirm'; render();
        }).catch(error => { state.phase = 'error'; state.error = error instanceof Error ? error.message : 'Could not check the image.'; render(); });
    };
    const run = async (): Promise<void> => {
        const info = state.inspection;
        if (!info || !info.configured) return;
        state.jobId = crypto.randomUUID(); state.phase = 'running'; render();
        try {
            const result = await service.imageAiUpscale({ projectRootUri, binding: info.binding, jobId: state.jobId });
            if (state.phase !== 'running') return;
            state.result = result; state.phase = 'ready'; render();
        } catch (error) {
            if (state.phase !== 'running') return;
            state.error = error instanceof Error ? error.message : 'Could not complete the request.';
            state.phase = 'error'; render();
        }
    };
    const cancel = async (): Promise<void> => {
        const jobId = state.jobId;
        if (!jobId) return;
        state.phase = 'error'; state.error = 'Canceled. If processing had already started, you may still be charged.'; render();
        await service.imageAiCancel(jobId).catch(() => undefined);
    };
    const adopt = async (alternative: ImageAiResult): Promise<void> => {
        const result = await options.adopt(alternative);
        if (result.ok) { state.phase = 'closed'; state.result = undefined; render(); }
        else { state.phase = 'error'; state.error = result.message || 'Could not select this option.'; render(); }
    };
    render();
    return { open };
}
