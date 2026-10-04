import { existsSync, realpathSync } from 'fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { isTimelineEditFileName, timelineCaptionsFileName, timelineEditFileName, timelineSlugFromEditFileName } from '../common/timeline-files';

/** Accept only a timeline file directly in the selected project directory. */
export function timelineEditPath(projectRoot: string, editUri?: string): string {
    const root = resolve(projectRoot);
    if (!editUri) return join(root, 'edit.json');
    let target: string;
    try { target = resolve(fileURLToPath(editUri)); }
    catch { throw new Error('Invalid edit data URI.'); }
    const rel = relative(root, target);
    if (!isTimelineEditFileName(basename(target)) || !rel || rel === '..'
        || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new Error('Specify edit.json or edit.<slug>.json inside the project.');
    }
    const realRoot = realpathSync(root);
    const realParent = realpathSync(dirname(target));
    const parentRel = relative(realRoot, realParent);
    if (parentRel === '..' || parentRel.startsWith(`..${sep}`) || isAbsolute(parentRel)
        || existsSync(target) && relative(dirname(realpathSync(target)), realParent) !== '') {
        throw new Error('Edit data outside the project cannot be used.');
    }
    return target;
}

export function timelineCaptionsPath(editPath: string): string {
    const name = basename(editPath);
    if (!isTimelineEditFileName(name)) throw new Error('Invalid edit data file name.');
    return join(dirname(editPath), timelineCaptionsFileName(timelineSlugFromEditFileName(name)));
}

export function timelineEditPathForCaptions(captionsPath: string, projectRoot: string): string {
    const name = basename(captionsPath);
    const editName = name.startsWith('captions') ? `edit${name.slice('captions'.length)}` : '';
    if (!isTimelineEditFileName(editName)) throw new Error('Invalid caption file name.');
    const editPath = join(dirname(captionsPath), timelineEditFileName(timelineSlugFromEditFileName(editName)));
    timelineEditPath(projectRoot, pathToFileURL(editPath).toString());
    if (existsSync(captionsPath)
        && relative(dirname(realpathSync(captionsPath)), realpathSync(dirname(captionsPath))) !== '') {
        throw new Error('Captions outside the project cannot be used.');
    }
    return editPath;
}
