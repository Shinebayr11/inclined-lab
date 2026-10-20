/* ============================================================
   НАЛУУ ХАВТГАЙН АҮК
   Брусыг динамометрээр налуугаар жигд татна:
   F = P(sinα + μ·cosα), А_ашиг = P·h, А_бүрэн = F·l, η = А_ашиг / А_бүрэн
   ============================================================ */

import type { JudgeResult } from "../_ai/judge";

export const L = 0.8; // налуугийн урт, м
export const G = 9.8; // Н/кг
export const H_MIN = 0.1;
export const H_MAX = 0.4;
export const F_MAX = 4; // динамометрийн хязгаар, Н
export const WEIGH_MS = 2200;
export const PULL_MS = 5000;
export const REQUIRED_HEIGHTS = 3;

export type SurfaceKind = "wood" | "glass" | "sand";
export const SURFACES: { value: SurfaceKind; label: string; mu: number }[] = [
  { value: "wood", label: "Мод", mu: 0.3 },
  { value: "glass", label: "Шил", mu: 0.12 },
  { value: "sand", label: "Зүлгүүр", mu: 0.5 },
];
export const MASSES = [0.1, 0.2, 0.3];

export type InclineRow = {
  id: number;
  h: number;
  mass: number;
  surface: SurfaceKind;
  /** Сурагчийн динамометрээс уншсан утга (текстээр) */
  P: string;
  F: string;
  trueP: number;
  trueF: number;
};

export type Incline = {
  h: number;
  mass: number;
  surface: SurfaceKind;
  action: "idle" | "weigh" | "pull";
  actionAt: number;
  /** Аль жинг сүүлд хэмжсэн бэ (кг) — өөр ачаа тавибал дахин хэмжинэ */
  weighedMass: number | null;
  /** Динамометрээс уншиж бичсэн утга (хүснэгтэд орохоос өмнө) */
  draftP: string;
  draftF: string;
  rows: InclineRow[];
  nextId: number;
  autoFill: boolean;
  checked: boolean;
  /** Сурагчийн дүгнэлт (AI уншина) */
  conclusion: string;
  /** Сүүлд AI-д шалгуулсан дүн — дараагийн сурагч руу шилжихэд бүртгэлд орно */
  judged: JudgeResult | null;
};

export const INITIAL_INCLINE: Incline = {
  h: 0.2,
  mass: 0.2,
  surface: "wood",
  action: "idle",
  actionAt: 0,
  weighedMass: null,
  draftP: "",
  draftF: "",
  rows: [],
  nextId: 1,
  autoFill: false,
  checked: false,
  conclusion: "",
  judged: null,
};

export type SetIncline = (fn: (s: Incline) => Incline) => void;

export const muOf = (s: SurfaceKind) => SURFACES.find((x) => x.value === s)?.mu ?? 0.3;
export const weightOf = (m: number) => m * G;
export const angleOf = (h: number) => Math.asin(h / L);

export function pullForce(h: number, mass: number, surface: SurfaceKind) {
  const a = angleOf(h);
  return weightOf(mass) * (Math.sin(a) + muOf(surface) * Math.cos(a));
}

/** Динамометрийн хуваарь 0.1 Н — хагас хуваарь хүртэл тоймлоно */
export const readOff = (v: number) => (Math.round(v * 20) / 20).toFixed(2);

export function parseNum(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** η (0..1); утга дутуу бол null */
export function efficiency(r: InclineRow): number | null {
  const P = parseNum(r.P);
  const F = parseNum(r.F);
  return P === null || F === null ? null : (P * r.h) / (F * L);
}

/** Үйлдлийн явц 0..1 */
export function progress(s: Incline, now: number) {
  const ms = s.action === "weigh" ? WEIGH_MS : s.action === "pull" ? PULL_MS : 1;
  return s.action === "idle" ? 1 : Math.min(1, (now - s.actionAt) / ms);
}

/** Динамометрийн зүүний заалт (Н) тухайн агшинд */
export function gaugeAt(s: Incline, now: number): number {
  const t = (now - s.actionAt) / 1000;
  const p = progress(s, now);
  if (s.action === "weigh") {
    // Дүүжлэхэд пүрш хэлбэлзээд P дээр тогтоно
    const P = weightOf(s.mass);
    return Math.max(0, P * (1 - Math.exp(-t * 3) * Math.cos(t * 11)));
  }
  if (s.action === "pull") {
    // Жигд татахад зүү бага зэрэг чичирнэ; дээр нь барьж байхад F дээр тогтоно
    const F = pullForce(s.h, s.mass, s.surface);
    if (p >= 1) return F;
    const ramp = Math.min(1, t * 4);
    return Math.max(0, F * ramp + 0.03 * Math.sin(t * 13) + 0.02 * Math.sin(t * 29));
  }
  return 0;
}

// Өөрийгөө шалгах: стандарт тохиргоонд АҮК 40–60% орчим байх ёстой
console.assert(
  Math.abs(efficiency({ id: 0, h: 0.2, mass: 0.2, surface: "wood", P: "1.96", F: readOff(pullForce(0.2, 0.2, "wood")), trueP: 0, trueF: 0 })! - 0.46) < 0.02,
  "incline: η self-check",
);
