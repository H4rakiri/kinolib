import { useEffect, useMemo, useRef, useState } from 'react';
import { searchItems } from '../lib/catalog.js';
import { searchTmdb } from '../lib/tmdb.js';
import MovieGrid from './MovieGrid.jsx';

// Поиск. Если задан ключ TMDB — живой поиск по всей базе (включая нишевое кино);
// иначе — по запечённому каталогу. Дебаунс, чтобы не дёргать API на каждый символ.
export default function SearchView({ catalog, tmdbKey, getStatus, onOpen }) {
  const [q, setQ] = useState('');
  const [live, setLive] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const timer = useRef(null);

  const local = useMemo(() => searchItems(catalog, q), [catalog, q]);

  useEffect(() => {
    if (!tmdbKey || !q.trim()) {
      setLive([]);
      setErr(null);
      return;
    }
    clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await searchTmdb(q, tmdbKey);
        setLive(res);
        setErr(null);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [q, tmdbKey]);

  // С ключом показываем живые результаты; каталожные совпадения — если их ещё нет
  // среди живых (по совпадению названия это редкость, поэтому просто приоритет живым).
  const results = tmdbKey ? live : local;

  return (
    <div>
      <input
        className="search-input"
        placeholder={
          tmdbKey ? 'Поиск по всей базе…' : 'Поиск по каталогу…'
        }
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />

      {!tmdbKey && (
        <div className="search-note">
          Ищем по каталогу. Чтобы искать по всей базе (включая нишевое кино),
          добавьте ключ TMDB в разделе «Библиотека → Настройки».
        </div>
      )}

      {!q.trim() ? (
        <div className="empty">Начните вводить название</div>
      ) : err ? (
        <div className="empty">Ошибка поиска: {err}</div>
      ) : loading && !results.length ? (
        <div className="empty">Поиск…</div>
      ) : (
        <MovieGrid
          items={results}
          getStatus={getStatus}
          onOpen={onOpen}
          empty="Ничего не найдено"
        />
      )}
    </div>
  );
}
