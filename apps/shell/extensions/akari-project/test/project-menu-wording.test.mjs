import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const noopDecorator = () => () => undefined;
const fileNew = ['file', 'new'];
const modules = {
    '@theia/core/shared/inversify': { inject: noopDecorator, injectable: noopDecorator },
    '@theia/core/lib/browser': { CommonMenus: { FILE_NEW: fileNew, FILE: ['file'] } },
    './akari-reveal-commands': { AKARI_REVEAL_PROJECT_ROOT: { id: 'akari.project.revealRoot', label: 'Open project folder' } }
};
const exports = {};
vm.runInNewContext(readFileSync(new URL('../lib/browser/akari-project-contribution.js', import.meta.url), 'utf8'), {
    require: id => modules[id] ?? {}, exports, module: { exports }, console
});

test('File menu and command palette share the English folder-project command', async () => {
    const { AkariProjectContribution, NEW_AKARI_PROJECT } = exports;
    const menus = [];
    AkariProjectContribution.prototype.registerMenus.call({}, {
        registerMenuAction(path, action) { menus.push({ path, action }); }
    });
    const item = menus.find(({ action }) => action.commandId === 'akari.project.new');
    assert.equal(item.path, fileNew);
    assert.equal(item.action.label, 'New project in a folder...');
    assert.equal(item.action.label, NEW_AKARI_PROJECT.label);

    const commands = [];
    let created = 0;
    AkariProjectContribution.prototype.registerCommands.call({
        createProject: () => { created += 1; }
    }, {
        registerCommand(command, handler) { commands.push({ command, handler }); }
    });
    const command = commands.find(({ command }) => command.id === item.action.commandId);
    assert.equal(command.command.label, item.action.label);
    await command.handler.execute();
    assert.equal(created, 1);
});
