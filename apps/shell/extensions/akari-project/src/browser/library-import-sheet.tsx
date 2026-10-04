import * as React from '@theia/core/shared/react';
import { createPortal } from '@theia/core/shared/react-dom';
import URI from '@theia/core/lib/common/uri';
import { AkariProjectService, LibraryCheckFinding } from '../common/akari-project-protocol';
import { LibraryImportItem, LibraryImportPlan, LibraryImportResult, LIBRARY_IMPORT_KINDS, libraryImportGroups } from '../common/library-import';
import { hoverPopupPosition } from '../common/material-card-hover';
import { AssetSiteListing } from '../common/asset-sites';
import { composeSiteAgentPrompt } from '../common/asset-site-prompt';

interface Props {
    service: AkariProjectService; isOSX: boolean;
    overlayHost: HTMLElement;
    request?: { paths: string[] };
    pick(mode: 'both' | 'files' | 'folders'): Promise<string[]>;
    imported(result: LibraryImportResult): Promise<void>;
    stopAudio(): void;
    consumed(): void;
    siteCategory?: string;
    openSite(id: string): Promise<void>;
    askSiteAgent(prompt: string): Promise<void>;
    openLab(): void;
    projectUri?: string;
    revealLibraryPath(path: string): void;
}
const css = `
.akari-library-import button { cursor:pointer; }
.akari-library-import button:disabled { cursor:default; opacity:.5; }
.akari-import-backdrop { position:fixed; z-index:50; background:#0006; display:flex; align-items:flex-end; }
.akari-import-sheet { height:88%; width:100%; box-sizing:border-box; display:flex; flex-direction:column; min-height:0;
 background:var(--theia-editor-background); color:var(--theia-editor-foreground); border:1px solid var(--theia-panel-border);
 border-radius:12px 12px 0 0; box-shadow:0 -6px 24px #0004; animation:akari-import-rise .18s ease-out; }
.akari-import-scroll { overflow:auto; min-height:0; flex:1; padding:12px; }
.akari-import-sheet header, .akari-import-sheet footer { padding:12px; flex:none; }
.akari-import-sheet footer { border-top:1px solid var(--theia-panel-border); display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.akari-import-sheet footer button { min-width:0 !important; margin-left:0 !important; white-space:nowrap; padding:4px; }
.akari-import-group { border:1px solid var(--theia-panel-border); border-radius:6px; margin:8px 0; overflow:hidden; }
.akari-import-group summary { padding:10px; cursor:pointer; }
.akari-import-row { display:flex; align-items:center; gap:6px; padding:8px; border-top:1px solid var(--theia-panel-border); }
.akari-import-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.akari-import-row-ambiguous { flex-wrap:wrap; }
.akari-import-kind-toggle { display:flex; width:100%; min-width:0; gap:4px; }
.akari-import-kind-toggle button { flex:1 1 0; min-width:0; padding:3px 2px; white-space:nowrap; }
.akari-library-import-add.theia-button { min-width:0 !important; margin-left:0 !important; padding:0 !important; }
.akari-import-sheet input[type=text], .akari-import-sheet textarea { box-sizing:border-box; width:100%; margin:8px 0; }
.akari-import-sheet button[aria-pressed=true] { outline:2px solid var(--theia-focusBorder); }
@keyframes akari-import-rise { from { transform:translateY(100%); } to { transform:translateY(0); } }
@media (prefers-reduced-motion:reduce) { .akari-import-sheet { animation:none; } }
`;

export function libraryImportReadinessText(rejectedCount: number): string {
    return `✓ Confirmed that all files can be loaded${rejectedCount > 0 ? `(Skipped: ${rejectedCount} items)` : ''}`;
}

export function focusLibraryImportSheet(element: HTMLElement | null): void {
    element?.focus({ preventScroll: true });
}

