/**
 * ライブラリの素材のライセンスを「2 軸」で読む純関数（読み取りの導出だけ）。
 *
 * - 商用利用: `allowed`（使える）/ `prohibited`（使えない）/ `unknown`（分からない）
 * - 帰属表示: `true`（要る）/ `false`（要らない）/ `null`（分からない）
 *
 * meta.json の `license.scope` は自由文字列のまま（語彙化はスキーマ側の別作業）なので、
 * ここでは既存の値（`commercial-ok` / `paid-license-required` / `private-owned` / `test-only`）と
 * 語彙化後の値（`commercial-ok` / `non-commercial` / `attribution` / `unknown`）の両方を読み、
 * `licenseSpdx` の手掛かりと突き合わせる。**迷ったら厳しい側**（非営利の SPDX は scope より優先）。
 *
 * カードにはライセンスを出さない。ここで導いた値は情報カード・ライセンスの窓・フィルターが使う。
 */
import type { AssetCatalogViewItem } from './akari-project-protocol';

export type LibraryCommercialUse = 'allowed' | 'prohibited' | 'unknown';

export interface LibraryLicenseAxes {
    commercial: LibraryCommercialUse;
    attributionRequired: boolean | null;
}

export interface LibraryLicenseInput {
    spdx?: string;
    scope?: string;
    attributionRequired?: boolean;
}

/** 既存 + 語彙化後の scope。表に無い値は SPDX から読む。 */
const SCOPE_COMMERCIAL: Readonly<Record<string, LibraryCommercialUse>> = {
    'commercial-ok': 'allowed',
    attribution: 'allowed',
    'non-commercial': 'prohibited',
    unknown: 'unknown',
    // 購入する権利の中身は買う先で決まる。ここからは言い切らない。
    'paid-license-required': 'unknown',
    // 利用者が自分で入れた素材。入手元の条件はアプリには分からない。
    'private-owned': 'unknown',
    'test-only': 'unknown'
};

/** 商用利用できることが SPDX だけで言える識別子。 */
const COMMERCIAL_SPDX = /^(CC0-1\.0|MIT|OFL-1\.1|Apache-2\.0|CC-BY(-SA)?-\d\.\d|LicenseRef-AKARI-[A-Za-z0-9.-]+)$/;
/** 帰属表示が要らないと SPDX だけで言える識別子（素材としての扱い）。 */
const NO_ATTRIBUTION_SPDX = /^(CC0-1\.0|LicenseRef-AKARI-[A-Za-z0-9.-]+)$/;

export function isNonCommercialSpdx(spdx: string | undefined): boolean {
    return !!spdx && /(^|-)NC(-|$)/i.test(spdx);
}

export function isAttributionSpdx(spdx: string | undefined): boolean {
    return !!spdx && /^CC-BY(-|$)/i.test(spdx);
}

export function deriveLibraryLicenseAxes(input: LibraryLicenseInput): LibraryLicenseAxes {
    const spdx = input.spdx?.trim() || undefined;
    const scope = input.scope?.trim() || undefined;
    let commercial: LibraryCommercialUse;
    if (isNonCommercialSpdx(spdx)) {
        commercial = 'prohibited';
    } else if (scope && scope in SCOPE_COMMERCIAL) {
        commercial = SCOPE_COMMERCIAL[scope];
    } else {
        commercial = spdx && COMMERCIAL_SPDX.test(spdx) ? 'allowed' : 'unknown';
    }
    let attributionRequired: boolean | null;
    if (isAttributionSpdx(spdx) || scope === 'attribution') {
        attributionRequired = true;
    } else if (typeof input.attributionRequired === 'boolean') {
        attributionRequired = input.attributionRequired;
    } else {
        attributionRequired = spdx && NO_ATTRIBUTION_SPDX.test(spdx) ? false : null;
    }
    return { commercial, attributionRequired };
}

export function libraryItemLicenseAxes(item: Pick<AssetCatalogViewItem, 'licenseSpdx' | 'licenseScope' | 'licenseAttributionRequired'>): LibraryLicenseAxes {
    return deriveLibraryLicenseAxes({ spdx: item.licenseSpdx, scope: item.licenseScope, attributionRequired: item.licenseAttributionRequired });
}

/**
 * ライセンスの窓の種類。基本の 5 つ（標準素材 / CC0 / Lab のプレミアム / CC BY / CC BY-NC）に、
 * 利用者が自分で入れた素材（own）と、どれにも当たらないもの（other = 2 軸から文を組む）を足す。
 */
export type LibraryLicenseKind = 'builtin' | 'cc0' | 'premium' | 'by' | 'nc' | 'own' | 'other';

export const LAB_PREMIUM_SPDX = 'LicenseRef-AKARI-Assets-v0';

