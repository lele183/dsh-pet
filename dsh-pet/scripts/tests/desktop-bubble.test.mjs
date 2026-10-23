import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const helper = new URL('../../runtime/electron-helper/', import.meta.url);
let browser;
let page;

before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 800, height: 800 } });
  const html = await readFile(new URL('index.html', helper), 'utf8');
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  await page.setContent(`<style>${css}</style><div id="root"></div>`);
  await page.addScriptTag({ path: fileURLToPath(new URL('shared-core.js', helper)) });
  await page.addScriptTag({
    content: `
      const S = window.PetShared;
      const BASE = '';
      const toScreen = (value) => value;
      window.__dshPetDebug = {};
      window.petBridge = {
        setInputRegions(input) { window.lastInput = input; },
        setInputBusy(busy) { window.lastBusy = busy; }
      };
    `,
  });
  await page.addScriptTag({ path: fileURLToPath(new URL('sprite.js', helper)) });
});

after(async () => {
  await browser?.close();
});

async function show(text, font = { family: 'yahei', size: 28, followPet: false }) {
  await page.evaluate(
    ({ text, font }) => {
      window.sprite?.inputRegionResize.disconnect();
      document.querySelector('#root').replaceChildren();
      const size = 340;
      const px = S.resolveFontPx(font, size);
      const margin = Math.max(size * 0.5, S.bubbleTopMarginPx(font, size));
      const el = document.createElement('div');
      el.className = 'pet-sprite';
      Object.assign(el.style, {
        left: '170px',
        top: `${margin}px`,
        width: `${size}px`,
        height: `${(size * 9) / 16}px`,
      });
      el.style.setProperty('--pet-size', `${size}px`);
      el.style.setProperty('--dsh-pet-font-bubble', `${px.bubble}px`);
      el.style.setProperty('--dsh-pet-bubble-space', `${margin + size * S.BUBBLE_OVERLAP_RATIO - 8}px`);
      document.documentElement.style.setProperty('--dsh-pet-font-family', S.fontStackOf(font.family));
      const bubble = document.createElement('div');
      bubble.className = 'pet-bubble';
      el.appendChild(bubble);
      document.querySelector('#root').appendChild(el);
      window.sprite = Object.assign(Object.create(PetSprite.prototype), {
        el,
        bubble,
        whisperOn: true,
        whisperView: [{ text }],
        whisperImage: '',
        whisperUrl: '',
        workOn: false,
        workText: '',
        workState: null,
        bubbleOn: false,
        balanceState: null,
        balanceView: null,
        menuOpen: false,
        chatOpen: false,
        dragState: { active: false },
        inputRegionElements: new Set(),
        inputRegionResize: new ResizeObserver(() => {}),
      });
      sprite.renderBubble();
    },
    { text, font },
  );
}

test('large multiline bubbles fit the window, preserve line breaks and accept scrolling', async () => {
  const text = Array.from({ length: 30 }, (_, index) => `Provider ${index + 1}: 5 hours 42% / 7 days 18%`).join('\n');
  await show(text);
  const metrics = await page.evaluate(() => {
    const bubble = sprite.bubble;
    const content = bubble.querySelector('.pet-bub-content');
    const row = bubble.querySelector('.pet-bub-row');
    const rect = bubble.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      font: getComputedStyle(bubble).fontFamily,
      size: parseFloat(getComputedStyle(bubble).fontSize),
      whiteSpace: getComputedStyle(row).whiteSpace,
      scrollable: content.scrollHeight > content.clientHeight,
      regions: window.lastInput.rects.length,
      busy: window.lastBusy,
    };
  });
  assert(metrics.top >= 0, `Bubble was clipped above the window: ${metrics.top}`);
  assert(metrics.bottom < 800);
  assert(metrics.font.includes('Microsoft YaHei'));
  assert(metrics.size >= 20 && metrics.size <= 22);
  assert.equal(metrics.whiteSpace, 'pre-line');
  assert.equal(metrics.scrollable, true);
  assert.equal(metrics.regions, 1);
  assert.equal(metrics.busy, true);
  await page.locator('.pet-bub-content').hover();
  await page.mouse.wheel(0, 10000);
  await page.waitForFunction(() => {
    const el = document.querySelector('.pet-bub-content');
    return el.scrollTop >= el.scrollHeight - el.clientHeight - 2;
  });
});

test('short bubbles stay compact and hiding a long bubble releases its input region', async () => {
  await show('Ready to chat.');
  assert.equal(await page.locator('.is-scrollable').count(), 0);
  assert.equal(await page.evaluate(() => window.lastInput.rects.length), 0);
  assert.equal(await page.evaluate(() => window.lastBusy), false);
  assert(await page.locator('.pet-bubble').evaluate((el) => el.getBoundingClientRect().height < 100));
  await show('Long reply.\n'.repeat(40));
  await page.evaluate(() => {
    sprite.whisperOn = false;
    sprite.renderBubble();
  });
  assert.equal(await page.locator('.is-on, .is-scrollable').count(), 0);
  assert.equal(await page.evaluate(() => window.lastInput.rects.length), 0);
  assert.equal(await page.evaluate(() => window.lastBusy), false);
});
