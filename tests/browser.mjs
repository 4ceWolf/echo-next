import { chromium } from '/home/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

let html = await readFile('ui/dist/index.html', 'utf8');
html = html.replace('/* ECHO_NEXT_STYLES */', await readFile('ui/next.css', 'utf8')).replace('/* ECHO_NEXT_DEPTH */', await readFile('ui/depth-stage.js', 'utf8')).replaceAll('echo://', 'http://assets.echo.test/');
const background = await readFile('.qa/background.png');
const subject = await readFile('.qa/subject.png');
await mkdir('.qa/screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let subjectFails = false;
  await page.addInitScript(() => {
    localStorage.setItem('echo-next.onboarded', 'true');
    window.commands = [];
    window.ipc = { postMessage: message => window.commands.push(JSON.parse(message)) };
  });
  await page.route('http://echo-next.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.route('http://assets.echo.test/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/lrc')) return route.fulfill({ contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[00:00.00]A little closer to the music\n[00:10.00]A little room to breathe' });
    if (path.startsWith('/subject') && subjectFails) return route.fulfill({ status: 404 });
    return route.fulfill({ contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: path.startsWith('/subject') ? subject : background });
  });
  await page.goto('http://echo-next.test/');
  const state = { playing: false, position_ms: 0, duration_ms: 180000, speed: 1, mono_downmix: false, concert_hall_enabled: false, dsp_speed_available: true, dsp_concert_hall_available: true, last_error: null, current_track: '/demo/first-light.wav', depth_mask_path: '/demo/mask.png', depth_status: 'ready', depth_error: null, queue_len: 1, queue_index: 0, shuffle: false, smart_shuffle: false, repeat: 'Off', library_count: 1, smart_shuffle_bias: 1, crossfade_ms: 0, crossfade_active: false, crossfade_to: null, crossfade_progress: 0, upcoming: [] };
  await page.evaluate(state => {
    window.__echoLibraryUpdate([{ path: state.current_track, title: 'First Light', artist: 'Echo Next', album: 'A little closer', duration_ms: 180000, sample_rate: 44100, bit_depth: 16, has_art: true }]);
    window.__echoStateUpdate(state);
  }, state);
  await page.locator('#heroStage.has-depth').waitFor();
  await page.screenshot({ path: '.qa/screenshots/dashboard.png', fullPage: true });
  await page.locator('.nav-btn[data-page="nowplaying"]').click();
  await page.locator('#npStage.has-depth').waitFor();
  const layerStyles = await page.locator('#npStage').evaluate(stage => ({ background: getComputedStyle(stage.querySelector('[data-layer="bg"]')).transform, foreground: getComputedStyle(stage.querySelector('[data-layer="fg"]')).transform, animation: getComputedStyle(stage.querySelector('[data-layer="fg"]')).animationName, controls: getComputedStyle(stage.querySelector('.np-controls')).zIndex, subject: getComputedStyle(stage.querySelector('[data-layer="fg"]')).zIndex }));
  assert.equal(layerStyles.background, 'none'); assert.equal(layerStyles.foreground, 'none'); assert.equal(layerStyles.animation, 'none');
  assert.ok(Number(layerStyles.controls) > Number(layerStyles.subject));
  assert.ok(await page.locator('.np-meta').evaluate(element => Number(getComputedStyle(element).zIndex) > 6));
  await page.screenshot({ path: '.qa/screenshots/depth.png', fullPage: true });
  await page.locator('#npClose').click();
  await page.locator('.nav-btn[data-page="settings"]').click();
  await page.getByLabel('Enable artwork depth', { exact: true }).uncheck();
  assert.equal(await page.locator('#heroStage.has-depth').count(), 0);
  await page.getByLabel('Enable artwork depth', { exact: true }).check();
  await page.getByLabel('Choose the foreground automatically').uncheck();
  assert.equal(await page.locator('#depthThreshold').isEnabled(), true);
  subjectFails = true;
  await page.locator('#depthThreshold').fill('70');
  await page.locator('#depthThreshold').dispatchEvent('change');
  await page.waitForFunction(() => document.querySelector('#heroStage').dataset.depthState === 'error');
  assert.match(await page.locator('#depthStatus').innerText(), /could not load/);
  assert.equal(await page.locator('#heroStage.has-art').count(), 1);
  subjectFails = false;
  await page.getByRole('button', { name: 'Retry artwork depth', exact: true }).click();
  await page.locator('#heroStage.has-depth').waitFor({ state: 'attached' });
  assert.ok(await page.evaluate(() => window.commands.some(command => command.cmd === 'retry_depth')));
  for (const width of [1100, 760]) {
    await page.setViewportSize({ width, height: 720 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await page.screenshot({ path: '.qa/screenshots/settings.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: actual bundled UI boots; depth readiness, static alignment, controls layering, settings, failure fallback, retry and native-supported widths');
} finally { await browser.close(); }
