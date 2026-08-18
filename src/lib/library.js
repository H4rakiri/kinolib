// Личная библиотека пользователя: статусы «хочу / смотрю / посмотрел»
// и произвольные подборки (как плейлисты).
//
// Источник правды — JSON вида:
//   { version, updatedAt, entries: { [id]: entry },
//     collections: [ {id,name,createdAt,itemIds[]} ], items: { [id]: snapshot } }
// items — снапшоты фильмов, добавленных из живого поиска (их нет в запечённом
// каталоге), чтобы библиотека умела показывать даже нишевое кино.
// Синхронизируется в приватный репозиторий GitHub. Экспорт/импорт — тоже.

const KEY = 'kinolib.library.v1';

export function emptyLibrary() {
  return { version: 1, updatedAt: null, entries: {}, collections: [], items: {} };
}

// Приводим любую загруженную структуру к актуальной форме (миграция).
function normalize(data) {
  return {
    version: 1,
    updatedAt: data.updatedAt || null,
    entries: data.entries || {},
    collections: Array.isArray(data.collections) ? data.collections : [],
    items: data.items && typeof data.items === 'object' ? data.items : {},
  };
}

// Запомнить снапшот фильма (для тайтлов не из каталога). Хранит только лёгкие поля.
function withSnapshot(lib, snapshot) {
  if (!snapshot || !snapshot.id) return lib;
  const { _partial, mediaType, ...clean } = snapshot;
  void _partial;
  void mediaType;
  return { ...lib, items: { ...lib.items, [snapshot.id]: clean } };
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

// Заменить библиотеку целиком, сохранив её updatedAt (для применения версии
// из облака — чтобы сравнение «кто новее» осталось корректным).
export function replaceLibrary(lib) {
  const norm = normalize(lib);
  localStorage.setItem(KEY, JSON.stringify(norm));
  return norm;
}

// --- Статусы ------------------------------------------------------------

// Установить статус (или снять, если status === null). Если передан snapshot
// (фильм не из каталога) — запоминаем его данные.
export function setStatus(lib, id, status, snapshot) {
  let next = { ...lib, entries: { ...lib.entries } };
  if (status === null) {
    delete next.entries[id];
  } else {
    const prev = next.entries[id] || {};
    next.entries[id] = {
      ...prev,
      status,
      addedAt: prev.addedAt || new Date().toISOString(),
    };
    if (snapshot) next = withSnapshot(next, snapshot);
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

// Добавить/убрать тайтл из подборки (тумблер). При добавлении фильма не из
// каталога передаём snapshot, чтобы запомнить его данные.
export function toggleInCollection(lib, colId, itemId, snapshot) {
  let adding = false;
  const collections = lib.collections.map((c) => {
    if (c.id !== colId) return c;
    const has = c.itemIds.includes(itemId);
    adding = !has;
    return {
      ...c,
      itemIds: has
        ? c.itemIds.filter((x) => x !== itemId)
        : [...c.itemIds, itemId],
    };
  });
  let next = { ...lib, collections };
  if (adding && snapshot) next = withSnapshot(next, snapshot);
  return saveLibrary(next);
}

// Снапшот тайтла, сохранённый в библиотеке (для фильмов не из каталога).
export function getSnapshot(lib, id) {
  return lib.items?.[id] || null;
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
