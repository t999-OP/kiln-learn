// Tiny SVG plotting kit shared by the lesson player (step graphs) and the widgets.
// The widget sandbox gets a type-stripped copy of this file (see src/lib/server/widget-host.ts).
//   const p = makePlot(svg, { x: [-3, 3], y: [-1, 9] });
//   p.grid(); p.curve(compile("x^2")); p.dyn.point(1, 1);
import { compile } from "../core/mathexpr.ts";

type Fx = (x: number) => number;
type Range = [number, number];

const NS = "http://www.w3.org/2000/svg";
export const COLORS = ["var(--blue, #1c7ed6)", "var(--accent, #e8590c)", "var(--good, #2f9e44)", "var(--agent, #6741d9)"];

function niceStep(range: number, target = 8) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * mag).find((s) => raw <= s)!;
}

const fmtTick = (v: number) => String(Math.abs(v) < 1e-10 ? 0 : Number(v.toPrecision(4)));

export interface PlotOptions {
  x: Range;
  y: Range;
  width?: number;
  height?: number;
  pad?: number;
  top?: number;
}

export function makePlot(svg: SVGSVGElement, { x, y, width = 560, height = 300, pad = 30, top = 0 }: PlotOptions) {
  const [x0, x1] = x;
  const [y0, y1] = y;
  svg.setAttribute("viewBox", svg.getAttribute("viewBox") || `0 0 ${width} ${height}`);
  const sx = (v: number) => pad + ((v - x0) / (x1 - x0)) * (width - 2 * pad);
  const sy = (v: number) => top + height - pad - ((v - y0) / (y1 - y0)) * (height - 2 * pad);
  const clipId = `clip${Math.random().toString(36).slice(2, 8)}`;
  const clip = `url(#${clipId})`;

  const el = (parent: Element, tag: string, attrs: Record<string, string | number> = {}, style = "") => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, String(attrs[k]));
    if (style) e.setAttribute("style", style);
    parent.append(e);
    return e;
  };
  const defs = el(svg, "defs");
  el(el(defs, "clipPath", { id: clipId }), "rect", { x: pad, y: top + pad - 6, width: width - 2 * pad, height: height - 2 * pad + 12 });
  const base = el(svg, "g");
  const dynG = el(svg, "g");

  const api = (g: Element) => ({
    line(xa: number, ya: number, xb: number, yb: number, { color = "var(--muted, #888)", w = 2, dash = "", clipped = true } = {}) {
      return el(
        g,
        "line",
        { x1: sx(xa), y1: sy(ya), x2: sx(xb), y2: sy(yb), ...(clipped ? { "clip-path": clip } : {}) },
        `stroke:${color};stroke-width:${w};stroke-linecap:round;${dash ? `stroke-dasharray:${dash}` : ""}`,
      );
    },
    point(px: number, py: number, { color = "var(--accent, #e8590c)", r = 6, hollow = false } = {}) {
      return el(
        g,
        "circle",
        { cx: sx(px), cy: sy(py), r, "clip-path": clip },
        hollow ? `fill:var(--bg, #fff);stroke:${color};stroke-width:2.5` : `fill:${color};stroke:var(--bg, #fff);stroke-width:2`,
      );
    },
    rect(xa: number, ya: number, xb: number, yb: number, { fill = "var(--blue, #1c7ed6)", opacity = 0.25, stroke = "" } = {}) {
      const [X0, X1] = [sx(Math.min(xa, xb)), sx(Math.max(xa, xb))];
      const [Y0, Y1] = [sy(Math.max(ya, yb)), sy(Math.min(ya, yb))];
      return el(
        g,
        "rect",
        { x: X0, y: Y0, width: X1 - X0, height: Y1 - Y0, "clip-path": clip },
        `fill:${fill};fill-opacity:${opacity};${stroke ? `stroke:${stroke};stroke-width:1` : ""}`,
      );
    },
    text(
      px: number,
      py: number,
      str: string,
      { anchor = "middle", color = "var(--muted, #888)", size = 13, dy = 0, dx = 0, weight = 700 } = {},
    ) {
      const t = el(
        g,
        "text",
        { x: sx(px) + dx, y: sy(py) + dy, "text-anchor": anchor },
        `fill:${color};font-size:${size}px;font-weight:${weight};font-family:inherit`,
      );
      t.textContent = str;
      return t;
    },
    /** Plots f, breaking the path at discontinuities and far outside the y range. */
    curve(f: Fx | string, { color = COLORS[0], w = 3, from = x0, to = x1, samples = 500 } = {}) {
      const fn: Fx = typeof f === "string" ? (compile(f) as Fx) : f;
      let d = "";
      let pen = false;
      let prev: number | null = null;
      const span = y1 - y0;
      for (let i = 0; i <= samples; i++) {
        const xv = from + ((to - from) * i) / samples;
        const yv = fn(xv);
        const ok = Number.isFinite(yv) && yv > y0 - span * 2 && yv < y1 + span * 2;
        if (ok && pen && prev !== null && Math.abs(yv - prev) > span) pen = false;
        if (ok) d += `${pen ? "L" : "M"}${sx(xv).toFixed(1)},${sy(yv).toFixed(1)}`;
        pen = ok;
        prev = ok ? yv : null;
      }
      return el(
        g,
        "path",
        { d, "clip-path": clip },
        `fill:none;stroke:${color};stroke-width:${w};stroke-linejoin:round;stroke-linecap:round`,
      );
    },
    clear() {
      g.replaceChildren();
    },
  });

  const plot = {
    ...api(base),
    dyn: api(dynG),
    sx,
    sy,
    grid({ labels = true } = {}) {
      const xs = niceStep(x1 - x0);
      const ys = niceStep(y1 - y0, 6);
      for (let v = Math.ceil(x0 / xs) * xs; v <= x1 + 1e-9; v += xs) {
        plot.line(v, y0, v, y1, { color: "var(--line, #ddd)", w: Math.abs(v) < 1e-9 ? 2 : 1, clipped: false });
        if (labels && Math.abs(v) > 1e-9) plot.text(v, Math.min(Math.max(0, y0), y1), fmtTick(v), { dy: 16, size: 11 });
      }
      for (let v = Math.ceil(y0 / ys) * ys; v <= y1 + 1e-9; v += ys) {
        plot.line(x0, v, x1, v, { color: "var(--line, #ddd)", w: Math.abs(v) < 1e-9 ? 2 : 1, clipped: false });
        if (labels && Math.abs(v) > 1e-9)
          // Outside the left edge, so labels never collide with curves or points near the y axis.
          plot.text(x0, v, fmtTick(v), { anchor: "end", dx: -6, dy: 4, size: 11 });
      }
      return plot;
    },
  };
  return plot;
}

