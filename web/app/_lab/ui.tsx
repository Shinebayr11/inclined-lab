/* ============================================================
   Туслах бүрэлдэхүүн хэсгүүд
   ============================================================ */

export function Card({
  title,
  children,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#16223A] bg-[#0A1120] p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {aside}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function Switch({
  label,
  status,
  checked,
  tone = "amber",
  onChange,
}: {
  label: string;
  status: string;
  checked: boolean;
  tone?: "amber" | "sky";
  onChange: (v: boolean) => void;
}) {
  const on = tone === "amber" ? "bg-amber-400" : "bg-sky-500";
  return (
    <div className="flex items-center justify-between rounded-xl border border-[#1D2A45] bg-[#0B1324] p-4">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-slate-400">{status}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${
          checked ? on : "bg-slate-700"
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
            checked ? "left-7" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm text-slate-300">{label}</p>
      <div
        role="group"
        aria-label={label}
        className="grid gap-1 rounded-xl border border-[#1D2A45] bg-[#0B1324] p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={value === o.value}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`rounded-lg px-2 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-35 ${
              value === o.value
                ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/50"
                : "text-slate-400 hover:bg-[#132038] hover:text-slate-200"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  valueText,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Харуулах утга; null бол утгыг нууна (хэмжилтийг урьдчилан хэлэхгүйн тулд) */
  display: string | null;
  /** Дэлгэц уншигчид зориулсан тайлбар */
  valueText?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-slate-300">{label}</span>
        {display !== null && (
          <span className="font-mono text-sm font-semibold text-amber-300">
            {display}
          </span>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={valueText ?? display ?? undefined}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#1B2740] accent-sky-500"
      />
    </div>
  );
}

export function Check({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-sky-500"
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

const TONES = {
  sky: "text-sky-300",
  orange: "text-orange-300",
  emerald: "text-emerald-300",
  violet: "text-violet-300",
  slate: "text-slate-200",
};

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: keyof typeof TONES;
}) {
  return (
    <div className="rounded-xl border border-[#1D2A45] bg-[#0B1324] p-3">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-xl font-bold ${TONES[tone]}`}>
        {value}
      </p>
    </div>
  );
}

export const primaryBtn =
  "w-full rounded-xl bg-amber-400 px-4 py-3 font-semibold text-slate-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40";
export const secondaryBtn =
  "w-full rounded-xl border border-[#22304D] bg-[#0D1729] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-[#132038] disabled:cursor-not-allowed disabled:opacity-40";
