export interface UiLintFinding {
    check?: string;
    severity?: string;
    message?: string;
    path?: string;
}

/** UI で短く案内する高頻度 check だけを持つ。詳細ログの英語本文は置き換えない。 */
export const LINT_CHECK_UI: Readonly<Record<string, string>> = Object.freeze({
    'cuts.track-transition-unsupported':
        'This transition cannot be exported in a picture-in-picture or multi-track composite. Delete the transition, or move the picture back to a single track.',
    'cuts.transition-out.non-adjacent':
        'There is a gap between this transition and the next clip. Close the gap, or delete the transition.',
    'cuts.transition-out.zero-overlap':
        'A transition is set, but there is no spare footage to overlap, so it has no effect. Adjust the footage trim, or delete the transition.',
    'cuts.transition-out.layer-evacuated':
        'This clip was moved to the picture-in-picture path, so the declared transition is not exported. Resolve the overlap, or delete the transition.',
    'captions.overlap':
        'Captions overlap in time. Move the caption start or end on the timeline.',
    'captions.output-domain-exceeds-duration':
        'A caption in output time runs past the video duration. Export clamps it to the end of the video.',
    'cuts.track-overlap':
        'Clips overlap on the same picture track. Move the clips so they do not overlap.',
    'references.files':
        'A referenced footage file was not found. Check the footage location or file name.',
    'overlays.timeline':
        'An overlay is outside the picture range. Adjust its position or the picture length.',
    'audio.sfx.timeline':
        'A sound effect is outside the picture range. Adjust its time or the picture length.'
});

/** pass verdict でも保存直後に知らせる、本タスク由来の transition warning だけ。 */
export const LINT_WARNING_SUMMARY_CHECKS: readonly string[] = Object.freeze([
    'cuts.transition-out.zero-overlap',
    'cuts.transition-out.layer-evacuated'
]);

export function lintCheckFromError(error: string | undefined): string | undefined {
    const match = /^\[([^\]]+)\]/u.exec(error ?? '');
    return match?.[1];
}

export function japaneseLintSummary(
    errors: readonly string[],
    findings: readonly UiLintFinding[] = []
): string | undefined {
    const finding = findings.find(candidate => candidate.severity === 'error' && candidate.check
        && LINT_CHECK_UI[candidate.check]);
    const check = finding?.check ?? lintCheckFromError(errors[0]);
    return check ? LINT_CHECK_UI[check] : undefined;
}

export function japaneseLintWarningSummary(
    findings: readonly UiLintFinding[] = []
): string | undefined {
    const finding = findings.find(candidate => candidate.severity === 'warning' && candidate.check
        && LINT_WARNING_SUMMARY_CHECKS.includes(candidate.check));
    return finding?.check ? LINT_CHECK_UI[finding.check] : undefined;
}

/**
 * 辞書にある check は短い UI 文 + 従来の英語詳細、未知 check は従来文言そのまま。
 */
export function formatLintFailureForUi(
    prefix: string,
    errors: readonly string[],
    findings: readonly UiLintFinding[] = []
): string {
    const detail = errors[0] ?? 'edit-lint error';
    const summary = japaneseLintSummary(errors, findings);
    return summary ? `${prefix}: ${summary} Details: ${detail}` : `${prefix}: ${detail}`;
}
