import test from 'node:test';
import assert from 'node:assert/strict';
import {
    composeExportHandOffPacket,
    copyArtifactCommand,
    copyArtifactStdin,
    EXPORT_SHARE_TARGETS
} from '../lib/common/export-share.js';

test('EXPORT_SHARE_TARGETS returns the four fixed services in order', () => {
    assert.deepEqual(EXPORT_SHARE_TARGETS.map(target => target.id), [
        'x', 'youtube', 'instagram', 'tiktok'
    ]);
    assert.equal(EXPORT_SHARE_TARGETS.length, 4);
    assert.ok(EXPORT_SHARE_TARGETS.every(target => target.url.startsWith('https://')));
});

test('composeExportHandOffPacket includes every video fact', () => {
    const packet = composeExportHandOffPacket({
        artifactPath: '/project/exports/final.mp4',
        durationSeconds: 12.5,
        width: 1920,
        height: 1080,
        fps: 30,
        bytes: 123456,
        engine: 'gpu'
    });
    assert.match(packet, /\/project\/exports\/final\.mp4/);
    assert.match(packet, /12\.5/);
    assert.match(packet, /1920×1080/);
    assert.match(packet, /30/);
    assert.match(packet, /123456/);
    assert.match(packet, /Partner/);
    assert.doesNotMatch(packet, /Claude Code/);
});

test('copyArtifactCommand builds copy commands for each OS', () => {
    assert.deepEqual(copyArtifactCommand('darwin', '/project/exports/final.mp4'), {
        command: 'osascript',
        args: ['-e', 'set the clipboard to POSIX file "/project/exports/final.mp4"']
    });
    assert.deepEqual(copyArtifactCommand('win32', 'C:\\project\\exports\\final.mp4'), {
        command: 'powershell',
        args: ['-NoProfile', '-Command', "Set-Clipboard -Path 'C:\\project\\exports\\final.mp4'"]
    });
    assert.deepEqual(copyArtifactCommand('linux', '/project/exports/final.mp4'), {
        command: 'xclip',
        args: ['-selection', 'clipboard', '-t', 'text/uri-list']
    });
    assert.equal(copyArtifactStdin('linux', '/project/exports/final.mp4'), 'file:///project/exports/final.mp4\n');
});

test('copyArtifactCommand returns undefined for unsupported OSes', () => {
    assert.equal(copyArtifactCommand('aix', '/project/exports/final.mp4'), undefined);
});
