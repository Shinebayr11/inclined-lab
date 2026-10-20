/* ============================================================
   Лабораторийн ширээ: хэмжээ, тоног төхөөрөмж, цацрагийн тооцоо.
   Тусгалын хуулийг вектороор бодно — өнцгийг хэзээ ч «зохиож»
   харуулдаггүй, зөвхөн хэмжилтийг шалгахад ашиглана.
   ============================================================ */

import {
  type Rect,
  type Vec,
  add,
  clamp,
  clipSegment,
  countDistinct,
  dist,
  dot,
  frameAt,
  fromHeading,
  hash01,
  headingOf,
  raySegment,
  rayToRect,
  reflect,
  rotate,
  scale,
  sub,
  toDeg,
  toLocal,
  toRad,
  toWorld,
  wrapDeg,
} from "./geometry";

/* ---------- Ширээний хэмжээ (SVG нэгж) ---------- */

export const VIEW_W = 900;
export const VIEW_H = 600;
export const SCENE: Rect = { x0: 0, y0: 0, x1: VIEW_W, y1: VIEW_H };

/** Ширээн дээр наасан цагаан цаас (A4, хэвтээ) */
export const PAPER = { x: 36, y: 28, w: 828, h: 544 };
const PAPER_INNER: Rect = {
  x0: PAPER.x + 8,
  y0: PAPER.y + 8,
  x1: PAPER.x + PAPER.w - 8,
  y1: PAPER.y + PAPER.h - 8,
};
/** A4 цаасны өргөн 297 мм */
export const MM_PER_UNIT = 297 / PAPER.w;

/** Тусгалын цэг O — толины төв, цаасан дээр харандаагаар тэмдэглэсэн */
export const O: Vec = { x: 450, y: 432 };
export const MIRROR_LEN = 340;
export const MIRROR_MIN = -30;
export const MIRROR_MAX = 30;

/** Гэрлийн эх үүсвэрийн уртын хагас — ангархай нь урд үзүүрт */
export const SOURCE_HALF = 34;
/** Гурван ангархайн хоорондох зай */
export const SLIT_GAP = 12;
export const ORBIT_MIN = -80;
export const ORBIT_MAX = 80;
const ORBIT_R_MIN = 150;
const ORBIT_R_MAX = 330;

export const PROTRACTOR_R = 160;
/** Нэг цаасан дээр багтах туршилтын тоо */
export const MAX_TRIALS = 12;

/* ---------- Төлөв ---------- */

export type SourceKind = "raybox" | "laser";
export type Surface = "mirror" | "rough";
/** pos — эх үүсвэрийн төв, dir — цацрагийн чиглэл (градус) */
export type LightSource = { pos: Vec; dir: number };
export type ProtractorState = { visible: boolean; pos: Vec; rot: number };

export type Ray = {
  start: Vec;
  /** Толинд тусах цэг; тусахгүй бол null */
  hit: Vec | null;
  side: "front" | "back" | null;
  /** Туссан цацрагийн төгсгөл: тусах цэг эсвэл ширээний ирмэг */
  end: Vec;
  /** Ойсон цацрагуудын төгсгөл (толь — 1, барзгар гадаргуу — олон) */
  reflectedEnds: Vec[];
  reflectedDir: Vec | null;
  thetaI: number | null;
  thetaR: number | null;
};

export type Trial = {
  id: number;
  /** Тэмдэглэх үеийн толины өнцөг — өнцгийг тэр үеийн нормалиас хэмжинэ */
  mirrorAngle: number;
  start: Vec;
  hit: Vec;
  end: Vec;
  trueI: number;
  trueR: number;
  /** Сурагчийн протрактороор уншсан утга (оруулсан текстээрээ) */
  measI: string;
  measR: string;
};

/* ---------- Толь ---------- */

export function mirrorFrame(angle: number) {
  const f = frameAt(O, angle);
  return {
    ...f,
    a: toWorld(f, { x: -MIRROR_LEN / 2, y: 0 }),
    b: toWorld(f, { x: MIRROR_LEN / 2, y: 0 }),
  };
}

/* ---------- Гэрлийн эх үүсвэр ---------- */

export const slitOf = (s: LightSource) =>
  add(s.pos, scale(fromHeading(s.dir), SOURCE_HALF));

export const aimAt = (from: Vec, to: Vec) => headingOf(sub(to, from));

export function aimedSource(pos: Vec): LightSource {
  return { pos, dir: aimAt(pos, O) };
}

