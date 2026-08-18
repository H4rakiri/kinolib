import MovieGrid from './MovieGrid.jsx';

// Экран открытой подборки: назад, название, добавление фильмов, сетка.
export default function CollectionView({
  col,
  resolve,
  getStatus,
  onOpen,
  onBack,
  onAdd,
  onDelete,
}) {
  const items = col.itemIds.map((id) => resolve(id)).filter(Boolean);

  return (
    <div>
      <div className="col-topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Назад">
          ‹
        </button>
        <div className="col-title">
          <h2>{col.name}</h2>
          <span className="dim">{col.itemIds.length} в подборке</span>
        </div>
        <button className="icon-btn danger" onClick={onDelete} aria-label="Удалить">
          🗑
        </button>
      </div>

      <button className="add-wide" onClick={onAdd}>
        + Добавить фильмы
      </button>

      {items.length === 0 ? (
        <div className="hint">
          Пока пусто. Нажмите «Добавить фильмы» — можно выбрать из своей библиотеки
          или найти что угодно через поиск.
        </div>
      ) : (
        <MovieGrid items={items} getStatus={getStatus} onOpen={onOpen} />
      )}
    </div>
  );
}
