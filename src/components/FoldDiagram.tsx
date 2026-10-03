// Draws one origami step.
//
// The figures come from `lib/origami.ts` in a 100x100 box, so this file is only
// shapes and arrows — no origami logic lives here.
//
// The drawing conventions are the ones printed in origami books:
//   · dashed line  = where to fold
//   · shaded flap  = the piece that moves
//   · arrow        = which way it goes
//   · ✕ on a fold  = fold away from you (mountain)
//   · a dot at each end  = fold toward you (valley)

import type { CreaseKind, Figure, Pt } from "../lib/origami";

/** Stroke/fill colours read from CSS vars so they follow the app's theme. */
const PAPER = "var(--surface-strong, #f6f1e7)";
const PAPER_EDGE = "rgba(120, 100, 80, 0.55)";
const CREASE = "#f472b6";
const CREASE_MTN = "#38bdf8";
const FLAP = "color-mix(in srgb, var(--accent, #f472b6) 18%, transparent)";
const INK = "var(--text-faint, #8b8172)";

const toPoints = (pts: readonly Pt[]) => pts.map(([x, y]) => `${x},${y}`).join(" ");

/** A gentle arc so the arrow shows the paper travelling, not teleporting. */
function arc(from: Pt, to: Pt, lift = 10): string {
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2 - lift;
  return `M ${from[0]} ${from[1]} Q ${mx} ${my} ${to[0]} ${to[1]}`;
}

function Arrowhead({ at, from }: { at: Pt; from: Pt }) {
  const dx = at[0] - from[0];
  const dy = at[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const size = 5.5;
  return (
    <polygon
      points={`${at[0]},${at[1]} ${at[0] - ux * size + px * size * 0.55},${at[1] - uy * size + py * size * 0.55} ${
        at[0] - ux * size - px * size * 0.55
      },${at[1] - uy * size - py * size * 0.55}`}
      fill={CREASE}
    />
  );
}

function Crease({ a, b, kind }: { a: Pt; b: Pt; kind: CreaseKind }) {
  const colour = kind === "mountain" ? CREASE_MTN : CREASE;
  return (
    <g>
      <line
        x1={a[0]}
        y1={a[1]}
        x2={b[0]}
        y2={b[1]}
        stroke={colour}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeDasharray={kind === "plain" ? "1 5" : "7 4.5"}
      />
      {/* A mountain fold gets the two-dashes "fold away" mark. */}
      {kind === "mountain" && (
        <>
          <line x1={a[0] - 3.4} y1={a[1] - 3.4} x2={a[0] + 3.4} y2={a[1] + 3.4} stroke={colour} strokeWidth={1.8} strokeLinecap="round" />
          <line x1={b[0] - 3.4} y1={b[1] - 3.4} x2={b[0] + 3.4} y2={b[1] + 3.4} stroke={colour} strokeWidth={1.8} strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

export function FoldDiagram({ figure, size = 168 }: { figure: Figure; size?: number }) {
  return (
    <svg
      viewBox="-8 -8 116 116"
      width={size}
      height={size}
      role="img"
      aria-label="Diagram showing the paper shape and the fold to make"
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* the paper */}
      <polygon
        points={toPoints(figure.outline)}
        fill={PAPER}
        stroke={PAPER_EDGE}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />

      {/* the moving piece, shaded so the eye finds it first */}
      {figure.flap && <polygon points={toPoints(figure.flap.points)} fill={FLAP} stroke="none" />}

      {figure.creases?.map((c, i) => (
        <Crease key={i} a={c.a} b={c.b} kind={c.kind ?? "valley"} />
      ))}

      {figure.flap && (
        <g>
          <path d={arc(centreOf(figure.flap.points), figure.flap.to)} fill="none" stroke={CREASE} strokeWidth={2.2} strokeLinecap="round" />
          <Arrowhead at={figure.flap.to} from={centreOf(figure.flap.points)} />
        </g>
      )}

      {figure.arrow && (
        <g>
          <path d={arc(figure.arrow.from, figure.arrow.to)} fill="none" stroke={CREASE} strokeWidth={2.2} strokeLinecap="round" />
          <Arrowhead at={figure.arrow.to} from={figure.arrow.from} />
        </g>
      )}

      {figure.notes?.map((n, i) => (
        <text
          key={i}
          x={n.at[0]}
          y={n.at[1]}
          textAnchor="middle"
          fontSize={9}
          fontWeight={700}
          fill={INK}
        >
          {n.text}
        </text>
      ))}
    </svg>
  );
}

/** Where to hang a fold's arrow: the middle of the piece that moves. */
function centreOf(points: readonly Pt[]): Pt {
  const n = points.length || 1;
  const sx = points.reduce((s, p) => s + p[0], 0) / n;
  const sy = points.reduce((s, p) => s + p[1], 0) / n;
  return [sx, sy];
}