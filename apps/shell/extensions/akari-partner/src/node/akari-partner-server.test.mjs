import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePartnerProcessLaunch } from '../../lib/node/akari-partner-server.js';

test('The Windows Command Code npm shim starts the PTY through cmd.exe', () => {
    assert.deepEqual(
        resolvePartnerProcessLaunch(
            'commandcode',
            'C:\\Users\\creator\\AppData\\Roaming\\npm\\command-code.cmd',
            'win32',
            { ComSpec: 'C:\\Windows\\System32\\cmd.exe' }
        ),
        {
            executablePath: 'C:\\Windows\\System32\\cmd.exe',
            args: [
                '/d',
                '/s',
                '/c',
                'C:\\Users\\creator\\AppData\\Roaming\\npm\\command-code.cmd'
            ]
        }
    );
});

test('POSIX and the other partners keep their existing launch plan', () => {
    assert.deepEqual(resolvePartnerProcessLaunch('commandcode', '/opt/bin/command-code', 'darwin', {}), { args: [] });
    assert.deepEqual(resolvePartnerProcessLaunch('codex', 'C:\\tools\\codex.exe', 'win32', {}), { args: [] });
});

test('The Windows Pi npm shim also starts through cmd.exe, and Devin takes no arguments', () => {
    assert.deepEqual(resolvePartnerProcessLaunch('pi', 'C:\\Users\\creator\\.local\\pi.cmd', 'win32', { ComSpec: 'C:\\Windows\\cmd.exe' }), {
        executablePath: 'C:\\Windows\\cmd.exe', args: ['/d', '/s', '/c', 'C:\\Users\\creator\\.local\\pi.cmd']
    });
    assert.deepEqual(resolvePartnerProcessLaunch('devin', 'C:\\devin\\devin.exe', 'win32', {}), { args: [] });
});

test('The Windows Claude npm shim goes through cmd.exe, and a native exe starts directly', () => {
    const shim = 'C:\\Users\\creator\\AppData\\Roaming\\npm\\claude.cmd';
    assert.deepEqual(resolvePartnerProcessLaunch('claude', shim, 'win32', { ComSpec: 'C:\\Windows\\cmd.exe' }), {
        executablePath: 'C:\\Windows\\cmd.exe', args: ['/d', '/s', '/c', shim]
    });
    assert.deepEqual(resolvePartnerProcessLaunch('claude', 'C:\\tools\\claude.exe', 'win32', {}), { args: [] });
    assert.deepEqual(resolvePartnerProcessLaunch('claude', 'C:\\tools\\claude.bat', 'win32', { ComSpec: 'C:\\Windows\\cmd.exe' }), {
        executablePath: 'C:\\Windows\\cmd.exe', args: ['/d', '/s', '/c', 'C:\\tools\\claude.bat']
    });
});
