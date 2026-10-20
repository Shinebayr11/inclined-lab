"use client";

import Link from "next/link";
import { useState } from "react";
import { secondaryBtn } from "../_lab/ui";
import { currentStudent, setCurrentStudent } from "./classLog";
import { type JudgeResult, type RubricItem, feedback, keywordJudge } from "./judge";

/** Сурагчийн бичсэн текстийг AI-аар шалгаж, хариуг хэлэхгүйгээр асуултаар чиглүүлнэ. */
export function AiCheck({
  text,
  rubric,
  onResult,
}: {
  text: string;
  rubric: readonly RubricItem[];
  onResult: (r: JudgeResult) => void;
}) {
  const [res, setRes] = useState<{ text: string; r: JudgeResult } | null>(null);
  // Текстээ засвал хуучин үнэлгээг нууна
  const shown = res && res.text === text ? res.r : null;
  const fb = shown ? feedback(shown, rubric) : null;

  async function check() {
    const r = await keywordJudge.judge(text, rubric);
    setRes({ text, r });
    onResult(r);
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={check} disabled={text.trim().length < 10} className={secondaryBtn}>
        🤖 AI-д шалгуулах
      </button>
      {fb && shown && (
        <div aria-live="polite" className="space-y-1.5 rounded-xl border border-sky-900/60 bg-sky-950/30 p-3 text-xs leading-relaxed">
          {shown.score === 1 && <p className="font-semibold text-emerald-300">Бүрэн дүгнэлт! Бүх гол ойлголтыг бичсэн байна.</p>}
          {fb.good.map((g) => (
            <p key={g} className="text-emerald-300">✓ {g}</p>
          ))}
          {fb.doubt.map((d) => (
            <p key={d} className="text-amber-300">⚠ {d}</p>
          ))}
          {fb.ask && <p className="text-sky-200">❓ {fb.ask}</p>}
          <p className="text-[10px] text-slate-500">
            AI зөвхөн бичсэн текстийг уншина. Хэмжилтийн алдааг код тооцно.
          </p>
        </div>
      )}
    </div>
  );
}

/** Ээлжлэн туршилт хийх сурагчийн нэр ба багшийн самбар руу холбоос. */
export function StudentBar({ onNext }: { onNext: () => void }) {
  const [name, setName] = useState(() => (typeof window === "undefined" ? "" : currentStudent()));
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="flex items-center gap-2 text-slate-400">
        👤 Сурагч
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setCurrentStudent(e.target.value);
          }}
          placeholder="Нэр эсвэл дугаар"
          className="w-36 rounded-lg border border-[#22304D] bg-[#0B1324] px-2 py-1 text-slate-100 outline-none focus:border-sky-600"
        />
      </label>
      <button
        type="button"
        disabled={!name.trim()}
        onClick={() => {
          onNext();
          setName("");
          setCurrentStudent("");
        }}
        className="rounded-lg border border-[#22304D] px-3 py-1 text-slate-300 transition hover:bg-[#132038] disabled:opacity-40"
      >
        Дараагийн сурагч →
      </button>
      <Link href="/teacher" className="rounded-lg px-3 py-1 text-sky-300 transition hover:bg-[#132038]">
        🧑‍🏫 Багшийн самбар
      </Link>
    </div>
  );
}