/** Нормалиас хэмжсэн байрлалын өнцөг (O цэгийг тойрох) */
export function orbitAngleOf(pos: Vec, mirrorAngle: number): number {
  const l = toLocal(frameAt(O, mirrorAngle), pos);
  return toDeg(Math.atan2(l.x, l.y));
}

export function orbitPosition(angle: number, radius: number, mirrorAngle: number): Vec {
  const a = toRad(angle);
  const r = clamp(radius, ORBIT_R_MIN, ORBIT_R_MAX);
  return toWorld(frameAt(O, mirrorAngle), {
    x: r * Math.sin(a),
    y: r * Math.cos(a),
  });
}

/** Эх үүсвэрийг ширээн дээр үлдээж, толин дээр давхарлуулахгүй байрлуулах */
export function placeSource(pos: Vec, mirrorAngle: number): Vec {
  const M = 44;
  const inScene = (p: Vec) => ({
    x: clamp(p.x, M, VIEW_W - M),
    y: clamp(p.y, M, VIEW_H - M),
  });
  let p = inScene(pos);
  const f = frameAt(O, mirrorAngle);
  const l = toLocal(f, p);
  const GAP = 48;
  if (Math.abs(l.x) < MIRROR_LEN / 2 + GAP && Math.abs(l.y) < GAP) {
    p = inScene(toWorld(f, { x: l.x, y: l.y >= 0 ? GAP : -GAP }));
  }
  return p;
}

/** Эхлэх байрлал: нормалиас 40°, O цэгээс 270 нэгж, O руу чиглэсэн */
export const INITIAL_SOURCE: LightSource = aimedSource(orbitPosition(-40, 270, 0));

/** Протрактор эхэндээ цаасны буланд хэвтэнэ — сурагч өөрөө байрлуулна */
export const INITIAL_PROTRACTOR: ProtractorState = {
  visible: true,
  pos: { x: 716, y: 214 },
  rot: 0,
};

/* ---------- Цацрагийн тооцоо ---------- */

/** Барзгар гадаргуу: жижиг хэсэг бүрийн нормаль ±40° хүртэл хазайна */
const ROUGH_FACET = 3;
const ROUGH_SPREAD = 40;
const ROUGH_FAN = 9;

function traceOne(start: Vec, d: Vec, mirrorAngle: number, surface: Surface): Ray {
  const m = mirrorFrame(mirrorAngle);
  const hit = raySegment(start, d, m.a, m.b);
  const empty = { reflectedEnds: [], reflectedDir: null, thetaI: null, thetaR: null };

  if (!hit) {
    return { start, hit: null, side: null, end: rayToRect(start, d, SCENE), ...empty };
  }
  const p = add(start, scale(d, hit.t));
  // Нормалийн дагуу явж байвал ар талд нь тусна — ар тал будагтай, ойлгохгүй
  if (dot(d, m.normal) >= 0) {
    return { start, hit: p, side: "back", end: p, ...empty };
  }

  const thetaI = toDeg(Math.acos(clamp(dot(scale(d, -1), m.normal), -1, 1)));

  if (surface === "rough") {
    const facet = Math.round((hit.u * MIRROR_LEN) / ROUGH_FACET);
    const ends: Vec[] = [];
    for (let k = 0; k < ROUGH_FAN; k++) {
      const tilt = (hash01(facet * 31 + k * 7.3) - 0.5) * 2 * ROUGH_SPREAD;
      const r = reflect(d, rotate(m.normal, tilt));
      if (dot(r, m.normal) > 0.05) ends.push(rayToRect(p, r, SCENE));
    }
    return {
      start,
      hit: p,
      side: "front",
      end: p,
      reflectedEnds: ends,
      reflectedDir: null,
      thetaI,
      thetaR: null,
    };
  }

  const r = reflect(d, m.normal);
  return {
    start,
    hit: p,
    side: "front",
    end: p,
    reflectedEnds: [rayToRect(p, r, SCENE)],
    reflectedDir: r,
    thetaI,
    thetaR: toDeg(Math.acos(clamp(dot(r, m.normal), -1, 1))),
  };
}

/** Эх үүсвэрээс гарах бүх цацраг. Эхнийх нь голын цацраг */
export function traceBeam(
  source: LightSource,
  mirrorAngle: number,
  count: 1 | 3,
  surface: Surface,
): Ray[] {
  const d = fromHeading(source.dir);
  const side = fromHeading(source.dir + 90);
  const slit = slitOf(source);
  const offsets = count === 1 ? [0] : [0, -SLIT_GAP, SLIT_GAP];
  return offsets.map((o) =>
    traceOne(add(slit, scale(side, o)), d, mirrorAngle, surface),
  );
}

