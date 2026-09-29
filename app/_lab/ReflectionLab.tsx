"use client";

import { useMemo, useState } from "react";
import { clamp, dist, frameAt, toWorld } from "./geometry";
import { LESSON, type StepId } from "./lesson";
import {
  type LightSource,
  type ProtractorState,
  type SourceKind,
  type Surface,
  type Trial,
  INITIAL_PROTRACTOR,
  INITIAL_SOURCE,
  MAX_TRIALS,
  MIRROR_MAX,
  MIRROR_MIN,
  MM_PER_UNIT,
  O,
  ORBIT_MAX,
  ORBIT_MIN,
  PROTRACTOR_R,
  REQUIRED_ANGLES,
  VIEW_H,
  VIEW_W,
  aimedSource,
  distinctAngles,
  fillReadings,
  makeTrial,
  measuredTrials,
  orbitAngleOf,
  orbitPosition,
  placeSource,
  protractorIsSet,
  traceBeam,
} from "./optics";
import { MeasurementTable, ResultsSummary, ScatterChart } from "./Results";
import Scene from "./Scene";
import {
  Card,
  Check,
  Segmented,
  Slider,
  Stat,
  Switch,
  primaryBtn,
  secondaryBtn,
} from "./ui";

/* ============================================================
   ГЭРЛИЙН ТУСГАЛЫН ЛАБОРАТОРИ
   Жинхэнэ лабораторийн дарааллаар: өрөөг харанхуйлж цацрагийг
   цаасан дээр тэмдэглээд, протрактороор өөрөө хэмжинэ.
   ============================================================ */

type Tab = "content" | "terms" | "formulas";
type Zoom = 1 | 2 | 3;

const fmtDeg = (a: number) => `${Number.isInteger(a) ? a : a.toFixed(1)}°`;

