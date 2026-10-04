export type WorldMapMarkerState = 'absent' | 'present' | 'invalid';

export interface ParsedWorldMapMarker {
    state: WorldMapMarkerState;
    error?: string;
}

export function parseWorldMapMarker(source: string | undefined): ParsedWorldMapMarker {
    if (source === undefined) return { state: 'absent' };
    try {
        const value = JSON.parse(source) as { schemaVersion?: unknown; kind?: unknown };
        if (value?.schemaVersion !== 3) {
            return { state: 'invalid', error: 'world-map.json schemaVersion must be 3.' };
        }
        if (value.kind !== 'flat' && value.kind !== 'spatial') {
            return { state: 'invalid', error: 'world-map.json kind must be flat or spatial.' };
        }
        return { state: 'present' };
    } catch (error) {
        return { state: 'invalid', error: error instanceof Error ? error.message : String(error) };
    }
}
