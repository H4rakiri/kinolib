#!/usr/bin/env node
/*
 * Сбор каталога для «Киноленты».
 *
 * Запускается вручную (`npm run fetch-data`) или по расписанию через
 * GitHub Actions (.github/workflows/fetch-data.yml). Результат — public/data/catalog.json
 * в той же схеме, что и демо-файл: сайт остаётся чистой статикой, а ключи
 * живут только в Secrets репозитория и в этот файл не попадают.
 *
 * Источник — неофициальный API Кинопоиска (https://kinopoiskapiunofficial.tech):
 * русские названия, постеры, рейтинги КП + IMDb, хронометраж, жанры, сезоны/серии.
 * Опционально: если задан TMDB_TOKEN, постеры берутся с TMDB (обычно стабильнее).
 *
 * Переменные окружения:
 *   KP_TOKEN    — обязательный ключ kinopoiskapiunofficial.tech
 *   TMDB_TOKEN  — необязательный ключ TMDB (v3) для более надёжных постеров
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KP_TOKEN = process.env.KP_TOKEN;
const TMDB_TOKEN = process.env.TMDB_TOKEN;
const KP = 'https://kinopoiskapiunofficial.tech/api';

if (!KP_TOKEN) {
  console.error('Нужен KP_TOKEN (ключ kinopoiskapiunofficial.tech).');
  process.exit(1);
}

// Коллекции Кинопоиска → наши id/названия. Сколько страниц тянуть — 20 фильмов
// на страницу; 5 страниц ≈ топ-100. Настраивайте под свои лимиты.
const COLLECTIONS = [
  { id: 'kp_top250', title: 'Топ-250 Кинопоиска', kpType: 'TOP_250_MOVIES', pages: 5 },
  { id: 'imdb_top', title: 'Топ IMDB', kpType: 'TOP_250_MOVIES', pages: 5, sort: 'imdb' },
  { id: 'tv_popular', title: 'Популярные сериалы', kpType: 'TOP_POPULAR_TV_SERIES', pages: 3 },
  { id: 'anime_top', title: 'Топ аниме', kpType: 'TOP_POPULAR_ALL', pages: 5, onlyAnime: true },
];

const GENRES = [
  'драма', 'криминал', 'боевик', 'фантастика', 'фэнтези',
  'триллер', 'комедия', 'мелодрама', 'приключения', 'детектив',
  'ужасы', 'аниме', 'мультфильм',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function kp(path) {
  const res = await fetch(`${KP}${path}`, {
    headers: { 'X-API-KEY': KP_TOKEN, Accept: 'application/json' },
  });
  if (res.status === 429) {
    // Уперлись в лимит — подождём и повторим один раз.
    await sleep(1500);
    return kp(path);
  }
  if (!res.ok) throw new Error(`KP ${path} → ${res.status}`);
  return res.json();
}

function classify(film) {
  const genres = (film.genres || []).map((g) => g.genre);
  if (genres.includes('аниме')) return 'anime';
  if (['TV_SERIES', 'MINI_SERIES', 'TV_SHOW'].includes(film.type)) return 'tv';
  return 'movie';
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

async function tmdbPoster(imdbId) {
  if (!TMDB_TOKEN || !imdbId) return null;
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id&api_key=${TMDB_TOKEN}`
    );
    if (!res.ok) return null;
    const d = await res.json();
    const hit = d.movie_results?.[0] || d.tv_results?.[0];
    return hit?.poster_path
      ? `https://image.tmdb.org/t/p/w500${hit.poster_path}`
      : null;
  } catch {
    return null;
  }
}

async function toItem(film) {
  const type = classify(film);
  const genres = (film.genres || []).map((g) => g.genre);
  const episodeRuntime = film.filmLength || null; // для сериалов КП обычно даёт длину серии
  let seasons = null,
    episodes = null,
    runtime = film.filmLength || null,
    epRt = null;

  if (type !== 'movie') {
    const s = await seriesRuntime(film.kinopoiskId, episodeRuntime);
    seasons = s.seasons;
    episodes = s.episodes;
    epRt = episodeRuntime;
    runtime = s.runtime;
  }

  const poster =
    (await tmdbPoster(film.imdbId)) || film.posterUrl || film.posterUrlPreview || null;

  const lists = genres
    .filter((g) => GENRES.includes(g))
    .map((g) => `genre_${g}`);

  return {
    id: film.imdbId || `kp${film.kinopoiskId}`,
    kpId: film.kinopoiskId,
    tmdbId: null,
    type,
    title: film.nameRu || film.nameOriginal || film.nameEn || '—',
    originalTitle: film.nameOriginal || film.nameEn || film.nameRu || '',
    year: film.year || null,
    poster,
    genres,
    runtime,
    seasons,
    episodes,
    episodeRuntime: epRt,
    ratingKp: film.ratingKinopoisk || null,
    ratingImdb: film.ratingImdb || null,
    overview: film.shortDescription || film.description || '',
    lists,
  };
}

async function fetchCollection(col, byId) {
  const collected = [];
  for (let page = 1; page <= col.pages; page++) {
    const data = await kp(
      `/v2.2/films/collections?type=${col.kpType}&page=${page}`
    );
    for (const short of data.items || []) {
      const kpId = short.kinopoiskId;
      let film = byId.get(kpId);
      if (!film) {
        film = await kp(`/v2.2/films/${kpId}`);
        byId.set(kpId, film);
        await sleep(120); // бережём лимит
      }
      if (col.onlyAnime && classify(film) !== 'anime') continue;
      collected.push(film);
    }
    await sleep(120);
  }
  return collected;
}

async function main() {
  const byId = new Map(); // kinopoiskId → полный объект фильма (дедуп между коллекциями)
  const membership = new Map(); // kinopoiskId → Set(collectionId)

  for (const col of COLLECTIONS) {
    console.log(`Собираю: ${col.title}…`);
    const films = await fetchCollection(col, byId);
    for (const f of films) {
      if (!membership.has(f.kinopoiskId)) membership.set(f.kinopoiskId, new Set());
      membership.get(f.kinopoiskId).add(col.id);
    }
  }

  const items = [];
  for (const [kpId, film] of byId) {
    if (!membership.has(kpId)) continue;
    const item = await toItem(film);
    item.lists = [...new Set([...item.lists, ...membership.get(kpId)])];
    items.push(item);
  }

  const catalog = {
    updatedAt: new Date().toISOString().slice(0, 10),
    source: 'kinopoisk' + (TMDB_TOKEN ? '+tmdb' : ''),
    genres: GENRES,
    collections: COLLECTIONS.map((c) => ({
      id: c.id,
      title: c.title,
      kind: c.onlyAnime ? 'anime' : c.kpType.includes('TV') ? 'tv' : 'movie',
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
