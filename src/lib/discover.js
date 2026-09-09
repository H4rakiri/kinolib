// «Свалка» рекомендаций и стопка «Тиндера» — без всякой алгоритмики,
// просто случайная выборка из каталога с минимальным рейтингом.

const MIN_RATING = 5;

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const rating = (it) => it.ratingImdb || it.ratingTmdb || 0;

// Случайный список одного типа (фильмы/сериалы/аниме). В основном из каталога,
// плюс немного из библиотеки (хочу/просмотрел) — «но не много».
export function recommendList(catalog, library, type, resolve, n = 100) {
  const catPool = catalog.items.filter(
    (it) => it.type === type && rating(it) >= MIN_RATING
  );

  // Немного тайтлов из библиотеки этого типа (не больше ~15% списка).
  const libItems = Object.keys(library.entries)
    .filter((id) => ['want', 'watched'].includes(library.entries[id].status))
    .map((id) => resolve(id))
    .filter((it) => it && it.type === type && rating(it) >= MIN_RATING);
  const libPick = shuffle(libItems).slice(0, Math.round(n * 0.15));
  const libIds = new Set(libPick.map((it) => it.id));

  const rest = shuffle(catPool.filter((it) => !libIds.has(it.id))).slice(
    0,
    Math.max(0, n - libPick.length)
  );

  return shuffle([...libPick, ...rest]).slice(0, n);
}

// Стопка «Тиндера» из всех категорий сразу. Исключаем уже решённые
// (в библиотеке) и отвергнутые, чтобы подкидывать свежее.
export function tinderDeck(catalog, library, n = 50) {
  const decided = new Set([
    ...Object.keys(library.entries),
    ...Object.keys(library.dismissed || {}),
  ]);
  const pool = catalog.items.filter(
    (it) => rating(it) >= MIN_RATING && !decided.has(it.id)
  );
  return shuffle(pool).slice(0, n);
}
