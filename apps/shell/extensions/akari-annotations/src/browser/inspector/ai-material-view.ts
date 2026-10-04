import type { CommandService } from '@theia/core/lib/common';
import type { TranscriptSummary } from '../../common/akari-annotations-protocol';
import type { AkariMaterialSelection } from '../../common/material-selected-event';
import { aiActionCatalog, describeAiTiles } from '../../common/ai-action-catalog';
import { appendAiBack, appendAiTiles, type AiTabView } from './ai-tiles';
import { viewAfterHomeTabClick } from './home-tab';
import { appendAiTranscribePanel } from './ai-transcribe-panel';

const kindLabels = { audio: 'Audio footage', video: 'Video footage', image: 'Image footage', other: 'Footage' };

export function appendAiMaterialView(parent: HTMLElement, options: {
    selection: AkariMaterialSelection;
    tab: 'generation' | 'info';
    view: AiTabView;
    summary: TranscriptSummary;
    running: boolean;
    commands: Pick<CommandService, 'executeCommand'>;
    onTab: (tab: 'generation' | 'info') => void;
    onView: (view: AiTabView) => void;
    onVideoForm: (parent: HTMLElement) => void;
    createdPath?: string;
    onDialogResult: (result: 'opened' | 'running' | 'cancelled') => void;
}): void {
    const { selection } = options;
    const targetKind = `material-${selection.mediaKind}`;
    const groups = selection.mediaKind === 'other' ? [] : describeAiTiles(
        aiActionCatalog(selection.mediaKind === 'image' ? [{ id: 'video', kind: 'video' }] : []), targetKind as 'material-audio' | 'material-video' | 'material-image'
    );
    const enabledViews = groups.flatMap(group => group.tiles).filter(tile => tile.enabled).map(tile => tile.id as AiTabView);
    const header = document.createElement('header');
    header.className = 'akari-inspector-ai-material-header';
    const name = document.createElement('strong');
    name.className = 'akari-inspector-ai-material-name';
    name.textContent = selection.name;
    const kind = document.createElement('span');
    kind.className = 'akari-inspector-ai-material-kind';
    kind.textContent = kindLabels[selection.mediaKind];
    header.append(name, kind);
    parent.appendChild(header);

    const strip = document.createElement('div');
    strip.className = 'akari-inspector-tab-strip';
    strip.setAttribute('role', 'tablist');
    strip.setAttribute('aria-label', 'Footage edit panel');
    for (const tab of [{ id: 'generation', label: 'Home' }, { id: 'info', label: 'Info' }] as const) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'akari-inspector-tab';
        button.textContent = tab.label;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', String(options.tab === tab.id));
        if (options.tab === tab.id) button.className += ' is-active';
        button.setAttribute('data-akari-inspector-ai-tab', tab.id);
        button.addEventListener('click', () => {
            options.onTab(tab.id);
            if (tab.id === 'generation') options.onView(viewAfterHomeTabClick({
                currentView: options.view, enabledTileCount: enabledViews.length, soleTileView: enabledViews[0]
            }));
        });
        strip.appendChild(button);
    }
    parent.appendChild(strip);

    if (options.tab === 'info') {
        const info = document.createElement('div');
        info.className = 'akari-inspector-ai-material-info';
        const path = document.createElement('p');
        path.textContent = `Path: ${selection.relativePath}`;
        const type = document.createElement('p');
        type.textContent = `Type: ${kindLabels[selection.mediaKind]}`;
        info.append(path, type);
        parent.appendChild(info);
        return;
    }

    if (options.view === 'transcribe' && (selection.mediaKind === 'audio' || selection.mediaKind === 'video')) {
        appendAiBack(parent, 'Transcribe', () => options.onView('tiles'));
        appendAiTranscribePanel(parent, {
            projectRoot: selection.projectRoot,
            target: { relativePath: selection.relativePath, name: selection.name, duration: 0, atSeconds: 0 },
            summary: options.summary, running: options.running, commands: options.commands,
            onDialogResult: options.onDialogResult
        });
        return;
    }
    if (options.view === 'video' && selection.mediaKind === 'image') {
        appendAiBack(parent, 'Generate video', () => options.onView('tiles'));
        options.onVideoForm(parent);
        if (options.createdPath) {
            const message = document.createElement('p');
            message.className = 'akari-inspector-ai-material-created';
            message.textContent = `Created new footage ${options.createdPath.split('/').pop()} (${options.createdPath})`;
            parent.appendChild(message);
        }
        return;
    }
    if (!groups.length) {
        const empty = document.createElement('p');
        empty.className = 'akari-inspector-ai-material-empty';
        empty.textContent = 'No edits are available for this footage yet';
        parent.appendChild(empty);
        return;
    }
    appendAiTiles(parent, groups, id => { if (id === 'transcribe' || id === 'video') options.onView(id); },
        options.summary.state === 'done');
}
