import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(packageRoot, '..', '..');
const schema = JSON.parse(await readFile(join(repoRoot, 'packages/schemas/intake.schema.json'), 'utf8'));
const surfaces = await readFile(join(repoRoot,
    'apps/shell/extensions/akari-surfaces/src/common/intake-labels.ts'), 'utf8');
const html = await readFile(join(packageRoot, 'intake-form-template.html'), 'utf8');

// Read literal tables without requiring the shell build or executing UI code.
function literal(source, pattern) {
    const match = source.match(pattern);
    assert.ok(match, 'Label table missing: ' + pattern);
    return JSON.parse(JSON.stringify(runInNewContext('(' + match[1] + ')')));
}

for (const [kind, schemaKey, tsName, htmlName] of [
    ['task', 'x-akari-labels', 'INTAKE_TASK_LABELS', 'TASKS'],
    ['autonomy', 'x-akari-autonomy-labels', 'INTAKE_AUTONOMY_LABELS', 'AUTONOMY']
]) {
    test('Both ' + kind + ' label mirrors match every schema ID and label', () => {
        const canonical = Object.fromEntries(Object.entries(schema[schemaKey]).filter(([id]) => !id.startsWith('$')));
        const tsLabels = literal(surfaces, new RegExp(tsName + ':[\\s\\S]*?= (\\{[\\s\\S]*?\\});'));
        const htmlLabels = Object.fromEntries(literal(html,
            new RegExp('const ' + htmlName + ' = (\\[[\\s\\S]*?\\]);')).map(({ id, label }) => [id, label]));
        assert.deepEqual(tsLabels, canonical);
        assert.deepEqual(htmlLabels, canonical);
    });
}
