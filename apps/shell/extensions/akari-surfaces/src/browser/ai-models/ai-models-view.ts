import {
    AkariAiModelsService, AI_MODEL_KINDS, AiModel, AiModelCatalog, AiModelKind,
    AiModelPreferences, AiModelSetId
} from '../../common/ai-models-protocol';
import {
    capabilityState, capabilityText, comparisonKeys, filterAiModels, formatAiModelOtherPrices, formatAiModelPrice, groupRepresentative,
    INPUT_LABELS, OUTPUT_LABELS, otherVariantCount, radarAxes
} from '../../common/ai-models-model';
import { makerBadge } from '../settings/maker-badge';

const KIND_LABELS: Record<AiModelKind, string> = { image: 'Images', video: 'Video', voice: 'Voice', transcribe: 'Transcription' };
const LICENSE_LABELS: Record<string, string> = { 'commercial-ok': 'Commercial use allowed', conditional: 'Conditional', 'credit-required': 'Attribution required', unknown: 'Not checked' };
const COMPARE_COLORS = ['#f0b44c', '#38bdf8', '#c084fc'] as const;

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] => {
    const item = document.createElement(tag);
    item.className = className;
    if (text !== undefined) {
        item.textContent = text;
    }
    return item;
};

const button = (text: string, attr: string, value: string, click: () => void): HTMLButtonElement => {
    const item = node('button', 'akari-ai-button', text);
    item.type = 'button';
    item.setAttribute(attr, value);
    item.addEventListener('click', click);
    return item;
};

function badge(catalog: AiModelCatalog, model: AiModel): HTMLElement {
    return makerBadge(catalog.makers, model.maker);
}

function fieldPills(values: Record<string, unknown>, labels: Record<string, string>, keys: readonly string[], model?: AiModel): HTMLElement {
    const wrap = node('div', 'akari-ai-pills');
    for (const key of keys) {
        const state = capabilityState(values[key]);
        if (state === 'unknown') {
            continue;
        }
        const detail = capabilityText(key, values[key], model);
        const label = `${labels[key]}${state === 'available' && detail !== 'Allowed' ? ` ${detail}` : ''}`;
        const pill = node('span', `akari-ai-pill${state === 'unavailable' ? ' akari-ai-no' : ''}`, label);
        if (key === 'resolutions' && model?.outputs.akari_sizes) {
            const limit = /\(Model limit: [^)]+\)$/.exec(detail);
            if (limit) {
                pill.textContent = `${labels[key]} ${detail.slice(0, -limit[0].length)}`;
                pill.append(node('small', 'akari-ai-secondary', limit[0].slice(1, -1)));
            }
        }
        wrap.append(pill);
    }
    return wrap;
}

