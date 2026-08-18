import MovieCard from './MovieCard.jsx';

export default function MovieGrid({ items, getStatus, onOpen, empty }) {
  if (!items.length) {
    return <div className="empty">{empty || 'Ничего не найдено'}</div>;
  }
  return (
    <div className="grid">
      {items.map((item) => (
        <MovieCard
          key={item.id}
          item={item}
          status={getStatus(item.id)}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
