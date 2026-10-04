import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
function loadSource(relative, overrides = {}) {
  const filename = new URL(`../src/${relative}`, import.meta.url);
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 }
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require, module, exports) { ${output}\n})`, { filename: filename.pathname })(
    id => overrides[id] ?? require(id), module, module.exports);
  return module.exports;
}
const geometry = loadSource('common/companion-panel-geometry.ts');
const { CompanionPanelFrame } = loadSource('browser/companion-panel-frame.ts', {
  '../common/companion-panel-geometry': geometry
});
const storageKey = 'akari.companion.panel.placement';

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    if (tagName === 'iframe') {
      this.messages = [];
      this.contentWindow = { postMessage: (...args) => this.messages.push(args) };
    }
  }
  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = undefined;
  }
  get isConnected() { return Boolean(this.parent); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function fixture() {
  const values = new Map();
  const timers = new Map();
  let now = 0;
  let nextTimerId = 1;
  const doc = {
    body: new Element('body'),
    createElement: tag => new Element(tag),
    activeElement: null
  };
  const listeners = new Map();
  const win = {
    innerWidth: 1200,
    innerHeight: 800,
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key)
    },
    addEventListener(type, listener) {
      const list = listeners.get(type) ?? new Set();
      list.add(listener);
      listeners.set(type, list);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    dispatch(type, event = {}) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener(event);
    },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout(fn, ms) {
      const id = nextTimerId++;
      timers.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimeout(id) { timers.delete(id); }
  };
  function advance(ms) {
    const until = now + ms;
    while (true) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > until) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
    }
    now = until;
  }
  const frame = new CompanionPanelFrame({ doc, win });
  const mount = (width = 620) => frame.mount('/panel', 1234, { width, height: 200 });
  const message = data => win.dispatch('message', { source: frame.iframeEl.contentWindow, data });
  return { frame, win, values, timers, advance, mount, message };
}

function mouse(clientX, buttons = 1) {
  return { button: 0, buttons, clientX, screenX: clientX, screenY: 100,
    preventDefault() {}, stopPropagation() {} };
}

test('(a) Three deltas after start move the frame by 90,30', () => {
  const { frame, mount, message } = fixture();
  mount();
  const { x, y } = frame;
  message({ type: 'akari-companion-panel', drag: { phase: 'start' } });
  for (let i = 0; i < 3; i++) message({ type: 'akari-companion-panel', drag: { dx: 30, dy: 10 } });
  assert.equal(frame.x, x + 90);
  assert.equal(frame.y, y + 30);
  assert.equal(frame.rootEl.children.length, 1);
  frame.unmount();
});

test('(b) Parent mousemove never moves or ends content dragging after button release', () => {
  const { frame, win, mount, message } = fixture();
  mount();
  message({ type: 'akari-companion-panel', drag: { phase: 'start' } });
  const { x, y } = frame;
  win.dispatch('mousemove', mouse(400, 0));
  assert.equal(frame.x, x);
  assert.equal(frame.y, y);
  assert.equal(frame.contentDragging, true);
  message({ type: 'akari-companion-panel', drag: { dx: 30, dy: 10 } });
  assert.equal(frame.x, x + 30);
  frame.unmount();
});

test('(d) End after two seconds and clean timers on delta, blur, and unmount', () => {
  const { frame, win, timers, advance, mount, message } = fixture();
  mount();
  message({ type: 'akari-companion-panel', drag: { phase: 'start' } });
  assert.equal(timers.size, 1);
  advance(1999);
  assert.equal(frame.contentDragging, true);
  advance(1);
  assert.equal(frame.contentDragging, false);
  assert.equal(timers.size, 0);
  message({ type: 'akari-companion-panel', drag: { phase: 'start' } });
  advance(1999);
  message({ type: 'akari-companion-panel', drag: { dx: 10, dy: 0 } });
  advance(1999);
  assert.equal(frame.contentDragging, true);
  advance(1);
  assert.equal(frame.contentDragging, false);
  assert.equal(timers.size, 0);
  message({ type: 'akari-companion-panel', drag: { phase: 'start' } });
  win.dispatch('blur');
  assert.equal(timers.size, 0);
  assert.equal(frame.contentDragging, false);
  message({ type: 'akari-companion-panel', drag: { phase: 'start' } });
  frame.unmount();
  assert.equal(timers.size, 0);
});

test('(e) Use transparent resize edges at left and bottom-left without a triangle', async () => {
  const { frame, mount } = fixture();
  mount();
  assert.equal(frame.panelEl.children.length, 4);
  assert.equal(frame.panelEl.children.some(child => child.textContent === '◢' || child.className === 'akari-companion-panel-resize'), false);
  assert.equal(frame.resizeEdgeEl.className, 'akari-companion-panel-edge-left');
  assert.equal(frame.resizeCornerEl.className, 'akari-companion-panel-edge-corner');
  const style = await readFile(new URL('../src/browser/companion-panel-pulse-style.ts', import.meta.url), 'utf8');
  assert.match(style, /\.akari-companion-panel-edge-left \{[^}]*top: 0;[^}]*bottom: 0;[^}]*width: 6px;[^}]*cursor: ew-resize;/s);
  assert.match(style, /\.akari-companion-panel-edge-corner \{[^}]*bottom: 0;[^}]*width: 10px;[^}]*height: 10px;[^}]*cursor: nesw-resize;/s);
  assert.match(style, /\.akari-companion-panel-edge-left,\s*\.akari-companion-panel-edge-corner \{[^}]*z-index: 2;/s);
  frame.unmount();
});

test('(f) Dragging left keeps right edge fixed, saves and reports width, and caps at 720', () => {
  const { frame, win, values, mount, message } = fixture();
  frame.setAnchorProvider(() => ({ left: 900, right: 940, bottom: 40 }));
  mount();
  const firstIframe = frame.iframeEl;
  assert.deepEqual(firstIframe.messages.at(-1), [{ type: 'akari-companion-frame', width: 620 }, '*']);
  firstIframe.dispatch('load');
  assert.deepEqual(firstIframe.messages.at(-1), [{ type: 'akari-companion-frame', width: 620 }, '*']);
  const grip = frame.resizeEdgeEl;
  assert.equal(grip.attributes.title, 'Resize AKARI Vibe');
  const right = frame.x + frame.size.width;
  grip.dispatch('mousedown', mouse(400));
  win.dispatch('mousemove', mouse(300));
  assert.equal(frame.size.width, 720);
  assert.equal(frame.x + frame.size.width, right);
  assert.deepEqual(firstIframe.messages.at(-1), [{ type: 'akari-companion-frame', width: 720 }, '*']);
  assert.deepEqual(JSON.parse(values.get(storageKey)), { width: 720 });
  win.dispatch('mousemove', mouse(200));
  assert.equal(frame.size.width, 720);
  win.dispatch('mousemove', mouse(1000));
  assert.equal(frame.size.width, 360);
  assert.equal(frame.x + frame.size.width, right);
  assert.deepEqual(JSON.parse(values.get(storageKey)), { width: 360 });
  win.dispatch('mouseup');
  frame.unmount();
  mount();
  assert.equal(frame.size.width, 360);
  assert.equal(frame.panelEl.dataset.placement, 'anchored');
  assert.deepEqual(frame.iframeEl.messages.at(-1), [{ type: 'akari-companion-frame', width: 360 }, '*']);
  message({ type: 'akari-companion-panel', width: 620, height: 480, mode: 'tab' });
  assert.equal(frame.size.width, 360);
  frame.resetPlacement();
  assert.equal(frame.size.width, 620);
  assert.equal(values.has(storageKey), false);
  assert.deepEqual(frame.iframeEl.messages.at(-1), [{ type: 'akari-companion-frame', width: 620 }, '*']);
  frame.unmount();
});

test('(g) Next delta moves by 20 even after a three-second drag pause', () => {
  const { frame, timers, advance, mount, message } = fixture();
  mount();
  const x = frame.x;
  message({ type: 'akari-companion-panel', drag: { phase: 'start' } });
  message({ type: 'akari-companion-panel', drag: { dx: 10, dy: 0 } });
  advance(3000);
  assert.equal(frame.contentDragging, false);
  assert.equal(timers.size, 0);
  message({ type: 'akari-companion-panel', drag: { dx: 10, dy: 0 } });
  assert.equal(frame.x, x + 20);
  assert.equal(frame.contentDragging, true);
  assert.equal(timers.size, 1);
  frame.unmount();
});

test('(h) Deltas before start and after end still move the frame', () => {
  const { frame, timers, mount, message } = fixture();
  mount();
  const { x, y } = frame;
  const delta = { type: 'akari-companion-panel', drag: { dx: 30, dy: 10 } };
  message(delta);
  assert.deepEqual([frame.x, frame.y], [x + 30, y + 10]);
  assert.equal(frame.contentDragging, true);
  message({ type: 'akari-companion-panel', drag: { phase: 'end', dx: 200, dy: 100 } });
  assert.deepEqual([frame.x, frame.y], [x + 30, y + 10]);
  assert.equal(frame.contentDragging, false);
  assert.equal(timers.size, 0);
  message(delta);
  assert.deepEqual([frame.x, frame.y], [x + 60, y + 20]);
  assert.equal(frame.contentDragging, true);
  assert.equal(timers.size, 1);
  frame.unmount();
});

test('Pill uses content width and radius and hides resize edges on pills and small frames', async () => {
  const { frame, win, mount, message } = fixture();
  mount();
  frame.resizeEdgeEl.dispatch('mousedown', mouse(400));
  win.dispatch('mousemove', mouse(1000));
  win.dispatch('mouseup');
  assert.equal(frame.size.width, 360);
  message({ type: 'akari-companion-panel', width: 44, height: 44, mode: 'pill' });
  assert.equal(frame.size.width, 44);
  assert.equal(frame.resizeEdgeEl.style.display, 'none');
  assert.equal(frame.resizeCornerEl.style.display, 'none');
  message({ type: 'akari-companion-panel', width: 620, height: 200, mode: 'tab' });
  assert.equal(frame.size.width, 360);
  assert.equal(frame.resizeEdgeEl.style.display, '');
  assert.equal(frame.resizeCornerEl.style.display, '');
  frame.resetPlacement();
  message({ type: 'akari-companion-panel', width: 100, height: 60, mode: 'tab' });
  assert.equal(frame.resizeEdgeEl.style.display, 'none');
  assert.equal(frame.resizeCornerEl.style.display, 'none');
  assert.equal(frame.cornerEl.style.display, 'none');
  frame.unmount();

  const style = await readFile(new URL('../src/browser/companion-panel-pulse-style.ts', import.meta.url), 'utf8');
  assert.match(style, /\.akari-companion-panel\[data-mode='pill'\] \{\s*border-radius: 22px;/);
});

test('Remembered width does not expand an empty strip beside collapsed circular content', () => {
  const { frame, win, mount, message } = fixture();
  mount();
  frame.resizeEdgeEl.dispatch('mousedown', mouse(400));
  win.dispatch('mousemove', mouse(350));
  win.dispatch('mouseup');
  assert.equal(frame.size.width, 670);
  frame.unmount();
  mount();
  // 中身は畳まれていても mode を tab のまま送る。
  message({ type: 'akari-companion-panel', width: 44, height: 44, mode: 'tab' });
  assert.equal(frame.size.width, 44);
  assert.equal(frame.size.height, 44);
  // 畳まれているあいだに読み込みが終わっても、広げたときの幅は覚えた幅のまま伝える。
  frame.iframeEl.dispatch('load');
  assert.deepEqual(frame.iframeEl.messages.at(-1), [{ type: 'akari-companion-frame', width: 670 }, '*']);
  message({ type: 'akari-companion-panel', width: 670, height: 200, mode: 'tab' });
  assert.equal(frame.size.width, 670);
  frame.unmount();
});

test('Resize surface covers iframe only while pressed', () => {
  const { frame, win, mount } = fixture();
  mount();
  const grip = frame.resizeEdgeEl;
  grip.dispatch('mousedown', mouse(400));
  assert.equal(frame.resizeSurface.className, 'akari-companion-resize-surface');
  assert.match(frame.resizeSurface.attributes.style, /position:fixed; inset:0; pointer-events:auto; cursor:ew-resize/);
  assert.equal(frame.resizeSurface.parent, frame.rootEl);
  win.dispatch('mousemove', mouse(350));
  assert.equal(frame.size.width, 670);
  win.dispatch('mousemove', mouse(300, 0));
  assert.equal(frame.resizeSurface, undefined);
  assert.equal(frame.size.width, 670);

  grip.dispatch('mousedown', mouse(400));
  win.dispatch('mouseup');
  assert.equal(frame.resizeSurface, undefined);
  frame.resizeCornerEl.dispatch('mousedown', mouse(400));
  assert.match(frame.resizeSurface.attributes.style, /cursor:nesw-resize/);
  win.dispatch('mouseup');
  grip.dispatch('mousedown', mouse(400));
  win.dispatch('blur');
  assert.equal(frame.resizeSurface, undefined);
  grip.dispatch('mousedown', mouse(400));
  const surface = frame.resizeSurface;
  frame.unmount();
  assert.equal(frame.resizeSurface, undefined);
  assert.equal(surface.parent, undefined);
});

test('Clamp content height to 720 and screen height', () => {
  const { frame, win, mount, message } = fixture();
  mount();
  message({ type: 'akari-companion-panel', width: 620, height: 1000 });
  assert.equal(frame.size.height, 720);
  win.innerHeight = 500;
  message({ type: 'akari-companion-panel', width: 620, height: 1000 });
  assert.equal(frame.size.height, 500);
  frame.unmount();
});

test('Close button has no square background', async () => {
  const style = await readFile(new URL('../src/browser/companion-panel-pulse-style.ts', import.meta.url), 'utf8');
  const corner = style.match(/\.akari-companion-panel-corner \{([^}]+)\}/)?.[1];
  const hover = style.match(/\.akari-companion-panel-corner:hover \{([^}]+)\}/)?.[1];
  assert.match(corner, /background: transparent;/);
  assert.doesNotMatch(corner, /border-radius:|box-shadow:/);
  assert.doesNotMatch(hover, /background:|box-shadow:/);
  assert.match(hover, /color: var\(--theia-foreground/);
  assert.match(corner, /width: 32px;\s*height: 32px;/);
});