const STYLE = `
.akari-ai-layout{display:grid;grid-template-columns:210px minmax(0,1fr);gap:0;border:1px solid var(--theia-panel-border, #424550);border-radius:9px;overflow:hidden;min-height:520px}
.akari-ai-aside{padding:13px;border-right:1px solid var(--theia-panel-border, #424550);display:flex;flex-direction:column;gap:14px;background:var(--theia-sideBar-background, #20232b)}
.akari-ai-field{display:flex;flex-direction:column;gap:6px}.akari-ai-field>strong{font-size:11px;color:var(--theia-descriptionForeground, #aab1bb)}
.akari-ai-options{display:flex;flex-wrap:wrap;gap:5px}.akari-ai-options .akari-ai-button{font-size:11px}
.akari-ai-button{border:1px solid var(--theia-panel-border, #5c6470);border-radius:6px;background:transparent;color:inherit;padding:5px 8px;cursor:pointer;text-align:left}
.akari-ai-button:hover,.akari-ai-button[aria-pressed=true]{background:var(--theia-list-hoverBackground, #343a47);border-color:var(--theia-focusBorder, #d6a958)}
.akari-ai-button:disabled{opacity:.45;cursor:default}.akari-ai-kind{display:flex;justify-content:space-between;width:100%}.akari-ai-note{font-size:11px;opacity:.7;line-height:1.5;margin:0}
.akari-ai-main{min-width:0;padding:14px;display:flex;flex-direction:column;gap:10px}.akari-ai-search{display:flex;gap:8px;flex-wrap:wrap}
.akari-ai-search input{flex:1;min-width:180px;border:1px solid var(--theia-panel-border,#5c6470);border-radius:6px;background:var(--theia-input-background,#252a34);color:inherit;padding:6px 9px}
.akari-ai-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.akari-ai-card{position:relative;border:1px solid var(--theia-panel-border,#4d5260);border-radius:9px;background:var(--theia-editorWidget-background,#292e38);padding:38px 10px 10px;min-width:0;display:flex;flex-direction:column;gap:7px}
.akari-ai-card[data-ai-model-favorite=true]{border-color:var(--theia-focusBorder,#f0b44c)}
.akari-ai-card[data-ai-model-compared=true]{border-color:var(--theia-focusBorder,#d6a958)}.akari-ai-card h4{font-size:13px;margin:0;line-height:1.3}
.akari-ai-card-top{position:absolute;top:6px;left:6px;right:6px;display:flex;justify-content:space-between}.akari-ai-star{font-size:18px;padding:1px 7px}.akari-ai-star[aria-pressed=true]{color:#f3bd52}
.akari-ai-star,.akari-ai-dots{width:27px;height:27px;display:inline-grid;place-items:center;padding:0;border-radius:6px}.akari-ai-star[aria-pressed=true]{background:rgba(240,180,76,.16);border-color:#f0b44c}
.akari-ai-name-row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}.akari-ai-name-row h4{min-width:0}.akari-ai-price{font-size:11px;color:#f0b44c}.akari-ai-secondary{display:block;font-size:9px;opacity:.72;line-height:1.4}
.akari-ai-via{white-space:nowrap}.akari-ai-summary{font-size:12px;line-height:1.5}
.akari-ai-check{display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer}.akari-ai-check input{accent-color:#f0b44c}
.akari-ai-menu{position:absolute;z-index:10;right:7px;top:39px;display:flex;flex-direction:column;background:var(--theia-menu-background,#343b48);border:1px solid var(--theia-panel-border,#666);border-radius:7px;padding:4px;box-shadow:0 8px 20px #0008}
.akari-ai-meta{display:flex;align-items:center;gap:5px;white-space:nowrap;overflow:hidden;font-size:10px;opacity:.9}.akari-ai-meta>span:last-child{overflow:hidden;text-overflow:ellipsis}.akari-ai-maker{display:inline-flex;align-items:center;gap:4px;flex-shrink:0}.akari-ai-maker-icon{width:19px;height:19px;border-radius:5px;display:inline-grid;place-items:center;font-size:10px;font-weight:bold}.akari-ai-maker-icon img{width:15px;height:15px;object-fit:contain}
.akari-ai-pills{display:flex;flex-wrap:wrap;gap:3px}.akari-ai-pill{border:1px solid var(--theia-panel-border,#5c6470);border-radius:4px;padding:1px 5px;font-size:10px}.akari-ai-no{text-decoration:line-through;opacity:.45}
.akari-ai-io{display:grid;grid-template-columns:29px 1fr;gap:4px;align-items:start;font-size:10px}.akari-ai-io>span{opacity:.6;padding-top:2px}
.akari-ai-flags{display:flex;gap:4px;flex-wrap:wrap;margin-top:auto}.akari-ai-flags span{font-size:10px;border-radius:4px;padding:2px 5px;background:var(--theia-list-hoverBackground,#444b59)}
.akari-ai-variants{align-self:flex-start;font-size:11px}.akari-ai-compare{grid-column:1/-1;border-top:1px solid var(--theia-panel-border,#4d5260);padding:14px;min-width:0;display:flex;flex-direction:column;align-items:stretch;gap:14px}.akari-ai-compare h3{grid-column:1/-1}
.akari-ai-compare h3{font-size:14px;margin:0 0 8px}.akari-ai-radar{width:min(320px,100%);height:auto}.akari-ai-radar text{font-size:10px;fill:var(--theia-foreground,#ddd)}.akari-ai-swatch{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px}
.akari-ai-table-wrap{overflow-x:auto}.akari-ai-table{border-collapse:collapse;width:100%;font-size:11px}.akari-ai-table th,.akari-ai-table td{padding:5px 7px;border-bottom:1px solid var(--theia-panel-border,#4d5260);text-align:left;vertical-align:top;min-width:95px}.akari-ai-table select{max-width:155px;background:var(--theia-input-background,#252a34);color:inherit;border:1px solid var(--theia-panel-border,#555);border-radius:4px}
`;

