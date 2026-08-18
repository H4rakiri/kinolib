// Личная библиотека пользователя: статусы «хочу / смотрю / посмотрел»
// и произвольные подборки (как плейлисты).
//
// Источник правды — JSON вида:
//   { version, updatedAt, entries: { [id]: entry }, collections: [ {id,name,createdAt,itemIds[]} ] }
// Сейчас хранится в localStorage; позже этот же JSON будет синхронизироваться
// в приватный репозиторий на GitHub (Contents API, токен в localStorage) —
// как сделано в ARISE. Экспорт/импорт даёт перенос между устройствами уже сейчас.

const KEY = 'kinolib.library.v1';

export function emptyLibrary() {
  return { version: 1, updatedAt: null, entries: {}, collections: [] };
}

// Приводим любую загруженную структуру к актуальной форме (миграция).
function normalize(data) {
  return {
    version: 1,
    updatedAt: data.updatedAt || null,
    entries: data.entries || {},
    collections: Array.isArray(data.collections) ? data.collections : [],
  };
}

export function loadLibrary() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyLibrary();
    const data = JSON.parse(raw);
    if (!data.entries) return emptyLibrary();
    return normalize(data);
  } catch {
    return emptyLibrary();
  }
}

export function saveLibrary(lib) {
  lib.updatedAt = new Date().toISOString();
  localStorage.setItem(KEY, JSON.stringify(lib));
  return lib;
}

// --- Статусы ------------------------------------------------------------

// Установить статус (или снять, если status === null).
export function setStatus(lib, id, status) {
  const next = { ...lib, entries: { ...lib.entries } };
  if (status === null) {
    delete next.entries[id];
  } else {
    const prev = next.entries[id] || {};
    next.entries[id] = {
      ...prev,
      status,
      addedAt: prev.addedAt || new Date().toISOString(),
    };
  }
  return saveLibrary(next);
}

export function getStatus(lib, id) {
  return lib.entries[id]?.status || null;
}

export function entriesByStatus(lib, status) {
  return Object.entries(lib.entries)
    .filter(([, e]) => e.status === status)
    .map(([id, e]) => ({ id, ...e }));
}

export function counts(lib) {
  const c = { want: 0, watching: 0, watched: 0 };
  for (const e of Object.values(lib.entries)) {
    if (c[e.status] !== undefined) c[e.status] += 1;
  }
  return c;
}

// --- Подборки (плейлисты) ----------------------------------------------

const uid = () =>
  (crypto.randomUUID?.() || `c${Date.now()}${Math.random().toString(16).slice(2)}`);

export function createCollection(lib, name) {
  const col = {
    id: uid(),
    name: name.trim() || 'Без названия',
    createdAt: new Date().toISOString(),
    itemIds: [],
  };
  return { lib: saveLibrary({ ...lib, collections: [...lib.collections, col] }), col };
}

export function renameCollection(lib, colId, name) {
  const collections = lib.collections.map((c) =>
    c.id === colId ? { ...c, name: name.trim() || c.name } : c
  );
  return saveLibrary({ ...lib, collections });
}

export function deleteCollection(lib, colId) {
  return saveLibrary({
    ...lib,
    collections: lib.collections.filter((c) => c.id !== colId),
  });
}

export function getCollection(lib, colId) {
  return lib.collections.find((c) => c.id === colId) || null;
}

export function inCollection(lib, colId, itemId) {
  const col = getCollection(lib, colId);
  return !!col && col.itemIds.includes(itemId);
}

// Добавить/убрать тайтл из подборки (тумблер).
export function toggleInCollection(lib, colId, itemId) {
  const collections = lib.collections.map((c) => {
    if (c.id !== colId) return c;
    const has = c.itemIds.includes(itemId);
    return {
      ...c,
      itemIds: has
        ? c.itemIds.filter((x) => x !== itemId)
        : [...c.itemIds, itemId],
    };
  });
  return saveLibrary({ ...lib, collections });
}

// --- Экспорт / импорт ---------------------------------------------------

export function exportLibrary(lib) {
  const blob = new Blob([JSON.stringify(lib, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kinolib-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importLibrary(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !data.entries) {
    throw new Error('Неверный формат файла библиотеки');
  }
  return saveLibrary(normalize(data));
}