export type LibraryLicenseKindInput = Pick<AssetCatalogViewItem,
    'origin' | 'licenseSpdx' | 'licenseScope' | 'licenseAttributionRequired' | 'price' | 'sourceKind' | 'distribution'>;

export function libraryLicenseKind(item: LibraryLicenseKindInput): LibraryLicenseKind {
    const spdx = item.licenseSpdx?.trim();
    if (spdx === LAB_PREMIUM_SPDX || (item.origin === 'resolver' && (item.price ?? 0) > 0)) return 'premium';
    if (isNonCommercialSpdx(spdx)) return 'nc';
    if (isAttributionSpdx(spdx)) return 'by';
    if (spdx === 'CC0-1.0') return 'cc0';
    if (spdx === 'LicenseRef-user-owned' || item.licenseScope === 'private-owned') return 'own';
    const axes = libraryItemLicenseAxes(item);
    if ((item.origin === 'local' && item.distribution === 'bundled') || (item.origin === 'resolver' && item.sourceKind === 'lab'))
        if (axes.commercial === 'allowed' && axes.attributionRequired !== true) return 'builtin';
    return 'other';
}

export type LibraryLicenseMark = 'ok' | 'ng' | 'warn';

export interface LibraryLicenseSheet {
    kind: LibraryLicenseKind;
    /** 窓の見出し。 */
    title: string;
    /** 見出しの下の 1 行。 */
    lead: string;
    /** ライセンスの名前（情報カードの「ライセンス名」と窓の「詳しくはこちら」に出す）。 */
    name: string;
    items: { mark: LibraryLicenseMark; text: string }[];
    /** 帰属表示が要る = 「クレジットをコピー」を出す。 */
    credit: boolean;
    /** 「詳しくはこちら」の行き先。無ければリンクを出さない。 */
    moreUrl?: string;
}

const REDISTRIBUTE_NG = 'Do not resell or redistribute the asset on its own or claim it as your own work.';
const TRADEMARK_NG = 'Designs containing this asset cannot be registered as trademarks (logos).';
const CREDIT_WARN = 'Include the creator name and license in the video description or elsewhere (use Copy credits to get the text).';

/** SPDX を人が読む名前へ。知らない識別子はそのまま出す。 */
export function libraryLicenseDisplayName(spdx: string | undefined): string {
    const id = spdx?.trim();
    if (!id) return 'No license specified';
    if (id === 'CC0-1.0') return 'CC0 (public domain)';
    if (id === LAB_PREMIUM_SPDX) return `AKARI Video Lab asset license (${id})`;
    if (id === 'LicenseRef-user-owned') return 'Asset you added';
    const cc = /^CC-BY((?:-(?:NC|SA|ND))*)-(\d\.\d)$/i.exec(id);
    if (cc) {
        const parts = cc[1].toUpperCase();
        const note = parts.includes('NC') ? '(Noncommercial)' : '(Attribution)';
        return `CC BY${parts} ${cc[2]}${note}`;
    }
    if (id === 'OFL-1.1') return 'SIL Open Font License 1.1';
    return id;
}

/** 「詳しくはこちら」の URL。公開された全文があるものだけ（LicenseRef-* は持たない）。 */
export function libraryLicenseMoreUrl(spdx: string | undefined): string | undefined {
    const id = spdx?.trim();
    if (!id || id.startsWith('LicenseRef-')) return undefined;
    if (id === 'CC0-1.0') return 'https://creativecommons.org/publicdomain/zero/1.0/deed.ja';
    const cc = /^CC-BY((?:-(?:NC|SA|ND))*)-(\d\.\d)$/i.exec(id);
    if (cc) return `https://creativecommons.org/licenses/by${cc[1].toLowerCase()}/${cc[2]}/deed.ja`;
    return `https://spdx.org/licenses/${encodeURIComponent(id)}.html`;
}

