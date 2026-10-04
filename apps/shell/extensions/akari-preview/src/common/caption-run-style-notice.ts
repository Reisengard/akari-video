/** User-facing names for look fields that cannot be represented by a caption run. */
export function captionRunOmittedNotice(keys: readonly string[]): string | undefined {
    if (!keys.length) return undefined;
    const names: Record<string, string> = {
        animation: 'Motion', background: 'Background', shadow: 'Shadow', glow: 'Glow',
        font_family: 'Typeface', fontFamily: 'Typeface', line_height: 'Leading', lineHeight: 'Leading',
        text_transform: 'Text transform', reference_height_px: 'Size basis',
        size_px: 'Size', sizePx: 'Size', position: 'Position', layout: 'Align',
        'stroke.method': 'Outline mode'
    };
    const labels = [...new Set(keys.map(key => names[key] ?? 'Other appearance'))];
    return `Left out appearance settings that cannot apply to a text range: ${labels.join(', ')}`;
}
