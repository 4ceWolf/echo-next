import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function setup() {
  const images = [];
  const timers = new Set();
  class FakeImage {
    constructor() { images.push(this); this.naturalWidth = 512; }
    succeed() { this.onload?.(); }
    fail() { this.onerror?.(); }
  }
  const context = vm.createContext({ Image: FakeImage, setTimeout: callback => { timers.add(callback); return callback; }, clearTimeout: callback => timers.delete(callback) });
  vm.runInContext(readFileSync(new URL('../ui/depth-stage.js', import.meta.url), 'utf8'), context);
  const classes = new Set();
  const background = { style: {} };
  const foreground = { style: {} };
  const stage = { dataset: {}, classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) }, querySelector: selector => selector.includes('"bg"') ? background : foreground };
  const renderer = new context.EchoDepthStage(stage);
  return { images, timers, stage, classes, background, foreground, renderer };
}

test('depth is enabled only after both images load', () => {
  const state = setup();
  state.renderer.update('art', 'subject');
  assert.equal(state.classes.has('has-depth'), false);
  state.images[1].succeed();
  assert.equal(state.classes.has('has-depth'), false);
  state.images[0].succeed();
  assert.equal(state.stage.dataset.depthState, 'ready');
  assert.equal(state.classes.has('has-depth'), true);
  assert.equal(state.timers.size, 0);
});

test('failed subject keeps flat artwork and retry can recover', () => {
  const state = setup();
  state.renderer.update('art', 'subject');
  state.images[0].succeed(); state.images[1].fail();
  assert.equal(state.stage.dataset.depthState, 'error');
  assert.equal(state.classes.has('has-art'), true);
  assert.equal(state.classes.has('has-depth'), false);
  state.renderer.retry();
  state.images[2].succeed();
  assert.equal(state.stage.dataset.depthState, 'ready');
});

test('late previous-track results cannot restore stale artwork', () => {
  const state = setup();
  state.renderer.update('old-art', 'old-subject');
  const oldCallbacks = state.images.map(image => image.onload);
  state.renderer.update('new-art', 'new-subject');
  oldCallbacks.forEach(callback => callback());
  assert.equal(state.classes.has('has-art'), false);
  state.images[2].succeed(); state.images[3].succeed();
  assert.match(state.background.style.backgroundImage, /new-art/);
  assert.match(state.foreground.style.backgroundImage, /new-subject/);
});

test('changing cutoff reloads the subject, not the loaded background', () => {
  const state = setup();
  state.renderer.update('art', 'subject-one');
  state.images.forEach(image => image.succeed());
  state.renderer.update('art', 'subject-two');
  assert.equal(state.images.length, 3);
  assert.equal(state.classes.has('has-art'), true);
  assert.equal(state.classes.has('has-depth'), false);
  state.images[2].succeed();
  assert.equal(state.classes.has('has-depth'), true);
});

test('disabling depth keeps artwork and clearing track clears both layers', () => {
  const state = setup();
  state.renderer.update('art', 'subject'); state.images.forEach(image => image.succeed());
  state.renderer.update('art', '');
  assert.equal(state.stage.dataset.depthState, 'flat');
  assert.equal(state.classes.has('has-art'), true);
  state.renderer.update('', '');
  assert.equal(state.stage.dataset.depthState, 'idle');
  assert.equal(state.background.style.backgroundImage, 'none');
  assert.equal(state.foreground.style.backgroundImage, 'none');
});

test('stalled image loading ends in a recoverable failure', () => {
  const state = setup();
  state.renderer.update('art', 'subject'); state.images[0].succeed();
  [...state.timers].forEach(callback => callback());
  assert.equal(state.stage.dataset.depthState, 'error');
  assert.equal(state.classes.has('has-art'), true);
  assert.equal(state.classes.has('has-depth'), false);
});
