import { useEffect, useMemo, useRef, useState } from 'react';
import { searchItems } from '../lib/catalog.js';
import { searchTmdb, fetchTmdbDetails } from '../lib/tmdb.js';
import { TYPE_LABEL } from '../lib/format.js';

// Оверлей добавления в подборку. Пустой запрос → то, что уже в библиотеке.
// Есть запрос → живой поиск по всей базе TMDB (или по каталогу, если нет ключа).
// Тап по строке — добавить/убрать (для нишевого кино догружаем детали и
// сохраняем снапшот, чтобы фильм отображался без каталога).
export default function AddPicker({
  catalog,
  library,
  tmdbKey,
  resolve,
  isIn,
  onToggle,
  onClose,
}) {
  const [q, setQ] = useState('');
  const [live, setLive] = useState([]);
  const [loading, setLoading] = useState(false);
  const [justAdded, setJustAdded] = useState(() => new Set());
  const timer = useRef(null);

  const libraryItems = useMemo(() => {
    const order = { watched: 0, watching: 1, want: 2 };
    return Object.keys(library.entries)
      .map((id) => resolve(id))
      .filter(Boolean)
      .sort(
        (a, b) =>
          (order[library.entries[a.id].status] ?? 9) -
          (order[library.entries[b.id].status] ?? 9)
      );
  }, [library, resolve]);

  useEffect(() => {
    if (!q.trim()) {
      setLive([]);
      return;
    }
    clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        setLive(tmdbKey ? await searchTmdb(q, tmdbKey) : searchItems(catalog, q));
      } catch {
        setLive([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [q, tmdbKey, catalog]);

  const rows = q.trim() ? live : libraryItems;

  const toggle = async (it) => {
    let item = it;
    // Нишевое кино из живого поиска — догружаем детали, чтобы получить imdb-id
    // и запомнить полноценный снапшот.
    if (it._partial && tmdbKey) {
      try {
        item = await fetchTmdbDetails(it);
      } catch {
        /* добавим по частичным данным */
      }
    }
    const inCatalog = catalog.items.some((x) => x.id === item.id);
    onToggle(item.id, inCatalog ? null : item);
    setJustAdded((s) => {
      const n = new Set(s);
      n.has(it.id) ? n.delete(it.id) : n.add(it.id);
      return n;
    });
  };

  const shown = (it) => isIn(it.id) || justAdded.has(it.id);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <input
            className="search-input compact"
            placeholder={tmdbKey ? 'Поиск по всей базе…' : 'Поиск по каталогу…'}
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="icon-btn" onClick={onClose} aria-label="Готово">
            ✕
          </button>
        </div>

        {!q.trim() && (
          <div className="picker-label">
            {libraryItems.length ? 'Из вашей библиотеки' : 'Найдите фильм через поиск'}
          </div>
        )}

        <div className="picker-list">
          {rows.map((it) => {
            const added = shown(it);
            return (
              <button
                key={it.id}
                className={`picker-row ${added ? 'added' : ''}`}
                onClick={() => toggle(it)}
              >
                <span className="picker-poster">
                  {it.poster ? <img src={it.poster} alt="" loading="lazy" /> : null}
                </span>
                <span className="picker-info">
                  <span className="picker-title">{it.title}</span>
                  <span className="picker-meta">
                    {TYPE_LABEL[it.type]} · {it.year || '—'}
                  </span>
                </span>
                <span className={`picker-toggle ${added ? 'on' : ''}`}>
                  {added ? '✓' : '+'}
                </span>
              </button>
            );
          })}
          {loading && !rows.length && <div className="hint">Поиск…</div>}
          {!loading && rows.length === 0 && (
            <div className="hint">
              {q.trim() ? 'Ничего не найдено' : 'Библиотека пуста'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
