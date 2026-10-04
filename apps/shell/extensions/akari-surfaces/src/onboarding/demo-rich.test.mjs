import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const controllerPath = join(dirname(fileURLToPath(import.meta.url)), 'controller.ts');

test('Example prompts and logs play eight stages in about eighteen seconds', async () => {
    const controller = await readFile(controllerPath, 'utf8');
    assert.match(controller, /const PROMPT = 'Please edit this video\. Add captions, diagrams, sound effects, and BGM to match the speech\.';/);
    const log = controller.slice(controller.indexOf('const LOG:'), controller.indexOf('const esc ='));
    const entries = [...log.matchAll(/\{ t: (\d+),[^\n]*/g)].map(match => match[0]);
    const times = entries.map(entry => Number(entry.match(/t: (\d+)/)[1]));
    assert.equal(entries.length, 15);
    assert.ok(times.every((time, index) => index === 0 || time > times[index - 1]));
    assert.ok(times.at(-1) + 700 >= 15000 && times.at(-1) + 700 <= 20000);
    assert.deepEqual(entries.flatMap(entry => [...entry.matchAll(/stage: (\d+)/g)].map(match => Number(match[1]))),
        [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.doesNotMatch(log, /figures|bgm: true|title: true/);
    assert.match(controller, /1: 4\.2, 2: 13\.5, 3: 20\.25, 4: 25\.2,\s*5: 28\.6, 6: 30\.1, 7: 31\.9, 8: 36\.9/);
    assert.match(controller, /title: 'Captions, diagrams, sound effects, and BGM are added'/);
    assert.match(controller, /body: '<p>Elements appear in sync with speech\. Press ▶ again to stop\. Continue after watching\.<\/p>'/);
});
