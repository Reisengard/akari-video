import { QuickExportLicenseFinding } from '../../common/quick-export-protocol';

export type LicenseRowKind = 'non-commercial' | 'unknown' | 'attribution';
export interface LicenseRow {
    readonly kind: LicenseRowKind;
    readonly label: string;
    readonly preview: string;
    readonly names: readonly string[];
    readonly credits: readonly string[];
}

const CHECKS: readonly [LicenseRowKind, QuickExportLicenseFinding['check'], string][] = [
    ['non-commercial', 'license.non-commercial', 'Footage restricted from commercial use:'],
    ['unknown', 'license.unknown', 'Footage with unknown licenses:'],
    ['attribution', 'license.attribution', 'Footage requiring attribution:']
];

export function buildLicenseRows(findings: readonly QuickExportLicenseFinding[]): readonly LicenseRow[] {
    return CHECKS.flatMap(([kind, check, prefix]) => {
        const entries = findings.filter(finding => finding.check === check);
        if (!entries.length) return [];
        const names = entries.map(entry => entry.details.name);
        const extra = names.length > 3 ? `, plus ${names.length - 3} more` : '';
        return [{
            kind,
            label: `${prefix} ${names.length}`,
            preview: `${names.slice(0, 3).join(', ')}${extra}`,
            names,
            credits: [...new Set(entries.map(entry => entry.details.credit).filter(Boolean))]
        }];
    });
}
