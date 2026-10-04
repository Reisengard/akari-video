import type { DaihonRow } from './daihon-row-model';

export function canSplitRow(row: Pick<DaihonRow, 'words' | 'outStart'>): boolean {
    return row.outStart !== null && (row.words?.length ?? 0) >= 2;
}

export function splitWordBoundaries(row: Pick<DaihonRow, 'words'>): number[] {
    return Array.from({ length: Math.max(0, (row.words?.length ?? 0) - 1) }, (_value, index) => index + 1);
}

export function canMergeRows(
    rows: readonly Pick<DaihonRow, 'id' | 'outStart' | 'timeDomain'>[], selectedIds: readonly string[]
): { ok: true; orderedIds: string[] } | { ok: false; reason: string } {
    const selected = new Set(selectedIds);
    if (selected.size < 2) return { ok: false, reason: 'Select 2 or more adjacent lines.' };
    if (selected.size !== selectedIds.length) return { ok: false, reason: 'The same line is selected more than once.' };
    const indexes = rows.flatMap((row, index) => selected.has(row.id) ? [index] : []);
    if (indexes.length !== selected.size) return { ok: false, reason: 'The selected lines were not found.' };
    if (indexes.some((index, offset) => offset > 0 && index !== indexes[offset - 1] + 1)) {
        return { ok: false, reason: 'Cannot merge lines that are apart. Select adjacent lines.' };
    }
    const selectedRows = indexes.map(index => rows[index]);
    if (selectedRows.some(row => row.outStart === null)) {
        return { ok: false, reason: 'Cannot merge because a selected line is already cut.' };
    }
    if (selectedRows.some(row => row.timeDomain !== selectedRows[0].timeDomain)) {
        return { ok: false, reason: 'Cannot merge lines that use different time domains.' };
    }
    return { ok: true, orderedIds: selectedRows.map(row => row.id) };
}
