#!/usr/bin/env node
/*
 * Сбор каталога для «Киноленты».
 *
 * Запускается вручную (`KP_TOKEN=... npm run fetch-data`) или по расписанию через
 * GitHub Actions (.github/workflows/fetch-data.yml). Результат — public/data/catalog.json
 * в той же схеме, что и раньше: сайт остаётся чистой статикой, ключ живёт только
 * в Secrets репозитория и в файл не попадает.
 *
 * Источник — неофициальный API Кинопоиска (https://kinopoiskapiunofficial.tech):
 * русские названия, постеры, рейтинги КП + IMDb, жанры, хронометраж, сезоны/серии.
 *
 * Бесплатный тариф лимитирован (~500 запросов/сутки, 20/сек), поэтому глубину
 * (pages) держим умеренной. Каждый фильм = 1 детальный запрос (за хронометражом),
 * каждый сериал/аниме = ещё 1 запрос за сезонами.
 *
 * Переменные окружения:
 *   KP_TOKEN — обязательный ключ kinopoiskapiunofficial.tech
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KP_TOKEN = process.env.KP_TOKEN;
const KP = 'https://kinopoiskapiunofficial.tech/api';

if (!KP_TOKEN) {
  console.error('Нужен KP_TOKEN (ключ kinopoiskapiunofficial.tech).');
  process.exit(1);
}

// Именованные коллекции. anime — через фильтр по жанру, остальные — через collections.
const COLLECTIONS = [
  { id: 'kp_top250', title: 'Топ Кинопоиска', kind: 'movie', kpType: 'TOP_250_MOVIES', pages: 5 },
  { id: 'popular', title: 'Популярное', kind: 'movie', kpType: 'TOP_POPULAR_MOVIES', pages: 2 },
  { id: 'series', title: 'Сериалы', kind: 'tv', kpType: 'POPULAR_SERIES', pages: 2 },
  { id: 'anime_top', title: 'Топ аниме', kind: 'anime', animeFilter: true, pages: 3 },
];

// Куратор­ский список жанров для чипов и «топов по жанру» (в порядке показа).
const GENRES = [
  'драма', 'комедия', 'боевик', 'триллер', 'фантастика', 'фэнтези',
  'приключения', 'криминал', 'детектив', 'мелодрама', 'ужасы',
  'аниме', 'мультфильм', 'военный', 'история',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function kp(path, tries = 0) {
  const res = await fetch(`${KP}${path}`, {
    headers: { 'X-API-KEY': KP_TOKEN, Accept: 'application/json' },
  });
  if (res.status === 429 && tries < 4) {
    await sleep(2000);
    return kp(path, tries + 1);
  }
  if (!res.ok) throw new Error(`KP ${path} → ${res.status}`);
  return res.json();
}

// Сериал ли это (для показа сезонов/серий). Аниме может быть и фильмом,
// и сериалом — различаем по типу/флагу KP, а не по жанру.
function isSerial(film) {
  return (
    ['TV_SERIES', 'MINI_SERIES', 'TV_SHOW'].includes(film.type) ||
    film.serial === true
  );
}

function classify(film) {
  const genres = (film.genres || []).map((g) => g.genre);
  if (genres.includes('аниме')) return 'anime';
  if (isSerial(film)) return 'tv';
  return 'movie';
}

// Собираем «сырые» карточки (kinopoiskId + базовые поля) из коллекции.
async function collectFromCollection(col, seen) {
  const out = [];
  for (let page = 1; page <= col.pages; page++) {
    const data = await kp(
      `/v2.2/films/collections?type=${col.kpType}&page=${page}`
    );
    for (const it of data.items || []) out.push(it);
    if (page >= (data.totalPages || page)) break;
    await sleep(120);
  }
  return out;
}

// Топ аниме — через фильтр по жанру (id 24) с сортировкой по рейтингу.
async function collectAnime(col) {
  const out = [];
  for (let page = 1; page <= col.pages; page++) {
    const data = await kp(
      `/v2.2/films?genres=24&order=RATING&type=ALL&ratingFrom=7&page=${page}`
    );
    for (const it of data.items || []) out.push(it);
    if (page >= (data.totalPages || page)) break;
    await sleep(120);
  }
  return out;
}

// Полный хронометраж сериала/аниме: суммируем серии всех сезонов × длину серии.
async function seriesRuntime(kpId, episodeRuntime) {
  try {
    const data = await kp(`/v2.2/films/${kpId}/seasons`);
    const seasons = data.items || [];
    const episodes = seasons.reduce((n, s) => n + (s.episodes?.length || 0), 0);
    return {
      seasons: seasons.length || null,
      episodes: episodes || null,
      runtime: episodes && episodeRuntime ? episodes * episodeRuntime : null,
    };
  } catch {
    return { seasons: null, episodes: null, runtime: null };
  }
}

// Обогащаем карточку деталями (хронометраж) и приводим к нашей схеме.
async function toItem(raw) {
  let detail = raw;
  // В коллекциях нет filmLength — тянем деталь ради хронометража/описания.
  try {
    detail = { ...raw, ...(await kp(`/v2.2/films/${raw.kinopoiskId}`)) };
    await sleep(120);
  } catch {
    /* остаёмся с тем, что есть */
  }

  const type = classify(detail);
  const genres = (detail.genres || []).map((g) => g.genre);
  const episodeRuntime = detail.filmLength || null;

  // Сезоны/серии — только для настоящих сериалов. Аниме-фильмы (serial=false)
  // остаются с обычным хронометражом filmLength.
  let seasons = null,
    episodes = null,
    runtime = episodeRuntime,
    epRt = null;

  if (isSerial(detail)) {
    const s = await seriesRuntime(detail.kinopoiskId, episodeRuntime);
    seasons = s.seasons;
    episodes = s.episodes;
    epRt = episodeRuntime;
    runtime = s.runtime || null;
    await sleep(120);
  }

  const lists = genres
    .filter((g) => GENRES.includes(g))
    .map((g) => `genre_${g}`);

  return {
    id: detail.imdbId || `kp${detail.kinopoiskId}`,
    kpId: detail.kinopoiskId,
    tmdbId: null,
    type,
    title: detail.nameRu || detail.nameOriginal || detail.nameEn || '—',
    originalTitle: detail.nameOriginal || detail.nameEn || detail.nameRu || '',
    year: detail.year || null,
    poster: detail.posterUrl || detail.posterUrlPreview || null,
    genres,
    runtime,
    seasons,
    episodes,
    episodeRuntime: epRt,
    ratingKp: detail.ratingKinopoisk || null,
    ratingImdb: detail.ratingImdb || null,
    overview: detail.shortDescription || detail.description || '',
    lists,
  };
}

