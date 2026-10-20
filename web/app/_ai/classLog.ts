import type { Hypothesis, RubricItem } from "./judge";

/* ============================================================
   АНГИЙН БҮРТГЭЛ: сурагчид ээлжлэн туршилт хийхэд хэн юуг алдсаныг
   зөвхөн энэ төхөөрөмжид хадгална (интернэт рүү илгээхгүй).
   ============================================================ */

export type LabId = "reflection" | "incline";

export type Session = {
  student: string;
  lab: LabId;
  at: number;
  stepsDone: number;
  stepsTotal: number;
  /** Өнцгийг гадаргуугаас хэмжсэн мөр (тусгал) */
  slips: number;
  /** Дундаж хэмжилтийн алдаа: тусгалд градус, налууд АҮК-ийн хувь */
  meanErr: number | null;
  hypothesis?: Hypothesis;
  covered: string[];
  missing: string[];
  negated: string[];
};

const KEY = "lab-class-log-v1";
const CURRENT = "lab-current-student";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* хувийн цонх эсвэл дүүрсэн storage — бүртгэлгүйгээр үргэлжилнэ */
  }
}

export const loadLog = () => read<Session[]>(KEY, []);
export const clearLog = () => write(KEY, []);
export const currentStudent = () => read<string>(CURRENT, "");
export const setCurrentStudent = (name: string) => write(CURRENT, name.trim());

/** Нэг сурагчийн нэг туршилтыг шинэчилнэ (дахин хадгалбал сүүлийнх үлдэнэ). */
export function saveSession(s: Session) {
  if (!s.student) return;
  write(KEY, [...loadLog().filter((x) => !(x.student === s.student && x.lab === s.lab)), s]);
}

/** Багшийн самбарын тоо ба хураангуй өгүүлбэрүүд. */
export function summarize(log: readonly Session[], lab: LabId, rubric: readonly RubricItem[]) {
  const rows = log.filter((s) => s.lab === lab);
  const n = rows.length;
  const missing = rubric.map((item) => ({
    item,
    count: rows.filter((s) => s.missing.includes(item.id) || s.negated.includes(item.id)).length,
  }));
  const slipStudents = rows.filter((s) => s.slips > 0).map((s) => s.student);
  const hyp: Record<Hypothesis, number> = { equal: 0, follows: 0, opposite: 0, unclear: 0 };
  for (const s of rows) if (s.hypothesis) hyp[s.hypothesis]++;
  const needHelp = rows
    .filter((s) => s.slips > 0 || s.missing.length + s.negated.length > rubric.length / 2 || s.stepsDone < s.stepsTotal)
    .map((s) => s.student);

  // shortcut: тоон дүнгээс загвараар өгүүлбэр үүсгэнэ. Fine-tune загвар нэмэгдвэл багшид илүү чөлөөтэй тайлбар бичнэ.
  const text: string[] = [];
  if (n === 0) return { n, missing, slipStudents, hyp, needHelp, text };
  const worst = [...missing].sort((a, b) => b.count - a.count)[0];
  if (lab === "reflection" && slipStudents.length / n >= 0.3)
    text.push(`${slipStudents.length}/${n} сурагч өнцгийг толины гадаргуугаас хэмжсэн. Дараагийн хичээлийг нормаль татаж, протракторын 90°-ийн шугамыг тааруулахаас эхлээрэй.`);
  if (worst && worst.count / n >= 0.3)
    text.push(`${worst.count}/${n} сурагчийн дүгнэлтэд «${worst.item.label}» дутуу байна. Ангиараа «${worst.item.ask}» гэж асууж ярилцаарай.`);
  if (hyp.opposite > 0)
    text.push(`${hyp.opposite} сурагч ойх өнцөг багасна гэж таамагласан. Таамаглал ба хэмжилтээ харьцуулж ярилцуулаарай.`);
  if (text.length === 0) text.push("Ихэнх сурагч туршилтыг зөв хийж, дүгнэлтээ бүрэн бичсэн байна.");
  return { n, missing, slipStudents, hyp, needHelp, text };
}
