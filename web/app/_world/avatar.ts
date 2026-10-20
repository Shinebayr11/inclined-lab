/* ============================================================
   Сурагчийн дүрийн сонголтууд
   Загварууд: Microsoft Rocketbox, MIT (public/lab3d/CREDITS.txt)
   ============================================================ */

export type KidId = "girl1" | "girl2" | "boy1" | "boy2";
export type Anim = "idle" | "walk" | "run";

export type Avatar = {
  kid: KidId;
  coat: string;
  goggles: boolean;
};

export const KIDS: { value: KidId; label: string; sex: "f" | "m" }[] = [
  { value: "girl1", label: "Сарнай", sex: "f" },
  { value: "girl2", label: "Номин", sex: "f" },
  { value: "boy1", label: "Тэмүүлэн", sex: "m" },
  { value: "boy2", label: "Билгүүн", sex: "m" },
];

export const COATS = [
  { value: "#f4f6f8", label: "Цагаан халат" },
  { value: "#9cc3e6", label: "Цэнхэр халат" },
  { value: "#a9d8b8", label: "Ногоон халат" },
];

export const DEFAULT_AVATAR: Avatar = { kid: "girl1", coat: COATS[0].value, goggles: true };

// Өрөөн доторх байрлал (м) ба харсан чиглэл (рад); хаалганы дэргэдээс эхэлнэ
export type PlayerState = { x: number; z: number; heading: number };
/** Анимацийн тавхайн жинхэнэ хурд (хүүхдийн өндөрт хэмжсэн, м/с): бие ингэж явбал хөл гулсахгүй */
const ANIM_SPEED = { walk: 1.35, run: 2.0 };
/** Хүүхэд том хүнээс түргэн гишгэдэг: анимацийг хурдасгаад хөдлөх хурдыг түүнтэй тааруулна */
export const PACE: Record<Anim, number> = { idle: 1, walk: 1.1, run: 1.3 };
/** Алхах, гүйх хурд, м/с */
export const WALK_SPEED = ANIM_SPEED.walk * PACE.walk;
export const RUN_SPEED = ANIM_SPEED.run * PACE.run;
/** Ширээний дэргэд багажийг дагаж хажуу тийш алхах хурд, м/с */
export const STEP_SPEED = 0.5;
/** Ширээний дэргэд d метр шилжих хугацаа (мс): холоос алхана, ойрхон бол хажуу тийш гишгэнэ */
export const travelMs = (d: number) => (d > 0.5 ? d / WALK_SPEED + 0.6 : d / STEP_SPEED + 0.25) * 1000;
export const START: PlayerState = { x: 5.6, z: 3.6, heading: -Math.PI / 2 };

export const kidUrl = (k: KidId) => `/lab3d/kid_${k}.glb`;
export const animUrl = (k: KidId, a: Anim) =>
  `/lab3d/anim_${KIDS.find((x) => x.value === k)?.sex ?? "f"}_${a}.json`;

const KEY = "inclined-lab.avatar.v2";

// Хөтөч хадгалахыг хориглосон үед ч ажиллана
export function loadAvatar(): Avatar | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const a = { ...DEFAULT_AVATAR, ...JSON.parse(raw) } as Avatar;
    return KIDS.some((k) => k.value === a.kid) ? a : null;
  } catch {
    return null;
  }
}

export function saveAvatar(a: Avatar) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {}
}
