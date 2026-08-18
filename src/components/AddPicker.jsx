import { useMemo, useState } from 'react';
import { searchItems } from '../lib/catalog.js';
import { TYPE_LABEL } from '../lib/format.js';

// Оверлей добавления фильмов в подборку. Пустой запрос → показываем то, что уже
// в библиотеке (сначала просмотренное). Есть запрос → ищем по всему каталогу.
// Тап по строке — добавить/убрать из подборки (тумблер, ✓).
export default function AddPicker({ catalog, library, isIn, onToggle, onClose }) {
  const [q, setQ] = useState('');

  const libraryItems = useMemo(() => {
    const order = { watched: 0, watching: 1, want: 2 };
    return Object.keys(library.entries)
      .map((id) => catalog.items.find((it) => it.id === id))
      .filter(Boolean)
      .sort(
        (a, b) =>
          (order[library.entries[a.id].status] ?? 9) -
          (order[library.entries[b.id].status] ?? 9)
      );
  }, [catalog, library]);

  const rows = q.trim() ? searchItems(catalog, q) : libraryItems;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <input
            className="search-input compact"
            placeholder="Поиск по всему каталогу…"
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
            const added = isIn(it.id);
            return (
              <button
                key={it.id}
                className={`picker-row ${added ? 'added' : ''}`}
                onClick={() => onToggle(it.id)}
              >
                <span className="picker-poster">
                  {it.poster ? <img src={it.poster} alt="" loading="lazy" /> : null}
                </span>
                <span className="picker-info">
                  <span className="picker-title">{it.title}</span>
                  <span className="picker-meta">
                    {TYPE_LABEL[it.type]} · {it.year}
                  </span>
                </span>
                <span className={`picker-toggle ${added ? 'on' : ''}`}>
                  {added ? '✓' : '+'}
                </span>
              </button>
            );
          })}
          {rows.length === 0 && (
            <div className="hint">
              {q.trim() ? 'Ничего не найдено' : 'Библиотека пуста'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
