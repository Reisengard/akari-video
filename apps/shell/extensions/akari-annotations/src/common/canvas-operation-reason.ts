/** 保存層の型名や英語を画面へ出さず、操作の失敗理由を短く示す。 */
export function canvasOperationReason(error: unknown): string {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.includes('2 個以上')) return 'Select at least 2 items.';
    if (detail.includes('同じ場所') || detail.includes('同じグループ')) return 'Select items at the same level.';
    if (detail.includes('袋')) return 'Move the parts out of the group first.';
    if (detail.includes('より前')) return 'Cannot be placed before the canvas start.';
    if (detail.includes('ロック') || /\block(ed)?\b/i.test(detail)) return 'Unlock before editing.';
    if (detail.includes('自分自身')) return 'Cannot be placed inside itself.';
    if (detail.includes('見つかりません') || /not found/i.test(detail)) return 'Target not found. Reload and try again.';
    return 'Cannot do this. Check the selection and time.';
}
