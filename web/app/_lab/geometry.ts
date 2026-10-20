/* ============================================================
   Векторын туслах функцууд ба цацрагийн геометр.
   SVG координат: x баруун тийш, y доош.
   «Чиглэлийн өнцөг» (heading) нь дэлгэц дээр цагийн зүүний
   эсрэг эерэг — математикийн заншилтай ижил.
   ============================================================ */

export type Vec = { x: number; y: number };
export type Rect = { x0: number; y0: number; x1: number; y1: number };

export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
export const len = (a: Vec) => Math.hypot(a.x, a.y);
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const dist = (a: Vec, b: Vec) => len(sub(a, b));
export const norm = (a: Vec): Vec => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
export const toDeg = (r: number) => (r * 180) / Math.PI;
export const toRad = (d: number) => (d * Math.PI) / 180;

/** Өнцгийг (−180°, 180°] завсарт оруулах */
export function wrapDeg(d: number): number {
  const w = ((d % 360) + 360) % 360;
  return w > 180 ? w - 360 : w;
}

/** Радианыг (−π, π] завсарт оруулах */
const wrapRad = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Векторын чиглэлийн өнцөг, градусаар */
export const headingOf = (v: Vec) => toDeg(Math.atan2(-v.y, v.x));

/** Чиглэлийн өнцгөөс нэгж вектор */
export const fromHeading = (deg: number): Vec => ({
  x: Math.cos(toRad(deg)),
  y: -Math.sin(toRad(deg)),
});

/** Векторыг дэлгэц дээр цагийн зүүний эсрэг deg градусаар эргүүлэх */
export function rotate(v: Vec, deg: number): Vec {
  const c = Math.cos(toRad(deg));
  const s = Math.sin(toRad(deg));
  return { x: v.x * c + v.y * s, y: -v.x * s + v.y * c };
}

/* ---------- Шулууны орон нутгийн координат ---------- */

/** along — шулууны дагуух чиглэл, normal — «урд» тал (angle = 0 үед дээш) */
export type Frame = { origin: Vec; along: Vec; normal: Vec };

export function frameAt(origin: Vec, angleDeg: number): Frame {
  return {
    origin,
    along: fromHeading(angleDeg),
    normal: fromHeading(angleDeg + 90),
  };
}

/** Дэлхийн цэгийг шулууны координат руу: x — дагуу, y — нормалийн дагуу */
export function toLocal(f: Frame, p: Vec): Vec {
  const r = sub(p, f.origin);
  return { x: dot(r, f.along), y: dot(r, f.normal) };
}

export function toWorld(f: Frame, l: Vec): Vec {
  return add(f.origin, add(scale(f.along, l.x), scale(f.normal, l.y)));
}

/* ---------- Цацраг ---------- */

/**
 * Цацраг (эхлэл p, нэгж чиглэл d) ба AB хэрчмийн огтлолцол.
 * t — цацрагийн дагуух зай, u ∈ [0, 1] — хэрчмийн дагуух байрлал.
 */
export function raySegment(
  p: Vec,
  d: Vec,
  a: Vec,
  b: Vec,
): { t: number; u: number } | null {
  const e = sub(b, a);
  const denom = cross(d, e);
  if (Math.abs(denom) < 1e-9) return null; // зэрэгцээ
  const w = sub(a, p);
  const t = cross(w, e) / denom;
  const u = cross(w, d) / denom;
  if (t <= 1e-6 || u < 0 || u > 1) return null;
  return { t, u };
}

/** Тусгалын томьёо: r = d − 2(d·n)n */
export const reflect = (d: Vec, n: Vec): Vec => sub(d, scale(n, 2 * dot(d, n)));

/** Цацрагийг тэгш өнцөгтийн хүрээ хүртэл сунгах */
export function rayToRect(p: Vec, d: Vec, r: Rect): Vec {
  let t = Infinity;
  if (d.x > 1e-9) t = Math.min(t, (r.x1 - p.x) / d.x);
  if (d.x < -1e-9) t = Math.min(t, (r.x0 - p.x) / d.x);
  if (d.y > 1e-9) t = Math.min(t, (r.y1 - p.y) / d.y);
  if (d.y < -1e-9) t = Math.min(t, (r.y0 - p.y) / d.y);
  if (!Number.isFinite(t) || t < 0) t = 0;
  return add(p, scale(d, t));
}

/** Хэрчмийг тэгш өнцөгтөөр тайрах (Liang–Barsky). Бүхэлдээ гадна бол null */
export function clipSegment(a: Vec, b: Vec, r: Rect): [Vec, Vec] | null {
  const d = sub(b, a);
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-d.x, a.x - r.x0],
    [d.x, r.x1 - a.x],
    [-d.y, a.y - r.y0],
    [d.y, r.y1 - a.y],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      t0 = Math.max(t0, t);
    } else {
      if (t < t0) return null;
      t1 = Math.min(t1, t);
    }
  }
  return [add(a, scale(d, t0)), add(a, scale(d, t1))];
}

/* ---------- Өнцгийн нум ---------- */

/** Хоёр чиглэлийн хоорондох богино нумын дунд (±π-ийн үсрэлтээс сэргийлнэ) */
export function midAngle(a0: number, a1: number): number {
  return a0 + wrapRad(a1 - a0) / 2;
}

/** Өнцгийн нумыг polyline-аар зурах (SVG arc-ийн sweep асуудлаас зайлсхийнэ) */
export function arcPath(
  center: Vec,
  r: number,
  a0: number,
  a1: number,
  steps = 28,
): string {
  const delta = wrapRad(a1 - a0);
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (delta * i) / steps;
    pts.push(
      `${(center.x + r * Math.cos(a)).toFixed(2)},${(center.y + r * Math.sin(a)).toFixed(2)}`,
    );
  }
  return "M" + pts.join(" L");
}

/* ---------- Бусад ---------- */

/** Тогтвортой псевдо-санамсаргүй тоо [0, 1) — рендер бүрт ижил гарна */
export function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Хоорондоо дор хаяж minGap-аар ялгаатай утгын тоо */
export function countDistinct(values: number[], minGap: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  let count = 0;
  let last = -Infinity;
  for (const v of sorted) {
    if (v - last >= minGap) {
      count++;
      last = v;
    }
  }
  return count;
}