export class AiModelsView {
    private catalog?: AiModelCatalog;
    private preferences?: AiModelPreferences;
    private kind: AiModelKind = 'image';
    private scope: 'app' | 'project' = 'app';
    private query = '';
    private maker = '';
    private viaIncluded = true;
    private viaApi = true;
    private need = '';
    private showUnavailable = false;
    private expanded = new Set<string>();
    private compare: string[] = [];
    private menu = '';
    private error = '';

    constructor(private readonly host: HTMLElement, private readonly service: AkariAiModelsService, private readonly projectRoot?: string) {
        const style = node('style');
        style.textContent = STYLE;
        host.append(style);
        void this.load();
    }

    private options(): { projectRootUri?: string } {
        return this.scope === 'project' ? { projectRootUri: this.projectRoot } : {};
    }

    private async load(): Promise<void> {
        try {
            [this.catalog, this.preferences] = await Promise.all([
                this.service.getAiModelCatalog(),
                this.service.getAiModelPreferences({ projectRootUri: this.projectRoot })
            ]);
        } catch (error) {
            this.error = error instanceof Error ? error.message : 'Could not load models.';
        }
        this.render();
    }

    private async save(action: () => Promise<AiModelPreferences>): Promise<void> {
        try {
            await action();
            this.preferences = await this.service.getAiModelPreferences({ projectRootUri: this.projectRoot });
            this.error = '';
        } catch (error) {
            this.error = error instanceof Error ? error.message : 'Could not save.';
        }
        this.render();
    }

    private render(): void {
        const style = this.host.querySelector('style');
        this.host.replaceChildren(...(style ? [style] : []));
        if (this.error) {
            const message = node('p', 'akari-ai-note', this.error);
            message.setAttribute('role', 'alert');
            this.host.append(message);
        }
        if (!this.catalog || !this.preferences) {
            if (!this.error) {
                this.host.append(node('p', 'akari-ai-note', 'Loading AI models…'));
            }
            return;
        }
        const layout = node('div', 'akari-ai-layout');
        layout.setAttribute('data-ai-models-view', 'true');
        const aside = node('aside', 'akari-ai-aside');
        const main = node('div', 'akari-ai-main');
        this.renderAside(aside);
        this.renderMain(main);
        layout.append(aside, main);
        const compare = node('section', 'akari-ai-compare');
        compare.setAttribute('data-ai-model-compare', 'true');
        this.renderCompare(compare);
        layout.append(compare);
        this.host.append(layout);
    }

    private field(host: HTMLElement, title: string, attr: string): HTMLElement {
        const field = node('div', 'akari-ai-field');
        field.setAttribute('data-ai-model-filter', attr);
        field.append(node('strong', '', title));
        host.append(field);
        return field;
    }

