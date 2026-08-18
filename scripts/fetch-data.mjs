#!/usr/bin/env node
/*
 * Сбор каталога «Киноленты» из официальных данных IMDb + TMDB.
 *
 * Ранжирование — по РЕАЛЬНОМУ рейтингу IMDb (датасет title.ratings, бесплатно,
 * без лимитов). Русские названия, постеры, описания, сезоны/серии — из TMDB
 * по imdb-id. Кинопоиск не используется.
 *
 * Результат — public/data/catalog.json (топы по типам и жанрам). Сайт статичен,
 * ключ TMDB живёт только в Secrets репозитория и в файл не попадает.
 *
 * Переменные окружения:
 *   TMDB_TOKEN — ключ themoviedb.org (v3 auth), обязателен для постеров/русских названий
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';

const TMDB_TOKEN = process.env.TMDB_TOKEN;
if (!TMDB_TOKEN) {
  console.error('Нужен TMDB_TOKEN (ключ themoviedb.org). Без него не будет постеров/названий.');
  process.exit(1);
}

const IMDB = 'https://datasets.imdbws.com';
const TMDB = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/w500';

// IMDb-жанры (англ.) → русские. Порядок RU-списка = порядок чипов в интерфейсе.
const GENRE_RU = {
  Drama: 'драма', Comedy: 'комедия', Action: 'боевик', Thriller: 'триллер',
  'Sci-Fi': 'фантастика', Fantasy: 'фэнтези', Adventure: 'приключения',
  Crime: 'криминал', Mystery: 'детектив', Romance: 'мелодрама', Horror: 'ужасы',
  Animation: 'мультфильм', Documentary: 'документальный', War: 'военный',
  Western: 'вестерн', History: 'история', Biography: 'биография', Family: 'семейный',
  Music: 'музыка', Musical: 'мюзикл', Sport: 'спорт',
};
const GENRE_ORDER = [
  'драма', 'комедия', 'боевик', 'триллер', 'фантастика', 'фэнтези',
  'приключения', 'криминал', 'детектив', 'мелодрама', 'ужасы', 'мультфильм',
  'военный', 'вестерн', 'история', 'документальный',
];

const MOVIE_VOTES = 25000; // порог голосов, чтобы в топах было реальное кино
const SERIES_VOTES = 8000;
const PER_GENRE = 120;
const TOP_MOVIES = 250;
const TOP_SERIES = 150;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Потоковое чтение gzip-TSV построчно (файлы большие — не грузим целиком).
async function* tsvLines(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IMDb ${url} → ${res.status}`);
  const rl = createInterface({
    input: (await import('node:stream')).Readable.fromWeb(res.body).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; } // заголовок
    yield line.split('\t');
  }
}

async function loadRatings() {
  console.log('Скачиваю рейтинги IMDb…');
  const map = new Map();
  for await (const [tconst, avg, votes] of tsvLines(`${IMDB}/title.ratings.tsv.gz`)) {
    map.set(tconst, { rating: parseFloat(avg), votes: parseInt(votes, 10) });
  }
  console.log(`  рейтингов: ${map.size}`);
  return map;
}

async function loadUniverse(ratings) {
  console.log('Скачиваю базовые данные IMDb (жанры/тип/год)…');
  const universe = [];
  for await (const row of tsvLines(`${IMDB}/title.basics.tsv.gz`)) {
    const [tconst, titleType, primaryTitle, originalTitle, isAdult, startYear, , runtime, genres] = row;
    if (isAdult === '1') continue;
    const isMovie = titleType === 'movie';
    const isSeries = titleType === 'tvSeries' || titleType === 'tvMiniSeries';
    if (!isMovie && !isSeries) continue;
    const r = ratings.get(tconst);
    if (!r || !r.rating) continue;
    if (r.votes < (isMovie ? MOVIE_VOTES : SERIES_VOTES)) continue;
    universe.push({
      tconst,
      type: isMovie ? 'movie' : 'tv',
      title: primaryTitle,
      orig: originalTitle,
      year: startYear === '\\N' ? null : parseInt(startYear, 10),
      runtime: runtime === '\\N' ? null : parseInt(runtime, 10),
      genres: genres === '\\N' ? [] : genres.split(','),
      rating: r.rating,
      votes: r.votes,
    });
  }
  console.log(`  прошло порог: ${universe.length}`);
  return universe;
}

const byRating = (a, b) => b.rating - a.rating || b.votes - a.votes;

// --- TMDB ---------------------------------------------------------------
async function tmdb(path) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${TMDB}${path}${sep}api_key=${TMDB_TOKEN}`);
  if (res.status === 429) { await sleep(1000); return tmdb(path); }
  if (!res.ok) throw new Error(`TMDB ${path} → ${res.status}`);
  return res.json();
}

async function enrich(entry) {
  const item = {
    id: entry.tconst,
    kpId: null,
    tmdbId: null,
    type: entry.type,
    title: entry.title,
    originalTitle: entry.orig || entry.title,
    year: entry.year,
    poster: null,
    genres: entry.genres.map((g) => GENRE_RU[g]).filter(Boolean),
    runtime: entry.type === 'movie' ? entry.runtime : null,
    seasons: null,
    episodes: null,
    episodeRuntime: null,
    ratingKp: null,
    ratingImdb: entry.rating,
    ratingTmdb: null,
    overview: '',
    lists: [],
  };

  try {
    const found = await tmdb(
      `/find/${entry.tconst}?external_source=imdb_id&language=ru-RU`
    );
    const hit = entry.type === 'movie' ? found.movie_results?.[0] : found.tv_results?.[0];
    if (hit) {
      item.tmdbId = hit.id;
      item.title = (entry.type === 'tv' ? hit.name : hit.title) || item.title;
      item.poster = hit.poster_path ? `${IMG}${hit.poster_path}` : null;
      item.overview = hit.overview || '';
      item.ratingTmdb = hit.vote_average || null;
      const isAnime =
        entry.genres.includes('Animation') && hit.original_language === 'ja';
      if (isAnime) item.type = 'anime';

      if (entry.type !== 'movie') {
        const tv = await tmdb(`/tv/${hit.id}?language=ru-RU`);
        item.seasons = tv.number_of_seasons || null;
        item.episodes = tv.number_of_episodes || null;
        item.episodeRuntime = tv.episode_run_time?.[0] || null;
        item.runtime =
          item.episodes && item.episodeRuntime
            ? item.episodes * item.episodeRuntime
            : null;
      }
    }
  } catch (e) {
    console.log('  TMDB fail', entry.tconst, e.message);
  }
  return item;
}

// Пул с ограниченной параллельностью для тысяч TMDB-запросов.
async function mapPool(arr, limit, fn) {
  const out = new Array(arr.length);
  let i = 0;
  let done = 0;
  async function worker() {
    while (i < arr.length) {
      const idx = i++;
      out[idx] = await fn(arr[idx]);
      if (++done % 100 === 0) console.log(`  …${done}/${arr.length}`);
      await sleep(25);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return out;
}

async function main() {
  const ratings = await loadRatings();
  const universe = await loadUniverse(ratings);

  const movies = universe.filter((e) => e.type === 'movie').sort(byRating);
  const series = universe.filter((e) => e.type === 'tv').sort(byRating);

  // Членство: tconst → Set(listId)
  const membership = new Map();
  const add = (tconst, listId) => {
    if (!membership.has(tconst)) membership.set(tconst, new Set());
    membership.get(tconst).add(listId);
  };

  movies.slice(0, TOP_MOVIES).forEach((e) => add(e.tconst, 'top_movies'));
  series.slice(0, TOP_SERIES).forEach((e) => add(e.tconst, 'top_series'));

  // Топ по жанрам (фильмы + сериалы вместе).
  for (const ruGenre of GENRE_ORDER) {
    const enGenres = Object.keys(GENRE_RU).filter((en) => GENRE_RU[en] === ruGenre);
    const pool = universe
      .filter((e) => e.genres.some((g) => enGenres.includes(g)))
      .sort(byRating)
      .slice(0, PER_GENRE);
    pool.forEach((e) => add(e.tconst, `genre_${ruGenre}`));
  }

  // Кандидаты в аниме: японская анимация — берём широкий пул Animation,
  // TMDB подтвердит original_language при обогащении.
  universe
    .filter((e) => e.genres.includes('Animation'))
    .sort(byRating)
    .slice(0, 300)
    .forEach((e) => add(e.tconst, 'anime_candidate'));

  const selected = universe.filter((e) => membership.has(e.tconst));
  console.log(`Уникальных тайтлов к обогащению: ${selected.length}`);

  const items = await mapPool(selected, 8, enrich);

  // Финализируем списки: жанры-по-факту + коллекции; аниме собираем отдельно.
  for (const item of items) {
    const sets = membership.get(item.id);
    const lists = new Set();
    for (const l of sets) {
      if (l === 'anime_candidate') continue;
      lists.add(l);
    }
    // Жанры по фактическим genres тайтла (уже RU).
    for (const g of item.genres) if (GENRE_ORDER.includes(g)) lists.add(`genre_${g}`);
    if (item.type === 'anime' && sets.has('anime_candidate')) lists.add('anime_top');
    item.lists = [...lists];
  }

  const catalog = {
    updatedAt: new Date().toISOString().slice(0, 10),
    source: 'imdb+tmdb',
    genres: GENRE_ORDER,
    collections: [
      { id: 'top_movies', title: 'Топ фильмов', kind: 'movie' },
      { id: 'top_series', title: 'Топ сериалов', kind: 'tv' },
      { id: 'anime_top', title: 'Топ аниме', kind: 'anime' },
    ],
    items,
  };

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const out = pathResolve(__dirname, '../public/data/catalog.json');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(catalog, null, 2), 'utf8');
  console.log(`Готово: ${items.length} тайтлов → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
