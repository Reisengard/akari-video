#!/usr/bin/env node
// 音楽グリッド CLI — 宣言済み BGM の拍・キメ・構成が **timeline のどこに来るか**を出し、
// 指定した発火時刻をグリッドへ寄せる（スナップ）。edit-plan の beat-sync が使う。
//
// ネットワークには触れない。BGM の長さは ffprobe（media-bin 経由）で測るか --track-duration で渡す。
//
// Usage:
//   node bin/beat-grid.mjs --track <id> --timeline <秒> [options]
//   node bin/beat-grid.mjs --edit <edit.json> [--timeline <秒>] [options]
// options:
//   --in <秒>              audio.bgm.in（--edit 指定時は edit.json から読む）
//   --track-duration <秒>  BGM ファイルの長さ（未指定なら ffprobe で測る）
//   --snap 12.3,45.6       その timeline 秒をグリッドへ寄せた結果を出す
//   --window <秒>          スナップ窓（既定 0.12）
//   --every <N>            カット候補の間隔（拍。既定 4 = 1 小節）
//   --fps <数>             出力 fps（--edit 指定時は edit.json の output.fps）
//   --declarations <path>  宣言 JSON（既定: <ライブラリ>/declarations.json / env AKARI_SOUNDS_DECLARATIONS）
//   --json                 機械可読出力

import { audioReadPath, readAudioDeclarations } from '../shared/library-roots.mjs';
import { resolveAssetLibraryRoots } from '../../creator-root/src/index.mjs';
import { resolveFfprobe } from '../../media-bin/src/index.mjs';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { cutCandidates, musicGrid, snapToGrid, toFrameGrid } from '../shared/beat-grid.mjs';

const ffprobeBinary = (() => {
    try { return { command: resolveFfprobe() }; }
    catch (error) { return { error }; }
})();

function libraryRoot(env = process.env) {
    return path.join(resolveAssetLibraryRoots(env).write, 'audio');
}

function parseArguments(argv, env = process.env) {
    function valueAfter(index, option, example) {
        const value = argv[index + 1];
        if (value === undefined || value.startsWith('--')) {
            console.error(`${option} needs a value (example: ${example})`);
            process.exit(1);
        }
        return value;
    }
    const options = {
        track: null, edit: null, timeline: null, in: null, trackDuration: null,
        snap: [], window: 0.12, every: 4, fps: null,
        declarations: env.AKARI_SOUNDS_DECLARATIONS || null, json: false,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--track') { options.track = valueAfter(i++, arg, '--track <id>'); continue; }
        if (arg === '--edit') { options.edit = path.resolve(valueAfter(i++, arg, '--edit <edit.json>')); continue; }
        if (arg === '--timeline') { options.timeline = Number(valueAfter(i++, arg, '--timeline <seconds>')); continue; }
        if (arg === '--in') { options.in = Number(valueAfter(i++, arg, '--in <seconds>')); continue; }
        if (arg === '--track-duration') { options.trackDuration = Number(valueAfter(i++, arg, '--track-duration <seconds>')); continue; }
        if (arg === '--snap') { options.snap = valueAfter(i++, arg, '--snap 12.3,45.6').split(',').map(Number).filter((n) => Number.isFinite(n)); continue; }
        if (arg === '--window') { options.window = Number(valueAfter(i++, arg, '--window <seconds>')); continue; }
        if (arg === '--every') { options.every = Number(valueAfter(i++, arg, '--every <N>')); continue; }
        if (arg === '--fps') { options.fps = Number(valueAfter(i++, arg, '--fps <number>')); continue; }
        if (arg === '--declarations') { options.declarations = valueAfter(i++, arg, '--declarations <path>'); continue; }
        if (arg === '--json') { options.json = true; continue; }
        throw new Error(`Unknown option: ${arg}`);
    }
    return options;
}

async function loadDeclarations(options) {
    const candidate = options.declarations
        ? path.resolve(options.declarations)
        : audioReadPath(libraryRoot(), 'declarations.json');
    if (!existsSync(candidate)) {
        throw new Error(
            `Declaration data was not found: ${candidate}\n` +
            'Declare it yourself with declare-audio (node bin/declare-helper.mjs), ' +
            'or, if you bought it, akari store install sounds-declaration-pack.',
        );
    }
    return { declarations: (options.declarations ? JSON.parse(await readFile(candidate, 'utf8')) : readAudioDeclarations(libraryRoot())), source: candidate };
}

/** edit.json から BGM の id / in / タイムライン長（cuts の合計）を読む。 */
async function readEdit(editPath) {
    const edit = JSON.parse(await readFile(editPath, 'utf8'));
    const bgm = edit.audio?.bgm ?? null;
    const cuts = Array.isArray(edit.cuts) ? edit.cuts : [];
    const timeline = cuts.reduce((sum, cut) => {
        const span = Number(cut.out) - Number(cut.in);
        return Number.isFinite(span) && span > 0 ? sum + span : sum;
    }, 0);
    return {
        bgmPath: bgm?.path ?? null,
        bgmIn: Number.isFinite(bgm?.in) ? bgm.in : 0,
        outputFps: Number.isFinite(edit.output?.fps) ? edit.output.fps : null,
        timelineFromCuts: timeline > 0 ? Math.round(timeline * 1000) / 1000 : null,
        editDir: path.dirname(editPath),
    };
}

