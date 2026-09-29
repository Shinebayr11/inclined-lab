"use client";

import {
  type Measured,
  type Trial,
  measuredFromSurface,
  parseAngle,
  slopeThroughOrigin,
} from "./optics";
import { Stat } from "./ui";

/* ---------- Хэмжилтийн хүснэгт ---------- */

type Field = "measI" | "measR";

export function MeasurementTable({
  trials,
  checked,
  autoFill,
  onChange,
  onRemove,
}: {
  trials: Trial[];
  checked: boolean;
  autoFill: boolean;
  onChange: (id: number, field: Field, value: string) => void;
  onRemove: (id: number) => void;
}) {
  if (trials.length === 0) {
    return (
      <p className="py-6 text-center text-sm leading-relaxed text-slate-500">
        Эх үүсвэрийг тохируулаад «Цацрагийг тэмдэглэх» дар. Тэмдэглэсэн цацраг
        бүр энд мөр болж нэмэгдэнэ
        {autoFill
          ? " — тусах, ойх өнцөг нь автоматаар бичигдэнэ."
          : " — протрактороор уншсан өнцгөө бичнэ."}
      </p>
    );
  }
  // Толийг эргүүлж байсан бол мөр бүр аль байрлалд хэмжсэнийг харуулна
  const showMirror = trials.some((t) => t.mirrorAngle !== 0);
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-[#0A1120] text-xs text-slate-500">
          <tr>
            <th className="px-2 py-2 text-left font-medium">№</th>
            {showMirror && <th className="px-2 py-2 text-right font-medium">Толь</th>}
            <th className="px-2 py-2 text-right font-medium">θᵢ</th>
            <th className="px-2 py-2 text-right font-medium">θᵣ</th>
            <th className="px-2 py-2 text-right font-medium">Зөрүү</th>
            {checked && (
              <>
                <th className="px-2 py-2 text-right font-medium">Жинхэнэ</th>
                <th className="px-2 py-2 text-right font-medium">Алдаа</th>
              </>
            )}
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {trials.map((t) => {
            const i = parseAngle(t.measI);
            const r = parseAngle(t.measR);
            const slip =
              (i !== null && measuredFromSurface(i, t.trueI)) ||
              (r !== null && measuredFromSurface(r, t.trueR));
            return (
              <tr key={t.id} className="border-t border-[#16223A]">
                <td className="px-2 py-1.5 text-slate-500">{t.id}</td>
                {showMirror && (
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-xs text-slate-400">
                    {Number.isInteger(t.mirrorAngle) ? t.mirrorAngle : t.mirrorAngle.toFixed(1)}°
                  </td>
                )}
                <td className="px-2 py-1.5 text-right">
                  <AngleInput
                    value={t.measI}
                    tone="text-sky-300"
                    label={`${t.id}-р туршилтын тусах өнцөг`}
                    onChange={(v) => onChange(t.id, "measI", v)}
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <AngleInput
                    value={t.measR}
                    tone="text-orange-300"
                    label={`${t.id}-р туршилтын ойх өнцөг`}
                    onChange={(v) => onChange(t.id, "measR", v)}
                  />
                </td>
                <td
                  className={`px-2 py-1.5 text-right font-mono ${
                    i !== null && r !== null && Math.abs(i - r) > 2
                      ? "text-amber-300"
                      : "text-emerald-400"
                  }`}
                >
                  {i !== null && r !== null ? `${Math.abs(i - r).toFixed(1)}°` : "—"}
                </td>
                {checked && (
                  <>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-xs text-slate-400">
                      {t.trueI.toFixed(1)}° / {t.trueR.toFixed(1)}°
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {i !== null && r !== null ? (
                        <ErrorChip
                          err={Math.max(Math.abs(i - t.trueI), Math.abs(r - t.trueR))}
                          slip={slip}
                        />
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </>
                )}
                <td className="px-1 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(t.id)}
                    aria-label={`${t.id}-р туршилтыг устгах`}
                    className="rounded px-1.5 text-slate-600 transition hover:bg-rose-950/50 hover:text-rose-300"
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AngleInput({
  value,
  label,
  tone,
  onChange,
}: {
  value: string;
  label: string;
  tone: string;
  onChange: (v: string) => void;
}) {
  const invalid = value.trim() !== "" && parseAngle(value) === null;
  return (
    <span className="inline-flex items-center gap-0.5">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        aria-invalid={invalid}
        placeholder="—"
        title={invalid ? "0-ээс 90 хүртэлх тоо оруулна уу" : undefined}
        className={`w-16 rounded-md border bg-[#0B1324] px-2 py-1 text-right font-mono text-sm outline-none placeholder:text-slate-600 focus:border-sky-500 ${
          invalid ? "border-rose-500/70 text-rose-300" : `border-[#22304D] ${tone}`
        }`}
      />
      <span className="text-slate-500">°</span>
    </span>
  );
}

function ErrorChip({ err, slip }: { err: number; slip: boolean }) {
  if (slip) {
    return (
      <span
        title="Өнцгийг толины гадаргуугаас хэмжсэн бололтой. Нормалиас хэмжинэ!"
        className="whitespace-nowrap rounded-full bg-rose-950/60 px-2 py-0.5 text-xs font-semibold text-rose-300"
      >
        ⚠ гадаргуугаас
      </span>
    );
  }
  const cls =
    err <= 1
      ? "bg-emerald-950/60 text-emerald-300"
      : err <= 3
        ? "bg-amber-950/60 text-amber-300"
        : "bg-rose-950/60 text-rose-300";
  return (
    <span className={`rounded-full px-2 py-0.5 font-mono text-xs font-semibold ${cls}`}>
      ±{err.toFixed(1)}°
    </span>
  );
}

/* ---------- Шалгасны дараах дүн ---------- */

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);

export function ResultsSummary({ rows }: { rows: Measured[] }) {
  if (rows.length === 0) return null;
  const k = slopeThroughOrigin(rows);
  const meanDiff = mean(rows.map((r) => Math.abs(r.i - r.r)));
  const meanErr = mean(
    rows.map((r) => (Math.abs(r.i - r.trueI) + Math.abs(r.r - r.trueR)) / 2),
  );
  const slips = rows.filter(
    (r) => measuredFromSurface(r.i, r.trueI) || measuredFromSurface(r.r, r.trueR),
  ).length;
  const onLine = k !== null && Math.abs(k - 1) <= 0.05 && meanDiff <= 2;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Stat label="Налалт k (θᵣ ≈ k·θᵢ)" value={k === null ? "—" : k.toFixed(2)} tone="emerald" />
        <Stat label="Дундаж |θᵢ − θᵣ|" value={`${meanDiff.toFixed(1)}°`} tone="sky" />
        <Stat label="Дундаж алдаа" value={`±${meanErr.toFixed(1)}°`} tone="orange" />
      </div>
      {slips > 0 && (
        <p className="rounded-xl border border-rose-800/50 bg-rose-950/30 p-3 text-xs leading-relaxed text-rose-200">
          ⚠ {slips} мөрөнд өнцгийг толины гадаргуугаас хэмжсэн бололтой (≈ 90° − θ).
          Протракторын 90°-ийн шугамыг нормальтай тааруулж дахин уншаарай.
        </p>
      )}
      <p className="text-xs leading-relaxed text-slate-400">
        {onLine
          ? "Цэгүүд θᵣ = θᵢ шулууны дагуу байна. Хэмжилт бага зэрэг алдаатай ч тусах өнцөг ойх өнцөгтэй тэнцүү гэдэг нь харагдаж байна."
          : "Цэгүүд θᵣ = θᵢ шулуунаас нэлээд холдсон байна. Протракторын төв O цэгт байгаа эсэх, өнцгийг нормалиас хэмжсэн эсэхээ шалгаад дахин хэмжээрэй."}
      </p>
    </div>
  );
}

/* ---------- График ---------- */

export function ScatterChart({
  rows,
  checked,
}: {
  rows: Measured[];
  checked: boolean;
}) {
  const W = 230;
  const H = 236;
  const PL = 30;
  const PR = 12;
  const PT = 22;
  const PB = 34;
  const toX = (v: number) => PL + (v / 90) * (W - PL - PR);
  const toY = (v: number) => H - PB - (v / 90) * (H - PB - PT);
  const k = checked ? slopeThroughOrigin(rows) : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mx-auto w-full max-w-xs"
      role="img"
      aria-label={`Тусах ба ойх өнцгийн график, ${rows.length} цэг`}
    >
      {/* Тор */}
      {[0, 30, 60, 90].map((t) => (
        <g key={t}>
          <line x1={toX(t)} y1={toY(0)} x2={toX(t)} y2={toY(90)} stroke="#16223A" />
          <line x1={toX(0)} y1={toY(t)} x2={toX(90)} y2={toY(t)} stroke="#16223A" />
          <text x={toX(t)} y={toY(0) + 13} textAnchor="middle" fontSize="9" fill="#64748b">
            {t}
          </text>
          <text x={PL - 6} y={toY(t) + 3} textAnchor="end" fontSize="9" fill="#64748b">
            {t}
          </text>
        </g>
      ))}
      <text x={toX(90)} y={H - 4} textAnchor="end" fontSize="10" fill="#7dd3fc">
        θᵢ, °
      </text>
      <text x={PL} y={PT - 9} fontSize="10" fill="#fdba74">
        θᵣ, °
      </text>

      {/* Тэнхлэг */}
      <line x1={toX(0)} y1={toY(0)} x2={toX(90)} y2={toY(0)} stroke="#334155" strokeWidth="1.5" />
      <line x1={toX(0)} y1={toY(0)} x2={toX(0)} y2={toY(90)} stroke="#334155" strokeWidth="1.5" />

      {/* Шалгасны дараа: хуулийн шулуун ба өгөгдлийн шулуун */}
      {checked && (
        <line
          x1={toX(0)}
          y1={toY(0)}
          x2={toX(90)}
          y2={toY(90)}
          stroke="#34D399"
          strokeWidth="1.5"
          strokeDasharray="5 5"
          opacity="0.6"
        />
      )}
      {k !== null && (
        <line
          x1={toX(0)}
          y1={toY(0)}
          x2={toX(Math.min(90, 90 / k))}
          y2={toY(Math.min(90, 90 * k))}
          stroke="#FBBF24"
          strokeWidth="1.2"
          opacity="0.8"
        />
      )}

      {rows.map((r) => (
        <circle
          key={r.id}
          cx={toX(r.i)}
          cy={toY(r.r)}
          r="4.5"
          fill="#FBBF24"
          stroke="#0A1120"
          strokeWidth="1.5"
        />
      ))}

      {rows.length === 0 && (
        <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="10" fill="#475569">
          Хэмжилт алга
        </text>
      )}
    </svg>
  );
}
