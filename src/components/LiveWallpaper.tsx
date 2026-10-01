// 🌸 Live wallpapers — a gentle animated backdrop for every theme.
// Pure CSS animations on GPU-friendly properties (transform/opacity), a
// handful of elements each, zero JS per frame. Respects reduced motion.
import { useMemo } from "react";

type Particle = {
  left: number; // %
  size: number; // px
  duration: number; // s
  delay: number; // s (negative = already mid-flight)
  opacity: number;
  drift: number; // px of horizontal sway
};

function rand(seed: number): () => number {
  // Deterministic little LCG so wallpapers don't reshuffle on every re-render.
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function particles(seed: number, count: number, opts: { min: number; max: number; durMin: number; durMax: number; drift: number; opacity?: [number, number] }): Particle[] {
  const r = rand(seed);
  const [oMin, oMax] = opts.opacity ?? [0.45, 0.9];
  return Array.from({ length: count }, () => ({
    left: r() * 100,
    size: opts.min + r() * (opts.max - opts.min),
    duration: opts.durMin + r() * (opts.durMax - opts.durMin),
    delay: -r() * opts.durMax,
    opacity: oMin + r() * (oMax - oMin),
    drift: (r() - 0.5) * 2 * opts.drift,
  }));
}

const FALLBACKS = ["🌸", "❀", "🌸", "✿", "❀", "🌸"];
const FIREWORKS = ["✦", "✧", "·", "✧", "✦", "·"];

export function LiveWallpaper({ theme }: { theme: string }) {
  const petals = useMemo(() => particles(42, 14, { min: 10, max: 20, durMin: 11, durMax: 22, drift: 60 }), []);
  const bubbles = useMemo(() => particles(7, 16, { min: 6, max: 18, durMin: 9, durMax: 20, drift: 30, opacity: [0.25, 0.6] }), []);
  const leaves = useMemo(() => particles(11, 12, { min: 8, max: 16, durMin: 10, durMax: 24, drift: 80 }), []);
  const clouds = useMemo(() => particles(23, 7, { min: 90, max: 220, durMin: 60, durMax: 130, drift: 0, opacity: [0.5, 0.85] }), []);
  const stars = useMemo(() => particles(99, 46, { min: 1.5, max: 3.5, durMin: 2.5, durMax: 6, drift: 0, opacity: [0.25, 1] }), []);
  const sparks = useMemo(() => particles(55, 10, { min: 8, max: 16, durMin: 12, durMax: 26, drift: 90, opacity: [0.3, 0.7] }), []);

  if (theme === "sakura") {
    return (
      <div className="wallpaper" aria-hidden>
        <div className="wp-sun wp-sun-sakura" />
        {petals.map((p, i) => (
          <span
            key={i}
            className="wp-fall"
            style={{
              left: `${p.left}%`,
              fontSize: p.size,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              opacity: p.opacity,
              ["--drift" as string]: `${p.drift}px`,
            }}
          >
            {FALLBACKS[i % FALLBACKS.length]}
          </span>
        ))}
      </div>
    );
  }

  if (theme === "ocean") {
    return (
      <div className="wallpaper" aria-hidden>
        <div className="wp-sun wp-sun-ocean" />
        {bubbles.map((p, i) => (
          <span
            key={i}
            className="wp-bubble"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              ["--drift" as string]: `${p.drift}px`,
            }}
          />
        ))}
        <div className="wp-caustics" />
      </div>
    );
  }

  if (theme === "matcha") {
    return (
      <div className="wallpaper" aria-hidden>
        <div className="wp-sun wp-sun-matcha" />
        {leaves.map((p, i) => (
          <span
            key={i}
            className="wp-fall wp-leaf"
            style={{
              left: `${p.left}%`,
              fontSize: p.size,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              opacity: p.opacity,
              ["--drift" as string]: `${p.drift}px`,
            }}
          >
            {i % 3 === 0 ? "🍃" : "🌿"}
          </span>
        ))}
        {sparks.slice(0, 6).map((p, i) => (
          <span
            key={`s${i}`}
            className="wp-firefly"
            style={{
              left: `${p.left}%`,
              top: `${20 + (i * 13) % 60}%`,
              animationDuration: `${5 + (i % 4)}s`,
              animationDelay: `${-i * 1.7}s`,
            }}
          />
        ))}
      </div>
    );
  }

  if (theme === "dragon") {
    return (
      <div className="wallpaper" aria-hidden>
        {clouds.map((p, i) => (
          <span
            key={i}
            className="wp-cloud"
            style={{
              top: `${6 + ((i * 17) % 55)}%`,
              width: p.size,
              height: p.size * 0.36,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              opacity: p.opacity,
            }}
          />
        ))}
        <span className="wp-balloon" style={{ left: "12%", animationDuration: "34s", animationDelay: "-6s" }}>🎈</span>
        <span className="wp-balloon wp-balloon-b" style={{ left: "78%", animationDuration: "44s", animationDelay: "-20s" }}>🎈</span>
      </div>
    );
  }

  if (theme === "midnight") {
    return (
      <div className="wallpaper wallpaper-midnight" aria-hidden>
        <div className="wp-moon" />
        <div className="wp-shooting-star" />
        {stars.map((p, i) => (
          <span
            key={i}
            className="wp-star"
            style={{
              left: `${p.left}%`,
              top: `${(i * 37) % 92}%`,
              width: p.size,
              height: p.size,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              opacity: p.opacity,
            }}
          />
        ))}
        {sparks.slice(0, 5).map((p, i) => (
          <span
            key={`f${i}`}
            className="wp-fall wp-firefly-dim"
            style={{
              left: `${p.left}%`,
              fontSize: p.size + 4,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              opacity: p.opacity * 0.5,
              ["--drift" as string]: `${p.drift}px`,
            }}
          >
            {FIREWORKS[i % FIREWORKS.length]}
          </span>
        ))}
      </div>
    );
  }

  return null;
}