/* ---------- Протрактор ---------- */

/** Төв нь O цэгт, суурь нь толь эсвэл нормальтай давхцсан эсэх */
export function protractorIsSet(p: ProtractorState, mirrorAngle: number): boolean {
  if (!p.visible || dist(p.pos, O) > 1.5) return false;
  const d = ((wrapDeg(p.rot - mirrorAngle) % 90) + 90) % 90;
  return Math.min(d, 90 - d) < 1;
}

/** Төвийг ойр байгаа тусгалын цэгт наалдуулах */
export function snapProtractorPos(pos: Vec, targets: Vec[]): Vec {
  for (const t of targets) if (dist(pos, t) < 10) return t;
  return {
    x: clamp(pos.x, 0, VIEW_W),
    y: clamp(pos.y, 0, VIEW_H),
  };
}

/**
 * Суурийг толь эсвэл нормальтай зэрэгцээ болгож наалдуулах.
 * Толийг эргүүлж байсан бол өмнөх байрлал бүрийн шугамд ч наалдана.
 */
export function snapProtractorRot(rot: number, mirrorAngles: number[]): number {
  for (const m of mirrorAngles) {
    for (let k = -2; k <= 2; k++) {
      const target = wrapDeg(m + k * 90);
      if (Math.abs(wrapDeg(rot - target)) < 2.5) return target;
    }
  }
  return wrapDeg(rot);
}

/* ---------- Хэмжилт ---------- */

/** Голын цацрагийг цаасан дээр харандаагаар тэмдэглэх */
export function makeTrial(id: number, ray: Ray, mirrorAngle: number): Trial | null {
  if (
    !ray.hit ||
    ray.side !== "front" ||
    !ray.reflectedDir ||
    ray.thetaI === null ||
    ray.thetaR === null
  ) {
    return null;
  }
  // Эх үүсвэр цааснаас гадна байвал зөвхөн цаасан дээрх хэсгийг зурна
  const clipped = clipSegment(ray.start, ray.hit, PAPER_INNER);
  const start = clipped ? clipped[0] : ray.hit;
  const edge = rayToRect(ray.hit, ray.reflectedDir, PAPER_INNER);
  const length = Math.min(dist(ray.hit, edge), Math.max(dist(start, ray.hit), 180));
  return {
    id,
    mirrorAngle,
    start,
    hit: ray.hit,
    end: add(ray.hit, scale(ray.reflectedDir, length)),
    trueI: ray.thetaI,
    trueR: ray.thetaR,
    measI: "",
    measR: "",
  };
}

/** Протракторын заалт шиг 0.5° хүртэл тоймлоно */
export function protractorReading(angle: number): string {
  const v = Math.round(angle * 2) / 2;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Хоосон нүдийг протракторын заалтаар бөглөх — сурагчийн бичсэнийг дарахгүй */
export function fillReadings(t: Trial): Trial {
  return {
    ...t,
    measI: t.measI.trim() === "" ? protractorReading(t.trueI) : t.measI,
    measR: t.measR.trim() === "" ? protractorReading(t.trueR) : t.measR,
  };
}

/** «35,5» ч гэж бичиж болно. 0–90°-аас гадуур бол хүчингүй */
export function parseAngle(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 && v <= 90 ? v : null;
}

export type Measured = Trial & { i: number; r: number };

export function measuredTrials(trials: Trial[]): Measured[] {
  const out: Measured[] = [];
  for (const t of trials) {
    const i = parseAngle(t.measI);
    const r = parseAngle(t.measR);
    if (i !== null && r !== null) out.push({ ...t, i, r });
  }
  return out;
}

/** Шалгахад 3°-аас дээш ялгаатай 5 өөр өнцөг хэрэгтэй */
export const REQUIRED_ANGLES = 5;
export const distinctAngles = (rows: Measured[]) =>
  countDistinct(
    rows.map((r) => r.trueI),
    3,
  );

/** Өнцгийг толины гадаргуугаас хэмжсэн бололтой эсэх (хамгийн түгээмэл алдаа) */
export function measuredFromSurface(measured: number, truth: number): boolean {
  return Math.abs(measured - (90 - truth)) <= 2 && Math.abs(measured - truth) > 4;
}

/** Эх цэгийг дайрсан шулууны налалт: r ≈ k·i */
export function slopeThroughOrigin(rows: Measured[]): number | null {
  let sxy = 0;
  let sxx = 0;
  for (const r of rows) {
    sxy += r.i * r.r;
    sxx += r.i * r.i;
  }
  return sxx > 0 ? sxy / sxx : null;
}
