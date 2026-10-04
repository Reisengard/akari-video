import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PartnerTurnDetector } from '../lib/common/partner-turn-detector.js';

const OPTS = { maxGapMs: 1000, armAfterMs: 3000, idleFireMs: 2000 };

test('Continuous output for armAfterMs becomes armed', () => {
    const detector = new PartnerTurnDetector(OPTS);
    let now = 0;
    // 100ms 間隔のスピナー的出力
    for (; now <= 2900; now += 100) {
        assert.equal(detector.feed('.', now).armed, false, `not armed yet at ${now}`);
    }
    assert.equal(detector.feed('.', 3000).armed, true);
});

test('Sporadic output, like a key-echo, does not become armed', () => {
    const detector = new PartnerTurnDetector(OPTS);
    // 1.5s 間隔 = maxGapMs(1s) を超える → 毎回 burst リセット
    for (let now = 0; now <= 15000; now += 1500) {
        assert.equal(detector.feed('a', now).armed, false, `sporadic at ${now}`);
    }
});

test('After armed, idleFireMs of silence fires turn end once', () => {
    const detector = new PartnerTurnDetector(OPTS);
    for (let now = 0; now <= 3000; now += 100) {
        detector.feed('.', now);
    }
    assert.equal(detector.isArmed, true);
    assert.equal(detector.checkTurnEnd(3000 + 1999), false, 'too early');
    assert.equal(detector.isArmed, true);
    assert.equal(detector.checkTurnEnd(3000 + 2000), true, 'fires at idleFireMs');
    assert.equal(detector.checkTurnEnd(3000 + 5000), false, 'fires only once');
    assert.equal(detector.isArmed, false);
});

test('Output that continues after turn end can arm and fire turn end again', () => {
    const detector = new PartnerTurnDetector(OPTS);
    for (let now = 0; now <= 3000; now += 100) {
        detector.feed('.', now);
    }
    assert.equal(detector.checkTurnEnd(5000), true);
    // 2 ターン目
    for (let now = 10000; now <= 13000; now += 100) {
        detector.feed('.', now);
    }
    assert.equal(detector.isArmed, true);
    assert.equal(detector.checkTurnEnd(15100), true);
});

test('BEL reports immediately regardless of armed, and clears armed', () => {
    const detector = new PartnerTurnDetector(OPTS);
    assert.deepEqual(detector.feed('\u0007', 0), { bell: true, armed: false });
    for (let now = 100; now <= 3100; now += 100) {
        detector.feed('.', now);
    }
    assert.equal(detector.isArmed, true);
    const result = detector.feed('done\u0007', 3200);
    assert.equal(result.bell, true);
    assert.equal(result.armed, false, 'BEL disarms so idle does not double-fire');
    assert.equal(detector.checkTurnEnd(9999), false);
});

test('nextCheckDelayMs returns the remaining wait, or undefined when not armed', () => {
    const detector = new PartnerTurnDetector(OPTS);
    assert.equal(detector.nextCheckDelayMs(0), undefined);
    for (let now = 0; now <= 3000; now += 100) {
        detector.feed('.', now);
    }
    assert.equal(detector.nextCheckDelayMs(3000), 2000);
    assert.equal(detector.nextCheckDelayMs(4500), 500);
    assert.equal(detector.nextCheckDelayMs(9000), 0);
});

test('A long stretch of continuous output does not fire turn end in the middle', () => {
    const detector = new PartnerTurnDetector(OPTS);
    let fired = 0;
    for (let now = 0; now <= 60000; now += 200) {
        detector.feed('stream', now);
        if (detector.checkTurnEnd(now)) {
            fired += 1;
        }
    }
    assert.equal(fired, 0);
    assert.equal(detector.checkTurnEnd(60000 + 2000), true);
});
