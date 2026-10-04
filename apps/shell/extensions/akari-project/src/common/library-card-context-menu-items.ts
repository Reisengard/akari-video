import { AssetCatalogViewItem } from './akari-project-protocol';
import { MaterialContextMenuItem } from './material-context-menu-items';

export function libraryCardContextMenuItems(item: AssetCatalogViewItem): MaterialContextMenuItem[] {
    if (!item.libraryDir || item.origin !== 'resolver') return [];
    return [
        { id: 'reveal', label: 'Show location in Finder' },
        { id: 'remove-library', label: 'Remove from library', danger: true }
    ];
}

export function libraryRemovalWarning(item: Pick<AssetCatalogViewItem, 'sourceKind' | 'title'>, projects: readonly string[]): string {
    const names = projects.slice(0, 3).map(project => project.replace(/[\\/]+$/, '').split(/[\\/]/).pop());
    const used = projects.length ? `Used by ${projects.length} ${projects.length === 1 ? 'project' : 'projects'} (${names.join(', ')})` : 'No projects use this asset';
    return `${used}. ${item.sourceKind === 'own' || item.sourceKind === 'site' ? 'It cannot be downloaded again. ' : ''}Move to Trash.`;
}
