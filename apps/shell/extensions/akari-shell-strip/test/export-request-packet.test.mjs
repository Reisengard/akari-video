import test from 'node:test';
import assert from 'node:assert/strict';
import { composeExportRequestPacket } from '../lib/common/export-request-packet.js';

// 固定テンプレートに一字一句一致することを確認する（設定値 + 明示承認済み文言）。

test('composeExportRequestPacket reruns lint and matches the entire template', () => {
    const packet = composeExportRequestPacket({
        resolutionLabel: '1080p Landscape',
        outputName: 'final.mp4',
        rerunLint: true
    });
    assert.equal(
        packet,
        '[Export request] Export edit.json using the render-cut skill. '
        + 'Settings: Resolution 1080p Landscape; output name final.mp4; rerun lint Yes. '
        + 'The user confirmed these settings in the export dialog (explicitly approved; no additional chat confirmation needed). '
        + 'Keep .akari/render.json updated with progress as you proceed'
    );
});

test('composeExportRequestPacket skips lint with alternate resolution and output name', () => {
    const packet = composeExportRequestPacket({
        resolutionLabel: 'Square',
        outputName: 'v2-square.mp4',
        rerunLint: false
    });
    assert.equal(
        packet,
        '[Export request] Export edit.json using the render-cut skill. '
        + 'Settings: Resolution Square; output name v2-square.mp4; rerun lint No. '
        + 'The user confirmed these settings in the export dialog (explicitly approved; no additional chat confirmation needed). '
        + 'Keep .akari/render.json updated with progress as you proceed'
    );
    assert.equal(packet.includes('ExportEngine'), false);
    assert.equal(/[\r\n]/.test(packet), false, 'Packet must be one line');
});
