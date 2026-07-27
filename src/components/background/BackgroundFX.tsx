export function BackgroundFX() {
  const cx = 500;
  const cy = 1100;
  const radii = [300, 450, 600, 750, 900, 1050, 1200, 1350, 1500];

  return (
    <div className="bg-radar-wrapper">
      <div className="bg-animation" />
      
      <svg className="radar-svg" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="radar-glow" cx="50%" cy="100%" r="100%">
            <stop offset="0%" stopColor="rgba(158, 255, 46, 0.12)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        <rect width="1000" height="1000" fill="url(#radar-glow)" />

        <g className="radar-spin" stroke="rgba(158, 255, 46, 0.25)" strokeWidth="0.8" fill="none" strokeDasharray="2 20" strokeLinecap="round">
          {radii.map((r, i) => (
             <circle key={`circle-${i}`} cx={cx} cy={cy} r={r} />
          ))}
        </g>

        <g className="radar-spin" fill="rgba(158, 255, 46, 1)">
          <circle cx={cx + 300 * Math.cos(Math.PI * 1.3)} cy={cy + 300 * Math.sin(Math.PI * 1.3)} r="2" />
          <circle cx={cx + 450 * Math.cos(Math.PI * 1.6)} cy={cy + 450 * Math.sin(Math.PI * 1.6)} r="2" />
          <circle cx={cx + 600 * Math.cos(Math.PI * 1.2)} cy={cy + 600 * Math.sin(Math.PI * 1.2)} r="2" />
          <circle cx={cx + 600 * Math.cos(Math.PI * 1.8)} cy={cy + 600 * Math.sin(Math.PI * 1.8)} r="2" />
          <circle cx={cx + 750 * Math.cos(Math.PI * 1.45)} cy={cy + 750 * Math.sin(Math.PI * 1.45)} r="2" />
          <circle cx={cx + 900 * Math.cos(Math.PI * 1.15)} cy={cy + 900 * Math.sin(Math.PI * 1.15)} r="2" />
          <circle cx={cx + 900 * Math.cos(Math.PI * 1.85)} cy={cy + 900 * Math.sin(Math.PI * 1.85)} r="2" />
          <circle cx={cx + 1050 * Math.cos(Math.PI * 1.35)} cy={cy + 1050 * Math.sin(Math.PI * 1.35)} r="2" />
          <circle cx={cx + 1050 * Math.cos(Math.PI * 1.65)} cy={cy + 1050 * Math.sin(Math.PI * 1.65)} r="2" />
          <circle cx={cx + 1200 * Math.cos(Math.PI * 1.1)} cy={cy + 1200 * Math.sin(Math.PI * 1.1)} r="2" />
          <circle cx={cx + 1200 * Math.cos(Math.PI * 1.9)} cy={cy + 1200 * Math.sin(Math.PI * 1.9)} r="2" />
        </g>
      </svg>
    </div>
  );
}
