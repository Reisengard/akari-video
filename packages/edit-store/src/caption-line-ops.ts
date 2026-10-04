import { applyCaptionTextEdit, type CaptionTextEditRecord } from './caption-words-rederive';

export function replaceCaptionLine(source: string, captionId: string, text: string): string {
    if (!captionId) {
        throw new Error('The caption has no id.');
    }
    const lines = source.match(/.*(?:\r\n|\n|$)/g)?.filter(line => line.length > 0) ?? [];
    let matches = 0;
    const updated = lines.map(line => {
        const idMatch = line.match(/"id"\s*:\s*"((?:\\.|[^"\\])*)"/);
        if (!idMatch || decodeJsonString(idMatch[1]) !== captionId) {
            return line;
        }
        matches++;
        const openIndex = line.indexOf('{');
        const closeIndex = line.lastIndexOf('}');
        if (openIndex < 0 || closeIndex < openIndex) {
            throw new Error(`Caption ${captionId} is not a single-line record.`);
        }
        const record = JSON.parse(line.slice(openIndex, closeIndex + 1)) as CaptionTextEditRecord;
        const updated = applyCaptionTextEdit(record, text).record;
        if (updated === record) return line;
        return line.slice(0, openIndex) + JSON.stringify(updated) + line.slice(closeIndex + 1);
    }).join('');
    if (matches !== 1) {
        throw new Error(matches === 0
            ? `Caption ${captionId} is not in the caption data.`
            : `Caption ${captionId} appears more than once in the caption data.`);
    }
    return updated;
}

export function decodeJsonString(value: string): string {
    try {
        return JSON.parse(`"${value}"`);
    } catch {
        return value;
    }
}
