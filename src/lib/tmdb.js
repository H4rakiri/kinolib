// Живой поиск по всей базе TMDB (для поиска нишевого кино, которого нет в
// запечённых топах). Ключ (v3 auth) хранится только в этом браузере —
// вводится пользователем в настройках, в публичный код сайта не попадает.

const KEY_STORE = 'kinolib.tmdb.v1';
const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/w500';

export function getTmdbKey() {
  return localStorage.getItem(KEY_STORE) || '';
}
export function setTmdbKey(key) {
  if (key) localStorage.setItem(KEY_STORE, key.trim());
  else localStorage.removeItem(KEY_STORE);
}
export function hasTmdbKey() {
  return !!getTmdbKey();
}

function poster(path) {
  return path ? `${IMG}${path}` : null;
}

function yearOf(dateStr) {
  return dateStr ? Number(dateStr.slice(0, 4)) || null : null;
}

// Аниме: японская анимация (жанр Animation = 16, оригинальный язык — японский).
function detectType(r, mediaType) {
  const isAnimation = (r.genre_ids || []).includes(16);
  if (isAnimation && r.original_language === 'ja') return 'anime';
  return mediaType === 'tv' ? 'tv' : 'movie';
}

// Лёгкий результат поиска (без деталей). Полные данные догружаем при открытии.
function normalizeSearch(r) {
  const mt = r.media_type;
  if (mt !== 'movie' && mt !== 'tv') return null;
  const title = mt === 'tv' ? r.name : r.title;
  const orig = mt === 'tv' ? r.original_name : r.original_title;
  const date = mt === 'tv' ? r.first_air_date : r.release_date;
  return {
    id: `tmdb:${mt}:${r.id}`, // временный id, на добавлении заменяется на imdb
    tmdbId: r.id,
    mediaType: mt,
    type: detectType(r, mt),
    title: title || orig || '—',
    originalTitle: orig || title || '',
    year: yearOf(date),
    poster: poster(r.poster_path),
    genres: [],
    runtime: null,
    seasons: null,
    episodes: null,
    episodeRuntime: null,
    ratingKp: null,
    ratingImdb: null,
    ratingTmdb: r.vote_average || null,
    overview: r.overview || '',
    lists: [],
    _partial: true,
  };
}

export async function searchTmdb(query, key = getTmdbKey()) {
  if (!key || !query.trim()) return [];
  const url = `${BASE}/search/multi?api_key=${key}&language=ru-RU&include_adult=false&query=${encodeURIComponent(
    query
  )}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = await res.json();
  return (data.results || [])
    .map(normalizeSearch)
    .filter(Boolean)
    // Сначала более известные (по числу голосов TMDB)
    .sort((a, b) => (b.ratingTmdb || 0) - (a.ratingTmdb || 0));
}

// Полные данные при открытии карточки из поиска: imdb-id, хронометраж,
// сезоны/серии, локализованные жанры. id становится imdb-id (для дедупликации
// с каталогом), иначе tmdb-id.
export async function fetchTmdbDetails(item, key = getTmdbKey()) {
  if (!key) return item;
  const mt = item.mediaType;
  const url = `${BASE}/${mt}/${item.tmdbId}?api_key=${key}&language=ru-RU&append_to_response=external_ids`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const d = await res.json();
  const genres = (d.genres || []).map((g) => g.name);
  const imdbId = d.external_ids?.imdb_id || null;

  let runtime = null,
    seasons = null,
    episodes = null,
    episodeRuntime = null;

  if (mt === 'tv') {
    seasons = d.number_of_seasons || null;
    episodes = d.number_of_episodes || null;
    episodeRuntime = d.episode_run_time?.[0] || null;
    runtime = episodes && episodeRuntime ? episodes * episodeRuntime : null;
  } else {
    runtime = d.runtime || null;
  }

  const isAnime =
    genres.some((g) => g.toLowerCase().includes('мульт') || g === 'Animation') &&
    d.original_language === 'ja';

  return {
    ...item,
    id: imdbId || item.id,
    tmdbId: item.tmdbId,
    type: isAnime ? 'anime' : mt === 'tv' ? 'tv' : 'movie',
    genres,
    runtime,
    seasons,
    episodes,
    episodeRuntime,
    overview: d.overview || item.overview || '',
    poster: item.poster || (d.poster_path ? `${IMG}${d.poster_path}` : null),
    _partial: false,
  };
}
