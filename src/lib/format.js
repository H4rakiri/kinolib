// Утилиты форматирования хронометража и подписей для карточек/деталей.

// Полный хронометраж в человекочитаемый вид: 142 → «2 ч 22 мин», 47 → «47 мин».
export function formatRuntime(minutes) {
  if (!minutes || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

// Крупный хронометраж сериала/аниме: 25600 → «17 дн 18 ч» либо «426 ч».
export function formatLongRuntime(minutes) {
  if (!minutes || minutes <= 0) return '—';
  const totalH = Math.round(minutes / 60);
  if (totalH < 100) return formatRuntime(minutes);
  const days = Math.floor(totalH / 24);
  const hours = totalH % 24;
  if (days === 0) return `${totalH} ч`;
  return `${days} дн ${hours} ч`;
}

// Русское склонение: (5, ['сезон','сезона','сезонов']) → «сезонов».
export function plural(n, forms) {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

export function seasonsLabel(n) {
  return `${n} ${plural(n, ['сезон', 'сезона', 'сезонов'])}`;
}

export function episodesLabel(n) {
  return `${n} ${plural(n, ['серия', 'серии', 'серий'])}`;
}

export const TYPE_LABEL = {
  movie: 'Фильм',
  tv: 'Сериал',
  anime: 'Аниме',
};

export const STATUS = {
  want: { id: 'want', label: 'Хочу посмотреть', short: 'Хочу', icon: '🔖' },
  watching: { id: 'watching', label: 'Смотрю', short: 'Смотрю', icon: '▶' },
  watched: { id: 'watched', label: 'Посмотрел', short: 'Просмотрено', icon: '✓' },
};
export const STATUS_ORDER = ['watching', 'want', 'watched'];