/** Stable React children keep details, scrollTop, focus and text selection across widget updates. */
export function LibraryImportSheet(props: Props): React.ReactElement {
    const [menu, setMenu] = React.useState(false);
    const [open, setOpen] = React.useState(false);
    const [sitesOpen, setSitesOpen] = React.useState(false);
    const [checkOpen, setCheckOpen] = React.useState(false);
    const [checkBusy, setCheckBusy] = React.useState(false);
    const [checkResult, setCheckResult] = React.useState<{ ok: number; warnings: LibraryCheckFinding[]; errors: LibraryCheckFinding[] }>();
    const [sites, setSites] = React.useState<AssetSiteListing[]>([]);
    const [siteTab, setSiteTab] = React.useState<'audio' | 'font' | 'visual'>('audio');
    const [siteRequest, setSiteRequest] = React.useState('');
    const [plan, setPlan] = React.useState<LibraryImportPlan>();
    const [busy, setBusy] = React.useState<'plan' | 'apply'>();
    const [error, setError] = React.useState('');
    const [asSet, setAsSet] = React.useState(false);
    const [title, setTitle] = React.useState('');
    const [credit, setCredit] = React.useState('');
    const [playing, setPlaying] = React.useState<string>();
    const [hover, setHover] = React.useState<{ item: LibraryImportItem; left: number; top: number }>();
    const [visual, setVisual] = React.useState<{ image?: string; error?: string }>({});
    const audio = React.useRef<HTMLAudioElement>();
    const generation = React.useRef(0);
    const playGeneration = React.useRef(0);
    const mounted = React.useRef(true);
    const waveforms = React.useRef(new Map<string, { image?: string; error?: string }>());
    const dialog = React.useRef<HTMLDivElement>(null);
    const [bounds, setBounds] = React.useState(() => props.overlayHost.getBoundingClientRect());
    const hoverDelay = React.useRef<ReturnType<typeof setTimeout>>();
    const hideHover = (): void => { if (hoverDelay.current) clearTimeout(hoverDelay.current); hoverDelay.current = undefined; setHover(undefined); };
    const stop = (): void => {
        playGeneration.current++;
        if (audio.current) { audio.current.pause(); audio.current.removeAttribute('src'); audio.current.load(); }
        if (mounted.current) setPlaying(undefined);
    };
    const close = (): void => { if (busy === 'apply') return; generation.current++; stop(); hideHover(); setOpen(false); setBusy(undefined); };
    const showSites = (): void => {
        setMenu(false); setSitesOpen(true); setError('');
        setSiteTab(props.siteCategory?.includes('font') ? 'font' :
            props.siteCategory?.includes('still') || props.siteCategory?.includes('broll') ? 'visual' : 'audio');
        void props.service.getAssetSiteListings().then(setSites).catch(e => setError(String(e)));
    };
    React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; stop(); if (hoverDelay.current) clearTimeout(hoverDelay.current); }; }, []);
    React.useEffect(() => {
        if (!open) return;
        const previous = document.activeElement as HTMLElement | null;
        focusLibraryImportSheet(dialog.current);
        return () => { if (previous?.isConnected) focusLibraryImportSheet(previous); };
    }, [open]);
    React.useLayoutEffect(() => {
        const measure = (): void => setBounds(props.overlayHost.getBoundingClientRect());
        measure();
        const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
        observer?.observe(props.overlayHost);
        window.addEventListener('resize', measure);
        return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
    }, [props.overlayHost]);
    const begin = async (paths: string[]): Promise<void> => {
        if (!paths.length || busy === 'apply') return;
        const current = ++generation.current;
        stop(); props.stopAudio(); hideHover(); waveforms.current.clear(); setMenu(false); setOpen(true);
        setPlan(undefined); setError(''); setAsSet(false); setTitle(''); setCredit(''); setBusy('plan');
        try { const value = await props.service.planLibraryImport(paths); if (current === generation.current) setPlan(value); }
        catch (e) { if (current === generation.current) setError(String(e)); }
        finally { if (current === generation.current) setBusy(undefined); }
    };
    React.useEffect(() => { if (props.request) { void begin(props.request.paths); props.consumed(); } }, [props.request]);
    const pick = async (mode: 'both' | 'files' | 'folders'): Promise<void> => {
        try { const paths = await props.pick(mode); if (mounted.current) await begin(paths); }
        catch (e) { setError(String(e)); }
    };
    React.useEffect(() => {
        if (!hover) { setVisual({}); return; }
        let alive = true;
        const item = hover.item;
        setVisual({});
        void (async () => {
            try {
                if (item.category === 'audio') {
                    let result = waveforms.current.get(item.path);
                    if (!result) { result = await props.service.previewLibraryImportAudio(item.path); waveforms.current.set(item.path, result); }
                    if (alive) setVisual(result);
                } else if (item.kind === 'still') {
                    const uri = URI.fromFilePath(item.path);
                    if (alive) setVisual({ image: uri.toString() });
                }
            } catch { if (alive) setVisual({ error: 'Cannot display preview' }); }
        })();
        const hide = (): void => setHover(undefined);
        window.addEventListener('scroll', hide, true); window.addEventListener('resize', hide);
        return () => { alive = false;
            window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); };
    }, [hover?.item.path]);
    const play = async (item: LibraryImportItem): Promise<void> => {
        const wasPlaying = playing === item.path;
        stop(); if (wasPlaying) return;
        props.stopAudio();
        const current = playGeneration.current;
        setPlaying(item.path); setError('');
        try {
            const uri = URI.fromFilePath(item.path);
            // Same file-URI route as the library's existing audio cards, including external sources.
            const player = audio.current ?? (audio.current = new Audio());
            player.onended = stop;
            player.onerror = () => { stop(); setError(`${item.name} — Cannot preview audio`); };
            player.src = uri.toString();
            await player.play();
        } catch (e) { if (current === playGeneration.current) { stop(); setError(`Cannot preview audio: ${String(e)}`); } }
    };
    const apply = async (): Promise<void> => {
        if (!plan || busy || (asSet && !title.trim())) return;
        stop(); hideHover(); setBusy('apply'); setError('');
        const value = { ...plan, credit: credit.trim() || undefined,
            pack: asSet ? { id: `own-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, title: title.trim() } : undefined };
        try {
            const result = await props.service.applyLibraryImport(value);
            // A partial apply is still an import; the callback reports failures and reloads the home.
            await props.imported(result);
            if (mounted.current) setOpen(false);
        } catch (e) { if (mounted.current) setError(String(e)); }
        finally { if (mounted.current) setBusy(undefined); }
    };
    const row = (item: LibraryImportItem): React.ReactNode => <div className={`akari-import-row${item.ambiguous ? ' akari-import-row-ambiguous' : ''}`} key={item.path}
        onMouseEnter={event => { const position = hoverPopupPosition(event.currentTarget.getBoundingClientRect(),
            { width: window.innerWidth, height: window.innerHeight }, { width: 300, height: 220 }); hideHover(); hoverDelay.current = setTimeout(() => setHover({ item, ...position }), 250); }}
        onMouseLeave={hideHover}>
        {item.category === 'audio' && <button type='button' aria-label={`${item.name} — Preview audio`} aria-pressed={playing === item.path}
            onClick={() => void play(item)}>{playing === item.path ? '■' : '▶'}</button>}
        <span className='akari-import-name' title={item.path}>{item.name}</span>
        <small>{item.durationSec !== null ? `${item.durationSec.toFixed(1)} seconds` : `${((item.bytes ?? 0) / 1024).toFixed(0)} KB`}</small>
        {item.ambiguous && <span role='group' aria-label={`${item.name} — Type`} className='akari-import-kind-toggle'>
            {(['sfx', 'bgm'] as const).map(kind => <button type='button' key={kind} aria-pressed={item.kind === kind}
                disabled={busy === 'apply'} onClick={() => setPlan(previous => previous && ({ ...previous,
                    items: previous.items.map(entry => entry.path === item.path ? { ...entry, kind } : entry) }))}>{kind === 'sfx' ? 'Sound effects' : 'BGM'}</button>)}
        </span>}
    </div>;
    const count = plan?.items.filter(item => item.selected !== false).length ?? 0;
    return createPortal(<div className='akari-library-import'>
        <style>{css}</style>
        <button type='button' className='theia-button akari-library-import-add' aria-label='Add to library' aria-haspopup='menu' aria-expanded={menu}
            style={{ position: 'fixed', left: bounds.right - 58, top: bounds.bottom - 100, width: 42, height: 42, borderRadius: '50%', fontSize: 24, zIndex: 30 }}
            onClick={() => setMenu(!menu)}>＋</button>
        {menu && <div style={{ position: 'fixed', left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, zIndex: 40 }} onClick={() => setMenu(false)}>
            <div role='menu' style={{ position: 'absolute', right: 16, bottom: 108, padding: 10, display: 'grid', gap: 8,
                background: 'var(--theia-editor-background)', border: '1px solid var(--theia-panel-border)', boxShadow: '0 4px 16px #0005' }}
                onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') setMenu(false); }}>
                <button type='button' role='menuitem' onClick={() => { setMenu(false); setPlan(undefined); setError(''); setOpen(true); }}>Import from local files</button>
                <button type='button' role='menuitem' onClick={showSites}>Find on asset websites</button>
                <button type='button' role='menuitem' disabled>Paste a URL to import (coming soon)</button><hr style={{ width: '100%' }} />
                <button type='button' role='menuitem' onClick={() => { setMenu(false); props.overlayHost.dispatchEvent(new CustomEvent('akari.library.changeLocation')); }}>Change asset storage location…</button>
                <button type='button' role='menuitem' onClick={() => { setMenu(false); setCheckOpen(true); setCheckBusy(true); setCheckResult(undefined); setError('');
                    void props.service.checkLibrary(props.projectUri).then(setCheckResult).catch(e => setError(String(e))).finally(() => setCheckBusy(false)); }}>Check library</button>
            </div>
        </div>}
        {checkOpen && <div className='akari-import-backdrop' data-akari-library-check-sheet
            style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }}
            onMouseDown={event => { if (event.target === event.currentTarget) setCheckOpen(false); }}>
            <div tabIndex={-1} role='dialog' aria-modal='true' aria-label='Check library' className='akari-import-sheet'>
                <header><strong>Check library</strong></header>
                <div className='akari-import-scroll'>
                    {checkBusy && <p role='status'>Checking…</p>}
                    {checkResult && <><p>OK: {checkResult.ok}  items · Warnings: {checkResult.warnings.length}  items · Errors: {checkResult.errors.length}  items</p>
                        {[...checkResult.errors, ...checkResult.warnings].map((finding, index) =>
                            <div className='akari-import-row' key={`${finding.code}-${finding.category}-${finding.id}-${index}`}>
                                <span className='akari-import-name'>{finding.level === 'error' ? 'Errors' : 'Warnings'} · {finding.category}/{finding.id}: {finding.message}</span>
                                {finding.level === 'error' && <button type='button' onClick={() => props.revealLibraryPath(finding.dir)}>Show location in Finder</button>}
                            </div>)}</>}
                    {error && <p role='alert'>{error}</p>}
                </div>
                <footer><button type='button' onClick={() => setCheckOpen(false)}>Close</button></footer>
            </div>
        </div>}
        {sitesOpen && <div className='akari-import-backdrop' data-akari-site-sheet
            style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }}
            onMouseDown={event => { if (event.target === event.currentTarget) setSitesOpen(false); }}>
            <div tabIndex={-1} role='dialog' aria-modal='true' aria-label='Find on asset websites' className='akari-import-sheet'>
                <header><strong>Find on asset websites</strong></header>
                <div className='akari-import-scroll'>
                    <button type='button' onClick={() => { setSitesOpen(false); props.openLab(); }}>Start with AKARI Video Lab</button>
                    <div style={{ margin: '12px 0' }}><label>Ask the agent (free text)
                        <textarea value={siteRequest} onChange={event => setSiteRequest(event.target.value)} /></label>
                        <button type='button' onClick={() => { setSitesOpen(false); void props.askSiteAgent(composeSiteAgentPrompt(undefined, siteRequest)); }}>Ask the agent</button>
                    </div>
                    <div role='tablist' aria-label='Asset website category'>
                        {([['audio', 'Audio'], ['font', 'Fonts'], ['visual', 'Video and images']] as const).map(([key, label]) =>
                            <button key={key} type='button' role='tab' aria-selected={siteTab === key} onClick={() => setSiteTab(key)}>{label}</button>)}
                    </div>
                    {sites.filter(value => value.site.tab === siteTab && value.site.price === 'free').map(value =>
                        <div className='akari-import-group' key={value.site.id} style={{ padding: 10 }}>
                            <strong>{value.site.name}</strong> <small>Free</small>
                            <div><small>{siteTab === 'audio' ? 'Audio assets' : siteTab === 'font' ? 'Fonts' : 'Video and images'}</small></div>
                            <p>{value.site.terms.summary_ja}</p>
                            {value.recommendations.length > 0 && <small>Popular {value.recommendations.length}  items</small>}
                            <div><button type='button' onClick={() => { setSitesOpen(false); void props.openSite(value.site.id); }}>Open</button>
                                <button type='button' onClick={() => { setSitesOpen(false); void props.askSiteAgent(composeSiteAgentPrompt(value.site, siteRequest)); }}>Ask the agent</button></div>
                        </div>)}
                    <details className='akari-import-group'><summary>Paid and subscription services ({sites.filter(value => value.site.tab === siteTab && value.site.price !== 'free').length})</summary>
                        {sites.filter(value => value.site.tab === siteTab && value.site.price !== 'free').map(value =>
                            <div className='akari-import-row' key={value.site.id}><strong>{value.site.name}</strong>
                                <small>{value.site.price === 'subscription' ? 'Subscription' : 'One-time purchase'}</small>
                                <small>{siteTab === 'audio' ? 'Audio assets' : siteTab === 'font' ? 'Fonts' : 'Video and images'}</small>
                                <span>{value.site.terms.summary_ja}</span>
                                <button type='button' onClick={() => { setSitesOpen(false); void props.openSite(value.site.id); }}>Open</button>
                                <button type='button' onClick={() => { setSitesOpen(false); void props.askSiteAgent(composeSiteAgentPrompt(value.site, siteRequest)); }}>Ask the agent</button></div>)}</details>
                    {error && <p role='alert'>{error}</p>}
                </div>
                <footer><button type='button' onClick={() => setSitesOpen(false)}>Close</button></footer>
            </div>
        </div>}
        {open && <div className='akari-import-backdrop' style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }}
            onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
            <div ref={dialog} tabIndex={-1} role='dialog' aria-modal='true' aria-label='Import from local files' className='akari-import-sheet'
                onKeyDown={event => {
                    if (event.key === 'Escape') { event.stopPropagation(); close(); }
                    if (event.key === 'Tab') {
                        const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), summary')).filter(element => element.getClientRects().length > 0);
                        const first = elements[0], last = elements[elements.length - 1];
                        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
                        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
                    }
                }}>
                <header><strong>{plan ? `${count} items will be imported` : 'Import from local files'}</strong></header>
                <div className='akari-import-scroll'>
                    {busy === 'plan' && <p role='status'>Checking files…</p>}
                    {!plan && !busy && <><p>Drop files or folders here, or select them.</p>
                        {props.isOSX ? <button type='button' onClick={() => void pick('both')}>Choose files or folders</button>
                            : <><button type='button' onClick={() => void pick('files')}>Choose files</button> <button type='button' onClick={() => void pick('folders')}>Choose folder</button></>}
                    </>}
                    {plan && <>
                        <p>{libraryImportReadinessText(plan.rejected.length)}</p>
                        {plan.truncated && <p role='alert'>Showing up to {plan.limit}  items that can be checked at once. Import the rest in separate batches.</p>}
                        {plan.warnings.map((warning, index) => <p key={index} role='status'>{warning}</p>)}
                        {libraryImportGroups(plan).map(group => <details key={group.kind} className='akari-import-group'>
                            <summary>{group.icon} {group.label} · {group.items.length}  items <small>{group.items[0].name}</small></summary>
                            {group.items.map(row)}
                        </details>)}
                        {plan.items.some(item => item.ambiguous) && <section className='akari-import-group' aria-label='Needs review'>
                            <h4 style={{ padding: 8, margin: 0 }}>Needs review · {plan.items.filter(item => item.ambiguous).length}  items</h4>
                            {plan.items.filter(item => item.ambiguous).map(row)}
                        </section>}
                        {!!plan.duplicates.length && <section><h4>Already imported · {plan.duplicates.length}  items</h4>
                            {plan.duplicates.map((item, index) => <p key={`${item.path}-${index}`}>{item.name} → {item.title || item.id}</p>)}</section>}
                        {!!plan.rejected.length && <section><h4>Skipped · {plan.rejected.length}  items</h4>
                            {plan.rejected.map((item, index) => <p key={`${item.path}-${index}`}>{item.name} — {item.reason}</p>)}</section>}
                        <label><input type='checkbox' checked={asSet} disabled={busy === 'apply'} onChange={event => setAsSet(event.target.checked)} />Group into a set</label>
                        {asSet && <input type='text' aria-label='Set name' placeholder='Set name' value={title} disabled={busy === 'apply'} onChange={event => setTitle(event.target.value)} />}
                        <details><summary>Details</summary><label>Credit text (optional)<textarea value={credit} disabled={busy === 'apply'} onChange={event => setCredit(event.target.value)} /></label></details>
                    </>}
                    {error && <p role='alert'>{error}</p>}
                </div>
                <footer><button type='button' disabled={busy === 'apply'} onClick={close}>Close</button>
                    {plan && <button type='button' className='theia-button' disabled={!!busy || !count || (asSet && !title.trim())} onClick={() => void apply()}>
                        {busy === 'apply' ? 'Importing…' : 'Import'}</button>}</footer>
            </div>
        </div>}
        {hover && createPortal(<div role='tooltip' className='akari-import-hover' style={{ position: 'fixed', left: hover.left, top: hover.top,
            width: 300, height: 220, zIndex: 10000, pointerEvents: 'none', boxSizing: 'border-box', padding: 12, borderRadius: 8,
            background: 'var(--theia-editor-background)', color: 'var(--theia-editor-foreground)', boxShadow: '0 4px 24px #0008', border: '1px solid var(--theia-panel-border)' }}>
            <div style={{ height: 145, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {visual.image ? <img src={visual.image} alt={hover.item.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    : <span>{visual.error || (hover.item.category === 'audio' || hover.item.kind === 'still' ? 'Loading…' : LIBRARY_IMPORT_KINDS.find(kind => kind.kind === hover.item.kind)?.label)}</span>}
            </div>
            <div className='akari-import-name'>{hover.item.name}</div>
            <small>{hover.item.durationSec === null ? (hover.item.durationSource === 'size' ? 'Duration unavailable; estimated from size · ' : '') : `${hover.item.durationSec.toFixed(1)} seconds · `}
                {((hover.item.bytes ?? 0) / 1024).toFixed(0)} KB</small>
        </div>, document.body)}
    </div>, props.overlayHost);
}
