export function Marquee({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  const repeated = Array.from({ length: 6 }).flatMap(() => items);
  return (
    <div className="marquee-wrapper">
      <div className={`marquee${reverse ? " marquee-reverse" : ""}`}>
        {repeated.map((text, i) => (
          <span key={i} className="marquee-item-wrap">
            <span className="marquee-item">{text}</span>
            <span className="marquee-bullet">•</span>
          </span>
        ))}
      </div>
    </div>
  );
}