async function main() {
  const rawById = new Map(); // kinopoiskId → сырая карточка
  const membership = new Map(); // kinopoiskId → Set(collectionId)

  for (const col of COLLECTIONS) {
    console.log(`Собираю: ${col.title}…`);
    const raws = col.animeFilter
      ? await collectAnime(col)
      : await collectFromCollection(col);
    for (const raw of raws) {
      const id = raw.kinopoiskId;
      if (!rawById.has(id)) rawById.set(id, raw);
      if (!membership.has(id)) membership.set(id, new Set());
      membership.get(id).add(col.id);
    }
  }

  console.log(`Уникальных тайтлов: ${rawById.size}. Обогащаю деталями…`);
  const items = [];
  let done = 0;
  for (const [id, raw] of rawById) {
    const item = await toItem(raw);
    item.lists = [...new Set([...item.lists, ...membership.get(id)])];
    items.push(item);
    if (++done % 20 === 0) console.log(`  …${done}/${rawById.size}`);
  }

  const catalog = {
    updatedAt: new Date().toISOString().slice(0, 10),
    source: 'kinopoisk',
    genres: GENRES,
    collections: COLLECTIONS.map((c) => ({
      id: c.id,
      title: c.title,
      kind: c.kind,
    })),
    items,
  };

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const out = resolve(__dirname, '../public/data/catalog.json');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(catalog, null, 2), 'utf8');
  console.log(`Готово: ${items.length} тайтлов → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