export function libraryLicenseSheet(item: LibraryLicenseKindInput): LibraryLicenseSheet {
    const kind = libraryLicenseKind(item);
    const axes = libraryItemLicenseAxes(item);
    const spdx = item.licenseSpdx?.trim();
    const moreUrl = libraryLicenseMoreUrl(spdx);
    const name = libraryLicenseDisplayName(spdx);
    switch (kind) {
        case 'builtin':
            return { kind, name: spdx ? name : 'Standard AKARI Video assets', title: 'Simple licensing',
                lead: 'Anyone using AKARI Video can use these assets for free.', credit: false, moreUrl,
                items: [
                    { mark: 'ok', text: 'Use them in videos made with AKARI Video for personal or commercial purposes.' },
                    { mark: 'ok', text: 'Use them in social media, ads, and monetized videos.' },
                    { mark: 'ng', text: REDISTRIBUTE_NG },
                    { mark: 'ng', text: TRADEMARK_NG }
                ] };
        case 'cc0':
            return { kind, name, title: 'Free to use', lead: 'Rights to these assets have been waived. Anyone can use them for free.',
                credit: false, moreUrl,
                items: [
                    { mark: 'ok', text: 'Use them in personal or commercial videos. No credit is required.' },
                    { mark: 'ok', text: 'You may edit, crop, and change the colors freely.' },
                    { mark: 'warn', text: 'If people or trademarks appear, be mindful of their rights.' }
                ] };
        case 'premium':
            return { kind, name: libraryLicenseDisplayName(LAB_PREMIUM_SPDX), title: 'Premium Lab assets',
                lead: 'Available to people who purchased the asset in Lab or hold a pass that includes it.', credit: false,
                items: [
                    { mark: 'ok', text: 'Use them in personal or commercial videos made with AKARI Video.' },
                    { mark: 'ok', text: 'Use them in monetized videos, ads, and client work.' },
                    { mark: 'ng', text: 'You may not redistribute or resell the asset on its own or include it in other asset collections.' },
                    { mark: 'ng', text: TRADEMARK_NG }
                ] };
        case 'by':
            return { kind, name, title: 'Available with credit',
                lead: 'Commercial use is allowed when you credit the creator (attribution).', credit: true, moreUrl,
                items: [
                    { mark: 'ok', text: 'Use them in personal or commercial videos.' },
                    { mark: 'warn', text: CREDIT_WARN },
                    { mark: 'ok', text: 'You may edit them (indicating that you made changes is helpful).' }
                ] };
        case 'nc':
            return { kind, name, title: 'Commercial use is not allowed', lead: 'Use only in noncommercial videos.',
                credit: true, moreUrl,
                items: [
                    { mark: 'ok', text: 'Use in hobby, school, and nonprofit videos is allowed (credit required).' },
                    { mark: 'ng', text: 'Do not use in monetized videos, ads, client work, or products for sale.' },
                    { mark: 'warn', text: 'A warning appears during export if this asset is included.' }
                ] };
        case 'own':
            return { kind, name, title: 'Asset you added',
                lead: 'You added this asset to the library. Its use is governed by the terms under which you obtained it.',
                credit: axes.attributionRequired === true, moreUrl,
                items: [
                    { mark: 'ok', text: 'You may freely use assets you filmed or created yourself.' },
                    { mark: 'warn', text: 'For assets from websites, check the terms of use on the source website.' },
                    ...(axes.attributionRequired === true ? [{ mark: 'warn' as const, text: CREDIT_WARN }] : [])
                ] };
        default:
            return otherLicenseSheet(name, axes, moreUrl);
    }
}

function otherLicenseSheet(name: string, axes: LibraryLicenseAxes, moreUrl: string | undefined): LibraryLicenseSheet {
    const items: LibraryLicenseSheet['items'] = [];
    let title: string;
    let lead: string;
    if (axes.commercial === 'prohibited') {
        title = 'Commercial use is not allowed';
        lead = 'Use only in noncommercial videos.';
        items.push({ mark: 'ng', text: 'Do not use in monetized videos, ads, client work, or products for sale.' });
    } else if (axes.commercial === 'allowed') {
        title = axes.attributionRequired ? 'Available with credit' : 'Commercial use allowed';
        lead = 'Use in personal or commercial videos within the source terms.';
        items.push({ mark: 'ok', text: 'Use them in personal or commercial videos.' });
    } else {
        title = 'Check the terms of use';
        lead = 'The library information does not indicate whether commercial use of this asset is allowed.';
        items.push({ mark: 'warn', text: 'Check the source terms of use before including it in a monetized video.' });
    }
    if (axes.attributionRequired === true) items.push({ mark: 'warn', text: CREDIT_WARN });
    else if (axes.attributionRequired === false) items.push({ mark: 'ok', text: 'No credit is required.' });
    items.push({ mark: 'ng', text: REDISTRIBUTE_NG });
    return { kind: 'other', name, title, lead, items, credit: axes.attributionRequired === true, moreUrl };
}

/** 帰属表示の 1 行（クレジットをコピー）。CREDIT.txt が無ければ作者名とライセンス名から作る。 */
export function libraryCreditLine(item: Pick<AssetCatalogViewItem, 'title' | 'author' | 'creditText' | 'licenseSpdx'>): string {
    if (item.creditText?.trim()) return item.creditText.trim();
    const license = item.licenseSpdx?.trim() ? ` (${item.licenseSpdx.trim()})` : '';
    return `${item.title}${item.author ? ` / ${item.author}` : ''}${license}`;
}
