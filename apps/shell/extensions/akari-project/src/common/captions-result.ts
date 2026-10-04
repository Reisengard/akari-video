import type { BuildCaptionsResult } from './akari-project-protocol';

export function interpretCaptionsResult(exitCode: number, stdout: string, stderr: string): BuildCaptionsResult {
    if (exitCode === 1 && /Edited|手直し済み/.test(stderr)) return { needsForce: true };
    if (exitCode !== 0) throw new Error(stderr.trim() || `Failed to generate captions (${exitCode})`);
    const result: unknown = JSON.parse(stdout.trim());
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid caption generation result');
    return result as BuildCaptionsResult;
}
