export interface AkariMenuRow {
    id: string;
    label: string;
    icon: string;
}

export function akariMenuRows(options?: { worldMap?: boolean }): AkariMenuRow[] {
    const rows: AkariMenuRow[] = [
        { id: 'akari.partner.open', label: 'Partner', icon: 'codicon codicon-add' },
        { id: 'akari.daihon.open', label: 'Script', icon: 'akari-rail-icon akari-rail-icon-daihon' },
        { id: 'akari.cuts.open', label: 'Cut candidates', icon: 'akari-rail-icon akari-rail-icon-cuts' },
        { id: 'akari.review.open', label: 'Annotations', icon: 'akari-rail-icon akari-rail-icon-review' },
        { id: 'akari.annotations.open', label: 'Timeline (bottom panel)', icon: 'codicon codicon-comment' },
        { id: 'akari.menu.openOverview', label: 'Home', icon: 'codicon codicon-home' },
        { id: 'akari.home.openFirstRunSetup', label: 'Setup', icon: 'codicon codicon-tools' },
        { id: 'akari.home.openProjectLauncher', label: 'Project Launcher', icon: 'codicon codicon-layout' },
        { id: 'akari.project.showChanges', label: 'View changes', icon: 'codicon codicon-diff' }
    ];
    if (options?.worldMap) {
        rows.splice(5, 0, { id: 'akari.world.openMap', label: 'Map', icon: 'codicon codicon-map' });
    }
    return rows;
}
