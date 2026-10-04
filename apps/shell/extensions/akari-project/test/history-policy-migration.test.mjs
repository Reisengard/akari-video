import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { PROJECT_GITIGNORE, LEGACY_PROJECT_GITIGNORES } from 'akari-video/src/history-policy.mjs';

import { AkariProjectServiceImpl } from '../lib/node/akari-project-service.js';

const execFileAsync = promisify(execFile);

const LEGACY_GITIGNORE = LEGACY_PROJECT_GITIGNORES[0];

class MigrationService extends AkariProjectServiceImpl {
    fsPath(uri) {
        return uri;
    }
}

async function git(root, args) {
    return execFileAsync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
}

async function writeAll(root, files) {
    for (const [relative, content] of Object.entries(files)) {
        const destination = join(root, relative);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, content, 'utf8');
    }
}

async function trackedFiles(root) {
    const { stdout } = await git(root, ['ls-files']);
    return stdout.split('\n').filter(Boolean);
}

/** 節目の自動スナップショットと同じ内容で 1 本コミットしたプロジェクトを組む。 */
async function legacyProject(files = {}) {
    const root = await mkdtemp(join(tmpdir(), 'akari-history-migration-'));
    await git(root, ['init', '-q']);
    await writeAll(root, {
        '.gitignore': LEGACY_GITIGNORE,
        'edit.json': '{}\n',
        'captions.json': '[]\n',
        'planning/plan.md': '# Planning\n',
        'exports/.gitkeep': '',
        'exports/final.mp4': 'video-bytes',
        'exports/master.gpu-video.mp4': 'intermediate-bytes',
        '.akari/reports/contact-sheet.png': 'image-bytes',
        '.akari/reports/export-check/result.json': '{"ok":true}\n',
        '.akari/render-tmp/run-1/frame-000001.png': 'frame-bytes',
        '.akari/sidecars/shot-01/proxy.mp4': 'proxy-bytes',
        '.akari/events/2026-09-03-export-completed.json': '{"type":"export-completed"}\n',
        ...files
    });
    await git(root, ['add', '-A', '--', '.']);
    await git(root, ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'Export video']);
    return root;
}

test('opening a project: updates legacy .gitignore and removes generated files from history', async () => {
    const root = await legacyProject();
    try {
        const before = await trackedFiles(root);
        assert.ok(before.includes('exports/final.mp4'), 'precondition: legacy exports are tracked in history');
        assert.ok(before.includes('.akari/render-tmp/run-1/frame-000001.png'));

        await new MigrationService().migrateHistoryPolicy(root);

        assert.equal(await readFile(join(root, '.gitignore'), 'utf8'), PROJECT_GITIGNORE);
        const after = await trackedFiles(root);
        for (const gone of [
            'exports/final.mp4',
            'exports/master.gpu-video.mp4',
            '.akari/reports/contact-sheet.png',
            '.akari/render-tmp/run-1/frame-000001.png'
        ]) {
            assert.ok(!after.includes(gone), `${gone} remains in history`);
        }
        for (const kept of [
            'edit.json',
            'captions.json',
            'planning/plan.md',
            'exports/.gitkeep',
            '.akari/reports/export-check/result.json',
            '.akari/sidecars/shot-01/proxy.mp4',
            '.akari/events/2026-09-03-export-completed.json'
        ]) {
            assert.ok(after.includes(kept), `${kept} was removed from history`);
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('opening a project: deletes no files on disk', async () => {
    const root = await legacyProject();
    try {
        await new MigrationService().migrateHistoryPolicy(root);

        for (const relative of [
            'exports/final.mp4',
            'exports/master.gpu-video.mp4',
            '.akari/reports/contact-sheet.png',
            '.akari/render-tmp/run-1/frame-000001.png'
        ]) {
            assert.equal((await stat(join(root, relative))).isFile(), true, `${relative} was deleted`);
        }
        assert.equal(await readFile(join(root, 'exports/final.mp4'), 'utf8'), 'video-bytes');
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('opening a project: migration finishes in one commit and leaves a clean working tree', async () => {
    const root = await legacyProject();
    try {
        await new MigrationService().migrateHistoryPolicy(root);

        const { stdout: status } = await git(root, ['status', '--porcelain']);
        assert.equal(status.trim(), '', 'uncommitted changes remain after migration');
        const { stdout: log } = await git(root, ['log', '--format=%s']);
        assert.deepEqual(log.split('\n').filter(Boolean), [
            'Organize generated files excluded from change history (files remain in place)',
            'Export video'
        ]);
        // 過去のコミットは書き換えない（.git は横ばい）。
        const { stdout: historical } = await git(root, ['ls-tree', '-r', '--name-only', 'HEAD^']);
        assert.ok(historical.split('\n').includes('exports/final.mp4'));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('opening a project: the second run does nothing', async () => {
    const root = await legacyProject();
    try {
        const service = new MigrationService();
        await service.migrateHistoryPolicy(root);
        const { stdout: first } = await git(root, ['rev-parse', 'HEAD']);
        await service.migrateHistoryPolicy(root);
        const { stdout: second } = await git(root, ['rev-parse', 'HEAD']);
        assert.equal(second, first, 'commit count increased without changes');
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('opening a project: preserves user edits to .gitignore and appends entries', async () => {
    const root = await legacyProject({ '.gitignore': `${LEGACY_GITIGNORE}\n# My notes\nscratch/**\n` });
    try {
        await new MigrationService().migrateHistoryPolicy(root);

        const updated = await readFile(join(root, '.gitignore'), 'utf8');
        assert.ok(updated.includes('# My notes'), 'removed a user-written line');
        assert.ok(updated.includes('scratch/**'));
        assert.ok(updated.includes('!.akari/sidecars/**'));
        assert.ok(!(await trackedFiles(root)).includes('exports/final.mp4'));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('leaves projects inside a parent repository untouched', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'akari-history-parent-'));
    try {
        await git(parent, ['init', '-q']);
        const root = join(parent, 'projects', 'my-video');
        await writeAll(root, {
            '.gitignore': LEGACY_GITIGNORE,
            'edit.json': '{}\n',
            'exports/final.mp4': 'video-bytes'
        });
        await git(parent, ['add', '-A', '--', '.']);
        await git(parent, ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'Import']);

        await new MigrationService().migrateHistoryPolicy(root);

        assert.equal(await readFile(join(root, '.gitignore'), 'utf8'), LEGACY_GITIGNORE);
        assert.ok((await trackedFiles(parent)).includes('projects/my-video/exports/final.mp4'));
    } finally {
        await rm(parent, { recursive: true, force: true });
    }
});

test('silently does nothing for projects without git', async () => {
    const root = await mkdtemp(join(tmpdir(), 'akari-history-gitless-'));
    try {
        await writeAll(root, { '.gitignore': LEGACY_GITIGNORE, 'edit.json': '{}\n' });
        await new MigrationService().migrateHistoryPolicy(root);
        assert.equal(await readFile(join(root, '.gitignore'), 'utf8'), LEGACY_GITIGNORE);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
