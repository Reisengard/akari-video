/** Display aliases mirrored from the caption font panel catalog; card IDs and titles come from the library catalog. */
const DISPLAY_NAMES: Readonly<Record<string, string>> = {
    'biz-udgothic': 'BIZ UDGothic',
    'dela-gothic-one': 'Dela Gothic One Aa',
    dotgothic16: 'DotGothic16',
    'klee-one': 'Klee One',
    'mplus-rounded-1c': 'M PLUS Rounded 1c Aa',
    'noto-sans-jp': 'Noto Sans JP Aa',
    'noto-serif-jp': 'Noto Serif JP Aa',
    'shippori-mincho': 'Shippori Mincho',
    'zen-maru-gothic': 'Zen Maru Gothic'
};

export function libraryFontLabel(id: string, title: string): { display: string; english?: string } {
    const display = DISPLAY_NAMES[id] ?? title;
    const family = title.replace(/（.*$/, '').trim();
    return {
        display,
        english: display !== title ? title : /[A-Za-z]/u.test(family) && family !== display ? family : undefined
    };
}
