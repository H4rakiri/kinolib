import { useState } from 'react';
import { TYPE_LABEL, STATUS } from '../lib/format.js';

// Карточка фильма/сериала/аниме в сетке. Постер тянется по ссылке из каталога
// и кэшируется браузером (loading="lazy"). Плейсхолдер — если постера нет
// или ссылка битая (onError).
export default function MovieCard({ item, status, onOpen }) {
  const st = status ? STATUS[status] : null;
  const [broken, setBroken] = useState(false);
  return (
    <button className="card" onClick={() => onOpen(item)}>
      <div className="card-poster">
        {item.poster && !broken ? (
          <img
            src={item.poster}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
          />
        ) : (
          <div className="card-noposter">{item.title}</div>
        )}
        {item.ratingImdb || item.ratingTmdb ? (
          <span className="card-rating">
            {(item.ratingImdb || item.ratingTmdb).toFixed(1)}
          </span>
        ) : null}
        {st ? (
          <span className={`card-status status-${status}`} title={st.label}>
            {st.icon}
          </span>
        ) : null}
      </div>
      <div className="card-title">{item.title}</div>
      <div className="card-meta">
        {TYPE_LABEL[item.type]} · {item.year}
      </div>
    </button>
  );
}