    private renderAside(aside: HTMLElement): void {
        const catalog = this.catalog!;
        aside.append(node('p', 'akari-ai-note', 'Compare inputs and outputs to choose your default models.'));
        const kinds = this.field(aside, 'What to create', 'kind');
        for (const kind of AI_MODEL_KINDS) {
            const count = catalog.models.filter(row => row.kind === kind && row.callable).length;
            const item = button(`${KIND_LABELS[kind]} ${count}`, 'data-ai-model-kind', kind, () => {
                this.kind = kind;
                this.need = '';
                this.maker = '';
                this.compare = [];
                this.render();
            });
            item.classList.add('akari-ai-kind');
            item.setAttribute('aria-pressed', String(this.kind === kind));
            kinds.append(item);
        }
        const scope = this.field(aside, 'Scope', 'scope');
        const scopeRow = node('div', 'akari-ai-options');
        const projectName = this.projectRoot?.split(/[\\/]/).filter(Boolean).pop();
        for (const [id, label] of [['app', 'Entire app'], ['project', 'This video']] as const) {
            const scopeLabel = id === 'project' && this.preferences!.projectAvailable && projectName
                ? `${label}（${projectName}）` : label;
            const item = button(scopeLabel, 'data-ai-model-scope', id, () => {
                this.scope = id;
                this.render();
            });
            item.disabled = id === 'project' && !this.preferences!.projectAvailable;
            item.setAttribute('aria-pressed', String(this.scope === id));
            scopeRow.append(item);
        }
        scope.append(scopeRow);
        scope.append(node('p', 'akari-ai-note', 'Videos without pinned models use these defaults.'));
        const fixed = Object.keys(this.preferences!.projectDefaults).length;
        if (this.preferences!.projectAvailable && this.scope === 'app' && fixed) {
            scope.append(node('p', 'akari-ai-note', `This video pins ${fixed} types`));
        }
        const sets = this.field(aside, 'Recommended set', 'set');
        const setRow = node('div', 'akari-ai-options');
        for (const id of ['cheap', 'normal', 'quality'] as AiModelSetId[]) {
            setRow.append(button(catalog.sets[id].label, 'data-ai-model-set', id, () => void this.save(() => this.service.applySet(id, this.options()))));
        }
        sets.append(setRow, node('p', 'akari-ai-note', 'Apply defaults for all types.'));
        const via = this.field(aside, 'Method', 'via');
        for (const [id, label] of [
            ['included', 'No extra cost (subscription or this Mac)'],
            ['api', 'Pay as you go (API keys)']
        ] as const) {
            const row = node('label', 'akari-ai-check');
            const input = node('input') as HTMLInputElement;
            input.type = 'checkbox';
            input.checked = id === 'included' ? this.viaIncluded : this.viaApi;
            input.setAttribute('data-ai-model-via', id);
            input.addEventListener('change', () => {
                if (id === 'included') {
                    this.viaIncluded = input.checked;
                } else {
                    this.viaApi = input.checked;
                }
                this.render();
            });
            row.append(input, label);
            via.append(row);
        }
        const needs = this.field(aside, 'Inputs', 'need');
        const needRow = node('div', 'akari-ai-options');
        const needKeys = this.kind === 'image' ? ['reference_images'] : this.kind === 'video' ? ['first_frame', 'last_frame', 'reference_images', 'reference_videos', 'reference_audios', 'source_video'] : this.kind === 'voice' ? ['style', 'voice_clone', 'reference_audio'] : ['audio', 'video'];
        for (const key of ['', ...needKeys]) {
            const item = button(key ? INPUT_LABELS[key] || key : 'All', 'data-ai-model-need', key || 'all', () => {
                this.need = key;
                this.render();
            });
            item.setAttribute('aria-pressed', String(this.need === key));
            needRow.append(item);
        }
        needs.append(needRow);
        const unavailable = button('Show unavailable models', 'data-ai-model-show-unavailable', 'toggle', () => {
            this.showUnavailable = !this.showUnavailable;
            this.render();
        });
        unavailable.setAttribute('aria-pressed', String(this.showUnavailable));
        aside.append(unavailable);
    }

    private renderMain(main: HTMLElement): void {
        const catalog = this.catalog!;
        const search = node('div', 'akari-ai-search');
        const input = node('input') as HTMLInputElement;
        input.type = 'search';
        input.value = this.query;
        input.placeholder = 'Search model, company, family, or capability';
        input.setAttribute('data-ai-model-search', 'true');
        input.setAttribute('aria-label', 'Search AI models');
        input.addEventListener('input', () => {
            this.query = input.value;
            this.renderResults();
        });
        search.append(input);
        const makers = [...new Set(catalog.models.filter(row => row.kind === this.kind).map(row => row.maker))];
        for (const id of ['', ...makers]) {
            const item = button(id ? catalog.makers[id]?.name || id : 'All companies', 'data-ai-model-maker', id || 'all', () => {
                this.maker = id;
                this.render();
            });
            if (id) {
                const maker = catalog.makers[id];
                const icon = node('span', 'akari-ai-maker-icon', maker?.initials || id.slice(0, 1).toUpperCase());
                icon.style.background = maker?.background || '#526177';
                icon.style.color = maker?.color || '#fff';
                if (maker?.logo) {
                    const image = node('img') as HTMLImageElement;
                    image.src = maker.logo;
                    image.alt = '';
                    icon.replaceChildren(image);
                }
                item.prepend(icon, ' ');
            }
            item.setAttribute('aria-pressed', String(this.maker === id));
            search.append(item);
        }
        main.append(search, node('p', 'akari-ai-note', 'Use ★ for favorites. Choose Default or Compare from ⋯.'));
        const results = node('div');
        results.setAttribute('data-ai-model-results', 'true');
        main.append(results);
        this.renderResults(results);
    }

