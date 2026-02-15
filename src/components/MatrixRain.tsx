// ═══════════════════════════════════════════════════════════════
//  Matrix Rain — The living background of AGI PRIME
//  Subtle digital rain that shows the system is alive
// ═══════════════════════════════════════════════════════════════

import { useEffect, useRef } from 'react';

const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';

interface Column {
  x: number;
  y: number;
  speed: number;
  chars: string[];
  length: number;
}

export default function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const columnsRef = useRef<Column[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fontSize = 14;
    let columns: Column[] = [];

    function initColumns() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      const colCount = Math.floor(canvas.width / fontSize);
      columns = [];

      for (let i = 0; i < colCount; i++) {
        // Only ~30% of columns are active for subtlety
        if (Math.random() > 0.3) continue;

        const length = Math.floor(Math.random() * 15) + 5;
        const chars: string[] = [];
        for (let j = 0; j < length; j++) {
          chars.push(CHARS[Math.floor(Math.random() * CHARS.length)]);
        }

        columns.push({
          x: i * fontSize,
          y: Math.random() * -canvas.height,
          speed: Math.random() * 1.5 + 0.5,
          chars,
          length,
        });
      }

      columnsRef.current = columns;
    }

    function draw() {
      if (!canvas || !ctx) return;

      ctx.fillStyle = 'rgba(3, 3, 8, 0.12)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (const col of columnsRef.current) {
        for (let j = 0; j < col.chars.length; j++) {
          const y = col.y + j * fontSize;
          if (y < 0 || y > canvas.height) continue;

          const progress = j / col.chars.length;

          if (j === col.chars.length - 1) {
            // Lead character — bright
            ctx.fillStyle = 'rgba(0, 255, 65, 0.9)';
            ctx.shadowBlur = 8;
            ctx.shadowColor = 'rgba(0, 255, 65, 0.5)';
          } else {
            // Trail — fading
            const alpha = (1 - progress) * 0.4;
            ctx.fillStyle = `rgba(0, 255, 65, ${alpha})`;
            ctx.shadowBlur = 0;
          }

          ctx.font = `${fontSize}px ${getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace'}`;
          ctx.fillText(col.chars[j], col.x, y);
          ctx.shadowBlur = 0;

          // Randomly mutate characters
          if (Math.random() < 0.01) {
            col.chars[j] = CHARS[Math.floor(Math.random() * CHARS.length)];
          }
        }

        col.y += col.speed;

        // Reset when off screen
        if (col.y - col.length * fontSize > canvas.height) {
          col.y = Math.random() * -200 - 100;
          col.speed = Math.random() * 1.5 + 0.5;
        }
      }

      animRef.current = requestAnimationFrame(draw);
    }

    initColumns();
    draw();

    const handleResize = () => initColumns();
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="matrix-rain" />;
}
