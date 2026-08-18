import { useState } from 'react';
import { DEFAULT_REPO } from '../lib/sync.js';

const STATUS_TEXT = {
  off: 'Выключена',
  sync: 'Синхронизация…',
  push: 'Сохранение…',
  idle: 'Подключено',
  error: 'Ошибка',
};

// Настройка синхронизации библиотеки через приватный репозиторий GitHub.
// Токен хранится только в этом браузере (localStorage).
export default function SyncSettings({ cfg, status, msg, onSave, onSyncNow }) {
  const [open, setOpen] = useState(false);
  const [repo, setRepo] = useState(cfg.repo || DEFAULT_REPO);
  const [token, setToken] = useState(cfg.token || '');

  const dotClass =
    status === 'idle'
      ? 'dot-ok'
      : status === 'error'
      ? 'dot-err'
      : status === 'off'
      ? 'dot-off'
      : 'dot-busy';

  return (
    <div className="sync">
      <button className="sync-bar" onClick={() => setOpen((o) => !o)}>
        <span className={`dot ${dotClass}`} />
        <span className="sync-label">
          Синхронизация: {STATUS_TEXT[status] || status}
          {status === 'error' && msg ? ` — ${msg}` : ''}
        </span>
        <span className="sync-caret">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="sync-panel">
          <label className="field">
            <span>Репозиторий данных</span>
            <input
              className="search-input compact"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="владелец/репозиторий"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <label className="field">
            <span>Personal access token</span>
            <input
              className="search-input compact"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="github_pat_… (scope: repo/contents)"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <p className="sync-note">
            Токен сохраняется только в этом браузере и используется для чтения и
            записи <b>library.json</b> в приватном репозитории. Нужен доступ на
            запись содержимого (classic — scope <code>repo</code>; fine-grained —
            Contents: Read and write для этого репозитория).
          </p>
          <div className="sync-actions">
            <button
              className="mini-add solid"
              onClick={() => onSave({ repo: repo.trim(), token: token.trim() })}
            >
              Сохранить и подключить
            </button>
            {cfg.token ? (
              <button className="ghost small" onClick={onSyncNow}>
                Синхронизировать
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
