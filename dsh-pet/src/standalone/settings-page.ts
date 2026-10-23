import {
  BUBBLE_FONT_BASE_PX,
  DEFAULT_FONT,
  FONT_PRESETS,
  FONT_REF_SIZE,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
} from '../shared/fonts';

const fontLabels = {
  candy: '软糖体（内置）',
  yahei: '微软雅黑 / 苹方',
  youyuan: '幼圆',
  kaiti: '楷体',
  simsun: '宋体',
  comic: 'Comic Sans',
  system: '系统默认',
};

/** Local-only settings shell; external same-origin assets keep CSP free of unsafe-inline. */
export const settingsPage = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>桌宠 AI 设置</title><link rel="stylesheet" href="/standalone-ai/settings.css">
<script src="/standalone-ai/settings.js" defer></script></head><body>
<main><header><span class="fish" aria-hidden="true">🐾</span><p class="local">独立桌宠 / 本机设置</p>
<h1>桌宠 AI 设置</h1><p class="intro">调整桌宠字体，配置模型连接与碎碎念。<br>所有设置仅保存在本机。</p></header>
<form id="appearance" aria-describedby="font-note">
<fieldset id="font-controls" disabled><legend>外观与字体</legend>
<div class="pair"><div><label for="fontFamily">字体</label><select id="fontFamily" name="fontFamily">${FONT_PRESETS.map(
  ({ id }) => `<option value="${id}">${fontLabels[id]}</option>`,
).join('')}</select></div>
<div><label for="fontSize">基础字号（px）</label><input id="fontSize" name="fontSize" type="number" min="${FONT_SIZE_MIN}" max="${FONT_SIZE_MAX}" step="any" required aria-describedby="font-note"></div></div>
<label class="check enabled"><input id="fontFollowPet" type="checkbox">字号随宠物大小缩放</label>
<p class="hint" id="font-note">调整气泡与悬浮提示的字体和字号。关闭缩放后，字号保持固定。保存后立即应用。</p>
<div class="font-preview"><p class="hint">气泡预览</p><p id="font-preview-text">你好呀，今天也一起加油。Hello, Magpie!</p></div>
<p class="hint" id="font-preview-note" aria-live="polite"></p>
</fieldset>
<footer><p>外观可单独保存。<br>系统未安装的字体会使用备用字体。</p><button id="font-save" type="submit" disabled>保存外观</button></footer>
<p id="font-status" role="status" aria-live="polite">正在读取桌宠外观…</p>
<button id="font-retry" type="button" hidden>重试读取外观</button>
</form>
<form id="settings" aria-describedby="privacy">
<fieldset><legend>模型连接</legend>
<label for="protocol">接口协议</label><select id="protocol" name="protocol"><option value="openai-compatible">OpenAI 兼容</option><option value="anthropic">Anthropic</option></select>
<label for="baseUrl">接口地址（Base URL）</label><input id="baseUrl" name="baseUrl" type="url" placeholder="https://example.com/v1" maxlength="2048" spellcheck="false" aria-describedby="endpoint-note"><p class="hint" id="endpoint-note">填写服务商提供的基础接口地址（支持 HTTP 与 HTTPS，通常以 /v1 结尾）。不要把密钥放进地址。</p>
<label for="model">模型名称</label><input id="model" name="model" type="text" maxlength="200" placeholder="填写服务商的模型 ID，例如 deepseek-chat" spellcheck="false">
<div class="key-heading"><label for="apiKey">API 密钥</label><span id="key-state" class="hint">尚未读取</span></div>
<input id="apiKey" name="apiKey" type="password" autocomplete="new-password" maxlength="8192" placeholder="留空保留已保存的密钥" aria-describedby="key-note">
<p id="key-note" class="hint">密钥只写入本机配置，不会回显。留空不会删除旧密钥。</p>
<label class="check clear"><input id="clearApiKey" type="checkbox">清除已保存的密钥，并关闭 AI</label>
<label class="check enabled"><input id="enabled" type="checkbox">启用 AI 对话</label>
<div class="test-row"><button id="test-btn" type="button">测试连接</button><span id="test-result" class="test-result" role="status" aria-live="polite"></span></div>
</fieldset>
<fieldset><legend>定时自动碎碎念</legend>
<label class="check"><input id="automaticWhispers" type="checkbox" aria-describedby="cost">开启自动碎碎念</label>
<p id="cost" class="notice">开启后，桌宠会按设定间隔定时调用模型并在桌面上说话冒泡（产生 API 费用）。默认关闭；右键菜单中的手动对话与手动碎碎念不受此开关限制。</p>
<div class="pair"><div><label for="whisperIntervalSec">碎碎念间隔（秒）</label><input id="whisperIntervalSec" type="number" min="60" max="86400" step="1" value="300" required></div>
<div><label for="maxTokens">单次输出上限（tokens）</label><input id="maxTokens" type="number" min="128" max="4096" step="1" value="1024" required></div></div>
<p class="hint">间隔至少 60 秒，默认 300 秒。输出上限越小，单次回复越简短。</p>
</fieldset>
<footer><p id="privacy">所有配置与密钥仅保存在当前机器。<br>关闭 AI 后，桌宠仍可正常显示、移动与互动。</p><button id="save" type="submit" disabled>保存到本机</button></footer>
<p id="status" role="status" aria-live="polite">正在读取本机设置…</p>
</form><noscript>需要启用 JavaScript 才能保存设置。请从桌宠菜单打开本页。</noscript></main></body></html>`;

export const settingsStyle = `
:root{color-scheme:light;--ink:#203b4b;--muted:#526a78;--blue:#12618b;--line:#cbdce5;--paper:#fff;--water:#edf5fa}
@font-face{font-family:"ShangshouSoftCandy";src:url("/dsh-pet-7340/font/上首软糖体.ttf") format("truetype");font-display:swap;font-weight:400}
*{box-sizing:border-box}body{margin:0;background:var(--water);color:var(--ink);font:16px/1.6 "Microsoft YaHei UI","PingFang SC",sans-serif}
main{max-width:720px;margin:48px auto;padding:0 24px 32px}header{padding:0 12px 28px}.fish{display:block;font:700 29px/1.3 Georgia,serif;color:var(--blue);letter-spacing:2px;margin-bottom:24px}.local{font-size:13px;color:var(--muted);margin:0 0 10px}h1{font-size:32px;line-height:1.3;letter-spacing:-1px;margin:0 0 16px;font-weight:700}.intro{margin:0;color:var(--muted)}
form{background:var(--paper);border:1px solid var(--line);border-radius:16px 16px 6px 6px;padding:28px 32px 20px}fieldset{padding:0 0 28px;margin:0 0 24px;border:0;border-bottom:1px solid var(--line);min-width:0}legend{font-size:19px;font-weight:700;margin-bottom:18px;padding:0}label{display:block;font-weight:600;font-size:14px;margin:14px 0 6px}input:not([type=checkbox]),select{display:block;width:100%;min-height:44px;border:1px solid #a5bdcb;border-radius:6px;background:#fff;color:var(--ink);padding:9px 12px;font:inherit;font-size:15px}input::placeholder{color:#6a7e8b}input[type=checkbox]{accent-color:var(--blue);width:18px;height:18px;flex-shrink:0;margin:0}.check{display:flex;align-items:center;gap:10px;min-height:32px;cursor:pointer}.enabled{margin-top:24px}.clear{font-weight:400;color:var(--muted);font-size:13px}.hint{font-size:12px;line-height:1.6;color:var(--muted);margin:7px 0 0}.key-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px}.key-heading label{margin:0 0 6px}.key-heading .hint{margin:0 0 6px}.notice{font-size:13px;color:#704b13;background:#fff7e7;border-left:3px solid #c18e36;margin:12px 0 16px;padding:12px 14px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}footer{display:flex;align-items:center;justify-content:space-between;gap:18px}footer p{font-size:12px;color:var(--muted);margin:0}button{border:0;border-radius:7px;min-height:44px;padding:10px 20px;background:var(--blue);color:#fff;font:600 15px/1.5 inherit;white-space:nowrap;cursor:pointer}button:hover{background:#0b4e73}button:disabled{opacity:.55;cursor:wait}:focus-visible{outline:3px solid #3a94c4;outline-offset:3px}#status{font-size:13px;min-height:24px;margin:18px 0 0;color:var(--blue)}#status[data-error=true]{color:#a13b30}
.test-row{display:flex;align-items:center;gap:14px;margin:20px 0 6px;flex-wrap:wrap}#test-btn{background:#fff;color:var(--blue);border:1.5px solid var(--blue);min-height:38px;padding:6px 18px;font-size:14px;border-radius:6px;cursor:pointer;font-weight:600}#test-btn:hover{background:#edf5fa}#test-btn:disabled{opacity:.6;cursor:wait}.test-result{font-size:13px;line-height:1.5;min-height:22px;flex:1 1 200px}.test-success{color:#1a7f37;font-weight:600}.test-error{color:#cf222e}.reply-preview{display:block;color:var(--muted);font-weight:normal;font-size:12px;margin-top:4px;word-break:break-all}
#appearance{margin-bottom:24px}.font-preview{margin-top:18px;padding:14px 18px;background:var(--water);border:1px solid var(--line);border-radius:8px;max-height:240px;overflow:auto}#font-preview-text{margin:8px 0 0;overflow-wrap:anywhere}#font-preview-note{min-height:20px}#font-status{font-size:13px;min-height:24px;margin:18px 0 0;color:var(--blue)}#font-status[data-error=true]{color:#a13b30}#font-retry{margin-top:10px}
@media(max-width:560px){main{margin:24px auto;padding:0 14px 24px}header{padding:0 8px 24px}h1{font-size:28px}form{padding:24px 20px 16px}.pair{grid-template-columns:1fr;gap:0}footer{align-items:stretch;flex-direction:column}button{width:100%}.fish{margin-bottom:18px}}
`;

export const settingsScript = `
'use strict';
(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  history.replaceState(null, '', location.pathname);
  const get = id => document.getElementById(id);
  const form = get('settings');
  const status = get('status');
  const save = get('save');
  const testBtn = get('test-btn');
  const testResult = get('test-result');
  const appearance = get('appearance');
  const fontSave = get('font-save');
  const fontControls = get('font-controls');
  const fontRetry = get('font-retry');
  const fontPresets = ${JSON.stringify(FONT_PRESETS)};
  const configPath = '/dsh-pet-7340/config';
  let petSize = ${FONT_REF_SIZE};
  function message(text, error = false) { status.textContent = text; status.dataset.error = String(error); }
  function fontMessage(text, error = false) {
    get('font-status').textContent = text;
    get('font-status').dataset.error = String(error);
  }
  async function request(method, body, path = '/standalone-ai/settings') {
    const response = await fetch(path, {
      method, credentials: 'omit', cache: 'no-store', redirect: 'error',
      headers: { 'X-DSH-Pet-Token': token, ...(body ? {'Content-Type': 'application/json'} : {}) },
      ...(body ? {body: JSON.stringify(body)} : {})
    });
    if (!response.ok) {
      if (response.status === 403) throw new Error('打开凭据已失效。请从桌宠菜单重新打开设置。');
      if (response.status === 429) throw new Error('保存过于频繁，请稍等一分钟再试。');
      if (path === configPath) {
        if (response.status === 409) throw new Error('本机外观配置无法解析，请检查配置文件后重试。');
        if (method === 'GET') throw new Error('桌宠外观读取失败，请检查本机服务后重试。');
        throw new Error('外观未保存。请检查字体、字号和本机服务，再重试。');
      }
      throw new Error('设置未保存。请检查接口地址、模型名称与密钥，再重试。');
    }
    return response.json();
  }
  function appearanceConfig(data) {
    const main = data && data.main;
    const font = main && main.font;
    if (!main || !Array.isArray(main.pets) || !main.pets.length || !font ||
        !fontPresets.some(preset => preset.id === font.family) ||
        !Number.isFinite(font.size) || font.size < ${FONT_SIZE_MIN} || font.size > ${FONT_SIZE_MAX} ||
        typeof font.followPet !== 'boolean') {
      throw new Error('桌宠外观读取失败，请重试。');
    }
    return main;
  }
  function previewFont() {
    const preset = fontPresets.find(preset => preset.id === get('fontFamily').value);
    const size = Number(get('fontSize').value);
    if (!preset || !Number.isFinite(size) || size < ${FONT_SIZE_MIN} || size > ${FONT_SIZE_MAX}) {
      get('font-preview-note').textContent = '字号请输入 ${FONT_SIZE_MIN}–${FONT_SIZE_MAX} 之间的数字。';
      return;
    }
    const scale = get('fontFollowPet').checked ? petSize / ${FONT_REF_SIZE} : 1;
    const bubblePx = size * ${BUBBLE_FONT_BASE_PX / DEFAULT_FONT.size} * scale * 0.7473;
    get('font-preview-text').style.fontFamily = preset.stack;
    get('font-preview-text').style.fontSize = bubblePx + 'px';
    get('font-preview-note').textContent = '基础字号 ' + size + 'px，当前宠物的气泡正文约 ' +
      Math.round(bubblePx * 10) / 10 + 'px。';
  }
  function populateAppearance(data) {
    const main = appearanceConfig(data);
    const pet = main.pets.find(pet => pet.display === 'desktop' || pet.display === 'both') || main.pets[0];
    petSize = Number(pet.size) > 0 ? Number(pet.size) : ${FONT_REF_SIZE};
    get('fontFamily').value = main.font.family;
    get('fontSize').value = String(main.font.size);
    get('fontFollowPet').checked = main.font.followPet;
    previewFont();
  }
  async function loadAppearance() {
    fontControls.disabled = true;
    fontSave.disabled = true;
    fontRetry.hidden = true;
    fontMessage('正在读取桌宠外观…');
    try {
      populateAppearance(await request('GET', undefined, configPath));
      fontControls.disabled = false;
      fontSave.disabled = false;
      fontMessage('修改后可在这里预览，保存后应用到桌宠。');
    } catch (error) {
      fontMessage(error.message, true);
      fontRetry.hidden = false;
    }
  }
  for (const id of ['fontFamily', 'fontSize', 'fontFollowPet']) {
    get(id).addEventListener('input', previewFont);
    get(id).addEventListener('change', previewFont);
  }
  fontRetry.addEventListener('click', loadAppearance);
  appearance.addEventListener('submit', async event => {
    event.preventDefault();
    if (!appearance.reportValidity()) return;
    const font = {
      family: get('fontFamily').value, size: Number(get('fontSize').value), followPet: get('fontFollowPet').checked
    };
    fontSave.disabled = true;
    fontControls.disabled = true;
    fontMessage('正在保存外观…');
    try {
      // Refresh the pet list before saving so another page's pet changes are preserved.
      const current = appearanceConfig(await request('GET', undefined, configPath));
      populateAppearance(await request('PUT', {pets: current.pets, font}, configPath));
      fontMessage('外观已保存，桌宠正在应用新设置。');
    } catch (error) { fontMessage(error.message, true); }
    finally { fontSave.disabled = false; fontControls.disabled = false; }
  });
  function populate(data) {
    for (const id of ['protocol','baseUrl','model','whisperIntervalSec','maxTokens']) {
      if (data[id] !== undefined) get(id).value = String(data[id]);
    }
    for (const id of ['enabled','automaticWhispers']) get(id).checked = data[id] === true;
    get('key-state').textContent = data.hasKey ? '已保存 · 不回显' : '尚未设置';
    get('apiKey').value = '';
    get('clearApiKey').checked = false;
  }
  get('clearApiKey').addEventListener('change', () => {
    get('apiKey').disabled = get('clearApiKey').checked;
    if (get('clearApiKey').checked) {
      get('apiKey').value = '';
      get('enabled').checked = false;
      get('automaticWhispers').checked = false;
    }
  });
  if (testBtn && testResult) {
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testResult.className = 'test-result';
      testResult.textContent = '正在测试连接，请稍候…';
      const input = {
        protocol: get('protocol').value,
        baseUrl: get('baseUrl').value.trim(),
        model: get('model').value.trim(),
        apiKey: get('apiKey').value.trim(),
      };
      try {
        const response = await fetch('/standalone-ai/test', {
          method: 'POST',
          credentials: 'omit',
          cache: 'no-store',
          headers: {
            'X-DSH-Pet-Token': token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(input),
        });
        const data = await response.json();
        if (data.ok) {
          testResult.className = 'test-result test-success';
          testResult.textContent = '✓ ' + data.message;
          if (data.reply) {
            const preview = document.createElement('span');
            preview.className = 'reply-preview';
            preview.textContent = '回复: ' + data.reply;
            testResult.appendChild(preview);
          }
        } else {
          testResult.className = 'test-result test-error';
          testResult.textContent = '✗ ' + (data.message || data.error || '测试失败');
        }
      } catch (error) {
        testResult.className = 'test-result test-error';
        testResult.textContent = '✗ 请求异常：' + (error && error.message ? error.message : String(error));
      } finally {
        testBtn.disabled = false;
      }
    });
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    save.disabled = true;
    message('正在保存到本机…');
    const input = {
      protocol: get('protocol').value, baseUrl: get('baseUrl').value.trim(), model: get('model').value.trim(),
      apiKey: get('apiKey').value, clearApiKey: get('clearApiKey').checked,
      enabled: get('enabled').checked, automaticWhispers: get('automaticWhispers').checked,
      whisperIntervalSec: Number(get('whisperIntervalSec').value), maxTokens: Number(get('maxTokens').value)
    };
    get('apiKey').value = '';
    try {
      populate(await request('POST', input));
      get('apiKey').disabled = false;
      message('已保存到本机。');
    } catch (error) { message(error.message, true); }
    finally { save.disabled = false; }
  });
  if (!token) {
    const text = '请从桌宠菜单或本机启动器打开设置，以获得本次运行的访问凭据。';
    message(text, true); fontMessage(text, true); return;
  }
  void loadAppearance();
  request('GET').then(data => { populate(data); save.disabled = false; message('设置只在本机保存。'); })
    .catch(error => message(error.message, true));
})();
`;
