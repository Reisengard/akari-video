export interface TrialEntry { before?: string; after?: string; label: string; undo: () => Promise<void>; redo: () => Promise<void>; }
/** 未確定の 1 手。通常履歴と redo を変更するのは確定時だけ。失敗時は復元用 entry を保持する。 */
export class MaterialTrialHistory {
    entry?: TrialEntry;
    async cancel(): Promise<void> {
        const entry = this.entry;
        if (!entry) return;
        await entry.undo();
        if (this.entry === entry) this.entry = undefined;
    }
    set(entry: TrialEntry): void {
        if (this.entry) throw new Error('Roll back the previous trial first.');
        this.entry = entry;
    }
    /** 最初の before を保ったまま仮の 1 手を置換する。中間状態は保存しない。 */
    replace(entry: TrialEntry): void {
        if (!this.entry || this.entry.before === undefined || entry.before !== this.entry.before) {
            throw new Error('The pre-trial snapshot does not match.');
        }
        this.entry = entry;
    }
    confirm(push: (entry: TrialEntry) => void): void {
        if (!this.entry) return;
        const entry = this.entry;
        entry.label = 'Replace footage';
        this.entry = undefined;
        push(entry);
    }
}
