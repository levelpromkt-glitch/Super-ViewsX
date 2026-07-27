export function BackgroundFX() {
  return (
    <div className="bg-radar-wrapper">
      <div className="bg-animation" />
      
      <svg className="radar-svg" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="radar-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(158, 255, 46, 0.15)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        <circle cx="500" cy="850" r="500" fill="url(#radar-glow)" />

        <g className="radar-lines" stroke="rgba(158, 255, 46, 0.08)" strokeWidth="1" fill="none">
          {/* Concentric circles */}
          {[120, 240, 360, 480, 600, 720, 840, 960].map((r, i) => (
             <circle key={`circle-${i}`} cx="500" cy="850" r={r} />
          ))}
          
          {/* Radiating lines with dashed pattern */}
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30 * Math.PI) / 180;
            const x2 = 500 + 1000 * Math.cos(angle);
            const y2 = 850 + 1000 * Math.sin(angle);
            return (
              <line key={`line-${i}`} x1="500" y1="850" x2={x2} y2={y2} strokeDasharray="4 8" />
            );
          })}
        </g>

        {/* Scattered glowing nodes */}
        <g className="radar-nodes" fill="rgba(158, 255, 46, 0.8)">
           <circle cx="500" cy="730" r="2.5" />
           <circle cx="620" cy="850" r="2.5" />
           <circle cx="380" cy="850" r="2.5" />
           
           <circle cx="670" cy="680" r="2.5" />
           <circle cx="330" cy="680" r="2.5" />
           
           <circle cx="500" cy="490" r="2.5" />
           <circle cx="754" cy="595" r="2.5" />
           <circle cx="245" cy="595" r="2.5" />
           
           <circle cx="500" cy="250" r="2.5" />
           <circle cx="800" cy="330" r="2.5" />
           <circle cx="200" cy="330" r="2.5" />
           <circle cx="924" cy="425" r="2.5" />
           <circle cx="76" cy="425" r="2.5" />
        </g>
      </svg>
    </div>
  );
}
