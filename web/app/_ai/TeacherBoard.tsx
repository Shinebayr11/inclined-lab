"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, Segmented, Stat, secondaryBtn } from "../_lab/ui";
import { type LabId, type Session, clearLog, loadLog, summarize } from "./classLog";
import { HYPOTHESIS_TEXT, INCLINE_RUBRIC, REFLECTION_RUBRIC } from "./rubrics";

/* ============================================================
   БАГШИЙН САМБАР: сурагчид ээлжлэн хийсэн туршилтаас ангийн
   түгээмэл алдааг харуулж, дараагийн хичээлд юуг заахыг санал болгоно.
   ============================================================ */

const RUBRIC = { reflection: REFLECTION_RUBRIC, incline: INCLINE_RUBRIC };

export default function TeacherBoard() {
  const [log, setLog] = useState<Session[]>(() => loadLog());
  const [lab, setLab] = useState<LabId>("reflection");
  const rubric = RUBRIC[lab];
  const sum = summarize(log, lab, rubric);
  const rows = log.filter((s) => s.lab === lab).sort((a, b) => a.at - b.at);

  return (
    <main className="min-h-screen bg-[#050A14] p-4 text-slate-100 antialiased md:p-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-400">Багшийн самбар</p>
            <h1 className="mt-1 text-2xl font-bold">🧑‍🏫 Ангийн туршилтын дүн</h1>
            <p className="mt-1 text-xs text-slate-500">Өгөгдөл зөвхөн энэ төхөөрөмжид хадгалагдана.</p>
          </div>
          <Link href="/" className="rounded-lg px-3 py-1.5 text-sm text-sky-300 hover:bg-[#132038]">
            ← Лаборатори руу
          </Link>
        </header>

        <Segmented
          label="Туршилт"
          value={lab}
          options={[
            { value: "reflection", label: "🔦 Гэрлийн тусгал" },
            { value: "incline", label: "📐 Налуу хавтгай" },
          ]}
          onChange={setLab}
        />

        {sum.n === 0 ? (
          <Card title="Одоохондоо бүртгэл алга">
            <p className="text-sm text-slate-400">
              Сурагч нэрээ оруулаад туршилт хийж, «Хэмжилтээ шалгах», «AI-д шалгуулах» эсвэл «Дараагийн
              сурагч» дарахад энд бүртгэгдэнэ.
            </p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Сурагч" value={String(sum.n)} tone="sky" />
              <Stat label="Тусламж хэрэгтэй" value={String(sum.needHelp.length)} tone="orange" />
              {lab === "reflection" && (
                <Stat label="Гадаргуугаас хэмжсэн" value={String(sum.slipStudents.length)} tone="violet" />
              )}
              <Stat
                label="Дүгнэлт бүрэн"
                value={String(rows.filter((s) => s.missing.length + s.negated.length === 0).length)}
                tone="emerald"
              />
            </div>

            <Card title="🤖 Дараагийн хичээлд">
              <ul className="space-y-2 text-sm leading-relaxed text-slate-200">
                {sum.text.map((t) => (
                  <li key={t} className="flex gap-2">
                    <span className="text-sky-400">▸</span>
                    {t}
                  </li>
                ))}
              </ul>
            </Card>

            <Card title="📊 Дүгнэлтэд дутуу ойлголт">
              <ul className="space-y-3">
                {sum.missing.map(({ item, count }) => (
                  <li key={item.id} className="text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-300">{item.label}</span>
                      <span className="font-mono text-slate-400">
                        {count}/{sum.n}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#16233C]">
                      <div className="h-full rounded-full bg-rose-400/80" style={{ width: `${(count / sum.n) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            {lab === "reflection" && (
              <Card title="🎯 Таамаглал">
                <ul className="space-y-1 text-sm text-slate-300">
                  {(Object.keys(sum.hyp) as (keyof typeof sum.hyp)[]).map((k) => (
                    <li key={k} className="flex justify-between gap-2">
                      <span>{k === "unclear" ? "Тодорхой бус таамаглал" : HYPOTHESIS_TEXT[k].replace("Таны таамаглал: ", "")}</span>
                      <span className="font-mono text-slate-400">{sum.hyp[k]}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card title="👥 Сурагч бүрээр">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th className="p-2">Сурагч</th>
                      <th className="p-2">Алхам</th>
                      {lab === "reflection" && <th className="p-2">Гадаргуугаас</th>}
                      <th className="p-2">Хэмжилтийн алдаа</th>
                      <th className="p-2">Дүгнэлт</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.student} className={`border-t border-[#16223A] ${sum.needHelp.includes(s.student) ? "text-amber-200" : "text-slate-300"}`}>
                        <td className="p-2">{s.student}</td>
                        <td className="p-2 font-mono">
                          {s.stepsDone}/{s.stepsTotal}
                        </td>
                        {lab === "reflection" && <td className="p-2 font-mono">{s.slips}</td>}
                        <td className="p-2 font-mono">
                          {s.meanErr === null ? "—" : lab === "reflection" ? `±${s.meanErr.toFixed(1)}°` : `±${s.meanErr.toFixed(1)}%`}
                        </td>
                        <td className="p-2 font-mono">
                          {s.covered.length}/{rubric.length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500">Шар өнгөтэй сурагчдад тусламж хэрэгтэй байж магадгүй.</p>
            </Card>
          </>
        )}

        <button
          type="button"
          className={secondaryBtn}
          onClick={() => {
            if (!window.confirm("Бүх сурагчийн бүртгэлийг устгах уу?")) return;
            clearLog();
            setLog([]);
          }}
        >
          🗑 Бүртгэл цэвэрлэх
        </button>
      </div>
    </main>
  );
}
