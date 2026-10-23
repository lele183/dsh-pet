export const OWNER = 'Magpie';
export const QUOTA_MENU = '查看 Magpie 额度';
export const CONNECTION_MENU = '查看 Magpie 连接';

export function loopbackUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username || url.password || url.search || url.hash ||
    !['', '/'].includes(url.pathname)
  ) {
    throw new Error('Magpie gateway must be a local HTTP origin.');
  }
  return url.origin;
}

export async function requestJson(url, {
  method = 'GET', body, token, magpie = false, timeoutMs = 3000, signal,
} = {}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetch(url, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { 'x-dsh-pet-token': token } : {}),
      ...(magpie ? { authorization: 'Bearer magpie-dsh-pet' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Local service returned HTTP ${response.status}.`);
  if (response.status === 204) return null;
  const result = await response.json();
  if (result?.ok === false) {
    throw new Error(`Local action failed: ${result.reason ?? 'unknown'}.`);
  }
  return result;
}

export class MagpieClient {
  constructor(gateway, { timeoutMs = 3000, signal } = {}) {
    this.gateway = loopbackUrl(gateway);
    this.timeoutMs = timeoutMs;
    this.signal = signal;
  }

  get(path) {
    return requestJson(`${this.gateway}${path}`, {
      magpie: true, timeoutMs: this.timeoutMs, signal: this.signal,
    });
  }

  async verify() {
    const hello = await this.get('/api/hello');
    if (hello?.name !== 'magpie') throw new Error('The configured service is not Magpie.');
    return hello;
  }

  async models() {
    const result = await this.get('/v1/models');
    if (!Array.isArray(result?.data)) throw new Error('Invalid Magpie model catalog.');
    return result.data;
  }

  async concurrency() {
    const value = await this.get('/v1/magpie/concurrency');
    const count = value?.requests;
    if (
      !Number.isSafeInteger(count) || count < 0 ||
      !Number.isSafeInteger(value.waiting) || value.waiting < 0 ||
      !Number.isSafeInteger(value.tools) || value.tools < 0 ||
      !Array.isArray(value.active) ||
      value.active.some((entry) => !entry || typeof entry !== 'object')
    ) {
      throw new Error('Invalid Magpie concurrency snapshot.');
    }
    return value;
  }

  async quotas() {
    const result = await this.get('/v1/magpie/quotas?kept=1');
    if (!Array.isArray(result?.data)) throw new Error('Invalid Magpie quota snapshot.');
    return result.data;
  }
}

function safeLabel(value, fallback) {
  if (typeof value !== 'string' || !value.trim() || value.includes('@')) return fallback;
  return value.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 70);
}

export function gatewayActivity(snapshot, now = Date.now()) {
  // Pet chat has its own speaking animation; avoid covering its answer with a busy bubble.
  const own = snapshot.active.filter((entry) => entry.agent === 'dsh-pet').length;
  const requests = Math.max(0, snapshot.requests - own);
  const active = snapshot.active.filter((entry) => entry.agent !== 'dsh-pet');
  if (requests === 0) {
    if (snapshot.tools > 0) {
      return { state: 'waiting', task: `Magpie 正在等待 ${snapshot.tools} 个工具结果` };
    }
    return { state: null, task: null };
  }
  const queued = active.filter((entry) => ['slot', 'rpm'].includes(entry.phase)).length;
  const waiting = Math.min(requests, Math.max(queued, snapshot.waiting));
  const elapsed = active.reduce((max, entry) => {
    const started = Date.parse(entry.started);
    const ms = typeof entry.ms === 'number' ? entry.ms : (Number.isFinite(started) ? now - started : 0);
    return Math.max(max, Number.isFinite(ms) ? Math.max(0, ms) : 0);
  }, 0);
  const detail = requests === 1 && active.length === 1
    ? safeLabel(active[0].model, '模型请求')
    : `${requests} 个模型请求`;
  if (waiting === requests) {
    return { state: 'waiting', task: `Magpie 排队中 · ${detail}` };
  }
  return {
    state: 'working',
    task: `Magpie 生成中 · ${detail} · ${Math.floor(elapsed / 1000)} 秒`,
  };
}

function ageLabel(readAt, now) {
  const time = Date.parse(readAt);
  if (!Number.isFinite(time)) return '读取时间未知';
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  if (minutes < 1) return '刚刚读取';
  if (minutes < 60) return `${minutes} 分钟前读取`;
  return `${Math.floor(minutes / 60)} 小时前读取`;
}

export function quotaSummary(quotas, now = Date.now()) {
  if (!Array.isArray(quotas) || quotas.length === 0) {
    return 'Magpie 暂无已缓存额度，请先在 Magpie 的用量页刷新。';
  }
  const rows = quotas
    .filter((quota) => quota && typeof quota === 'object')
    .sort((a, b) => Number(Boolean(b.last)) - Number(Boolean(a.last)));
  if (rows.length === 0) return 'Magpie 的额度缓存格式暂不可用。';
  const lines = rows.slice(0, 5).map((quota) => {
    const provider = safeLabel(quota.provider, '订阅');
    const windows = Array.isArray(quota.windows)
      ? quota.windows.filter((window) => window && Number.isFinite(window.used) && window.used >= 0)
      : [];
    const windowText = windows.length
      ? windows.slice(0, 3).map((window) =>
        `${safeLabel(window.name, '额度')} ${Math.round(window.used)}%`).join(' / ')
      : '暂无额度百分比';
    return `${quota.last ? '当前 ' : ''}${provider}: ${windowText}\n${ageLabel(quota.readAt, now)}`;
  });
  return `Magpie 额度已用（缓存）\n${lines.join('\n')}${rows.length > 5 ? `\n另有 ${rows.length - 5} 项` : ''}`;
}

export class PetClient {
  constructor(runtime, { timeoutMs = 3000, signal } = {}) {
    if (!Number.isInteger(runtime.port) || runtime.port < 1 || runtime.port > 65535) {
      throw new Error('Invalid pet runtime port.');
    }
    if (!/^[A-Za-z0-9_-]{43}$/.test(runtime.token)) throw new Error('Invalid pet runtime capability.');
    this.base = `http://127.0.0.1:${runtime.port}`;
    this.token = runtime.token;
    this.timeoutMs = timeoutMs;
    this.signal = signal;
  }

  call(path, method = 'GET', body, timeoutMs = this.timeoutMs) {
    return requestJson(`${this.base}${path}`, {
      method, body, token: this.token, timeoutMs, signal: this.signal,
    });
  }

  async status(activity) {
    if (activity.state === null) return this.call('/dsh-pet-7340/work-status', 'DELETE');
    return this.call('/dsh-pet-7340/work-status', 'POST', activity);
  }

  registerMenu() {
    return this.call('/dsh-pet-7340/menu/item', 'POST', {
      owner: OWNER, labels: [QUOTA_MENU, CONNECTION_MENU], target: 'desktop',
    });
  }

  async menuEvents() {
    const response = await this.call(
      `/dsh-pet-7340/menu/events?owner=${OWNER}&wait=5000`, 'GET', undefined, 6500,
    );
    if (!response.events || typeof response.events !== 'object' || Array.isArray(response.events)) {
      throw new Error('Invalid pet menu event response.');
    }
    return response.events;
  }

  async say(text, petId = 'main', duration = 12000) {
    const pet = encodeURIComponent(petId);
    const lease = await this.call(`/dsh-pet-7340/lock?pet=${pet}&surface=desktop`, 'POST', {
      ttl: duration + 3000,
    });
    const lock = encodeURIComponent(lease.lockId);
    try {
      await this.call(`/dsh-pet-7340/broadcast?pet=${pet}&surface=desktop&lock=${lock}`, 'POST', {
        text, duration, anim: false,
      });
    } catch (error) {
      await this.call(`/dsh-pet-7340/lock/release?pet=${pet}`, 'POST', {
        lockId: lease.lockId,
      }).catch(() => {});
      throw error;
    }
    const release = setTimeout(() => {
      void this.call(`/dsh-pet-7340/lock/release?pet=${pet}`, 'POST', {
        lockId: lease.lockId,
      }).catch(() => {});
    }, duration);
    release.unref();
  }
}

export class ActivityMonitor {
  constructor(magpie, pet, { warn = () => {}, now = Date.now } = {}) {
    this.magpie = magpie;
    this.pet = pet;
    this.warn = warn;
    this.now = now;
    this.signature = undefined;
    this.lastError = false;
    this.lastActivity = null;
    this.lastPublishAt = 0;
    this.ownsStatus = false;
  }

  async tick() {
    let activity;
    try {
      activity = gatewayActivity(await this.magpie.concurrency(), this.now());
      this.lastError = false;
    } catch {
      if (!this.lastError) this.warn('Magpie status unavailable; reconnecting.');
      this.lastError = true;
      activity = { state: 'error', task: 'Magpie 状态暂不可用，正在重连' };
    }
    // A changing elapsed time should not restart a ten-second animation every second.
    const publish = JSON.stringify({ ...activity, task: activity.task?.replace(/ · \d+ 秒$/, '') });
    if (publish === this.signature && this.now() - this.lastPublishAt < 15000) return;
    if (activity.state === null && !this.ownsStatus) {
      this.signature = publish;
      this.lastActivity = activity;
      return;
    }
    try {
      await this.pet.status(activity);
      this.signature = publish;
      this.lastActivity = activity;
      this.lastPublishAt = this.now();
      this.ownsStatus = activity.state !== null;
    } catch {
      this.warn('Pet status update unavailable; retrying.');
    }
  }
}
