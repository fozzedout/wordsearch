// A tiny self-contained confetti burst rendered on a full-screen canvas.
// No dependencies — just animates a few hundred falling, spinning rectangles.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
}

const COLORS = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
];

const GRAVITY = 0.18;
const DRAG = 0.995;

export function launchConfetti(canvas: HTMLCanvasElement, durationMs = 2800): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const resize = () => {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);

  const w = window.innerWidth;
  const particles: Particle[] = [];
  const count = 220;

  // Two bursts from the lower corners, fountaining upward and inward so the
  // confetti arcs across the screen instead of exiting at the nearest edge.
  for (let i = 0; i < count; i++) {
    const fromLeft = i % 2 === 0;
    const originX = fromLeft ? w * 0.1 : w * 0.9;
    // Tilt 10°–55° from vertical, toward the centre of the screen.
    const tilt = Math.PI / 18 + Math.random() * (Math.PI / 4);
    const speed = 10 + Math.random() * 9;
    particles.push({
      x: originX,
      y: window.innerHeight + 10,
      vx: Math.sin(tilt) * speed * (fromLeft ? 1 : -1),
      vy: -Math.cos(tilt) * speed - 6,
      size: 6 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.3,
    });
  }

  canvas.classList.remove("hidden");
  const start = performance.now();

  function frame(now: number): void {
    if (!ctx) return;
    const elapsed = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      p.vx *= DRAG;
      p.vy = p.vy * DRAG + GRAVITY;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - elapsed / durationMs);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }

    if (elapsed < durationMs) {
      requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.classList.add("hidden");
      window.removeEventListener("resize", resize);
    }
  }

  requestAnimationFrame(frame);
}