    private renderResults(existing?: HTMLElement): void {
        const host = existing || this.host.querySelector<HTMLElement>('[data-ai-model-results]');
        if (!host || !this.catalog || !this.preferences) {
            return;
        }
        host.replaceChildren();
        const via: 'all' | 'included' | 'api' = this.viaIncluded && this.viaApi
            ? 'all' : this.viaIncluded ? 'included' : 'api';
        const visible = this.viaIncluded || this.viaApi ? filterAiModels(this.catalog.models, {
            kind: this.kind,
            query: this.query,
            maker: this.maker,
            via,
            need: this.need,
            showUnavailable: this.showUnavailable,
            expanded: [...this.expanded]
        }, this.catalog.makers) : [];
        const byId = new Map(this.catalog.models.map(model => [model.id, model.name]));
        const defaultId = this.preferences.defaults[this.kind];
        const favoriteNames = (this.preferences.favorites[this.kind] || []).map(id => byId.get(id)).filter(Boolean);
        const summary = `${KIND_LABELS[this.kind]}・${visible.length} results / Default: ${defaultId ? byId.get(defaultId) || 'Not checked' : 'None'} · ★ Favorites: ${favoriteNames.join('・') || 'None'}`;
        host.append(node('p', 'akari-ai-summary', summary));
        const grid = node('div', 'akari-ai-grid');
        for (const model of visible) {
            grid.append(this.card(model));
        }
        host.append(grid);
    }

