// 2026-09-12 裁定 A の純粋ロジック。
// widget はこの結果を DOM へ反映するだけとする。

export interface CompileSessionCandidate {
    id: string;
    startedAt: string;
}

export type CompileSessionPlan =
    { kind: 'notice'; notice: string }
    | { kind: 'copy'; sessionId: string; prompt: string };

export function sessionSortKey(session: CompileSessionCandidate): number {
    const match = /^s-(\d+)$/.exec(session.id);
    return match ? Number(match[1]) : 0;
}

export function planCompileHandoff(
    sessions: readonly CompileSessionCandidate[], sessionId?: string
): CompileSessionPlan {
    if (sessionId && !sessions.some(session => session.id === sessionId)) {
        return { kind: 'notice', notice: `Recording session not found: ${sessionId}` };
    }
    if (sessions.length === 0) {
        return { kind: 'notice', notice: 'No recorded sessions. Record one first.' };
    }
    const session = sessionId
        ? sessions.find(candidate => candidate.id === sessionId)!
        : [...sessions].sort((left, right) => {
            const leftOrder = sessionSortKey(left);
            const rightOrder = sessionSortKey(right);
            return leftOrder === rightOrder
                ? left.startedAt.localeCompare(right.startedAt)
                : leftOrder - rightOrder;
        }).pop()!;
    const prompt = `review セッション ${session.id} をコンパイルして`;
    return { kind: 'copy', sessionId: session.id, prompt };
}

export function compileCopiedMessage(prompt: string): string {
    return `Copied "${prompt}" to the clipboard. Paste it to your partner.`;
}

export function compileClipboardFailureNotice(detail: string): string {
    return `Could not copy to the clipboard: ${detail}`;
}

export function compileClipboardFailureFooter(prompt: string): string {
    return `Could not copy to the clipboard. Copy this text manually: ${prompt}`;
}
