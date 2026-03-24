// ═══════════════════════════════════════════════════════════════
//  Matrix Rain — The living background of AGI PRIME
//  Subtle digital rain that shows the system is alive
// ═══════════════════════════════════════════════════════════════

import { useEffect, useRef } from 'react';

const CHARS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';

interface Column {
  x: number;
  y: number;
  speed: number;
  chars: string[];
  length: number;
}

const TARGET_FPS = 20;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

export default function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const columnsRef = useRef<Column[]>([]);
  const animRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const fontRef = useRef<string>('monospace');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const fontSize = 14;
    fontRef.current = `${fontSize}px ${getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace'}`;

    function initColumns() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      const colCount = Math.floor(canvas.width / fontSize);
      const cols: Column[] = [];

      for (let i = 0; i < colCount; i++) {
        if (Math.random() > 0.3) continue;

        const length = Math.floor(Math.random() * 15) + 5;
        const chars: string[] = [];
        for (let j = 0; j < length; j++) {
          chars.push(CHARS[Math.floor(Math.random() * CHARS.length)]);
        }

        cols.push({
          x: i * fontSize,
          y: Math.random() * -canvas.height,
          speed: Math.random() * 1.5 + 0.5,
          chars,
          length,
        });
      }

      columnsRef.current = cols;
    }

    function draw(now: number) {
      animRef.current = requestAnimationFrame(draw);

      if (!canvas || !ctx) return;
      const delta = now - lastFrameRef.current;
      if (delta < FRAME_INTERVAL) return;
      lastFrameRef.current = now - (delta % FRAME_INTERVAL);

      ctx.fillStyle = 'rgba(3, 3, 8, 0.12)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = fontRef.current;

      for (const col of columnsRef.current) {
        for (let j = 0; j < col.chars.length; j++) {
          const y = col.y + j * fontSize;
          if (y < 0 || y > canvas.height) continue;

          const progress = j / col.chars.length;

          if (j === col.chars.length - 1) {
            ctx.fillStyle = 'rgba(0, 255, 65, 0.9)';
            ctx.shadowBlur = 8;
            ctx.shadowColor = 'rgba(0, 255, 65, 0.5)';
          } else {
            const alpha = (1 - progress) * 0.4;
            ctx.fillStyle = `rgba(0, 255, 65, ${alpha})`;
            ctx.shadowBlur = 0;
          }

          ctx.fillText(col.chars[j], col.x, y);
          ctx.shadowBlur = 0;

          if (Math.random() < 0.01) {
            col.chars[j] = CHARS[Math.floor(Math.random() * CHARS.length)];
          }
        }

        col.y += col.speed;

        if (col.y - col.length * fontSize > canvas.height) {
          col.y = Math.random() * -200 - 100;
          col.speed = Math.random() * 1.5 + 0.5;
        }
      }
    }

    initColumns();
    animRef.current = requestAnimationFrame(draw);

    const handleResize = () => initColumns();
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="matrix-rain" />;
}
