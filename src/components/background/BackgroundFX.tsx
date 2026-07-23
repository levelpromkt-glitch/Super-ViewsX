export function BackgroundFX() {
  return (
    <>
      <div className="bg-animation" />
      <div className="particles">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="particle" />
        ))}
      </div>
    </>
  );
}
