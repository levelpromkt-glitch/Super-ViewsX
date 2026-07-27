export function BackgroundFX() {
  return (
    <div className="bg-radar-wrapper">
      <div className="bg-animation" />
      <div className="radar-container">
        {Array.from({ length: 6 }).map((_, i) => {
          const size = (i + 1) * 280;
          const duration = 25 + (i * 15);
          const direction = i % 2 === 0 ? "normal" : "reverse";
          return (
            <div 
              key={i} 
              className="radar-ring" 
              style={{ 
                width: `${size}px`, 
                height: `${size}px`, 
                animationDuration: `${duration}s`, 
                animationDirection: direction 
              }}
            >
              <div className="radar-dot" style={{ opacity: 1 - (i * 0.1) }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
