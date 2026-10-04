import { AssetSite } from './asset-sites';
import { composeAgentContextPacket } from './agent-context-packet';

export const PARTNER_INJECT_PROMPT_COMMAND_ID = 'akari.partner.injectPrompt';
export function composeSiteAgentPrompt(site: AssetSite | undefined, request: string): string {
    // Same one-line context packet shape as composeCatalogImportPrompt, with site-only instructions.
    return composeAgentContextPacket('Asset website', site ? [
        { value: site.id }, { label: 'tab', value: site.tab },
        { label: 'title', value: site.name }, { label: 'source:', value: site.entry_url }
    ] : [{ value: 'Search all sources' }],
    `User request: ${request.trim()}. First search AKARI Lab and existing assets. If more are needed, choose from asset websites, open the page, and highlight the download button. The user clicks to download.`);
}
