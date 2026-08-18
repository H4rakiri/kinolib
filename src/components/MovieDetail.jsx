import { useState } from 'react';
import {
  TYPE_LABEL,
  STATUS,
  STATUS_ORDER,
  formatRuntime,
  formatLongRuntime,
  seasonsLabel,
  episodesLabel,
} from '../lib/format.js';

// Оверлей с деталями. Для сериалов/аниме показываем сезоны, серии,
// хронометраж серии и полный хронометраж; для фильмов — только хронометраж.
export default function MovieDetail({ item, status, onSetStatus, onClose }) {
  // Сериал определяем по наличию сезонов/серий, а не по типу: аниме-фильм
  // (например «Унесённые призраками») должен показывать хронометраж, а не сезоны.
  const isSeries = item.seasons != null || item.episodes != null;
  const [broken, setBroken] = useState(false);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <button className="sheet-close" onClick={onClose} aria-label="Закрыть">
          ✕
        </button>
        <div className="sheet-head">
          <div className="sheet-poster">
            {item.poster && !broken ? (
              <img src={item.poster} alt="" onError={() => setBroken(true)} />
            ) : (
              <div className="card-noposter">{item.title}</div>
            )}
          </div>
          <div className="sheet-info">
            <h2>{item.title}</h2>
            <div className="sheet-orig">
              {item.originalTitle} · {item.year}
            </div>
            <div className="sheet-badges">
              <span className="badge">{TYPE_LABEL[item.type]}</span>
              {item.genres.map((g) => (
                <span className="badge badge-genre" key={g}>
                  {g}
                </span>
              ))}
            </div>
            <div className="sheet-ratings">
              {item.ratingImdb ? (
                <span className="rate rate-imdb">
                  IMDb <b>{item.ratingImdb.toFixed(1)}</b>
                </span>
              ) : null}
              {item.ratingTmdb ? (
                <span className="rate rate-tmdb">
                  TMDB <b>{item.ratingTmdb.toFixed(1)}</b>
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="sheet-stats">
          {isSeries ? (
            <>
              <Stat label="Сезоны" value={seasonsLabel(item.seasons)} />
              <Stat label="Серии" value={episodesLabel(item.episodes)} />
              <Stat
                label="Серия"
                value={formatRuntime(item.episodeRuntime)}
              />
              <Stat
                label="Всего"
                value={formatLongRuntime(item.runtime)}
              />
            </>
          ) : (
            <Stat label="Хронометраж" value={formatRuntime(item.runtime)} />
          )}
        </div>

        {item.overview ? <p className="sheet-overview">{item.overview}</p> : null}

        <div className="sheet-actions">
          {STATUS_ORDER.map((s) => {
            const active = status === s;
            return (
              <button
                key={s}
                className={`status-btn ${active ? 'active' : ''} status-${s}`}
                onClick={() => onSetStatus(item.id, active ? null : s, item)}
              >
                {STATUS[s].icon} {STATUS[s].label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
