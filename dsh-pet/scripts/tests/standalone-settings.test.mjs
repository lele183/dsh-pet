import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { rolldown } from 'rolldown';

let browser, server, origin;
const token = 'settings-test-capability';
const initial = {
  main: {
    font: { family: 'yahei', size: 28, followPet: false },
    pets: [
      {
        id: 'main',
        name: 'Magpie',
        size: 340,
        display: 'desktop',
        balanceEnabled: false,
        whisperEnabled: false,
        workStatusEnabled: true,
        fixedEnabled: true,
        position: { corner: 'bottom-right', marginX: 24, marginY: 24 },
      },
    ],
    workStatusTexts: [['Keep custom text']],
  },
};
const ai = {
  protocol: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:3425/v1',
  model: 'group/cheap-first',
  enabled: true,
  hasKey: true,
  automaticWhispers: false,
  whisperIntervalSec: 300,
  maxTokens: 512,
};

before(async () => {
  const bundle = await rolldown({
    input: fileURLToPath(new URL('../../src/standalone/settings-page.ts', import.meta.url)),
    platform: 'node',
  });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const assets = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
  server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const asset = {
      '/standalone-ai/': [assets.settingsPage, 'text/html'],
      '/standalone-ai/settings.js': [assets.settingsScript, 'text/javascript'],
      '/standalone-ai/settings.css': [assets.settingsStyle, 'text/css'],
    }[path];
    if (asset) {
      res.writeHead(200, {
        'content-type': `${asset[1]}; charset=utf-8`,
        'content-security-policy':
          "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      });
      res.end(asset[0]);
      return;
    }
    if (decodeURIComponent(path) === '/dsh-pet-7340/font/上首软糖体.ttf') {
      res.writeHead(200, { 'content-type': 'font/ttf' });
      res.end(await readFile(new URL('../../assets/fonts/上首软糖体.ttf', import.meta.url)));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function open(t, { width = 900, authenticated = true, readError = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const state = { merged: structuredClone(initial), writes: [], aiWrites: [], calls: [], readError, saveError: false };
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.route('**/dsh-pet-7340/config', async (route) => {
    const request = route.request();
    assert.equal(request.headers()['x-dsh-pet-token'], token);
    state.calls.push(request.method());
    if (request.method() === 'PUT') {
      state.writes.push(request.postDataJSON());
      if (state.saveError) return route.fulfill({ status: 500, json: { error: 'write failed' } });
      Object.assign(state.merged.main, request.postDataJSON());
    } else if (state.readError) {
      return route.fulfill({ status: 500, json: { error: 'read failed' } });
    }
    return route.fulfill({ json: state.merged });
  });
  await page.route('**/standalone-ai/settings', async (route) => {
    const request = route.request();
    assert.equal(request.headers()['x-dsh-pet-token'], token);
    if (request.method() === 'POST') state.aiWrites.push(request.postDataJSON());
    return route.fulfill({ json: ai });
  });
  const visit = () => page.goto(`${origin}/standalone-ai/${authenticated ? `#token=${token}` : ''}`);
  await visit();
  if (authenticated) await page.locator('#save:enabled').waitFor();
  return { page, state, visit };
}

test('appearance saves immediately, refreshes pets, preserves AI edits and survives a page reload', async (t) => {
  const { page, state, visit } = await open(t);
  await page.locator('#font-save:enabled').waitFor();
  assert.equal(await page.locator('#fontFamily').inputValue(), 'yahei');
  assert.equal(await page.locator('#fontSize').inputValue(), '28');
  assert.equal(await page.locator('#fontFollowPet').isChecked(), false);
  const size = await page.locator('#font-preview-text').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  assert(size > 20 && size < 22);
  await page.locator('#model').fill('unsaved-model');
  await page.locator('#apiKey').fill('fake-unsaved-key');
  await page.locator('#fontFamily').selectOption('kaiti');
  await page.locator('#fontSize').fill('32');
  state.merged.main.pets.push({ ...state.merged.main.pets[0], id: 'second', name: 'Added elsewhere' });
  await page.getByRole('button', { name: '保存外观', exact: true }).click();
  await page.getByText('外观已保存，桌宠正在应用新设置。', { exact: true }).waitFor();
  assert.deepEqual(state.writes[0], {
    pets: state.merged.main.pets,
    font: { family: 'kaiti', size: 32, followPet: false },
  });
  assert.equal(state.writes[0].pets.length, 2);
  assert.deepEqual(state.merged.main.workStatusTexts, initial.main.workStatusTexts);
  assert.deepEqual(state.aiWrites, []);
  assert.equal(await page.locator('#model').inputValue(), 'unsaved-model');
  assert.equal(await page.locator('#apiKey').inputValue(), 'fake-unsaved-key');
  await visit();
  await page.locator('#font-save:enabled').waitFor();
  assert.equal(await page.locator('#fontFamily').inputValue(), 'kaiti');
  assert.equal(await page.locator('#fontSize').inputValue(), '32');
});

test('failed appearance reads block edits and saving, and Retry loads the saved values', async (t) => {
  const { page, state } = await open(t, { readError: true });
  await page.locator('#font-status[data-error=true]').waitFor();
  assert.equal(await page.locator('#font-save').isDisabled(), true);
  assert.equal(await page.locator('#fontSize').isDisabled(), true);
  assert.deepEqual(state.writes, []);
  state.readError = false;
  await page.getByRole('button', { name: '重试读取外观' }).click();
  await page.locator('#font-save:enabled').waitFor();
  assert.equal(await page.locator('#fontSize').inputValue(), '28');
});

test('failed appearance saves keep edits for retry and leave the AI configuration alone', async (t) => {
  const { page, state } = await open(t);
  await page.locator('#font-save:enabled').waitFor();
  await page.locator('#fontSize').fill('35');
  state.saveError = true;
  await page.getByRole('button', { name: '保存外观', exact: true }).click();
  await page.locator('#font-status[data-error=true]').waitFor();
  assert.equal(await page.locator('#fontSize').inputValue(), '35');
  assert.equal(await page.locator('#font-save').isEnabled(), true);
  state.saveError = false;
  await page.getByRole('button', { name: '保存外观', exact: true }).click();
  await page.getByText('外观已保存，桌宠正在应用新设置。', { exact: true }).waitFor();
  assert.equal(state.merged.main.font.size, 35);
  assert.deepEqual(state.aiWrites, []);
});

test('preview reflects font and scaling changes; invalid sizes cannot be saved', async (t) => {
  const { page, state } = await open(t);
  await page.locator('#font-save:enabled').waitFor();
  const previewSize = () =>
    page.locator('#font-preview-text').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const fixed = await previewSize();
  await page.locator('#fontFollowPet').check();
  assert((await previewSize()) < fixed);
  await page.locator('#fontFamily').selectOption('candy');
  await page.evaluate(() => document.fonts.ready);
  assert(await page.evaluate(() => document.fonts.check('16px "ShangshouSoftCandy"')));
  await page.locator('#fontSize').fill('201');
  await page.getByRole('button', { name: '保存外观', exact: true }).click();
  assert.deepEqual(state.writes, []);
  assert.equal(await page.locator('#fontSize').evaluate((el) => el.validity.rangeOverflow), true);
});

for (const width of [360, 900]) {
  test(`appearance controls fit the settings page at ${width}px`, async (t) => {
    const { page } = await open(t, { width });
    await page.locator('#font-save:enabled').waitFor();
    await page.locator('#fontSize').fill('200');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const clipped = await page
      .locator('#appearance label')
      .evaluateAll((labels) =>
        labels.filter((label) => label.scrollWidth > label.clientWidth).map((label) => label.textContent),
      );
    assert.deepEqual(clipped, []);
  });
}

test('a settings page without a capability never reads or writes configuration', async (t) => {
  const { page, state } = await open(t, { authenticated: false });
  await page.locator('#font-status[data-error=true]').waitFor();
  assert.equal(await page.locator('#font-save').isDisabled(), true);
  assert.equal(await page.locator('#fontSize').isDisabled(), true);
  assert.equal(await page.locator('#save').isDisabled(), true);
  assert.deepEqual(state.calls, []);
  assert.deepEqual(state.aiWrites, []);
});
