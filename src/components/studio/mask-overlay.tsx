import type { ShareFinding, SharePlace } from "@/lib/share-types";
import { cn } from "@/lib/utils";

type Placed = ShareFinding & { place: SharePlace };

const COLORS = ["var(--electric)", "var(--signal)", "var(--chart-3)", "var(--chart-4)"];

/** The findings SAM placed, on one frame size. Rows from another frame size (an older run) are left out. */
export function placed(findings: ShareFinding[]): Placed[] {
  const all = findings.filter((f): f is Placed => !!f.place);
  const [w, h] = all[0]?.place.frame ?? [0, 0];
  return all.filter((f) => f.place.frame[0] === w && f.place.frame[1] === h);
}

/**
 * SAM's outlines drawn over a picture shown with `object-contain`. The SVG uses the frame SAM saw as its
 * viewBox and the same fit, so each outline lands on its object at any panel size.
 */
export function MaskOverlay({ findings, className }: { findings: ShareFinding[]; className?: string }) {
  const masks = placed(findings);
  if (!masks.length) return null;
  const [w, h] = masks[0].place.frame;
  const kinds = [...new Set(masks.map((m) => m.label))];
  const color = (l: string) => COLORS[kinds.indexOf(l) % COLORS.length];
  // Small enough that a busy road keeps its cars visible under the tags.
  const font = Math.max(8, w / 110);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" aria-hidden className={cn("pointer-events-none absolute inset-0 size-full", className)}>
      {masks.map((m, i) => {
        const [x1, y1, x2] = m.place.box;
        const tag = `${m.label}${m.confidence !== null ? ` ${Math.round(m.confidence * 100)}%` : ""}`;
        return (
          <g key={i} style={{ color: color(m.label) }}>
            {m.place.outline
              ? <path d={m.place.outline} fill="currentColor" fillOpacity={0.22} stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              : <rect x={x1} y={y1} width={x2 - x1} height={m.place.box[3] - y1} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
            <g transform={`translate(${x1} ${Math.max(font * 1.4, y1)})`}>
              <rect y={-font * 1.4} width={tag.length * font * 0.62 + font * 0.6} height={font * 1.4} fill="currentColor" />
              <text x={font * 0.3} y={-font * 0.38} fontSize={font} className="fill-black font-mono">{tag}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
