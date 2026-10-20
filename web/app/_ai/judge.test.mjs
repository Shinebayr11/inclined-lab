// node --test app/_ai  (Node 22+ TypeScript-ийг шууд уншина)
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyHypothesis, judgeText } from "./judge.ts";

const rubric = [
  { id: "equal", label: "", keywords: ["тэнц"], ask: "" },
  { id: "normal", label: "", keywords: ["нормал"], ask: "" },
];

test("дүгнэлтэд орсон, үгүйсгэсэн, дутуу ойлголтыг ялгана", () => {
  assert.deepEqual(judgeText("Тусах өнцөг ойх өнцөгтэй тэнцүү байна.", rubric), {
    covered: ["equal"], negated: [], missing: ["normal"], score: 0.5,
  });
  assert.deepEqual(judgeText("Өнцгүүд тэнцүү биш", rubric).negated, ["equal"]);
});

test("таамаглалыг ангилна", () => {
  assert.equal(classifyHypothesis("Ойх өнцөг тусахтай ижил байна"), "equal");
  assert.equal(classifyHypothesis("Тусах өнцөг ихсэхэд ойх нь ихэснэ"), "follows");
  assert.equal(classifyHypothesis("Тусах ихэсвэл ойх багасна"), "opposite");
  assert.equal(classifyHypothesis("мэдэхгүй"), "unclear");
});

test("багшийн хураангуй: түгээмэл алдааг тоолно", async () => {
  const { summarize } = await import("./classLog.ts");
  const s = (student, slips, missing) => ({ student, lab: "reflection", at: 0, stepsDone: 8, stepsTotal: 8, slips, meanErr: 1, covered: [], missing, negated: [] });
  const sum = summarize([s("А", 1, ["normal"]), s("Б", 1, ["normal"]), s("В", 0, [])], "reflection", rubric);
  assert.deepEqual(sum.slipStudents, ["А", "Б"]);
  assert.equal(sum.missing.find((m) => m.item.id === "normal").count, 2);
  assert.match(sum.text[0], /2\/3 сурагч өнцгийг толины гадаргуугаас/);
});
