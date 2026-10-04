import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExportEncoderChoices, exportEncoderValues } from '../lib/common/export-encoder-choices.js';
import { buildQuickExportEncoderChoices } from '../lib/common/quick-export-cli.js';

test('Shared encoder choices preserve order and labels on every OS', () => {
    const automatic = { label: 'Auto (default; prefer available hardware)', value: 'auto' };
    const software = { label: 'Software (x264)', value: 'x264' };
    const expected = {
        darwin: [automatic, { label: 'Hardware (VideoToolbox)', value: 'videotoolbox' }, software],
        win32: [automatic,
            { label: 'Hardware (NVENC)', value: 'nvenc' },
            { label: 'Hardware (QSV)', value: 'qsv' },
            { label: 'Hardware (AMF)', value: 'amf' },
            { label: 'Hardware (Media Foundation)', value: 'mf' }, software],
        linux: [automatic, software]
    };
    for (const platform of ['darwin', 'win32', 'linux']) {
        assert.deepEqual(buildExportEncoderChoices(platform), expected[platform]);
        assert.deepEqual(buildExportEncoderChoices(platform), buildQuickExportEncoderChoices(platform));
    }
});

test('All encoder values form a deduplicated union across OSes', () => {
    const values = exportEncoderValues();
    assert.equal(values.length, new Set(values).size);
    assert.deepEqual([...values].sort(), ['auto', 'videotoolbox', 'nvenc', 'qsv', 'amf', 'mf', 'x264'].sort());
    assert.deepEqual(new Set(values), new Set(['darwin', 'win32', 'linux']
        .flatMap(platform => buildExportEncoderChoices(platform).map(({ value }) => value))));
});
