import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveToolRowState, describeToolAvailabilityLabel, shouldShowToolNote, SPEECH_ANALYZER_MANUAL_INSTALL_GUIDANCE, TOOL_UI } from '../../lib/common/tool-guidance.js';

test('SpeechAnalyzer guidance hides when available and appears when unprepared', () => {
    assert.equal(shouldShowToolNote({ id: 'speech-analyzer', available: true }), false);
    assert.equal(shouldShowToolNote({ id: 'speech-analyzer', available: false }), true);
});

test('Command Line Tools guidance hides when installed', () => {
    assert.equal(shouldShowToolNote({ id: 'xcode-clt', available: true }), false);
    assert.equal(shouldShowToolNote({ id: 'xcode-clt', available: false }), true);
});

test('VOICEVOX attribution remains visible after installation', () => {
    assert.equal(shouldShowToolNote({ id: 'voicevox', available: true }), true);
    assert.equal(shouldShowToolNote({ id: 'voicevox', available: false }), true);
});

test('FFmpeg without a note never displays a note', () => {
    assert.equal(shouldShowToolNote({ id: 'ffmpeg', available: true }), false);
    assert.equal(shouldShowToolNote({ id: 'ffmpeg', available: false }), false);
});

test('Unsupported tools show an OS badge without a checkbox before needs or availability', () => {
    for (const available of [false, true]) {
        const tool = { available, unsupported: true, needs: ['Command Line Tools missing'] };
        assert.deepEqual(deriveToolRowState(tool), { label: 'Unavailable on this OS', showCheckbox: false });
        assert.equal(describeToolAvailabilityLabel(tool), 'Unavailable on this OS');
    }
});

test('Supported tools with unmet needs show joined setup requirements and a checkbox', () => {
    assert.deepEqual(deriveToolRowState({ available: false, needs: ['Executable missing', 'Model missing'] }), {
        label: 'Setup required (Executable missing・Model missing）', showCheckbox: true
    });
});

test('Normal tools preserve installed status wording and checkbox visibility', () => {
    assert.deepEqual(deriveToolRowState({ available: true, needs: [] }), { label: 'Installed', showCheckbox: false });
    assert.deepEqual(deriveToolRowState({ available: false }), { label: 'Not installed', showCheckbox: true });
});

test('Available SpeechAnalyzer shows Available without a checkbox', () => {
    const tool = { id: 'speech-analyzer', available: true };
    assert.equal(describeToolAvailabilityLabel(tool), 'Available');
    assert.deepEqual(deriveToolRowState(tool), { label: 'Available', showCheckbox: false });
});

test('Unsupported SpeechAnalyzer shows an OS badge without a checkbox', () => {
    const tool = { id: 'speech-analyzer', available: false, unsupported: true };
    assert.equal(describeToolAvailabilityLabel(tool), 'Unavailable on this OS');
    assert.deepEqual(deriveToolRowState(tool), { label: 'Unavailable on this OS', showCheckbox: false });
});

test('Supported unprepared SpeechAnalyzer retains setup badge and checkbox', () => {
    const tool = { id: 'speech-analyzer', available: false };
    assert.deepEqual(deriveToolRowState(tool), { label: 'Setup required', showCheckbox: true });
    assert.deepEqual(deriveToolRowState({ ...tool, needs: ['Command Line Tools missing', 'Needs setup verification'] }), {
        label: 'Setup required (Command Line Tools missing・Needs setup verification）', showCheckbox: true
    });
});

test('Non-OS tools preserve normal badges even with an ID', () => {
    const tool = { id: 'whisper', available: false };
    assert.equal(describeToolAvailabilityLabel(tool), 'Not installed');
    assert.equal(describeToolAvailabilityLabel({ ...tool, available: true }), 'Installed');
    assert.equal(describeToolAvailabilityLabel({ ...tool, needs: ['Executable missing', 'Model missing'] }), 'Setup required (Executable missing・Model missing）');
    assert.equal(describeToolAvailabilityLabel({ ...tool, unsupported: true }), 'Unavailable on this OS');
});

test('SpeechAnalyzer manual guidance has one source shared by UI and installer', () => {
    assert.equal(TOOL_UI['speech-analyzer'].note, SPEECH_ANALYZER_MANUAL_INSTALL_GUIDANCE);
    assert.match(SPEECH_ANALYZER_MANUAL_INSTALL_GUIDANCE, /macOS 26 or later/);
    assert.match(SPEECH_ANALYZER_MANUAL_INSTALL_GUIDANCE, /Command Line Tools.*xcode-select --install/);
});

const ALL_TOOL_IDS = ['ffmpeg', 'whisper', 'yt-dlp', 'voicevox', 'blender', 'xcode-clt'];

test('Missing CLT shows recommendation and explains it is optional', () => {
    const clt = TOOL_UI['xcode-clt'];
    assert.equal(clt.badge, 'Recommended');
    assert.match(clt.note, /make videos without it/);
    assert.match(clt.note, /enabled automatically/);
    assert.match(`${clt.purpose} ${clt.note}`, /history/);
    assert.match(`${clt.purpose} ${clt.note}`, /AI analysis/);
    assert.match(clt.purpose, /transcription/);
    assert.match(clt.purpose, /person mattes/);
});

test('VOICEVOX explicitly requires attribution', () => {
    assert.match(TOOL_UI.voicevox.note, /Attribution is required/);
});

test('FFmpeg is usually required and yt-dlp defaults on', () => {
    assert.match(TOOL_UI.ffmpeg.badge, /Usually required/);
    assert.match(TOOL_UI['yt-dlp'].badge, /Enabled by default/);
});

test('Install fields and command strings are removed from tool UI', () => {
    for (const id of ALL_TOOL_IDS) {
        assert.equal('install' in TOOL_UI[id], false, `${id} に install フィールドが残っています`);
    }
});

test('All tools provide size estimates', () => {
    for (const id of ALL_TOOL_IDS) {
        assert.match(TOOL_UI[id].sizeLabel, /^About [0-9.]+ (MB|GB)/, `${id} の sizeLabel が「約 ...」形式ではありません`);
    }
});

test('Size labels contain neither commands nor URLs', () => {
    for (const id of ALL_TOOL_IDS) {
        const info = TOOL_UI[id];
        assert.doesNotMatch(info.sizeLabel, /brew|winget|xcode-select|https?:\/\//);
        assert.doesNotMatch(info.purpose, /brew|winget|xcode-select|https?:\/\//);
        if (info.note) {
            assert.doesNotMatch(info.note, /brew|winget|xcode-select|https?:\/\//);
        }
    }
});

test('SpeechAnalyzer guidance points to the existing macOS CLT installer', () => {
    assert.equal(TOOL_UI['speech-analyzer'].name, 'SpeechAnalyzer');
    assert.equal(TOOL_UI['speech-analyzer'].badge, 'Recommended');
    assert.match(TOOL_UI['speech-analyzer'].note, /macOS 26/);
    assert.match(TOOL_UI['speech-analyzer'].note, /Command Line Tools/);
});
