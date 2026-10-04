import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProjects, filterProjectsByChannel, HOME_PROJECT_PAGE_SIZE, listProjectChannels, PROJECT_PAGE_SIZE, readProjectView, saveProjectView, shouldLoadMoreProjects } from '../../lib/common/project-browser.js';

test('Search includes unloaded pages and combines names and channels', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ name: `動画 ${i}`, channel: i % 2 ? '旅行' : '料理', key: `project-${i}` }));
    assert.deepEqual(filterProjects(rows, '旅行 ９９'), [rows[99]]);
    assert.equal(filterProjects(rows, '').length, 100);
    assert.deepEqual(filterProjects(rows, '旅行 98'), []);
});

test('Search supports standalone projects, case folding, and full-width characters', () => {
    const row = { name: 'AKARI Video', key: 'my-project' };
    assert.deepEqual(filterProjects([row], 'ａｋａｒｉ VIDEO'), [row]);
    assert.deepEqual(filterProjects([row], 'my-project'), [row]);
});

test('View choices persist and storage errors do not prevent switching', () => {
    const saved = new Map();
    globalThis.localStorage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
    assert.equal(readProjectView(), 'cards');
    saveProjectView('list');
    assert.equal(readProjectView(), 'list');
    delete globalThis.localStorage;
    assert.equal(readProjectView(), 'cards');
    assert.doesNotThrow(() => saveProjectView('cards'));
});

test('Sorting covers every project, leaves unreadable dates last, and preserves input', async () => {
    const { sortProjects } = await import('../../lib/common/project-browser.js');
    const rows = [{ name: '動画10', key: 'a', updatedAt: 100 }, { name: '動画2', key: 'b', updatedAt: 300 }, { name: 'Unknown', key: 'c' }];
    assert.deepEqual(sortProjects(rows, 'updated-desc').map(row => row.key), ['b', 'a', 'c']);
    assert.deepEqual(sortProjects(rows, 'updated-asc').map(row => row.key), ['a', 'b', 'c']);
    assert.deepEqual(rows.map(row => row.key), ['a', 'b', 'c']);
    assert.deepEqual(sortProjects(rows.slice(0, 2), 'name-asc').map(row => row.key), ['b', 'a']);
});

test('Home and launcher retain separate view and sort preferences', async () => {
    const { readProjectSort, saveProjectSort } = await import('../../lib/common/project-browser.js');
    const saved = new Map();
    globalThis.localStorage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
    try {
        saveProjectView('list');
        saveProjectSort('updated-asc');
        assert.equal(readProjectView('home'), 'cards');
        assert.equal(readProjectSort('home'), 'updated-desc');
        saveProjectView('cards', 'home');
        saveProjectSort('name-desc', 'home');
        assert.equal(readProjectView(), 'list');
        assert.equal(readProjectSort(), 'updated-asc');
        assert.equal(readProjectSort('home'), 'name-desc');
    } finally { delete globalThis.localStorage; }
});

// 2026-09-26 オーナー指摘「チャンネルの切り替えはプロジェクト・ランチャーの中へ」。
test('Channel lists are unique and locale sorted without standalone projects', () => {
    const rows = [
        { channel: 'gadget' }, { channel: 'cooking' }, { channel: 'gadget' }, {}, { channel: undefined }
    ];
    assert.deepEqual(listProjectChannels(rows), ['cooking', 'gadget']);
    assert.deepEqual(listProjectChannels([]), []);
});

test('An unselected channel filter passes all projects through', () => {
    const rows = [{ channel: 'gadget', key: 'a' }, { key: 'b' }, { channel: 'cooking', key: 'c' }];
    assert.deepEqual(filterProjectsByChannel(rows, 'gadget').map(row => row.key), ['a']);
    assert.deepEqual(filterProjectsByChannel(rows).map(row => row.key), ['a', 'b', 'c']);
    assert.deepEqual(filterProjectsByChannel(rows, '見つからない'), []);
});

// 2026-09-26 オーナー指摘「もっと読み込むを押さなくても読めないか」。
test('Pagination runs only near the bottom when more projects remain', () => {
    // 1000px の中身を 600px の窓で見ていて、余白 260px より下端に近い位置。
    assert.equal(shouldLoadMoreProjects(200, 600, 1000, 12, 40), true);
    // 同じ位置でも全件出し切っていれば何もしない。
    assert.equal(shouldLoadMoreProjects(200, 600, 1000, 40, 40), false);
    // まだ上のほう（下端まで 800px）なら足さない。
    assert.equal(shouldLoadMoreProjects(0, 200, 1000, 12, 40), false);
    // スクロールが生まれない（中身が窓に収まる）ときは下端扱いで足す。
    assert.equal(shouldLoadMoreProjects(0, 600, 400, 12, 40), true);
});

test('Home page size provides enough rows without extra clicks', () => {
    assert.ok(HOME_PROJECT_PAGE_SIZE >= 12, 'オーナー指摘の「3、4  itemsしか出ない」を脱している');
    assert.ok(HOME_PROJECT_PAGE_SIZE <= PROJECT_PAGE_SIZE, 'ランチャーの 1 ページを超えない');
});
