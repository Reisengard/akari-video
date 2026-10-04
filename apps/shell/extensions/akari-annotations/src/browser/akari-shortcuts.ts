import type { Command } from '@theia/core/lib/common';

export interface AkariShortcut {
    command: Command;
    keys: readonly string[];
    when: string;
    /** The original timeline handler's canonical key, independent of user remapping. */
    key: string;
    shift?: boolean;
    alt?: boolean;
    modifier?: boolean;
}

const timeline = 'akariTimelineVisible && !akariModalOpen && !akariEditableFocus && !akariImeComposing';
const copy = `${timeline} && (akariTimelineFocus || (!akariFocusOutsideTimeline && !akariTextSelection))`;
const command = (id: string, label: string, category = 'Timeline'): Command => ({ id, label, category });

export const AKARI_SHORTCUTS: readonly AkariShortcut[] = [
    { command: command('akari.timeline.toggleVisibility', 'Hide / show timeline'),
        keys: ['ctrlcmd+shift+l'], when: '!akariModalOpen && !akariEditableFocus && !akariImeComposing',
        key: 'l', modifier: true, shift: true },
    { command: command('akari.timeline.undo', 'Undo', 'Edit'), keys: ['ctrlcmd+z'], when: '!akariHistoryEditableFocus', key: 'z', modifier: true },
    { command: command('akari.timeline.redo', 'Redo', 'Edit'), keys: ['ctrlcmd+shift+z'], when: '!akariHistoryEditableFocus', key: 'z', modifier: true, shift: true },
    { command: command('akari.timeline.selectTool', 'Select tool'), keys: ['v', 'a'], when: timeline, key: 'v' },
    { command: command('akari.timeline.razorTool', 'Split tool'), keys: ['b', 'c'], when: timeline, key: 'b' },
    { command: command('akari.timeline.frameTool', 'Placeholder tool'), keys: ['f'], when: timeline, key: 'f' },
    { command: command('akari.timeline.toggleSnap', 'Toggle snapping'), keys: ['n', 'm'], when: timeline, key: 'n' },
    { command: command('akari.caption.placeText', 'Place text'), keys: ['t'], when: timeline, key: 't' },
    { command: command('akari.timeline.delete', 'Delete'), keys: ['delete', 'backspace'], when: timeline, key: 'Delete' },
    { command: command('akari.timeline.deleteKeyframe', 'Delete keyframe'), keys: ['delete', 'backspace'], when: `${timeline} && akariKeyframeSelected`, key: 'Delete' },
    { command: command('akari.timeline.deleteOneSide', 'Delete video or audio only'), keys: ['alt+delete', 'alt+backspace'], when: timeline, key: 'Delete', alt: true },
    { command: command('akari.timeline.copy', 'Copy'), keys: ['ctrlcmd+c'], when: copy, key: 'c', modifier: true },
    { command: command('akari.timeline.cut', 'Cut'), keys: ['ctrlcmd+x'], when: copy, key: 'x', modifier: true },
    { command: command('akari.timeline.paste', 'Paste'), keys: ['ctrlcmd+v'], when: copy, key: 'v', modifier: true },
    { command: command('akari.timeline.group', 'Group'), keys: ['ctrlcmd+g'], when: timeline, key: 'g', modifier: true },
    { command: command('akari.timeline.ungroup', 'Ungroup'), keys: ['ctrlcmd+shift+g'], when: timeline, key: 'g', modifier: true, shift: true },
    { command: command('akari.timeline.moveTrackUp', 'Move to track above'), keys: [']'], when: timeline, key: ']' },
    { command: command('akari.timeline.moveTrackDown', 'Move to track below'), keys: ['['], when: timeline, key: '[' },
    ...(['left', 'right', 'up', 'down'] as const).flatMap((direction): AkariShortcut[] => [
        { command: command(`akari.timeline.nudge${direction}`, `Nudge position 1px (${{ left: 'left', right: 'right', up: 'up', down: 'down' }[direction]})`), keys: [`alt+${direction}`], when: timeline, key: `Arrow${direction[0].toUpperCase()}${direction.slice(1)}`, alt: true },
        { command: command(`akari.timeline.nudge10${direction}`, `Nudge position 10px (${{ left: 'left', right: 'right', up: 'up', down: 'down' }[direction]})`), keys: [`shift+alt+${direction}`], when: timeline, key: `Arrow${direction[0].toUpperCase()}${direction.slice(1)}`, alt: true, shift: true }
    ]),
    { command: command('akari.timeline.selectParent', 'Select parent'), keys: ['\\'], when: timeline, key: '\\' },
    { command: command('akari.timeline.selectChild', 'Select child'), keys: ['enter'], when: timeline, key: 'Enter' },
    { command: command('akari.timeline.clearSelection', 'Clear selection'), keys: ['escape'], when: `${timeline} && !akariFocusOutsideTimeline && !akariInspectorFocus`, key: 'Escape' },
    { command: command('akari.timeline.togglePlayback', 'Play / pause', 'Playback'), keys: ['space'], when: `${timeline} && !akariFocusOnControl`, key: ' ' },
    { command: command('akari.timeline.previousFrame', 'Previous frame', 'Playback'), keys: ['left'], when: timeline, key: 'ArrowLeft' },
    { command: command('akari.timeline.nextFrame', 'Next frame', 'Playback'), keys: ['right'], when: timeline, key: 'ArrowRight' },
    { command: command('akari.timeline.previousSecond', 'Back 1 sec', 'Playback'), keys: ['shift+left'], when: timeline, key: 'ArrowLeft', shift: true },
    { command: command('akari.timeline.nextSecond', 'Forward 1 sec', 'Playback'), keys: ['shift+right'], when: timeline, key: 'ArrowRight', shift: true },
    { command: command('akari.daihon.selectAllRows', 'Select all lines', 'Script'), keys: ['ctrlcmd+a'], when: 'akariDaihonRowsFocus && !akariEditableFocus && !akariImeComposing', key: 'a', modifier: true },
    { command: command('akari.daihon.clearRowSelection', 'Clear line selection', 'Script'), keys: ['escape'], when: 'akariDaihonRowsFocus && !akariEditableFocus && !akariImeComposing', key: 'Escape' },
    { command: command('akari.inspector.clearSolo', 'Clear inspector solo', 'Inspector'), keys: ['escape'], when: 'akariInspectorFocus && akariInspectorSolo && !akariEditableFocus && !akariImeComposing', key: 'Escape' },
    ...(['up', 'down'] as const).flatMap((direction): AkariShortcut[] => [
        { command: command(`akari.inspector.step${direction}`, `Step value by 1 (${direction === 'up' ? 'increase' : 'decrease'})`, 'Inspector'), keys: [direction], when: 'akariNumberFieldFocus && !akariImeComposing', key: `Arrow${direction[0].toUpperCase()}${direction.slice(1)}` },
        { command: command(`akari.inspector.step10${direction}`, `Step value by 10 (${direction === 'up' ? 'increase' : 'decrease'})`, 'Inspector'), keys: [`shift+${direction}`], when: 'akariNumberFieldFocus && !akariImeComposing', key: `Arrow${direction[0].toUpperCase()}${direction.slice(1)}`, shift: true }
    ])
];