    private card(model: AiModel): HTMLElement {
        const card = node('article', 'akari-ai-card');
        card.setAttribute('data-ai-model-card', model.id);
        card.setAttribute('data-ai-model-compared', String(this.compare.includes(model.id)));
        const top = node('div', 'akari-ai-card-top');
        const starred = !!this.preferences!.favorites[model.kind]?.includes(model.id);
        card.setAttribute('data-ai-model-favorite', String(starred));
        const star = button(starred ? '★' : '☆', 'data-ai-model-star', model.id, () => void this.save(() => this.service.toggleFavorite(model.kind, model.id)));
        star.classList.add('akari-ai-star');
        star.disabled = !model.callable;
        star.setAttribute('aria-label', `${starred ? 'Remove' : 'Add'} ${model.name} ${starred ? 'from' : 'to'} favorites`);
        star.setAttribute('aria-pressed', String(starred));
        const dots = button('⋯', 'data-ai-model-menu', model.id, () => {
            this.menu = this.menu === model.id ? '' : model.id;
            this.renderResults();
        });
        dots.classList.add('akari-ai-dots');
        dots.setAttribute('aria-label', `${model.name} menu`);
        top.append(star, dots);
        card.append(top);
        if (this.menu === model.id) {
            const menu = node('div', 'akari-ai-menu');
            menu.setAttribute('data-ai-model-menu-items', model.id);
            const appDefault = this.preferences!.appDefaults[model.kind] === model.id;
            const projectDefault = this.preferences!.projectDefaults[model.kind] === model.id;
            const appItem = button(appDefault ? 'Remove default' : 'Use as default', 'data-ai-model-action', 'default', () => {
                this.menu = '';
                void this.save(() => this.service.setDefault(model.kind, appDefault ? null : model.id));
            });
            const projectItem = button(projectDefault ? 'Unpin for this video' : 'Pin for this video', 'data-ai-model-action', 'project', () => {
                this.menu = '';
                void this.save(() => this.service.setDefault(model.kind, projectDefault ? null : model.id, { projectRootUri: this.projectRoot }));
            });
            projectItem.disabled = !this.preferences!.projectAvailable || !model.callable;
            appItem.disabled = !model.callable;
            const comparison = button(this.compare.includes(model.id) ? 'Remove from comparison' : 'Compare', 'data-ai-model-action', 'compare', () => {
                this.menu = '';
                if (this.compare.includes(model.id)) {
                    this.compare = this.compare.filter(id => id !== model.id);
                } else if (this.compare.length < 3) {
                    this.compare.push(model.id);
                }
                this.render();
            });
            menu.append(appItem, projectItem, comparison);
            card.append(menu);
        }
        const nameRow = node('div', 'akari-ai-name-row');
        nameRow.append(node('h4', '', model.name), node('span', 'akari-ai-price', model.via === 'api' ? formatAiModelPrice(model) : '¥0'));
        card.append(nameRow);
        const otherPrices = formatAiModelOtherPrices(model);
        if (otherPrices) {
            card.append(node('small', 'akari-ai-secondary', otherPrices));
        }
        const meta = node('div', 'akari-ai-meta');
        meta.append(badge(this.catalog!, model), node('span', '', model.via === 'api' ? `Via: ${model.provider || 'API'}` : model.via === 'local' ? 'This Mac' : 'Subscription'), node('span', '', model.family || model.group));
        card.append(meta);
        const io = node('div', 'akari-ai-io');
        const inputKeys = comparisonKeys(this.catalog!.models, model.kind, 'inputs', INPUT_LABELS);
        const outputKeys = comparisonKeys(this.catalog!.models, model.kind, 'outputs', OUTPUT_LABELS);
        io.append(
            node('span', '', 'Input'), fieldPills(model.inputs, INPUT_LABELS, inputKeys, model),
            node('span', '', 'Output'), fieldPills(model.outputs, OUTPUT_LABELS, outputKeys, model)
        );
        card.append(io);
        const flags = node('div', 'akari-ai-flags');
        flags.append(
            node('span', '', LICENSE_LABELS[model.license?.badge || 'unknown'] || 'Not checked'),
            node('span', '', model.verified === 'measured' ? 'Measured' : 'Published')
        );
        if (model.released) {
            flags.append(node('span', '', `Release date ${model.released}`));
        }
        if (!model.callable) {
            flags.append(node('span', '', 'Unavailable'));
        }
        if (this.preferences!.projectDefaults[model.kind] === model.id) {
            flags.append(node('span', '', 'Pinned for this video'));
        } else if (this.preferences!.defaults[model.kind] === model.id) {
            flags.append(node('span', '', 'Default'));
        }
        card.append(flags);
        const groupModels = this.catalog!.models.filter(row => row.kind === model.kind && (this.showUnavailable || row.callable));
        if (groupRepresentative(groupModels, model.group)?.id === model.id) {
            const count = otherVariantCount(this.catalog!.models, model, this.showUnavailable);
            if (count && !this.query && !this.maker && !this.need && this.viaIncluded && this.viaApi && !this.showUnavailable) {
                const expanded = this.expanded.has(model.group);
                const toggle = button(expanded ? `▴ Hide other ${count} types` : `▾ Other ${count} types`, 'data-ai-model-variants', model.group, () => {
                    if (expanded) {
                        this.expanded.delete(model.group);
                    } else {
                        this.expanded.add(model.group);
                    }
                    this.renderResults();
                });
                toggle.classList.add('akari-ai-variants');
                card.append(toggle);
            }
        }
        return card;
    }