export default function ReflectionLab() {
  const [sourceOn, setSourceOn] = useState(true);
  const [roomLight, setRoomLight] = useState(true);
  const [everDark, setEverDark] = useState(false);
  const [sourceKind, setSourceKind] = useState<SourceKind>("raybox");
  const [rayCount, setRayCount] = useState<1 | 3>(1);
  const [surface, setSurface] = useState<Surface>("mirror");
  const [aimLocked, setAimLocked] = useState(true);
  const [source, setSource] = useState<LightSource>(INITIAL_SOURCE);
  const [mirrorAngle, setMirrorAngle] = useState(0);
  const [protractor, setProtractor] = useState<ProtractorState>(INITIAL_PROTRACTOR);
  const [protractorPlaced, setProtractorPlaced] = useState(false);
  const [zoom, setZoom] = useState<Zoom>(1);
  const [zoomCenter, setZoomCenter] = useState(O);
  const [helper, setHelper] = useState(false);
  const [autoFill, setAutoFill] = useState(true);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [nextId, setNextId] = useState(1);
  const [checked, setChecked] = useState(false);
  const [hypothesis, setHypothesis] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [tab, setTab] = useState<Tab>("content");

  /* ---------- Цацраг ---------- */
  const count = sourceKind === "laser" ? 1 : rayCount;
  const rays = useMemo(
    () => (sourceOn ? traceBeam(source, mirrorAngle, count, surface) : []),
    [sourceOn, source, mirrorAngle, count, surface],
  );
  const main = rays[0] ?? null;
  const hitFront = main && main.side === "front" && main.hit ? main.hit : null;
  const offO = hitFront ? dist(hitFront, O) * MM_PER_UNIT : null;

  /* ---------- Хэмжилт ---------- */
  const measured = useMemo(() => measuredTrials(trials), [trials]);
  const distinct = distinctAngles(measured);
  const canCheck = distinct >= REQUIRED_ANGLES;

  // Толь эргэсэн бол ижил θᵢ-тай ч өөр туршилт гэж тооцно
  const duplicate =
    main?.hit &&
    main.thetaI !== null &&
    trials.some(
      (t) =>
        Math.abs(t.trueI - main.thetaI!) < 0.25 &&
        Math.abs(t.mirrorAngle - mirrorAngle) < 0.25 &&
        dist(t.hit, main.hit!) < 2,
    );
  // Өөр өөр толины байрлалд тэмдэглэсэн туршилт байгаа эсэх
  const mixedMirror = trials.some((t) => Math.abs(t.mirrorAngle - mirrorAngle) >= 0.25);

  const traceBlock = !sourceOn
    ? "Эх үүсвэрээ асаа."
    : surface === "rough"
      ? "Барзгар гадаргуу дээр ойсон гэрэл олон зүг тардаг тул нэг цацрагийг тэмдэглэх боломжгүй."
      : !main?.hit
        ? "Цацраг толинд тусахгүй байна — эх үүсвэрийг толь руу чиглүүл."
        : main.side === "back"
          ? "Цацраг толины ар талд тусаж байна. Ар тал нь будагтай тул гэрэл ойхгүй."
          : trials.length >= MAX_TRIALS
            ? "Цаас дүүрлээ — «Шинэ цаас» дарна уу."
            : duplicate
              ? "Энэ цацрагийг аль хэдийн тэмдэглэсэн. Эх үүсвэрийг хөдөлгөөд дахин тэмдэглэ."
              : null;

  const done: Record<StepId, boolean> = {
    dark: everDark,
    hypothesis: hypothesis.trim() !== "",
    aim: (offO !== null && offO < 1) || trials.some((t) => dist(t.hit, O) < 3),
    trace: trials.length > 0,
    protractor: protractorPlaced,
    measure: measured.length > 0,
    repeat: distinct >= REQUIRED_ANGLES,
    conclude: checked && conclusion.trim() !== "",
  };
  const doneCount = LESSON.steps.filter((s) => done[s.id]).length;

  /* ---------- Харах талбай (томруулалт) ---------- */
  const vw = VIEW_W / zoom;
  const vh = VIEW_H / zoom;
  const vx = clamp(zoomCenter.x - vw / 2, 0, VIEW_W - vw);
  const vy = clamp(zoomCenter.y - vh / 2, 0, VIEW_H - vh);
  const viewBox = `${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`;

  const orbit = clamp(
    Math.round(orbitAngleOf(source.pos, mirrorAngle)),
    ORBIT_MIN,
    ORBIT_MAX,
  );

  /* ---------- Үйлдлүүд ---------- */
  function changeRoomLight(on: boolean) {
    setRoomLight(on);
    if (!on) setEverDark(true);
  }

  function changeProtractor(p: ProtractorState) {
    setProtractor(p);
    if (protractorIsSet(p, mirrorAngle)) setProtractorPlaced(true);
  }

  function changeMirror(angle: number) {
    setMirrorAngle(angle);
    // Эх үүсвэр хөдлөхгүй, зөвхөн эргэсэн толинд давхарлахаас сэргийлнэ
    setSource((s) => {
      const pos = placeSource(s.pos, angle);
      return aimLocked ? aimedSource(pos) : { ...s, pos };
    });
  }

  function changeOrbit(angle: number) {
    const pos = orbitPosition(angle, dist(source.pos, O), mirrorAngle);
    setSource(aimedSource(placeSource(pos, mirrorAngle)));
  }

  function changeAimLock(locked: boolean) {
    setAimLocked(locked);
    if (locked) setSource((s) => aimedSource(s.pos));
  }

  function changeZoom(z: Zoom) {
    setZoom(z);
    // Протракторыг O-гийн ойролцоо тавьсан бол түүний хуваарийг,
    // эс бөгөөс тусгалын цэгийн урд талыг томруулна
    setZoomCenter(
      protractor.visible && dist(protractor.pos, O) < 200
        ? toWorld(frameAt(protractor.pos, protractor.rot), { x: 0, y: PROTRACTOR_R * 0.45 })
        : toWorld(frameAt(hitFront ?? O, mirrorAngle), { x: 0, y: 70 }),
    );
  }

  function placeProtractorAtO() {
    changeProtractor({ visible: true, pos: O, rot: mirrorAngle });
  }

  function traceRay() {
    if (traceBlock || !main) return;
    const t = makeTrial(nextId, main, mirrorAngle);
    if (!t) return;
    setTrials((ts) => [...ts, autoFill ? fillReadings(t) : t]);
    setNextId((n) => n + 1);
  }

  function changeAutoFill(on: boolean) {
    setAutoFill(on);
    // Асаахад өмнө нь хоосон үлдсэн мөрүүдийг ч бөглөнө
    if (on) setTrials((ts) => ts.map(fillReadings));
  }

  function updateTrial(id: number, field: "measI" | "measR", value: string) {
    setTrials((ts) => ts.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  }

  function newSheet() {
    setTrials([]);
    setNextId(1);
    setChecked(false);
  }

  function resetAll() {
    newSheet();
    setSourceOn(true);
    setRoomLight(true);
    setEverDark(false);
    setSourceKind("raybox");
    setRayCount(1);
    setSurface("mirror");
    setAimLocked(true);
    setSource(INITIAL_SOURCE);
    setMirrorAngle(0);
    setProtractor(INITIAL_PROTRACTOR);
    setProtractorPlaced(false);
    setZoom(1);
    setZoomCenter(O);
    setHelper(false);
    setAutoFill(true);
    setHypothesis("");
    setConclusion("");
  }

  const beamStatus = !sourceOn
    ? "Эх үүсвэр унтраалттай"
    : !main?.hit
      ? "Цацраг толинд тусахгүй байна"
      : main.side === "back"
        ? "Цацраг толины ар талд тусаж байна"
        : surface === "rough"
          ? "Ойсон гэрэл олон зүг тарж байна"
          : "Цацраг толинд тусаж ойж байна";

  return (
    <main className="min-h-screen bg-[#050A14] text-slate-100 antialiased">
      {/* ---------- Толгой ---------- */}
      <header className="border-b border-[#16223A] bg-gradient-to-b from-[#081124] to-[#050A14] px-6 py-7 md:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-400">
          Физикийн виртуал лаборатори
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
          🔦 {LESSON.topic}
        </h1>
        <p className="mt-1 text-sm text-slate-400">{LESSON.subtitle}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-[#22304D] bg-[#0C1526] px-3 py-1 text-slate-300">
            {LESSON.grade}
          </span>
          <span className="rounded-full border border-[#22304D] bg-[#0C1526] px-3 py-1 text-slate-300">
            {LESSON.duration}
          </span>
          <span className="rounded-full border border-emerald-800/60 bg-emerald-950/40 px-3 py-1 text-emerald-300">
            Бодит лабораторийн дарааллаар
          </span>
        </div>
      </header>

      {/* ---------- Гурван багана ---------- */}
      <div className="grid grid-cols-1 gap-5 p-4 md:p-6 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
        {/* ===== ЗҮҮН: тохиргоо ===== */}
        <aside className="space-y-4">
          <Card title="⚙️ Туршилтын тохиргоо">
            <Switch
              label="🔦 Гэрлийн эх үүсвэр"
              status={sourceOn ? "Асаалттай" : "Унтраалттай"}
              checked={sourceOn}
              onChange={setSourceOn}
            />
            <Switch
              label="💡 Өрөөний гэрэл"
              status={
                roomLight
                  ? "Асаалттай — цацраг бүдэг харагдана"
                  : "Унтраалттай — цацраг тод харагдана"
              }
              checked={roomLight}
              tone="sky"
              onChange={changeRoomLight}
            />
            <Segmented
              label="Эх үүсвэрийн төрөл"
              value={sourceKind}
              options={[
                { value: "raybox", label: "Гэрлийн хайрцаг" },
                { value: "laser", label: "Лазер" },
              ]}
              onChange={setSourceKind}
            />
            {sourceKind === "laser" && (
              <p className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
                ⚠️ Лазерыг хэзээ ч хүний нүд рүү чиглүүлж болохгүй.
              </p>
            )}
            <Segmented
              label="Цацраг"
              value={count}
              options={[
                { value: 1, label: "1 нарийн" },
                {
                  value: 3,
                  label: "3 зэрэгцээ",
                  disabled: sourceKind === "laser",
                  title: sourceKind === "laser" ? "Лазер нэг цацрагтай" : undefined,
                },
              ]}
              onChange={setRayCount}
            />
            <Segmented
              label="Гадаргуу"
              value={surface}
              options={[
                { value: "mirror", label: "Гөлгөр толь" },
                { value: "rough", label: "Барзгар" },
              ]}
              onChange={setSurface}
            />
            <Slider
              label="Эх үүсвэрийг O-г тойруулах"
              value={orbit}
              min={ORBIT_MIN}
              max={ORBIT_MAX}
              step={1}
              display={null}
              valueText={`нормалиас ${Math.abs(orbit)}°, ${orbit < 0 ? "зүүн" : "баруун"} талд`}
              onChange={changeOrbit}
            />
            <Check
              label="Чиглэлийг O цэгт түгжих"
              hint="Унтраавал эх үүсвэрийг ↻ бариулаар өөрөө чиглүүлнэ"
              checked={aimLocked}
              onChange={changeAimLock}
            />
            {!aimLocked && (
              <button
                type="button"
                onClick={() => setSource((s) => aimedSource(s.pos))}
                className={secondaryBtn}
              >
                🎯 O цэг рүү чиглүүлэх
              </button>
            )}
            <Slider
              label="Толины эргэлт"
              value={mirrorAngle}
              min={MIRROR_MIN}
              max={MIRROR_MAX}
              step={0.5}
              display={fmtDeg(mirrorAngle)}
              onChange={changeMirror}
            />
          </Card>

          <Card title="🧰 Хэрэгсэл">
            <Check
              label="📐 Протрактор"
              checked={protractor.visible}
              onChange={(v) => changeProtractor({ ...protractor, visible: v })}
            />
            <button type="button" onClick={placeProtractorAtO} className={secondaryBtn}>
              Протракторыг O цэгт тавих
            </button>
            <Segmented
              label="🔍 Томруулах"
              value={zoom}
              options={[
                { value: 1, label: "1×" },
                { value: 2, label: "2×" },
                { value: 3, label: "3×" },
              ]}
              onChange={changeZoom}
            />
            <Check
              label="🧑‍🏫 Туслах горим"
              hint="Жинхэнэ нормаль, өнцгийн нум, утгыг шууд харуулна (багшид)"
              checked={helper}
              onChange={setHelper}
            />
          </Card>

          <Card title="✏️ Хэмжилт">
            <button
              type="button"
              onClick={traceRay}
              disabled={traceBlock !== null}
              className={primaryBtn}
            >
              ✏️ Цацрагийг тэмдэглэх
            </button>
            <Check
              label="Хүснэгтэд автоматаар бичих"
              hint="Унтраавал протрактороор уншсан утгаа өөрөө бичнэ"
              checked={autoFill}
              onChange={changeAutoFill}
            />
            {traceBlock ? (
              <p className="text-xs leading-relaxed text-amber-300/90">{traceBlock}</p>
            ) : (
              offO !== null &&
              offO >= 1 && (
                <p className="text-xs leading-relaxed text-amber-300/90">
                  Цацраг O цэгээс {offO.toFixed(1)} мм зайд тусаж байна. Нормалийг O
                  цэгт татсан тул эх үүсвэрийг O руу чиглүүлбэл хэмжихэд амар.
                </p>
              )
            )}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={newSheet} className={secondaryBtn}>
                🧹 Шинэ цаас
              </button>
              <button type="button" onClick={resetAll} className={secondaryBtn}>
                ↺ Дахин эхлэх
              </button>
            </div>
          </Card>

          <Card title="🎯 Таамаглал">
            <p className="text-xs leading-relaxed text-slate-400">
              Хэмжихээсээ өмнө бич: тусах өнцгийг өөрчлөхөд ойх өнцөг яаж
              өөрчлөгдөх вэ?
            </p>
            <textarea
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              rows={3}
              placeholder="Миний таамаглал..."
              className="w-full resize-none rounded-xl border border-[#22304D] bg-[#0B1324] p-3 text-sm outline-none placeholder:text-slate-600 focus:border-sky-600"
            />
          </Card>
        </aside>

        {/* ===== ТӨВ: ширээ ===== */}
        <section className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-[#16223A] bg-[#0A1120] p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">🔬 Оптикийн ширээ</h2>
                <p className="text-xs text-slate-400">{beamStatus}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span
                  className={`rounded-full px-3 py-1 ring-1 ${
                    sourceOn
                      ? "bg-amber-400/15 text-amber-300 ring-amber-500/40"
                      : "bg-slate-700/40 text-slate-400 ring-slate-600/40"
                  }`}
                >
                  ● {sourceOn ? "Гэрэл асаалттай" : "Гэрэл унтраалттай"}
                </span>
                <span className="rounded-full bg-slate-700/40 px-3 py-1 text-slate-300 ring-1 ring-slate-600/40">
                  {roomLight ? "💡 Өрөө гэрэлтэй" : "🌙 Өрөө харанхуй"}
                </span>
                {zoom > 1 && (
                  <span className="rounded-full bg-sky-500/15 px-3 py-1 text-sky-300 ring-1 ring-sky-500/40">
                    🔍 {zoom}×
                  </span>
                )}
              </div>
            </div>

            <Scene
              viewBox={viewBox}
              roomLight={roomLight}
              sourceOn={sourceOn}
              sourceKind={sourceKind}
              surface={surface}
              rayCount={count}
              source={source}
              aimLocked={aimLocked}
              mirrorAngle={mirrorAngle}
              rays={rays}
              protractor={protractor}
              trials={trials}
              helper={helper}
              onSourceChange={setSource}
              onProtractorChange={changeProtractor}
              onMirrorChange={changeMirror}
            />

            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Эх үүсвэр, протракторыг чирж зөө · ↻ бариулаар эргүүл · Гарнаас: Tab-аар
              сонгоод сумаар зөө, Q/E-ээр эргүүл (Shift — том алхам)
            </p>
          </div>

          {/* Хэмжилтийн хүснэгт ба график */}
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_260px]">
            <Card
              title="📋 Хэмжилтийн хүснэгт"
              aside={
                <span className="font-mono text-xs text-slate-400">
                  {trials.length}/{MAX_TRIALS}
                </span>
              }
            >
              {trials.length > 0 && (
                <p className="-mt-2 text-xs text-slate-500">
                  {autoFill
                    ? "Утга 0.5° хүртэл тоймлогдож автоматаар бичигдэнэ. Протрактороор шалгаад шаардлагатай бол засаарай."
                    : "Протрактороор уншсан өнцгөө градусаар бич."}
                  {mixedMirror &&
                    " Толийг эргүүлэхээс өмнө тэмдэглэсэн цацрагийг тухайн үеийн бүдэг нормалиас нь, N (…°), хэмжинэ."}
                </p>
              )}
              <MeasurementTable
                trials={trials}
                checked={checked}
                autoFill={autoFill}
                onChange={updateTrial}
                onRemove={(id) => setTrials((ts) => ts.filter((t) => t.id !== id))}
              />
              <button
                type="button"
                onClick={() => setChecked(true)}
                disabled={!canCheck || checked}
                className="w-full rounded-xl border border-emerald-700/50 bg-emerald-950/40 px-4 py-2.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {checked
                  ? "Шалгасан ✓"
                  : canCheck
                    ? "✅ Хэмжилтээ шалгах"
                    : `Шалгахад дахин ${REQUIRED_ANGLES - distinct} өөр өнцгийн хэмжилт хэрэгтэй`}
              </button>
              {checked && <ResultsSummary rows={measured} />}
            </Card>

            <Card title="📈 График">
              <ScatterChart rows={measured} checked={checked} />
              <p className="text-center text-[11px] leading-relaxed text-slate-500">
                {checked
                  ? "Ногоон тасархай: θᵣ = θᵢ · Шар: таны өгөгдлийн шулуун"
                  : "Хэвтээ: θᵢ · Босоо: θᵣ"}
              </p>
            </Card>
          </div>

          {/* Дүгнэлт */}
          <Card title="✍️ Дүгнэлт">
            <textarea
              value={conclusion}
              onChange={(e) => setConclusion(e.target.value)}
              rows={3}
              placeholder="Цэгүүд ямар хэлбэртэй байна? Тусах ба ойх өнцгийн хооронд ямар хамаарал байна вэ? Алдаа юунаас болсон бэ?"
              className="w-full resize-none rounded-xl border border-[#22304D] bg-[#0B1324] p-3 text-sm outline-none placeholder:text-slate-600 focus:border-sky-600"
            />
            {checked ? (
              <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/30 p-4 text-center">
                <p className="text-2xl font-bold text-emerald-300">θᵢ = θᵣ</p>
                <p className="mt-1 text-xs text-emerald-500">
                  Тусах өнцөг ойх өнцөгтэй тэнцүү — тусгалын хууль
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Хууль хэмжилтээ шалгасны дараа нээгдэнэ.
              </p>
            )}
          </Card>
        </section>

        {/* ===== БАРУУН: явц ба заавар ===== */}
        <aside className="space-y-4">
          <Card
            title="🧭 Туршилтын явц"
            aside={
              <span className="font-mono text-xs text-slate-400">
                {doneCount}/{LESSON.steps.length}
              </span>
            }
          >
            <div
              className="h-1.5 overflow-hidden rounded-full bg-[#16233C]"
              role="progressbar"
              aria-label="Туршилтын явц"
              aria-valuemin={0}
              aria-valuemax={LESSON.steps.length}
              aria-valuenow={doneCount}
            >
              <div
                className="h-full rounded-full bg-emerald-400 transition-all"
                style={{ width: `${(doneCount / LESSON.steps.length) * 100}%` }}
              />
            </div>
            <ol className="space-y-2 text-sm">
              {LESSON.steps.map((s, i) => (
                <li
                  key={s.id}
                  className={`flex gap-3 ${done[s.id] ? "text-slate-500" : "text-slate-300"}`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                      done[s.id]
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-[#16233C] text-sky-300"
                    }`}
                  >
                    {done[s.id] ? "✓" : i + 1}
                  </span>
                  <span className="leading-snug">
                    {autoFill && s.autoText ? s.autoText : s.text}
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          {helper && (
            <Card title="🧑‍🏫 Туслах: жинхэнэ утга">
              {main?.side === "front" && main.thetaI !== null ? (
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Тусах өнцөг" value={`${main.thetaI.toFixed(1)}°`} tone="sky" />
                  <Stat
                    label="Ойх өнцөг"
                    value={main.thetaR === null ? "тарсан" : `${main.thetaR.toFixed(1)}°`}
                    tone="orange"
                  />
                  <Stat
                    label="Хазайлт δ"
                    value={`${(180 - 2 * main.thetaI).toFixed(1)}°`}
                    tone="violet"
                  />
                  <Stat
                    label="O-оос зай"
                    value={`${(offO ?? 0).toFixed(1)} мм`}
                    tone="emerald"
                  />
                </div>
              ) : (
                <p className="text-sm text-slate-400">{beamStatus}.</p>
              )}
            </Card>
          )}

          <Card title="📏 Протрактор унших">
            <ul className="space-y-2 text-sm text-slate-300">
              {LESSON.protractorTips.map((tip) => (
                <li key={tip} className="flex gap-2 leading-snug">
                  <span className="text-amber-300">▸</span>
                  {tip}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="🧪 Хэрэгцээт хэрэгсэл">
            <ul className="space-y-2 text-sm text-slate-300">
              {LESSON.equipment.map((item) => (
                <li key={item} className="flex gap-2 leading-snug">
                  <span className="text-sky-400">▸</span>
                  {item}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="✅ Хичээлийн зорилго">
            <ul className="space-y-2 text-sm text-slate-300">
              {LESSON.objectives.map((o) => (
                <li key={o} className="flex gap-2 leading-snug">
                  <span className="text-emerald-400">▸</span>
                  {o}
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>

      {/* ---------- Хичээлийн агуулга ---------- */}
      <section className="border-t border-[#16223A] bg-[#070D1A] px-5 py-8 md:px-8">
        <h2 className="text-xl font-bold">📚 Хичээлийн агуулга</h2>

        <div className="mt-4 flex gap-2 overflow-x-auto border-b border-[#16223A]" role="tablist">
          {(
            [
              ["content", "Гол агуулга"],
              ["terms", "Нэр томьёо"],
              ["formulas", "Томьёо ба хууль"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                tab === key
                  ? "border-sky-400 text-sky-300"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-5" role="tabpanel">
          {tab === "content" && (
            <div className="grid gap-4 md:grid-cols-2">
              {LESSON.content.map((c) => (
                <article
                  key={c.heading}
                  className="rounded-2xl border border-[#16223A] bg-[#0A1120] p-5"
                >
                  <h3 className="font-semibold text-sky-300">{c.heading}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{c.body}</p>
                </article>
              ))}
            </div>
          )}

          {tab === "terms" && (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {LESSON.terms.map((t) => (
                <div
                  key={t.term}
                  className="rounded-xl border border-[#16223A] bg-[#0A1120] p-4"
                >
                  <p className="font-semibold text-amber-300">{t.term}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{t.def}</p>
                </div>
              ))}
            </div>
          )}

          {tab === "formulas" && (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {LESSON.formulas.map((f) => (
                  <div
                    key={f.expr}
                    className="rounded-2xl border border-[#16223A] bg-[#0A1120] p-5 text-center"
                  >
                    <p className="font-mono text-2xl font-bold text-amber-300">{f.expr}</p>
                    <p className="mt-2 text-sm font-medium text-slate-200">{f.name}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{f.note}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-[#16223A] bg-[#0A1120] p-5">
                <h3 className="font-semibold text-emerald-300">Тусгалын гурван хууль</h3>
                <ol className="mt-3 space-y-2">
                  {LESSON.laws.map((l, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-300">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-950 text-[11px] font-semibold text-emerald-400">
                        {i + 1}
                      </span>
                      {l}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>
      </section>

      <footer className="border-t border-[#16223A] px-5 py-6 text-center text-xs leading-relaxed text-slate-600 md:px-8">
        Физикийн виртуал лаборатори · Цацрагийг тусгалын хуулиар вектороор бодно. Харин
        таны хэмжилт протракторын нарийвчлал, хэмжих аргаас хамаарч алдаатай байж болно —
        жинхэнэ лабораторид ч яг ийм.
      </footer>
    </main>
  );
}