/** Picks a y range that shows the interesting part of the curves. */
export function autoRange(fns: Fx[], [x0, x1]: Range): Range {
  const ys: number[] = [];
  for (const f of fns)
    for (let i = 0; i <= 200; i++) {
      const v = f(x0 + ((x1 - x0) * i) / 200);
      if (Number.isFinite(v)) ys.push(v);
    }
  if (!ys.length) return [-1, 1];
  ys.sort((a, b) => a - b);
  let lo = ys[Math.floor(ys.length * 0.03)];
  let hi = ys[Math.ceil(ys.length * 0.97) - 1];
  if (hi - lo < 1e-6) ((lo -= 1), (hi += 1));
  const padY = (hi - lo) * 0.12;
  return [Math.min(lo - padY, lo > 0 ? -padY : lo - padY), Math.max(hi + padY, hi < 0 ? padY : hi + padY)];
}

export interface GraphSpec {
  fns: string[];
  x?: Range;
  y?: Range;
  points?: Range[];
  holes?: Range[];
}

/** Renders a static step graph. */
export function renderGraph(svg: SVGSVGElement, spec: GraphSpec) {
  const fns = (spec.fns || []).map((s) => compile(s) as Fx);
  const x = spec.x || [-5, 5];
  const y = spec.y || autoRange(fns, x);
  const p = makePlot(svg, { x, y, height: 260 });
  p.grid();
  fns.forEach((f, i) => p.curve(f, { color: COLORS[i % COLORS.length] }));
  for (const [px, py] of spec.points || []) p.point(px, py, { color: "var(--accent, #e8590c)" });
  for (const [px, py] of spec.holes || []) p.point(px, py, { hollow: true, color: COLORS[0] });
  return p;
}
