// Синхронизация библиотеки через GitHub Contents API.
// library.json в приватном репозитории = источник правды между устройствами.
// Токен (personal access token) хранится только в localStorage этого браузера.
// Каждое сохранение = коммит, то есть полная история изменений.

const API = 'https://api.github.com';
const FILE = 'library.json';
const CFG_KEY = 'kinolib.sync.v1';

export const DEFAULT_REPO = 'H4rakiri/kinolib-data';

export function loadSyncConfig() {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return { repo: DEFAULT_REPO, token: '' };
    const d = JSON.parse(raw);
    return { repo: d.repo || DEFAULT_REPO, token: d.token || '' };
  } catch {
    return { repo: DEFAULT_REPO, token: '' };
  }
}

export function saveSyncConfig(cfg) {
  localStorage.setItem(CFG_KEY, JSON.stringify({ repo: cfg.repo, token: cfg.token }));
}

export function isConfigured(cfg) {
  return !!(cfg && cfg.repo && cfg.token);
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

// Unicode-безопасный base64 (кодируем кусками, чтобы не переполнить стек).
function encode(str) {
  const bytes = new TextEncoder().encode(str);
  const CHUNK = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function decode(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// GET library.json → { data, sha } либо null, если файла ещё нет.
export async function fetchRemote(cfg) {
  const res = await fetch(`${API}/repos/${cfg.repo}/contents/${FILE}`, {
    headers: headers(cfg.token),
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await describeError(res));
  const json = await res.json();
  return { data: JSON.parse(decode(json.content)), sha: json.sha };
}

// PUT library.json = коммит. При конфликте sha (409) один раз перечитываем и повторяем.
export async function pushRemote(cfg, data, sha) {
  const put = async (useSha) => {
    const body = {
      message: `sync: ${new Date().toISOString()}`,
      content: encode(JSON.stringify(data, null, 2)),
    };
    if (useSha) body.sha = useSha;
    return fetch(`${API}/repos/${cfg.repo}/contents/${FILE}`, {
      method: 'PUT',
      headers: { ...headers(cfg.token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  let res = await put(sha);
  if (res.status === 409) {
    const remote = await fetchRemote(cfg);
    res = await put(remote?.sha);
  }
  if (!res.ok) throw new Error(await describeError(res));
  const json = await res.json();
  return json.content.sha;
}

async function describeError(res) {
  let detail = '';
  try {
    detail = (await res.json()).message || '';
  } catch {
    /* ignore */
  }
  if (res.status === 401) return 'Неверный токен (401)';
  if (res.status === 403) return 'Нет доступа к репозиторию (403)';
  if (res.status === 404) return 'Репозиторий не найден (404)';
  return `GitHub ${res.status}: ${detail}`;
}
