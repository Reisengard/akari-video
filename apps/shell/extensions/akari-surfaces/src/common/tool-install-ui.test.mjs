import assert from 'node:assert/strict';
import test from 'node:test';
import {
    deriveToolSelection,
    describeToolInstallOutcome,
    filterInstallableSelection,
    formatInstallProgressLabel,
    shortenHomePath
} from '../../lib/common/tool-install-ui.js';

test('Unsupported tools are never selected initially or from previous state', () => {
    const tools = [
        { id: 'speech-analyzer', available: false, unsupported: true },
        { id: 'whisper', available: false, needs: ['Model missing'] }
    ];
    assert.deepEqual([...deriveToolSelection(tools)], ['whisper']);
    const previous = {
        selectedIds: new Set(['speech-analyzer', 'whisper']),
        unavailableIds: new Set(['speech-analyzer', 'whisper'])
    };
    assert.deepEqual([...deriveToolSelection(tools, previous)], ['whisper']);
});

test('Unsupported, installed, and unknown IDs are excluded from installation counts', () => {
    const selected = new Set(['speech-analyzer', 'ffmpeg', 'whisper', 'blender']);
    const tools = [
        { id: 'speech-analyzer', available: false, unsupported: true },
        { id: 'ffmpeg', available: true },
        { id: 'whisper', available: false }
    ];
    const filtered = filterInstallableSelection(tools, selected);
    assert.deepEqual([...filtered], ['whisper']);
    assert.equal(filtered.size, 1);
    assert.equal(filterInstallableSelection(tools, new Set(['speech-analyzer'])).size, 0);
    assert.equal(selected.size, 4, '元の選択は変更しない');
});

test('Skipped tools use manual-install wording or the supplied message', () => {
    const result = { id: 'speech-analyzer', outcome: 'skipped' };
    const label = describeToolInstallOutcome(result, 'SpeechAnalyzer');
    assert.match(label, /installed manually/);
    assert.doesNotMatch(label, /\n|失敗/);
    assert.equal(describeToolInstallOutcome({ ...result, message: '手動の案内' }, 'SpeechAnalyzer'), '手動の案内');
});

test('Initial checks select all missing tools by default', () => {
    const tools = [
        { id: 'ffmpeg', available: false },
        { id: 'blender', available: true },
        { id: 'yt-dlp', available: false }
    ];
    const selection = deriveToolSelection(tools);
    assert.deepEqual([...selection].sort(), ['ffmpeg', 'yt-dlp']);
});

test('Rechecks respect user deselection while a tool remains missing', () => {
    const tools = [{ id: 'ffmpeg', available: false }, { id: 'yt-dlp', available: false }];
    const previous = {
        selectedIds: new Set(['yt-dlp']), // ffmpeg のチェックをユーザーが外していた
        unavailableIds: new Set(['ffmpeg', 'yt-dlp'])
    };
    const selection = deriveToolSelection(tools, previous);
    assert.deepEqual([...selection].sort(), ['yt-dlp']);
});

test('Newly missing tools default to selected', () => {
    const tools = [
        { id: 'ffmpeg', available: false }, // 前回は available だった
        { id: 'blender', available: false } // 前回は結果に無かった
    ];
    const previous = { selectedIds: new Set(), unavailableIds: new Set() };
    const selection = deriveToolSelection(tools, previous);
    assert.deepEqual([...selection].sort(), ['blender', 'ffmpeg']);
});

test('Installed tools are removed from the selection', () => {
    const tools = [{ id: 'ffmpeg', available: true }];
    const previous = { selectedIds: new Set(['ffmpeg']), unavailableIds: new Set(['ffmpeg']) };
    const selection = deriveToolSelection(tools, previous);
    assert.equal(selection.size, 0);
});

test('Install progress displays tool name and current index over total', () => {
    assert.equal(formatInstallProgressLabel('FFmpeg', 1, 3), 'Installing: FFmpeg (1/3)…');
});

test('Install outcomes preserve a supplied message', () => {
    assert.equal(
        describeToolInstallOutcome({ id: 'ffmpeg', outcome: 'failed', message: 'ネットワークエラーです。' }, 'FFmpeg'),
        'ネットワークエラーです。'
    );
});

test('Install outcomes without messages build fallback wording', () => {
    assert.match(describeToolInstallOutcome({ id: 'ffmpeg', outcome: 'installed' }, 'FFmpeg'), /installed/);
    assert.match(describeToolInstallOutcome({ id: 'blender', outcome: 'external-installer-opened' }, 'Blender'), /opened/);
    assert.match(describeToolInstallOutcome({ id: 'blender', outcome: 'failed' }, 'Blender'), /failed/);
});

test('Destination paths within home are shortened to tilde', () => {
    assert.equal(shortenHomePath('/Users/fixture/Akari', '/Users/fixture'), '~/Akari');
    assert.equal(shortenHomePath('/Users/fixture', '/Users/fixture'), '~');
    assert.equal(shortenHomePath('/opt/data/Akari', '/Users/fixture'), '/opt/data/Akari');
});

test('Destination paths are unchanged when home is unknown', () => {
    assert.equal(shortenHomePath('/Users/fixture/Akari', undefined), '/Users/fixture/Akari');
});
