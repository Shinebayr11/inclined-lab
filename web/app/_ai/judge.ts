/* ============================================================
   AI ТУСЛАХ: сурагчийн бичсэн текстийг уншина.
   Хэмжилт, алдаа, оноог код тооцно — AI зөвхөн текст үнэлж, асуулт тавина.
   ============================================================ */

export type RubricItem = {
  id: string;
  /** Багшид харагдах ойлголтын нэр */
  label: string;
  /** Язгуурууд. Олон үгтэй бол дараалсан үгсэд хайна. */
  keywords: string[];
  /** Дутуу үед сурагчид тавих чиглүүлэх асуулт (хариуг хэлэхгүй) */
  ask: string;
};

export type JudgeResult = {
  covered: string[];
  negated: string[];
  missing: string[];
  score: number;
};

/** Fine-tune хийсэн загвар ба түлхүүр үгийн дүрэм хоёулаа энэ интерфейсээр ажиллана. */
export interface TextJudge {
  readonly kind: "keyword" | "model";
  judge(text: string, rubric: readonly RubricItem[]): Promise<JudgeResult>;
}

const NEGATORS = new Set(["биш", "үгүй", "бишээ"]);
const words = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

// shortcut: түлхүүр язгуур + үгүйсгэлийн дүрэм. Сурагчдын дүгнэлт дээр fine-tune хийсэн
// жижиг загвар бэлэн болмогц modelJudge-ээр солино (энэ нь интернэтгүй үеийн нөөц болж үлдэнэ).
export function judgeText(text: string, rubric: readonly RubricItem[]): JudgeResult {
  const w = words(text);
  const covered: string[] = [];
  const negated: string[] = [];
  const missing: string[] = [];
  for (const item of rubric) {
    let found = false;
    let positive = false;
    for (const kw of item.keywords) {
      const parts = words(kw);
      for (let i = 0; i <= w.length - parts.length; i++) {
        if (!parts.every((p, j) => w[i + j].includes(p))) continue;
        found = true;
        const last = w[i + parts.length - 1];
        const neg = last.endsWith("гүй") || last.includes("гүйгээр") || NEGATORS.has(w[i + parts.length] ?? "");
        if (!neg) positive = true;
      }
    }
    (positive ? covered : found ? negated : missing).push(item.id);
  }
  return { covered, negated, missing, score: rubric.length ? covered.length / rubric.length : 0 };
}

export const keywordJudge: TextJudge = {
  kind: "keyword",
  judge: async (text, rubric) => judgeText(text, rubric),
};

/** Сурагчид харуулах хариу: юуг зөв бичсэн, юуг эргэлзээтэй, дараагийн асуулт. */
export function feedback(r: JudgeResult, rubric: readonly RubricItem[]) {
  const by = (id: string) => rubric.find((x) => x.id === id)!;
  return {
    good: r.covered.map((id) => by(id).label),
    doubt: r.negated.map((id) => `«${by(id).label}» гэдгийг үгүйсгэсэн байна. Хэмжилтээ дахин хараарай.`),
    ask: r.missing.length ? by(r.missing[0]).ask : null,
  };
}

/* ---------- Таамаглал (таамаглах → ажиглах → тайлбарлах) ---------- */

export type Hypothesis = "equal" | "follows" | "opposite" | "unclear";

// shortcut: язгуурын дүрэм. Fine-tune загвар энэ ангиллыг мөн хийнэ.
export function classifyHypothesis(text: string): Hypothesis {
  const w = words(text);
  const has = (...stems: string[]) => w.some((x) => stems.some((s) => x.includes(s)));
  if (has("тэнц", "ижил", "адил")) return "equal";
  const up = has("ихэс", "өсө", "томр", "нэмэгд");
  const down = has("багас", "буура", "жижигр");
  if (up && down) return "opposite";
  if (up || has("өөрчлөгд")) return "follows";
  return "unclear";
}
