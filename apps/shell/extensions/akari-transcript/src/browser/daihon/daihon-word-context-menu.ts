export type WordMenuAction = { kind: 'play' } | { kind: 'edit' } | { kind: 'dictionary' } | { kind: 'cut-video' }
    | { kind: 'caption-only' } | { kind: 'freeze' }
    | { kind: 'coming-soon'; what: string } | { kind: 'pause' } | { kind: 'break' } | { kind: 'split' }
    | { kind: 'merge-prev' } | { kind: 'merge-next' } | { kind: 'insert-word' } | { kind: 'item-captions' } | { kind: 'mark'; color: string };
export interface WordMenuItem { label: string; action?: WordMenuAction; accel?: string; disabled?: boolean; title?: string; danger?: boolean }
export interface WordMenuGroup { title: string; note?: string; items: WordMenuItem[]; colors?: string[] }

const COLORS = ['#ff5c5c', '#ffb347', '#f5c451', '#6fd18a', '#4fa8ff', '#c77dff'];
export function wordContextMenuGroups(input: {
    rangeCount: number; wordCount: number; text: string; nextWordText: string;
    splitAvailable: boolean; mergeAvailable: boolean; mergeNextAvailable: boolean;
    wordInsertAvailable: boolean; itemCaptionsAvailable: boolean;
}): WordMenuGroup[] {
    const subject = input.rangeCount > 1 ? `${input.rangeCount} ranges at once`
        : input.wordCount > 1 ? 'This range' : 'This word';
    const coming = (label: string, what: string): WordMenuItem => ({ label, disabled: true, action: { kind: 'coming-soon', what } });
    return [
        { title: `${subject}: "${input.text}"`, items: [
            { label: '▶ Play from here', action: { kind: 'play' } }, { label: '✎ Edit', action: { kind: 'edit' } },
            { label: '📖 Add to the dictionary', action: { kind: 'dictionary' } },
            { label: '✂ Cut from the video', action: { kind: 'cut-video' }, danger: true },
            { label: 'Remove from captions only', action: { kind: 'caption-only' } },
            { label: '⏸ Freeze on this word only', action: { kind: 'freeze' } }
        ] },
        { title: 'Insert', note: `Before "${input.nextWordText}"`, items: [
            coming('🖼 Image Coming soon', 'Image'), coming('🎬 B-roll Coming soon', 'B-roll'),
            coming('🅰 Captions Coming soon', 'Captions'), input.wordInsertAvailable
                ? { label: '+ Word', action: { kind: 'insert-word' } }
                : coming('+ Word Coming soon', 'Word'),
            { label: '⏸ Pause 0.5 sec', accel: '⌘;', action: { kind: 'pause' } }
        ] },
        { title: 'Line', items: [
            { label: '/ Line break here (display only, still one line)', accel: '⇧⏎', action: { kind: 'break' } },
            input.splitAvailable ? { label: '⏎ Split here (becomes 2 lines)', accel: '⏎', action: { kind: 'split' } }
                : coming('⏎ Split here (becomes 2 lines) — Coming soon', 'Split here'),
            input.mergeAvailable ? { label: 'Merge with the previous line', accel: '⌫', action: { kind: 'merge-prev' } }
                : coming('Merge with the previous line — Coming soon', 'Merge with the previous line'),
            input.mergeNextAvailable ? { label: 'Merge with the next line', action: { kind: 'merge-next' } }
                : coming('Merge with the next line — Coming soon', 'Merge with the next line'),
            { label: 'Use captions for this line only (hide them on other clips of the same footage)', action: { kind: 'item-captions' },
                disabled: !input.itemCaptionsAvailable, title: input.itemCaptionsAvailable ? undefined : 'Waiting on ticket 1 (the item captions switch)' }
        ] },
        { title: 'Mark', colors: COLORS, items: COLORS.map(color => ({ label: color, action: { kind: 'mark' as const, color } })) }
    ];
}

export function openWordContextMenu(options: {
    x: number; y: number; groups: WordMenuGroup[]; onAction(action: WordMenuAction): void
}): HTMLDivElement {
    const pop = document.createElement('div');
    pop.className = 'akari-daihon-pop akari-daihon-wordcm';
    for (const group of options.groups) {
        const title = document.createElement('div'); title.className = 'akari-daihon-pttl'; title.textContent = group.title;
        pop.appendChild(title);
        if (group.note) { const note = document.createElement('div'); note.className = 'akari-daihon-cmnote'; note.textContent = group.note; pop.appendChild(note); }
        const items = document.createElement('div'); items.className = group.colors ? 'akari-daihon-cmcolors' : 'akari-daihon-cmitems';
        for (const item of group.items) {
            const button = document.createElement('button'); button.type = 'button'; button.textContent = item.label;
            if (item.danger) button.classList.add('danger');
            if (item.disabled) button.classList.add('disabled');
            if (item.title) button.title = item.title;
            if (group.colors) button.style.background = item.label;
            if (item.accel) { const accel = document.createElement('span'); accel.className = 'akari-daihon-cmaccel'; accel.textContent = item.accel; button.appendChild(accel); }
            button.addEventListener('click', event => { event.stopPropagation(); if (item.action) options.onAction(item.action); });
            items.appendChild(button);
        }
        pop.appendChild(items);
    }
    document.body.appendChild(pop);
    const margin = 8;
    pop.style.left = `${Math.max(margin, Math.min(options.x, window.innerWidth - pop.offsetWidth - margin))}px`;
    pop.style.top = `${Math.max(margin, Math.min(options.y, window.innerHeight - pop.offsetHeight - margin))}px`;
    return pop;
}
