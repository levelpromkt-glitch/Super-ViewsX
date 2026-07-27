import React, { useEffect, useRef } from 'react';

export function BackgroundFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight * 1.1; // 110vh to match wrapper
    canvas.width = width;
    canvas.height = height;

    const resizeCanvas = () => {
      width = window.innerWidth;
      height = window.innerHeight * 1.1;
      canvas.width = width;
      canvas.height = height;
    };
    window.addEventListener('resize', resizeCanvas);

    // Matrix characters
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$+-*/=%""\'#&_(),.;:?!\\|{}<>[]^~日ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ'.split('');
    const fontSize = 18;
    // We recalculate columns in the draw loop to handle resize gracefully without re-init arrays entirely,
    // but initializing here is fine.
    let columns = Math.ceil(width / fontSize);
    let drops: number[] = [];
    for (let x = 0; x < columns; x++) {
      drops[x] = Math.random() * (height / fontSize);
    }

    let animationFrameId: number;
    let lastDrawTime = 0;
    const fps = 24; 
    const interval = 1000 / fps;

    const draw = (timestamp: number) => {
      animationFrameId = requestAnimationFrame(draw);
      if (timestamp - lastDrawTime < interval) return;
      lastDrawTime = timestamp;

      // Semi-transparent black to create trail
      ctx.fillStyle = 'rgba(10, 14, 10, 0.15)';
      ctx.fillRect(0, 0, width, height);

      ctx.font = `bold ${fontSize}px monospace`;
      
      // Ensure drops array matches current columns if resized
      const currentCols = Math.ceil(width / fontSize);
      if (drops.length < currentCols) {
        for (let x = drops.length; x < currentCols; x++) {
          drops[x] = Math.random() * (height / fontSize);
        }
      }

      for (let i = 0; i < currentCols; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        
        // Head of the drop is white-ish, tail is theme green
        if (Math.random() > 0.95) {
          ctx.fillStyle = '#fff';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#fff';
        } else {
          ctx.fillStyle = 'rgba(158, 255, 46, 0.9)'; // Primary Lime
          ctx.shadowBlur = 5;
          ctx.shadowColor = 'rgba(158, 255, 46, 0.5)';
        }

        ctx.fillText(text, i * fontSize, drops[i] * fontSize);
        ctx.shadowBlur = 0; // reset for performance

        if (drops[i] * fontSize > height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    };

    animationFrameId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="bg-matrix-wrapper">
      <div className="bg-animation" />
      <canvas ref={canvasRef} className="matrix-canvas" />
    </div>
  );
}
