// caution は互換メタデータとして残すが、両ピッカーでは表示しない。
// 型・カタログと、別の警告／復帰導線の契約も継続して検査する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const catalogUrl = new URL('../src/common/partner-catalog.json', import.meta.url);
const catalogTypeUrl = new URL('../src/browser/partner-catalog.ts', import.meta.url);
const catalogWidgetUrl = new URL('../src/browser/akari-partner-catalog-widget.tsx', import.meta.url);
const partnerWidgetUrl = new URL('../src/browser/akari-partner-widget.tsx', import.meta.url);
const faqJaUrl = new URL('../../../../../docs/how-to/faq.ja.md', import.meta.url);

// 旧 caution 契約の文面を互換メタデータとして維持する（UI では表示しない）。
const CAUTION_TEXT = 'A conversation ends if the extension host restarts. For long work, use the CLI form.';

const BASE_KEYS = ['id', 'agent', 'name', 'description', 'recommended'];
const EXTENSION_KEYS = ['extensionId', 'viewContainerIds', 'binaryVerification'];
const KNOWN_KEYS = new Set([...BASE_KEYS, ...EXTENSION_KEYS, 'form', 'caution']);

const readCatalog = async () => JSON.parse(await readFile(catalogUrl, 'utf8'));

test('Every partner catalog entry matches the PartnerCatalogEntry shape', async () => {
    const catalog = await readCatalog();
    assert.ok(catalog.length > 0);

    for (const entry of catalog) {
        const where = `entry ${entry.id}`;
        for (const key of BASE_KEYS) {
            assert.ok(Object.hasOwn(entry, key), `${where}: missing ${key}`);
        }
        assert.equal(typeof entry.id, 'string', where);
        assert.equal(typeof entry.agent, 'string', where);
        assert.equal(typeof entry.name, 'string', where);
        assert.equal(typeof entry.description, 'string', where);
        assert.equal(typeof entry.recommended, 'boolean', where);
        assert.ok(['cli', 'extension'].includes(entry.form), `${where}: form is not cli or extension`);

        if (entry.form === 'extension') {
            assert.equal(typeof entry.extensionId, 'string', where);
            assert.ok(Array.isArray(entry.viewContainerIds), where);
            assert.equal(typeof entry.binaryVerification, 'object', where);
        } else {
            for (const key of EXTENSION_KEYS) {
                assert.ok(!Object.hasOwn(entry, key), `${where}: cli has ${key}`);
            }
        }

        // caution は任意。あるときは string
        if (Object.hasOwn(entry, 'caution')) {
            assert.equal(typeof entry.caution, 'string', where);
        }

        for (const key of Object.keys(entry)) {
            assert.ok(KNOWN_KEYS.has(key), `${where}: unknown field ${key}`);
        }
    }
});

test('Only the two extension entries carry the compatibility caution', async () => {
    const catalog = await readCatalog();
    const extensions = catalog.filter(entry => entry.form === 'extension');

    assert.deepEqual(extensions.map(entry => entry.id), [
        'anthropic/claude-code-extension',
        'openai/codex-extension'
    ]);
    for (const entry of extensions) {
        assert.equal(entry.caution, CAUTION_TEXT, `${entry.id} compatibility caution changed`);
    }
    assert.deepEqual(
        catalog.filter(entry => entry.caution !== undefined).map(entry => entry.id),
        extensions.map(entry => entry.id)
    );
});

test('Entries without caution (10 CLI entries) have no caution source data', async () => {
    const catalog = await readCatalog();
    const cli = catalog.filter(entry => entry.form === 'cli');

    assert.equal(cli.length, 10);
    for (const entry of cli) {
        assert.equal(entry.caution, undefined, `${entry.id} has caution`);
    }
});

test('The PartnerCatalogEntry type declares caution as an optional field', async () => {
    const source = await readFile(catalogTypeUrl, 'utf8');
    assert.match(source, /caution\?: string;/);
});

test('Neither picker renders caution in the body or the title', async () => {
    for (const url of [catalogWidgetUrl, partnerWidgetUrl]) {
        const source = await readFile(url, 'utf8');
        assert.doesNotMatch(source, /entry\.caution|data-partner-caution|cautionStyle|styles\.caution/);
    }
});

test('The Japanese FAQ keeps its disconnect and resume explanation', async () => {
    const faq = await readFile(faqJaUrl, 'utf8');

    assert.match(faq, /\*\*Q\. チャットが途中で切れます\*\*/);
    const disconnect = String.fromCharCode(
        0x62e1, 0x5f35, 0x30db, 0x30b9, 0x30c8, 0x304c, 0x518d, 0x8d77, 0x52d5, 0x3059, 0x308b, 0x3068, 0x4f1a, 0x8a71, 0x304c, 0x5207, 0x308c, 0x307e, 0x3059
    );
    assert.ok(faq.includes(disconnect), 'The FAQ lost its disconnect explanation');
    assert.ok(faq.includes('`akari --continue`'), 'The FAQ has no akari --continue guidance');
    assert.ok(faq.includes('`/akari`'), 'The FAQ has no /akari guidance');
});

test('The partner pane resume hint keeps this wording and a link to resume-session', async () => {
    const source = await readFile(partnerWidgetUrl, 'utf8');

    assert.ok(
        source.includes('If the session drops, type /akari in the partner pane to continue from where you are. From the terminal, use akari --continue.'),
        'The resume wording does not match this change'
    );
    assert.ok(source.includes('docs/how-to/resume-session.ja.md'), 'The resume steps do not link to resume-session');
});
