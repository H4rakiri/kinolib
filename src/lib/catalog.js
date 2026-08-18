// Загрузка и выборки по запечённому каталогу (public/data/catalog.json).

let cache = null;

export async function loadCatalog() {
  if (cache) return cache;
  // no-cache: браузер ревалидирует по ETag (304, если каталог не менялся;
  // свежая версия — сразу после еженедельного обновления, без ручного сброса).
  const res = await fetch(`${import.meta.env.BASE_URL}data/catalog.json`, {
    cache: 'no-cache',
  });
  if (!res.ok) throw new Error(`Не удалось загрузить каталог: ${res.status}`);
  cache = await res.json();
  return cache;
}

// Быстрый доступ к элементу по id.
export function indexById(catalog) {
  const map = new Map();
  for (const it of catalog.items) map.set(it.id, it);
  return map;
}

// Нормализация строки для поиска (без регистра, ё→е).
function norm(s) {
  return (s || '').toLowerCase().replace(/ё/g, 'е').trim();
}

// Поиск по русскому и оригинальному названию.
export function searchItems(catalog, query) {
  const q = norm(query);
  if (!q) return [];
  return catalog.items
    .filter(
      (it) => norm(it.title).includes(q) || norm(it.originalTitle).includes(q)
    )
    .sort((a, b) => (b.ratingKp || 0) - (a.ratingKp || 0));
}

// Элементы жанра, отсортированные как «топ по жанру».
export function itemsByGenre(catalog, genre, sortBy = 'ratingKp') {
  return catalog.items
    .filter((it) => it.genres.includes(genre))
    .sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
}

// Элементы именованной коллекции (Топ-250 Кинопоиска и т.п.).
export function itemsByCollection(catalog, collectionId, sortBy = 'ratingKp') {
  return catalog.items
    .filter((it) => it.lists.includes(collectionId))
    .sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
}