    private renderCompare(host: HTMLElement): void {
        host.append(node('h3', '', 'Compare (up to 3)'));
        const catalog = this.catalog!;
        const selectable = catalog.models.filter(row => row.kind === this.kind && (this.showUnavailable || row.callable));
        this.compare = this.compare.filter(id => selectable.some(row => row.id === id)).slice(0, 3);
        const picked = this.compare.map(id => selectable.find(row => row.id === id)!);
        if (!picked.length) {
            host.append(node('p', 'akari-ai-note', 'Add models using ⋯ on a card.'));
        }
        if (picked.length) {
            host.append(this.radar(picked));
        }
        const tableWrap = node('div', 'akari-ai-table-wrap');
        const table = node('table', 'akari-ai-table');
        table.setAttribute('data-ai-model-compare-table', 'true');
        const head = node('tr');
        head.append(node('th', '', 'Property'));
        for (const [index, model] of picked.entries()) {
            const th = node('th');
            const swatch = node('span', 'akari-ai-swatch');
            swatch.style.background = COMPARE_COLORS[index];
            const select = node('select') as HTMLSelectElement;
            select.setAttribute('data-ai-model-compare-select', String(index));
            select.setAttribute('aria-label', `${index + 1} column model`);
            for (const optionModel of selectable) {
                const option = node('option', '', optionModel.name);
                option.value = optionModel.id;
                option.selected = optionModel.id === model.id;
                select.append(option);
            }
            select.addEventListener('change', () => {
                if (!this.compare.includes(select.value)) {
                    this.compare[index] = select.value;
                    this.render();
                }
            });
            th.append(swatch, select, button('×', 'data-ai-model-compare-remove', model.id, () => {
                this.compare.splice(index, 1);
                this.render();
            }));
            head.append(th);
        }
        if (picked.length < 3 && selectable.length > picked.length) {
            const th = node('th');
            th.append(button('＋ Add', 'data-ai-model-compare-add', 'true', () => {
                const next = selectable.find(row => !this.compare.includes(row.id));
                if (next) {
                    this.compare.push(next.id);
                    this.render();
                }
            }));
            head.append(th);
        }
        table.append(head);
        const row = (label: string, value: (model: AiModel) => string): void => {
            const tr = node('tr');
            tr.append(node('th', '', label));
            for (const model of picked) {
                tr.append(node('td', '', value(model)));
            }
            table.append(tr);
        };
        row('Method', model => model.via === 'api' ? `API（${model.provider || 'Direct'}）` : model.via === 'local' ? 'This Mac' : 'Subscription');
        row('Price', formatAiModelPrice);
        row('Commercial use', model => LICENSE_LABELS[model.license?.badge || 'unknown'] || 'Not checked');
        if (this.kind === 'transcribe') row('Input: Prompt', () => '—');
        for (const key of comparisonKeys(catalog.models, this.kind, 'inputs', INPUT_LABELS)) {
            row(`Input: ${INPUT_LABELS[key]}`, model => capabilityText(key, model.inputs[key]));
        }
        for (const key of comparisonKeys(catalog.models, this.kind, 'outputs', OUTPUT_LABELS)) {
            row(`Output: ${OUTPUT_LABELS[key]}`, model => capabilityText(key, model.outputs[key], model));
        }
        row('Release date', model => model.released || 'Not checked');
        row('Evidence', model => model.verified === 'measured' ? 'Measured' : 'Published');
        for (const [index, axis] of (picked[0] ? radarAxes(picked[0]) : []).entries()) {
            row(axis.label, model => radarAxes(model)[index]?.display || 'Not checked');
        }
        tableWrap.append(table);
        host.append(tableWrap);
    }

    private radar(models: readonly AiModel[]): SVGSVGElement {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('class', 'akari-ai-radar');
        svg.setAttribute('viewBox', '0 0 320 290');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'Model comparison radar');
        svg.setAttribute('data-ai-model-radar', 'compare');
        const axes = radarAxes(models[0]);
        const cx = 160;
        const cy = 140;
        const radius = 105;
        const point = (index: number, scale: number): string => {
            const angle = -Math.PI / 2 + index * Math.PI * 2 / axes.length;
            return `${cx + Math.cos(angle) * radius * scale},${cy + Math.sin(angle) * radius * scale}`;
        };
        const addSvg = (tag: string, attributes: Record<string, string>, text?: string): void => {
            const item = document.createElementNS(ns, tag);
            for (const [key, value] of Object.entries(attributes)) {
                item.setAttribute(key, value);
            }
            if (text) {
                item.textContent = text;
            }
            svg.append(item);
        };
        for (const scale of [0.25, 0.5, 0.75, 1]) {
            addSvg('polygon', { points: axes.map((_, index) => point(index, scale)).join(' '), fill: 'none', stroke: '#687282', 'stroke-width': '1' });
        }
        for (const [index, axis] of axes.entries()) {
            addSvg('line', { x1: String(cx), y1: String(cy), x2: point(index, 1).split(',')[0], y2: point(index, 1).split(',')[1], stroke: '#687282' });
            const [x, y] = point(index, 1.19).split(',').map(Number);
            const anchor = Math.abs(x - cx) < 10 ? 'middle' : x < cx ? 'end' : 'start';
            addSvg('text', { x: String(x), y: String(y + 4), 'text-anchor': anchor }, axis.label);
        }
        for (const [index, model] of models.entries()) {
            const values = radarAxes(model);
            const color = COMPARE_COLORS[index];
            addSvg('polygon', {
                points: values.map((axis, axisIndex) => point(axisIndex, axis.value ?? 0)).join(' '),
                fill: color,
                'fill-opacity': '0.16',
                stroke: color,
                'stroke-width': '2',
                'data-ai-model-radar-series': model.id
            });
        }
        return svg;
    }
}
