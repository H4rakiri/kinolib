import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  loadCatalog,
  searchItems,
  itemsByGenre,
  itemsByCollection,
} from './lib/catalog.js';
import {
  loadLibrary,
  setStatus as setStatusLib,
  getStatus,
  entriesByStatus,
  counts,
  exportLibrary,
  importLibrary,
  createCollection,
  deleteCollection,
  getCollection,
  toggleInCollection,
  inCollection,
  replaceLibrary,
} from './lib/library.js';
import {
  loadSyncConfig,
  saveSyncConfig,
  isConfigured,
  fetchRemote,
  pushRemote,
} from './lib/sync.js';
import { STATUS, STATUS_ORDER } from './lib/format.js';
import MovieGrid from './components/MovieGrid.jsx';
import MovieDetail from './components/MovieDetail.jsx';
import CollectionView from './components/CollectionView.jsx';
import AddPicker from './components/AddPicker.jsx';
import SyncSettings from './components/SyncSettings.jsx';

const TABS = [
  { id: 'catalog', label: 'Каталог' },
  { id: 'search', label: 'Поиск' },
  { id: 'library', label: 'Библиотека' },
];

export default function App() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('catalog');
  const [library, setLibrary] = useState(() => loadLibrary());
  const [active, setActive] = useState(null); // открытый фильм
  const [openCol, setOpenCol] = useState(null); // id открытой подборки
  const [picker, setPicker] = useState(null); // { colId } — оверлей добавления

  // --- Синхронизация с приватным репозиторием -------------------------
  const [sync, setSync] = useState(loadSyncConfig);
  const [syncStatus, setSyncStatus] = useState('off'); // off|sync|push|idle|error
  const [syncMsg, setSyncMsg] = useState('');
  const shaRef = useRef(null); // sha текущего remote library.json
  const syncedTs = useRef(null); // updatedAt последнего синхронизированного состояния
  const ready = useRef(false); // прошёл ли первичный pull (иначе не пушим)
  const libRef = useRef(library);
  libRef.current = library;
  const pushTimer = useRef(null);

  // Согласование локальной и облачной версии: новее по updatedAt — побеждает.
  const reconcile = useCallback(async (cfg) => {
    if (!isConfigured(cfg)) {
      setSyncStatus('off');
      ready.current = false;
      return;
    }
    setSyncStatus('sync');
    setSyncMsg('');
    try {
      const remote = await fetchRemote(cfg);
      const local = libRef.current;
      const localTs = local.updatedAt || '';
      const remoteTs = remote?.data?.updatedAt || '';
      if (remote && remoteTs >= localTs) {
        shaRef.current = remote.sha;
        syncedTs.current = remote.data.updatedAt || null;
        setLibrary(replaceLibrary(remote.data));
      } else {
        // Локальная версия новее (или файла нет) — отправляем её в облако.
        const newSha = await pushRemote(cfg, local, remote?.sha || null);
        shaRef.current = newSha;
        syncedTs.current = local.updatedAt || null;
      }
      ready.current = true;
      setSyncStatus('idle');
    } catch (e) {
      setSyncStatus('error');
      setSyncMsg(e.message);
    }
  }, []);

  // Первичный pull при монтировании / смене настроек.
  useEffect(() => {
    reconcile(sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.repo, sync.token]);

  // Автопуш при изменениях библиотеки (с дебаунсом).
  useEffect(() => {
    if (!isConfigured(sync) || !ready.current) return;
    if (library.updatedAt === syncedTs.current) return; // это уже синхронизировано
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      try {
        setSyncStatus('push');
        const newSha = await pushRemote(sync, libRef.current, shaRef.current);
        shaRef.current = newSha;
        syncedTs.current = libRef.current.updatedAt || null;
        setSyncStatus('idle');
      } catch (e) {
        setSyncStatus('error');
        setSyncMsg(e.message);
      }
    }, 1500);
    return () => clearTimeout(pushTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.updatedAt]);

  const onSaveSync = (cfg) => {
    saveSyncConfig(cfg);
    setSync(cfg);
  };

  useEffect(() => {
    loadCatalog().then(setCatalog).catch((e) => setError(e.message));
  }, []);

  const byId = useMemo(() => {
    const m = new Map();
    if (catalog) for (const it of catalog.items) m.set(it.id, it);
    return m;
  }, [catalog]);

  const statusOf = (id) => getStatus(library, id);
  const onSetStatus = (id, status) =>
    setLibrary(setStatusLib(library, id, status));

  if (error) return <div className="fatal">Ошибка: {error}</div>;
  if (!catalog) return <div className="loading">Загрузка каталога…</div>;

  const currentCol = openCol ? getCollection(library, openCol) : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Кино<span>лента</span>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => {
                setTab(t.id);
                setOpenCol(null);
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        {tab === 'catalog' && (
          <CatalogView catalog={catalog} getStatus={statusOf} onOpen={setActive} />
        )}
        {tab === 'search' && (
          <SearchView catalog={catalog} getStatus={statusOf} onOpen={setActive} />
        )}
        {tab === 'library' &&
          (currentCol ? (
            <CollectionView
              col={currentCol}
              byId={byId}
              getStatus={statusOf}
              onOpen={setActive}
              onBack={() => setOpenCol(null)}
              onAdd={() => setPicker({ colId: currentCol.id })}
              onDelete={() => {
                if (confirm(`Удалить подборку «${currentCol.name}»?`)) {
                  setLibrary(deleteCollection(library, currentCol.id));
                  setOpenCol(null);
                }
              }}
            />
          ) : (
            <LibraryView
              byId={byId}
              library={library}
              setLibrary={setLibrary}
              getStatus={statusOf}
              onOpen={setActive}
              onOpenCol={setOpenCol}
              sync={sync}
              syncStatus={syncStatus}
              syncMsg={syncMsg}
              onSaveSync={onSaveSync}
              onSyncNow={() => reconcile(sync)}
            />
          ))}
      </main>

      {active && (
        <MovieDetail
          item={active}
          status={statusOf(active.id)}
          onSetStatus={onSetStatus}
          onClose={() => setActive(null)}
        />
      )}

      {picker && (
        <AddPicker
          catalog={catalog}
          library={library}
          colId={picker.colId}
          isIn={(id) => inCollection(library, picker.colId, id)}
          onToggle={(id) =>
            setLibrary(toggleInCollection(library, picker.colId, id))
          }
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

// --- Каталог: коллекции + жанры (компактно, в одну прокручиваемую строку) ---
function CatalogView({ catalog, getStatus, onOpen }) {
  const [sel, setSel] = useState({ kind: 'collection', id: 'kp_top250' });
  const [sortBy, setSortBy] = useState('ratingKp');

  const items = useMemo(() => {
    if (sel.kind === 'collection')
      return itemsByCollection(catalog, sel.id, sortBy);
    return itemsByGenre(catalog, sel.id, sortBy);
  }, [catalog, sel, sortBy]);

  return (
    <div>
      <div className="row-scroll">
        {catalog.collections.map((c) => (
          <button
            key={c.id}
            className={`chip ${
              sel.kind === 'collection' && sel.id === c.id ? 'active' : ''
            }`}
            onClick={() => setSel({ kind: 'collection', id: c.id })}
          >
            {c.title}
          </button>
        ))}
      </div>

      <div className="row-scroll subtle">
        {catalog.genres.map((g) => (
          <button
            key={g}
            className={`chip chip-ghost ${
              sel.kind === 'genre' && sel.id === g ? 'active' : ''
            }`}
            onClick={() => setSel({ kind: 'genre', id: g })}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <span className="count">{items.length}</span>
        <button
          className="sort-toggle"
          onClick={() =>
            setSortBy(sortBy === 'ratingKp' ? 'ratingImdb' : 'ratingKp')
          }
        >
          {sortBy === 'ratingKp' ? 'Кинопоиск' : 'IMDb'} ↓
        </button>
      </div>

      <MovieGrid items={items} getStatus={getStatus} onOpen={onOpen} />
    </div>
  );
}

// --- Поиск --------------------------------------------------------------
function SearchView({ catalog, getStatus, onOpen }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => searchItems(catalog, q), [catalog, q]);

  return (
    <div>
      <input
        className="search-input"
        placeholder="Поиск фильма, сериала, аниме…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      {q.trim() ? (
        <MovieGrid
          items={results}
          getStatus={getStatus}
          onOpen={onOpen}
          empty="Ничего не найдено"
        />
      ) : (
        <div className="empty">Начните вводить название</div>
      )}
    </div>
  );
}

// --- Моя библиотека -----------------------------------------------------
function LibraryView({
  byId,
  library,
  setLibrary,
  getStatus,
  onOpen,
  onOpenCol,
  sync,
  syncStatus,
  syncMsg,
  onSaveSync,
  onSyncNow,
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const c = counts(library);

  const submitCreate = () => {
    if (!name.trim()) return setCreating(false);
    const { lib, col } = createCollection(library, name);
    setLibrary(lib);
    setName('');
    setCreating(false);
    onOpenCol(col.id);
  };

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setLibrary(importLibrary(await file.text()));
    } catch (err) {
      alert('Не удалось импортировать: ' + err.message);
    }
    e.target.value = '';
  };

  const totalEntries = Object.keys(library.entries).length;

  return (
    <div>
      {/* Подборки */}
      <div className="lib-head">
        <h3>Подборки</h3>
        {!creating && (
          <button className="mini-add" onClick={() => setCreating(true)}>
            + Новая
          </button>
        )}
      </div>

      {creating && (
        <div className="create-row">
          <input
            className="search-input compact"
            placeholder="Название подборки"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCreate();
              if (e.key === 'Escape') setCreating(false);
            }}
          />
          <button className="mini-add solid" onClick={submitCreate}>
            Создать
          </button>
        </div>
      )}

      {library.collections.length === 0 && !creating ? (
        <div className="hint">
          Соберите свой список — например «На новый год» или «Пересмотреть».
        </div>
      ) : (
        <div className="col-list">
          {library.collections.map((col) => (
            <button
              key={col.id}
              className="col-card"
              onClick={() => onOpenCol(col.id)}
            >
              <span className="col-icon">☰</span>
              <span className="col-name">{col.name}</span>
              <span className="col-count">{col.itemIds.length}</span>
            </button>
          ))}
        </div>
      )}

      {/* Статусы */}
      {totalEntries === 0 ? (
        <div className="hint" style={{ marginTop: 28 }}>
          Отмечайте фильмы статусом в карточке — они появятся здесь.
        </div>
      ) : (
        STATUS_ORDER.map((s) => {
          const items = entriesByStatus(library, s)
            .map((e) => byId.get(e.id))
            .filter(Boolean);
          if (!items.length) return null;
          return (
            <section key={s} className="lib-section">
              <div className="lib-head">
                <h3>
                  {STATUS[s].label} <span className="dim">{c[s]}</span>
                </h3>
              </div>
              <MovieGrid items={items} getStatus={getStatus} onOpen={onOpen} />
            </section>
          );
        })
      )}

      <SyncSettings
        cfg={sync}
        status={syncStatus}
        msg={syncMsg}
        onSave={onSaveSync}
        onSyncNow={onSyncNow}
      />

      <div className="lib-footer">
        <button className="ghost small" onClick={() => exportLibrary(library)}>
          Экспорт
        </button>
        <label className="ghost small file-label">
          Импорт
          <input type="file" accept="application/json" onChange={onImport} hidden />
        </label>
      </div>
    </div>
  );
}
