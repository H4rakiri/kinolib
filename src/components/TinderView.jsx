import { useRef, useState } from 'react';
import { TYPE_LABEL } from '../lib/format.js';

// Стопка карточек со свайпами:
//   влево  — неинтересно (отвергнуть)
//   вправо — хочу посмотреть
//   вверх  — просмотрено (+ оценка понравилось/не понравилось)
// index/onAdvance подняты в родителя, чтобы прогресс стопки сохранялся при
// переключении вкладок (иначе локальный индекс сбрасывался бы на 0).
export default function TinderView({ deck, index, onAdvance, onLeft, onRight, onUp, onRebuild }) {
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [fly, setFly] = useState(null); // exit-трансформ улетающей карточки
  const [rating, setRating] = useState(false); // экран оценки после свайпа вверх
  const start = useRef(null);

  const i = index;
  const current = deck[i];
  const nextItem = deck[i + 1];

  const advance = () => {
    onAdvance();
    setDrag({ x: 0, y: 0, active: false });
    setFly(null);
    setRating(false);
  };

  const goLeft = () => {
    if (fly || rating) return;
    onLeft(current);
    setFly({ x: -640, y: 40, rot: -18 });
    setTimeout(advance, 280);
  };
  const goRight = () => {
    if (fly || rating) return;
    onRight(current);
    setFly({ x: 640, y: 40, rot: 18 });
    setTimeout(advance, 280);
  };
  const goUp = () => {
    if (fly || rating) return;
    setDrag({ x: 0, y: 0, active: false });
    setRating(true); // карточка держится, показываем оценку
  };
  const confirmWatched = (liked) => {
    onUp(current, liked);
    setRating(false);
    setFly({ x: 0, y: -760, rot: 0 });
    setTimeout(advance, 280);
  };

  const onDown = (e) => {
    if (fly || rating) return;
    start.current = { x: e.clientX, y: e.clientY };
    setDrag({ x: 0, y: 0, active: true });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag.active) return;
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y, active: true });
  };
  const onUpEvt = () => {
    if (!drag.active) return;
    const { x, y } = drag;
    const H = 110;
    const UP = 120;
    if (y < -UP && Math.abs(y) > Math.abs(x)) goUp();
    else if (x > H) goRight();
    else if (x < -H) goLeft();
    else setDrag({ x: 0, y: 0, active: false }); // возврат
  };

  if (i >= deck.length || !current) {
    return (
      <div className="tinder-done">
        <div className="tinder-done-emoji">🎬</div>
        <p>Стопка пройдена</p>
        <button className="mini-add solid" onClick={onRebuild}>
          Собрать новую стопку
        </button>
      </div>
    );
  }

  const t = fly
    ? `translate(${fly.x}px, ${fly.y}px) rotate(${fly.rot}deg)`
    : `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x * 0.05}deg)`;
  const transition = drag.active ? 'none' : 'transform 0.28s ease';

  // Подсказки направления при перетаскивании.
  const dir =
    drag.y < -60 && Math.abs(drag.y) > Math.abs(drag.x)
      ? 'up'
      : drag.x > 50
      ? 'right'
      : drag.x < -50
      ? 'left'
      : null;

  return (
    <div className="tinder">
      <div className="tinder-stack">
        {nextItem && <Card key={nextItem.id} item={nextItem} behind />}
        <Card
          key={current.id}
          item={current}
          style={{ transform: t, transition }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUpEvt}
          onPointerCancel={onUpEvt}
          dir={dir}
          rating={rating}
          onRate={confirmWatched}
          onCancelRate={() => setRating(false)}
        />
      </div>

      <div className="tinder-controls">
        <button className="swipe-btn no" onClick={goLeft} aria-label="Неинтересно">
          ✕
        </button>
        <button className="swipe-btn up" onClick={goUp} aria-label="Просмотрено">
          ▲
        </button>
        <button className="swipe-btn yes" onClick={goRight} aria-label="Хочу посмотреть">
          ♥
        </button>
      </div>
      <div className="tinder-hint">
        ← неинтересно · ↑ просмотрено · хочу →
      </div>
    </div>
  );
}

function Card({ item, behind, style, dir, rating, onRate, onCancelRate, ...handlers }) {
  const rate = item.ratingImdb || item.ratingTmdb;
  return (
    <div className={`tinder-card ${behind ? 'behind' : ''}`} style={style} {...handlers}>
      <div className="tinder-poster">
        {item.poster ? (
          <img src={item.poster} alt="" draggable={false} />
        ) : (
          <div className="card-noposter">{item.title}</div>
        )}
        <div className="tinder-shade" />
        {!behind && dir === 'left' && <span className="stamp stamp-no">НЕТ</span>}
        {!behind && dir === 'right' && <span className="stamp stamp-yes">ХОЧУ</span>}
        {!behind && dir === 'up' && <span className="stamp stamp-up">СМОТРЕЛ</span>}

        <div className="tinder-info">
          <div className="tinder-title">
            {item.title}
            {item.year ? <span className="tinder-year"> · {item.year}</span> : null}
          </div>
          <div className="tinder-meta">
            <span className="tinder-type">{TYPE_LABEL[item.type]}</span>
            {rate ? <span className="tinder-rate">★ {rate.toFixed(1)}</span> : null}
          </div>
          <div className="tinder-genres">
            {(item.genres || []).slice(0, 3).map((g) => (
              <span key={g} className="tinder-genre">
                {g}
              </span>
            ))}
          </div>
          {item.overview ? (
            <p className="tinder-overview">{item.overview}</p>
          ) : null}
        </div>

        {rating && !behind ? (
          <div className="tinder-rate-overlay">
            <span className="rate-q">Оценили?</span>
            <div className="rate-row">
              <button className="like-btn" onClick={() => onRate(true)}>
                👍 Понравилось
              </button>
              <button className="like-btn" onClick={() => onRate(false)}>
                👎 Не очень
              </button>
            </div>
            <button className="rate-skip" onClick={() => onRate(null)}>
              Просто отметить просмотренным
            </button>
            <button className="rate-cancel" onClick={onCancelRate}>
              Отмена
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
