import assert from 'node:assert/strict';
import test from 'node:test';
import {
    computeDownloadPercent,
    formatBytes,
    formatDownloadProgressLabel,
    summarizeCommandInstallPhase
} from '../../lib/common/tool-install-progress.js';

test('formatBytes rounds sizes of at least 1 MB to whole megabytes', () => {
    assert.equal(formatBytes(12 * 1024 * 1024), '12MB');
    assert.equal(formatBytes(574 * 1024 * 1024), '574MB');
});

test('formatBytes keeps one decimal below 1 MB', () => {
    assert.equal(formatBytes(512 * 1024), '0.5MB');
    assert.equal(formatBytes(0), '0MB');
});

test('Download progress with a total shows downloaded and total megabytes', () => {
    assert.equal(
        formatDownloadProgressLabel(12 * 1024 * 1024, 574 * 1024 * 1024),
        '12MB / 574MB'
    );
});

test('Indeterminate downloads show only known byte count', () => {
    assert.equal(formatDownloadProgressLabel(3 * 1024 * 1024), '3MB');
    assert.equal(formatDownloadProgressLabel(3 * 1024 * 1024, 0), '3MB');
});

test('Download percentage clamps to 0–100', () => {
    assert.equal(computeDownloadPercent(50, 200), 25);
    assert.equal(computeDownloadPercent(200, 200), 100);
    assert.equal(computeDownloadPercent(0, 200), 0);
});

test('Unknown or zero download totals return undefined', () => {
    assert.equal(computeDownloadPercent(50), undefined);
    assert.equal(computeDownloadPercent(50, 0), undefined);
});

test('Download commands map to the package download phase', () => {
    assert.equal(summarizeCommandInstallPhase('==> Fetching ffmpeg'), 'Downloading package…');
    assert.equal(summarizeCommandInstallPhase('Downloading https://...'), 'Downloading package…');
});

test('Extraction and installation commands map to extraction', () => {
    assert.equal(summarizeCommandInstallPhase('==> Pouring ffmpeg--8.1.2.arm64_sequoia.bottle.tar.gz'), 'Extracting…');
    assert.equal(summarizeCommandInstallPhase('==> Installing ffmpeg'), 'Extracting…');
});

test('Completion wording takes precedence over Installing', () => {
    assert.equal(summarizeCommandInstallPhase('Successfully installed ffmpeg'), 'Finishing…');
    assert.equal(summarizeCommandInstallPhase('==> Summary'), 'Finishing…');
    assert.equal(summarizeCommandInstallPhase('ffmpeg 8.1.2 is already installed'), 'Finishing…');
});

test('Empty phases show preparing and unknown phases use the default', () => {
    assert.equal(summarizeCommandInstallPhase(''), 'Preparing…');
    assert.equal(summarizeCommandInstallPhase('   '), 'Preparing…');
    assert.equal(summarizeCommandInstallPhase('some unrelated line'), 'Processing…');
});