function trackIdFromPath(bgmPath) {
    const base = path.basename(bgmPath).replace(/\.[^.]+$/, '');
    return base;
}

function probeDuration(filePath) {
    try {
        if (Object.hasOwn(ffprobeBinary, 'error')) throw ffprobeBinary.error;
        const result = spawnSync(ffprobeBinary.command, [
            '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', filePath,
        ], { encoding: 'utf8' });
        const seconds = Number(String(result.stdout ?? '').trim());
        return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
    } catch {
        return null;
    }
}

function formatHuman(grid, { trackId, snaps, cuts, declarationsSource }) {
    const lines = [];
    const m = grid.meta;
    lines.push(`Music grid: ${trackId} (declaration: ${declarationsSource})`);
    lines.push(`  ♩${m.bpm ?? '—'} / ${m.beats_per_bar} beats / ${m.fps}fps / length ${m.track_duration}s / in ${m.bgm_in}s / timeline ${m.timeline_frames}f (${m.loops} loops)`);
    lines.push(`  beats ${grid.beats.length} / downbeats ${grid.downbeats.length} / hits ${grid.hits.length}${grid.seams.length ? ` / loop seams ${grid.seams.join(', ')}f` : ''}`);
    if (grid.hits.length) lines.push(`  Hits (timeline frame): ${grid.hits.slice(0, 12).join(', ')}${grid.hits.length > 12 ? ' …' : ''}`);
    for (const section of grid.sections) {
        lines.push(`  Section: ${section.label} ${section.start_frame}–${section.end_frame}f`);
    }
    if (cuts.length) {
        lines.push(`  Cut candidates (${cuts.length}): ${cuts.slice(0, 12).join(', ')}${cuts.length > 12 ? ' …' : ''}`);
    }
    if (snaps.length) {
        lines.push('  Snap:');
        for (const snap of snaps) {
            lines.push(snap.snapped
                ? `    ${snap.from}f → ${snap.t}f (${snap.kind} / ${snap.delta > 0 ? '+' : ''}${snap.delta}f)`
                : `    ${snap.from}f → unchanged (no grid point inside the window)`);
        }
    }
    lines.push('  Choose firing points at the footage-plan and execution approval gates. This only lists candidates.');
    return lines.join('\n');
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    let { track: trackId, in: bgmIn, timeline: timelineDuration, trackDuration, fps } = options;
    let bgmFile = null;

    if (options.edit) {
        const edit = await readEdit(options.edit);
        if (!edit.bgmPath) throw new Error('edit.json has no audio.bgm');
        bgmFile = path.resolve(edit.editDir, edit.bgmPath);
        trackId = trackId ?? trackIdFromPath(edit.bgmPath);
        bgmIn = bgmIn ?? edit.bgmIn;
        timelineDuration = timelineDuration ?? edit.timelineFromCuts;
        fps = fps ?? edit.outputFps;
    }
    if (!trackId) throw new Error('Pass --track or --edit');
    if (!Number.isFinite(timelineDuration) || timelineDuration <= 0) {
        throw new Error('Pass --timeline (timeline length in seconds) when edit.json cuts do not imply it');
    }
    if (!Number.isFinite(fps) || fps <= 0) {
        throw new Error('Pass --fps (output fps) when edit.json has no output.fps');
    }

    const { declarations, source } = await loadDeclarations(options);
    const declaration = declarations[trackId];
    if (!declaration) {
        throw new Error(`No declaration for ${trackId}. Add one with declare-audio, or install a declaration pack.`);
    }

    if (!Number.isFinite(trackDuration)) {
        if (!bgmFile) {
            const guess = audioReadPath(libraryRoot(), 'akari-sounds-bgm', `${trackId}.mp3`);
            bgmFile = existsSync(guess) ? guess : null;
        }
        trackDuration = bgmFile ? probeDuration(bgmFile) : null;
        if (!trackDuration) {
            throw new Error('BGM length is unknown. Pass --track-duration <seconds> when ffprobe cannot measure it.');
        }
    }

    const secondsGrid = musicGrid({ declaration, trackDuration, bgmIn: bgmIn ?? 0, timelineDuration });
    const grid = toFrameGrid(secondsGrid, fps);
    const snaps = options.snap.map((t) => snapToGrid(t, secondsGrid, { fps, window: options.window }));
    const cuts = cutCandidates(secondsGrid, { fps, every: options.every });

    if (options.json) {
        console.log(JSON.stringify({
            track: trackId, declarations_source: source, grid, snaps, cut_candidates: cuts,
        }, null, 2));
        return;
    }
    console.log(formatHuman(grid, { trackId, snaps, cuts, declarationsSource: source }));
}

main().catch((error) => {
    console.error(error.message ?? String(error));
    process.exitCode = 1;
});
