import test from 'node:test';
import assert from 'node:assert/strict';
import { prependCliShimDirToPath } from '../../lib/node/cli-path-startup.js';

const cases = [
    {
        name: 'posix',
        delimiter: ':',
        shimDir: '/opt/akari-test/.akari/cli/bin',
        otherEntries: ['/usr/local/bin', '/usr/bin']
    },
    {
        name: 'win32',
        delimiter: ';',
        shimDir: 'C:\\Users\\test\\.akari\\cli\\bin',
        otherEntries: ['C:\\Windows\\System32', 'C:\\Windows']
    }
];

for (const { name, delimiter, shimDir, otherEntries } of cases) {
    test(`prependCliShimDirToPath: an empty PATH for ${name} becomes only shimDir`, () => {
        assert.equal(prependCliShimDirToPath({ shimDir, existingPath: '', pathDelimiter: delimiter }), shimDir);
    });

    test(`prependCliShimDirToPath: ${name} stays unchanged when shimDir is already first`, () => {
        const existingPath = [shimDir, ...otherEntries].join(delimiter);
        assert.equal(prependCliShimDirToPath({ shimDir, existingPath, pathDelimiter: delimiter }), existingPath);
    });

    test(`prependCliShimDirToPath: ${name} stays unchanged when shimDir is already present`, () => {
        const existingPath = [otherEntries[0], shimDir, otherEntries[1]].join(delimiter);
        assert.equal(prependCliShimDirToPath({ shimDir, existingPath, pathDelimiter: delimiter }), existingPath);
    });

    test(`prependCliShimDirToPath: ${name} adds shimDir at the front when it is missing`, () => {
        const existingPath = otherEntries.join(delimiter);
        assert.equal(
            prependCliShimDirToPath({ shimDir, existingPath, pathDelimiter: delimiter }),
            [shimDir, ...otherEntries].join(delimiter)
        );
    });
}
