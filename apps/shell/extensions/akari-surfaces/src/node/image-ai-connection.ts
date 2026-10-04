import type { ConnectionDoctor } from 'akari-shell-strip/lib/common/akari-connections-protocol';

/** A read-only fal request. Only an actual successful HTTP response counts as connected. */
export async function checkFalImageAiConnection(secret: string | undefined,
    fetchImpl: typeof fetch = fetch): Promise<ConnectionDoctor> {
    const checked = new Date().toISOString();
    if (!secret) return { status: 'unconfigured', detail: 'Configure a key to use this.', last_checked: checked };
    try {
        const response = await fetchImpl('https://rest.alpha.fal.ai/billing/user_balance', {
            method: 'GET', headers: { Authorization: `Key ${secret}` }, signal: AbortSignal.timeout(10000)
        });
        return response.ok ? { status: 'ok', detail: 'Connected successfully.', last_checked: checked }
            : response.status === 401 || response.status === 403
                ? { status: 'unauthorized', detail: 'Check your key.', last_checked: checked }
                : { status: 'unchecked', detail: `Could not check connection (HTTP ${response.status}）。`, last_checked: checked };
    } catch { return { status: 'unchecked', detail: 'Could not check connection. Check your network.', last_checked: checked }; }
}
