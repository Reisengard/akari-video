import { captionGraphemes, type CaptionRun } from '@akari-video/edit-store';

export function captionRunRows(displayText: string, runs: readonly CaptionRun[]): Array<{
    from: number; to: number; text: string; chip: string;
}> {
    const chars = captionGraphemes(displayText);
    const styleLabels: Record<string, string> = {
        color: 'Color', font_weight: 'Weight', scale: 'Size', baseline_shift_em: 'Vertical offset',
        rotate_deg: 'Rotation', letter_spacing_em: 'Letter spacing', stroke: 'Stroke',
        italic: 'Italic', underline: 'Underline'
    };
    return runs.map(run => ({
        from: run.from,
        to: run.to,
        text: chars.slice(run.from, run.to).join(''),
        chip: run.role ? ({ emphasis: 'Emphasis', keyword: 'Keyword', aside: 'Aside' }[run.role] ?? run.role)
            : Object.keys(run.style ?? {}).map(key => styleLabels[key] ?? 'Style').join(', ')
    }));
}
