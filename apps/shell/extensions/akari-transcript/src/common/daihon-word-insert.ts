import type { DaihonRow } from './daihon-row-model';

export function insertWordIntoText(
    row: Pick<DaihonRow, 'text' | 'words'>, afterWordIndex: number, word: string
): { text: string } | { error: string } {
    const inserted = word.normalize('NFC').trim();
    if (!inserted) return { error: 'Enter a word to insert.' };
    if (!row.words || !Number.isInteger(afterWordIndex)
        || afterWordIndex < 0 || afterWordIndex >= row.words.length) {
        return { error: 'Cannot find where to insert the word.' };
    }
    const before = row.words.slice(0, afterWordIndex + 1).map(item => item.text).join('');
    let offset = before.length;
    if (!row.text.startsWith(before)) {
        offset = 0;
        for (const item of row.words.slice(0, afterWordIndex + 1)) {
            const start = row.text.indexOf(item.text, offset);
            if (start < 0) return { error: 'The text on this line does not match the word positions.' };
            offset = start + item.text.length;
        }
    }
    return { text: row.text.slice(0, offset) + inserted + row.text.slice(offset) };
}
