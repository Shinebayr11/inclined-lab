"use client";

import { memo, useMemo, useRef, useState } from "react";
import {
  type Vec,
  add,
  arcPath,
  clamp,
  dist,
  frameAt,
  fromHeading,
  hash01,
  headingOf,
  midAngle,
  norm,
  rayToRect,
  scale,
  sub,
  toRad,
  toWorld,
  wrapDeg,
} from "./geometry";
import {
  type LightSource,
  type ProtractorState,
  type Ray,
  type SourceKind,
  type Surface,
  type Trial,
  MIRROR_LEN,
  MIRROR_MAX,
  MIRROR_MIN,
  MM_PER_UNIT,
  O,
  ORBIT_MAX,
  ORBIT_MIN,
  PAPER,
  PROTRACTOR_R,
  SCENE,
  SLIT_GAP,
  SOURCE_HALF,
  VIEW_H,
  VIEW_W,
  aimAt,
  aimedSource,
  orbitAngleOf,
  orbitPosition,
  placeSource,
  slitOf,
  snapProtractorPos,
  snapProtractorRot,
} from "./optics";

/* ============================================================
   ОПТИКИЙН ШИРЭЭ — дээрээс харсан байдал.
   Ширээ → цаас → харандааны зураас → толь → эх үүсвэр →
   протрактор → (харанхуй өрөө) → цацраг → туслах шугам → бариулууд
   ============================================================ */

type Handle =
  | "source"
  | "sourceRotate"
  | "protractor"
  | "protractorRotate"
  | "mirrorRotate";

type Drag = {
  handle: Handle;
  pointerId: number;
  /** Барьсан цэг ба объектын төвийн зөрүү */
  grab: Vec;
  startAngle: number;
  startRot: number;
};

const PENCIL = "#3f3f46";
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const pointsOf = (list: Vec[]) => list.map((p) => `${f1(p.x)},${f1(p.y)}`).join(" ");

export type SceneProps = {
  viewBox: string;
  roomLight: boolean;
  sourceOn: boolean;
  sourceKind: SourceKind;
  surface: Surface;
  rayCount: 1 | 3;
  source: LightSource;
  aimLocked: boolean;
  mirrorAngle: number;
  rays: Ray[];
  protractor: ProtractorState;
  trials: Trial[];
  helper: boolean;
  onSourceChange: (s: LightSource) => void;
  onProtractorChange: (p: ProtractorState) => void;
  onMirrorChange: (angle: number) => void;
};

export default function Scene({
  viewBox,
  roomLight,
  sourceOn,
  sourceKind,
  surface,
  rayCount,
  source,
  aimLocked,
  mirrorAngle,
  rays,
  protractor,
  trials,
  helper,
  onSourceChange,
  onProtractorChange,
  onMirrorChange,
}: SceneProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [active, setActive] = useState<Handle | null>(null);
  const [kbFocus, setKbFocus] = useState<"source" | "protractor" | null>(null);

  // Протракторын төв наалдах цэгүүд: O ба цацраг тусч буй цэгүүд
  const snapTargets = useMemo(
    () => [
      O,
      ...rays.flatMap((r) => (r.hit && r.side === "front" ? [r.hit] : [])),
      ...trials.map((t) => t.hit),
    ],
    [rays, trials],
  );
  // Протракторын суурь наалдах чиглэлүүд: одоогийн болон өмнөх толины байрлал
  const snapAngles = useMemo(
    () => [mirrorAngle, ...trials.map((t) => t.mirrorAngle)],
    [mirrorAngle, trials],
  );

  const dirVec = fromHeading(source.dir);

  /* ---------- Чирэх ---------- */

  function svgPoint(e: React.PointerEvent): Vec {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function beginDrag(handle: Handle, e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const svg = svgRef.current;
    if (!svg) return;
    e.preventDefault();
    e.stopPropagation();
    svg.setPointerCapture(e.pointerId);
    const p = svgPoint(e);
    const center =
      handle === "protractorRotate"
        ? protractor.pos
        : handle === "mirrorRotate"
          ? O
          : source.pos;
    drag.current = {
      handle,
      pointerId: e.pointerId,
      grab: sub(p, handle === "protractor" ? protractor.pos : source.pos),
      startAngle: headingOf(sub(p, center)),
      startRot: protractor.rot,
    };
    setActive(handle);
  }

  function handleMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const p = svgPoint(e);

    switch (d.handle) {
      case "source": {
        const pos = placeSource(sub(p, d.grab), mirrorAngle);
        onSourceChange(aimLocked ? aimedSource(pos) : { ...source, pos });
        break;
      }
      case "sourceRotate": {
        // Бариул эх үүсвэрийн ард — цацраг эсрэг тийш чиглэнэ
        let dir = headingOf(sub(source.pos, p));
        const toO = aimAt(source.pos, O);
        if (Math.abs(wrapDeg(dir - toO)) < 1.2) dir = toO;
        onSourceChange({ ...source, dir });
        break;
      }
      case "protractor":
        onProtractorChange({
          ...protractor,
          pos: snapProtractorPos(sub(p, d.grab), snapTargets),
        });
        break;
      case "protractorRotate": {
        const a = headingOf(sub(p, protractor.pos));
        const rot = snapProtractorRot(d.startRot + wrapDeg(a - d.startAngle), snapAngles);
        onProtractorChange({ ...protractor, rot });
        break;
      }
      case "mirrorRotate": {
        // Бариулыг аль ч үзүүрээс нь барьж эргүүлж болно
        let a = wrapDeg(headingOf(sub(p, O)));
        if (a > 90) a -= 180;
        if (a < -90) a += 180;
        onMirrorChange(clamp(Math.round(a * 2) / 2, MIRROR_MIN, MIRROR_MAX));
        break;
      }
    }
  }

  function endDrag() {
    drag.current = null;
    setActive(null);
  }

  /* ---------- Гар ---------- */

  function handleKey(target: "source" | "protractor", e: React.KeyboardEvent) {
    const fine = target === "protractor";
    const move = e.shiftKey ? 10 : fine ? 1 : 2;
    const turn = e.shiftKey ? 5 : 1;
    let dx = 0;
    let dy = 0;
    let dr = 0;
    // e.code — кирилл гарын байрлалд ч Q/E ажиллана
    switch (e.code) {
      case "ArrowLeft":
        dx = -move;
        break;
      case "ArrowRight":
        dx = move;
        break;
      case "ArrowUp":
        dy = -move;
        break;
      case "ArrowDown":
        dy = move;
        break;
      case "KeyQ":
        dr = turn;
        break;
      case "KeyE":
        dr = -turn;
        break;
      default:
        return;
    }
    e.preventDefault();

    if (target === "protractor") {
      onProtractorChange(
        dr !== 0
          ? { ...protractor, rot: wrapDeg(protractor.rot + dr) }
          : {
              ...protractor,
              pos: {
                x: clamp(protractor.pos.x + dx, 0, VIEW_W),
                y: clamp(protractor.pos.y + dy, 0, VIEW_H),
              },
            },
      );
      return;
    }
    if (dr !== 0 && aimLocked) {
      // Түгжээтэй үед Q/E нь O цэгийг тойруулна
      const angle = clamp(orbitAngleOf(source.pos, mirrorAngle) - dr, ORBIT_MIN, ORBIT_MAX);
      const pos = orbitPosition(angle, dist(source.pos, O), mirrorAngle);
      onSourceChange(aimedSource(placeSource(pos, mirrorAngle)));
    } else if (dr !== 0) {
      onSourceChange({ ...source, dir: wrapDeg(source.dir + dr) });
    } else {
      const pos = placeSource(
        { x: source.pos.x + dx, y: source.pos.y + dy },
        mirrorAngle,
      );
      onSourceChange(aimLocked ? aimedSource(pos) : { ...source, pos });
    }
  }

  const focusProps = (target: "source" | "protractor") => ({
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent) => handleKey(target, e),
    onFocus: (e: React.FocusEvent<SVGGElement>) => {
      if (e.currentTarget.matches(":focus-visible")) setKbFocus(target);
    },
    onBlur: () => setKbFocus(null),
  });

  const main = rays[0];
  // Толины бариул A үзүүрт — протракторын бариул (баруун талд) давхцахгүй
  const mirrorKnob = toWorld(frameAt(O, mirrorAngle), { x: -MIRROR_LEN / 2 - 26, y: -12 });
  const protractorKnob = toWorld(frameAt(protractor.pos, protractor.rot), {
    x: PROTRACTOR_R + 16,
    y: -10,
  });
  const sourceKnob = sub(source.pos, scale(dirVec, SOURCE_HALF + 26));
  const slit = slitOf(source);

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}`, touchAction: "pan-y pinch-zoom" }}
      className="block w-full select-none rounded-xl ring-1 ring-[#16223A]"
      role="group"
      aria-label="Оптикийн ширээ: гэрлийн эх үүсвэр, хавтгай толь, протрактор"
      onPointerMove={handleMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
    >
      <SceneDefs />
      <DeskAndPaper />
      <PastConstruction trials={trials} mirrorAngle={mirrorAngle} />
      <Construction mirrorAngle={mirrorAngle} />
      <TraceMarks trials={trials} />
      <Mirror angle={mirrorAngle} surface={surface} />

      {/* Гэрлийн эх үүсвэр */}
      {sourceKind === "raybox" && <Cable source={source} />}
      <g
        transform={`translate(${f1(source.pos.x)} ${f1(source.pos.y)}) rotate(${f2(-source.dir)})`}
        onPointerDown={(e) => beginDrag("source", e)}
        {...focusProps("source")}
        role="button"
        aria-label={`${sourceKind === "laser" ? "Лазер" : "Гэрлийн хайрцаг"}: чирж эсвэл сумаар зөөнө, Q/E товчоор ${
          aimLocked ? "O цэгийг тойруулна" : "эргүүлнэ"
        }`}
        className={`outline-none ${active === "source" ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ touchAction: "none" }}
      >
        <rect
          x={-SOURCE_HALF - 10}
          y={-28}
          width={SOURCE_HALF * 2 + 20}
          height={56}
          fill="transparent"
        />
        {sourceKind === "laser" ? (
          <LaserBody on={sourceOn} />
        ) : (
          <RayBoxBody on={sourceOn} slits={rayCount} />
        )}
        {kbFocus === "source" && (
          <rect
            x={-SOURCE_HALF - 8}
            y={-26}
            width={SOURCE_HALF * 2 + 16}
            height={52}
            rx={10}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        )}
      </g>

      {/* Протрактор — тунгалаг хуванцар */}
      {protractor.visible && (
        <g
          transform={`translate(${f1(protractor.pos.x)} ${f1(protractor.pos.y)}) rotate(${f2(-protractor.rot)})`}
          onPointerDown={(e) => beginDrag("protractor", e)}
          {...focusProps("protractor")}
          role="button"
          aria-label="Протрактор: чирж эсвэл сумаар зөөнө, Q/E товчоор эргүүлнэ"
          className={`outline-none ${active === "protractor" ? "cursor-grabbing" : "cursor-grab"}`}
          style={{ touchAction: "none" }}
        >
          <ProtractorFace />
          {kbFocus === "protractor" && (
            <path
              d={`M ${-P_R - 6} ${P_STRIP + 6} L ${-P_R - 6} 0 A ${P_R + 6} ${P_R + 6} 0 0 1 ${P_R + 6} 0 L ${P_R + 6} ${P_STRIP + 6} Z`}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          )}
        </g>
      )}

      {/* Харанхуй өрөө: бүх зүйл бүдгэрч, зөвхөн гэрэл тод үлдэнэ */}
      <rect
        width={VIEW_W}
        height={VIEW_H}
        fill="#020617"
        opacity={roomLight ? 0 : 0.62}
        pointerEvents="none"
        style={{ transition: "opacity 400ms ease" }}
      />

      {sourceOn && <Beams rays={rays} kind={sourceKind} roomLight={roomLight} />}
      {sourceOn && (
        <circle
          cx={f1(slit.x)}
          cy={f1(slit.y)}
          r={sourceKind === "laser" ? 9 : 18}
          fill={sourceKind === "laser" ? "url(#lab-glow-red)" : "url(#lab-glow-warm)"}
          opacity={roomLight ? 0.55 : 1}
          pointerEvents="none"
        />
      )}
      {helper && sourceOn && main && <HelperOverlay ray={main} mirrorAngle={mirrorAngle} />}

      {/* Эргүүлэх бариулууд */}
      <Knob
        at={mirrorKnob}
        color="#cbd5e1"
        title="Толийг эргүүлэх"
        onPointerDown={(e) => beginDrag("mirrorRotate", e)}
      />
      {protractor.visible && (
        <Knob
          at={protractorKnob}
          color="#fcd34d"
          title="Протракторыг эргүүлэх"
          onPointerDown={(e) => beginDrag("protractorRotate", e)}
        />
      )}
      {!aimLocked && (
        <>
          <line
            x1={f1(sourceKnob.x)}
            y1={f1(sourceKnob.y)}
            x2={f1(source.pos.x - dirVec.x * SOURCE_HALF)}
            y2={f1(source.pos.y - dirVec.y * SOURCE_HALF)}
            stroke="#fbbf24"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            pointerEvents="none"
          />
          <Knob
            at={sourceKnob}
            color="#fbbf24"
            title="Эх үүсвэрийг эргүүлэх"
            onPointerDown={(e) => beginDrag("sourceRotate", e)}
          />
        </>
      )}
    </svg>
  );
}

/* ============================================================
   Зургийн хэсгүүд
   ============================================================ */

const SceneDefs = memo(function SceneDefs() {
  return (
    <defs>
      <linearGradient id="lab-desk" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#4a2e18" />
        <stop offset="0.5" stopColor="#5b3a21" />
        <stop offset="1" stopColor="#452c18" />
      </linearGradient>
      <pattern id="lab-grain" width="260" height="36" patternUnits="userSpaceOnUse">
        <path d="M0 9 C70 3 150 15 260 8" stroke="#2b1a0c" strokeOpacity="0.35" fill="none" />
        <path d="M0 26 C90 32 170 20 260 27" stroke="#8a5a32" strokeOpacity="0.25" fill="none" />
      </pattern>
      <filter id="lab-paper-shadow" x="-5%" y="-5%" width="110%" height="115%">
        <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000" floodOpacity="0.45" />
      </filter>
      {/* Хэвтээ шугамын bbox өндөр 0 тул шүүлтүүрийн мужийг бүх зургаар авна */}
      <filter
        id="lab-beam-blur"
        filterUnits="userSpaceOnUse"
        x="0"
        y="0"
        width={VIEW_W}
        height={VIEW_H}
      >
        <feGaussianBlur stdDeviation="6" />
      </filter>
      <linearGradient id="lab-silver" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f8fafc" />
        <stop offset="0.5" stopColor="#cbd5e1" />
        <stop offset="1" stopColor="#64748b" />
      </linearGradient>
      <linearGradient id="lab-holder" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#475569" />
        <stop offset="1" stopColor="#1e293b" />
      </linearGradient>
      <linearGradient id="lab-metal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4b5563" />
        <stop offset="1" stopColor="#1f2937" />
      </linearGradient>
      <linearGradient id="lab-laser" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e5e7eb" />
        <stop offset="0.45" stopColor="#9ca3af" />
        <stop offset="1" stopColor="#4b5563" />
      </linearGradient>
      <radialGradient id="lab-glow-warm">
        <stop offset="0" stopColor="#fffbeb" stopOpacity="0.95" />
        <stop offset="0.45" stopColor="#fbbf24" stopOpacity="0.35" />
        <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="lab-glow-red">
        <stop offset="0" stopColor="#fecaca" stopOpacity="0.95" />
        <stop offset="0.45" stopColor="#ef4444" stopOpacity="0.4" />
        <stop offset="1" stopColor="#ef4444" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
});

/** Модон ширээ ба скочоор наасан цаас */
const DeskAndPaper = memo(function DeskAndPaper() {
  const corners = [
    { x: PAPER.x, y: PAPER.y, r: -38 },
    { x: PAPER.x + PAPER.w, y: PAPER.y, r: 38 },
    { x: PAPER.x, y: PAPER.y + PAPER.h, r: 38 },
    { x: PAPER.x + PAPER.w, y: PAPER.y + PAPER.h, r: -38 },
  ];
  return (
    <g pointerEvents="none">
      <rect width={VIEW_W} height={VIEW_H} fill="url(#lab-desk)" />
      <rect width={VIEW_W} height={VIEW_H} fill="url(#lab-grain)" />
      <rect
        x={PAPER.x}
        y={PAPER.y}
        width={PAPER.w}
        height={PAPER.h}
        fill="#f6f4ec"
        filter="url(#lab-paper-shadow)"
      />
      {corners.map((c, i) => (
        <rect
          key={i}
          x={c.x - 30}
          y={c.y - 9}
          width={60}
          height={18}
          fill="#fef3c7"
          opacity={0.6}
          transform={`rotate(${c.r} ${c.x} ${c.y})`}
        />
      ))}
    </g>
  );
});

/**
 * Толийг эргүүлэхээс өмнө тэмдэглэсэн цацрагуудын толины шугам ба нормаль.
 * Жинхэнэ лабораторид толийг эргүүлбэл шинэ шугам зурдаг, хуучныг нь арилгадаггүй —
 * тэр цацрагийн өнцгийг хуучин нормалиас нь хэмжинэ.
 */
const PastConstruction = memo(function PastConstruction({
  trials,
  mirrorAngle,
}: {
  trials: Trial[];
  mirrorAngle: number;
}) {
  const lines = new Map<string, { angle: number; hit: Vec }>();
  for (const t of trials) {
    if (Math.abs(t.mirrorAngle - mirrorAngle) < 0.25) continue;
    const key = `${t.mirrorAngle}|${Math.round(t.hit.x)}|${Math.round(t.hit.y)}`;
    if (!lines.has(key)) lines.set(key, { angle: t.mirrorAngle, hit: t.hit });
  }
  return (
    <g stroke={PENCIL} fill="none" strokeLinecap="round" opacity={0.5} pointerEvents="none">
      {[...lines.entries()].map(([key, { angle, hit }]) => {
        const f = frameAt(hit, angle);
        const a = toWorld(f, { x: -120, y: 0 });
        const b = toWorld(f, { x: 120, y: 0 });
        const n = toWorld(f, { x: 0, y: 200 });
        const tag = toWorld(f, { x: 0, y: 216 });
        return (
          <g key={key}>
            <line x1={f1(a.x)} y1={f1(a.y)} x2={f1(b.x)} y2={f1(b.y)} strokeWidth={1} />
            <line
              x1={f1(hit.x)}
              y1={f1(hit.y)}
              x2={f1(n.x)}
              y2={f1(n.y)}
              strokeWidth={1}
              strokeDasharray="5 5"
            />
            <text
              x={f1(tag.x)}
              y={f1(tag.y)}
              fontSize={11}
              fontStyle="italic"
              fontFamily="Georgia, 'Times New Roman', serif"
              fill={PENCIL}
              stroke="none"
              textAnchor="middle"
              dominantBaseline="central"
            >
              N ({Number.isInteger(angle) ? angle : angle.toFixed(1)}°)
            </text>
          </g>
        );
      })}
    </g>
  );
});

/** Харандаагаар зурсан толины шугам AB, тусгалын цэг O, нормаль ON */
function Construction({ mirrorAngle }: { mirrorAngle: number }) {
  const f = frameAt(O, mirrorAngle);
  const ext = MIRROR_LEN / 2 + 30;
  const at = (x: number, y: number) => toWorld(f, { x, y });
  const a = at(-ext, 0);
  const b = at(ext, 0);
  const n = at(0, 236);
  const label = (p: Vec, text: string) => (
    <text
      x={f1(p.x)}
      y={f1(p.y)}
      fontSize={14}
      fontStyle="italic"
      fontFamily="Georgia, 'Times New Roman', serif"
      fill={PENCIL}
      stroke="none"
      textAnchor="middle"
      dominantBaseline="central"
    >
      {text}
    </text>
  );
  return (
    <g stroke={PENCIL} fill="none" strokeLinecap="round" opacity={0.8} pointerEvents="none">
      <line x1={f1(a.x)} y1={f1(a.y)} x2={f1(b.x)} y2={f1(b.y)} strokeWidth={1.1} />
      <line
        x1={O.x}
        y1={O.y}
        x2={f1(n.x)}
        y2={f1(n.y)}
        strokeWidth={1.1}
        strokeDasharray="7 5"
      />
      <circle cx={O.x} cy={O.y} r={2.4} fill={PENCIL} stroke="none" />
      {label(at(-ext - 12, 8), "A")}
      {label(at(ext + 12, 8), "B")}
      {label(at(-11, 11), "O")}
      {label(at(12, 236), "N")}
    </g>
  );
}

/** Өмнөх туршилтуудын харандаагаар тэмдэглэсэн цацрагууд */
const TraceMarks = memo(function TraceMarks({ trials }: { trials: Trial[] }) {
  const along = (a: Vec, b: Vec, k: number) => add(a, scale(sub(b, a), k));
  const crossMark = (p: Vec) =>
    `M${f1(p.x - 3.5)} ${f1(p.y - 3.5)}L${f1(p.x + 3.5)} ${f1(p.y + 3.5)}M${f1(p.x - 3.5)} ${f1(p.y + 3.5)}L${f1(p.x + 3.5)} ${f1(p.y - 3.5)}`;
  const arrow = (p: Vec, d: Vec) => {
    const side = { x: -d.y, y: d.x };
    const a = add(sub(p, scale(d, 7)), scale(side, 4));
    const b = add(sub(p, scale(d, 7)), scale(side, -4));
    return `M${f1(a.x)} ${f1(a.y)}L${f1(p.x)} ${f1(p.y)}L${f1(b.x)} ${f1(b.y)}`;
  };
  return (
    <g
      stroke={PENCIL}
      strokeWidth={1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      opacity={0.85}
      pointerEvents="none"
    >
      {trials.map((t) => {
        const dIn = norm(sub(t.hit, t.start));
        const dOut = norm(sub(t.end, t.hit));
        // Дугаарыг эх үүсвэрийн их биеэс холдуулж, цацрагийн хажууд бичнэ
        const tagIn = add(t.start, { x: dIn.x * 26 - dIn.y * 12, y: dIn.y * 26 + dIn.x * 12 });
        const tagOut = add(t.end, { x: -dOut.x * 8 - dOut.y * 12, y: -dOut.y * 8 + dOut.x * 12 });
        return (
          <g key={t.id}>
            <line x1={f1(t.start.x)} y1={f1(t.start.y)} x2={f1(t.hit.x)} y2={f1(t.hit.y)} />
            <line x1={f1(t.hit.x)} y1={f1(t.hit.y)} x2={f1(t.end.x)} y2={f1(t.end.y)} />
            <path
              strokeWidth={1}
              d={[
                crossMark(along(t.start, t.hit, 0.3)),
                crossMark(along(t.start, t.hit, 0.7)),
                crossMark(along(t.hit, t.end, 0.35)),
                crossMark(along(t.hit, t.end, 0.75)),
              ].join("")}
            />
            <path d={arrow(along(t.start, t.hit, 0.5), dIn) + arrow(along(t.hit, t.end, 0.55), dOut)} />
            {[
              { p: tagIn, s: String(t.id) },
              { p: tagOut, s: `${t.id}′` },
            ].map(({ p, s }) => (
              <text
                key={s}
                x={f1(p.x)}
                y={f1(p.y)}
                fontSize={12}
                fontStyle="italic"
                fontFamily="Georgia, 'Times New Roman', serif"
                fill={PENCIL}
                stroke="none"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {s}
              </text>
            ))}
          </g>
        );
      })}
    </g>
  );
});

/** Барзгар гадаргуугийн ирмэг — тогтмол хэлбэртэй */
const ROUGH_EDGE = (() => {
  let d = `M ${-MIRROR_LEN / 2} 0`;
  for (let x = -MIRROR_LEN / 2; x <= MIRROR_LEN / 2; x += 4) {
    d += ` L ${x} ${f1((hash01(x) - 0.5) * 2.6)}`;
  }
  return d;
})();

/** Толь ба тавиур. Орон нутгийн y > 0 нь толины ар тал */
const Mirror = memo(function Mirror({ angle, surface }: { angle: number; surface: Surface }) {
  const h = MIRROR_LEN / 2;
  return (
    <g transform={`translate(${O.x} ${O.y}) rotate(${f2(-angle)})`} pointerEvents="none">
      <rect
        x={-h - 8}
        y={4}
        width={MIRROR_LEN + 16}
        height={20}
        rx={3}
        fill="url(#lab-holder)"
        stroke="#0f172a"
      />
      {surface === "mirror" ? (
        <>
          <rect x={-h} y={0} width={MIRROR_LEN} height={5} fill="url(#lab-silver)" />
          <line x1={-h} y1={0} x2={h} y2={0} stroke="#ffffff" strokeWidth={1.2} />
        </>
      ) : (
        <>
          <rect x={-h} y={0} width={MIRROR_LEN} height={5} fill="#a8a29e" />
          <path d={ROUGH_EDGE} stroke="#57534e" fill="none" />
        </>
      )}
      <text
        x={0}
        y={40}
        fontSize={10}
        letterSpacing={2}
        textAnchor="middle"
        fill="#64748b"
      >
        {surface === "mirror" ? "ХАВТГАЙ ТОЛЬ" : "БАРЗГАР ГАДАРГУУ"}
      </text>
    </g>
  );
});

/** Гэрлийн хайрцгийн цахилгааны утас — араас нь ширээний ирмэг хүртэл сул унжина */
function Cable({ source }: { source: LightSource }) {
  const d = fromHeading(source.dir);
  const side = { x: -d.y, y: d.x };
  const back = sub(source.pos, scale(d, SOURCE_HALF));
  const end = sub(rayToRect(back, scale(d, -1), SCENE), scale(d, 12));
  const l = dist(back, end);
  const c1 = add(sub(back, scale(d, l * 0.35)), scale(side, 18));
  const c2 = add(add(end, scale(d, l * 0.3)), scale(side, -14));
  return (
    <path
      d={`M ${f1(back.x)} ${f1(back.y)} C ${f1(c1.x)} ${f1(c1.y)} ${f1(c2.x)} ${f1(c2.y)} ${f1(end.x)} ${f1(end.y)}`}
      stroke="#0b0f19"
      strokeWidth={4}
      strokeLinecap="round"
      fill="none"
      pointerEvents="none"
    />
  );
}

/** Гэрлийн хайрцаг: урд хавтан дээр 1 эсвэл 3 нарийн ангархай */
function RayBoxBody({ on, slits }: { on: boolean; slits: 1 | 3 }) {
  const ys = slits === 1 ? [0] : [-SLIT_GAP, 0, SLIT_GAP];
  return (
    <>
      <rect
        x={-SOURCE_HALF}
        y={-19}
        width={SOURCE_HALF * 2}
        height={38}
        rx={6}
        fill="url(#lab-metal)"
        stroke="#0b1220"
        strokeWidth={1.2}
      />
      {[-20, -12, -4, 4].map((x) => (
        <line
          key={x}
          x1={x}
          y1={-11}
          x2={x}
          y2={11}
          stroke="#0f172a"
          strokeWidth={2.4}
          strokeLinecap="round"
          opacity={0.7}
        />
      ))}
      <rect x={SOURCE_HALF - 5} y={-17} width={6} height={34} rx={1} fill="#0b1220" />
      {ys.map((y) => (
        <rect
          key={y}
          x={SOURCE_HALF - 1}
          y={y - 1.6}
          width={2.4}
          height={3.2}
          fill={on ? "#fff7d6" : "#334155"}
        />
      ))}
      <circle cx={-SOURCE_HALF + 9} cy={-12} r={3} fill={on ? "#22c55e" : "#475569"} />
    </>
  );
}

/** Лазер заагч: металл их бие, улаан товч */
function LaserBody({ on }: { on: boolean }) {
  return (
    <>
      <rect
        x={-SOURCE_HALF}
        y={-9}
        width={SOURCE_HALF * 2 - 4}
        height={18}
        rx={9}
        fill="url(#lab-laser)"
        stroke="#374151"
      />
      <rect x={SOURCE_HALF - 10} y={-8} width={10} height={16} rx={2} fill="#1f2937" />
      <circle cx={SOURCE_HALF} cy={0} r={2} fill={on ? "#ff4d4d" : "#4b5563"} />
      <circle cx={-8} cy={-9} r={3.4} fill={on ? "#ef4444" : "#7f1d1d"} stroke="#450a0a" />
    </>
  );
}

/* ---------- Протрактор (орон нутгийн координатаар, нэг удаа зурна) ---------- */

const P_R = PROTRACTOR_R;
const P_IN = 62;
const P_STRIP = 18;

const PROTRACTOR_BODY = `M ${-P_R} 0 A ${P_R} ${P_R} 0 0 1 ${P_R} 0 L ${P_R} ${P_STRIP} L ${-P_R} ${P_STRIP} Z M ${-P_IN} 0 A ${P_IN} ${P_IN} 0 0 1 ${P_IN} 0 Z`;

const PROTRACTOR_TICKS = (() => {
  let d = "";
  for (let k = 0; k <= 180; k++) {
    const l = k % 10 === 0 ? 15 : k % 5 === 0 ? 10 : 6;
    const c = Math.cos(toRad(k));
    const s = -Math.sin(toRad(k));
    d += `M${f2(P_R * c)} ${f2(P_R * s)}L${f2((P_R - l) * c)} ${f2((P_R - l) * s)}`;
    if (k % 10 === 0) {
      d += `M${f2(P_IN * c)} ${f2(P_IN * s)}L${f2((P_IN + 7) * c)} ${f2((P_IN + 7) * s)}`;
    }
  }
  // Суурийн доод ирмэг дээрх миллиметрийн хуваарь
  const mm = 1 / MM_PER_UNIT;
  const n = Math.floor((P_R - 6) / mm);
  for (let i = -n; i <= n; i++) {
    const l = i % 10 === 0 ? 7 : i % 5 === 0 ? 5 : 3;
    d += `M${f2(i * mm)} ${P_STRIP}L${f2(i * mm)} ${P_STRIP - l}`;
  }
  return d;
})();

const PROTRACTOR_LABELS = Array.from({ length: 19 }, (_, j) => {
  const k = j * 10;
  const c = Math.cos(toRad(k));
  const s = -Math.sin(toRad(k));
  return {
    k,
    outer: { x: (P_R - 25) * c, y: (P_R - 25) * s },
    inner: { x: (P_R - 39) * c, y: (P_R - 39) * s },
    rot: 90 - k,
  };
});

const ProtractorFace = memo(function ProtractorFace() {
  return (
    <g>
      <path
        d={PROTRACTOR_BODY}
        fillRule="evenodd"
        fill="rgba(254, 249, 219, 0.5)"
        stroke="#57534e"
      />
      <path d={PROTRACTOR_TICKS} stroke="#1c1917" strokeWidth={0.7} />
      {PROTRACTOR_LABELS.map((l) => (
        <g key={l.k}>
          <text
            x={f2(l.outer.x)}
            y={f2(l.outer.y)}
            transform={`rotate(${l.rot} ${f2(l.outer.x)} ${f2(l.outer.y)})`}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={9.5}
            fontWeight={600}
            fill="#1c1917"
          >
            {l.k}
          </text>
          <text
            x={f2(l.inner.x)}
            y={f2(l.inner.y)}
            transform={`rotate(${l.rot} ${f2(l.inner.x)} ${f2(l.inner.y)})`}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={8}
            fill="#b91c1c"
          >
            {180 - l.k}
          </text>
        </g>
      ))}
      {/* 90°-ийн туслах шугам ба төвийн тэмдэг */}
      <line x1={0} y1={-P_IN} x2={0} y2={-(P_R - 48)} stroke="#1c1917" strokeWidth={0.5} opacity={0.5} />
      <path d="M -6 0 L 6 0 M 0 0 L 0 9" stroke="#1c1917" strokeWidth={1} />
      <text x={P_R - 14} y={7} fontSize={6} fill="#57534e" textAnchor="middle">
        мм
      </text>
    </g>
  );
});

/* ---------- Цацраг ---------- */

/** Тэлж буй цацрагийн дөрвөлжин: a цэгт өргөн wa, b цэгт wb */
function beamPoly(a: Vec, b: Vec, wa: number, wb: number): string {
  const d = norm(sub(b, a));
  const s = { x: -d.y, y: d.x };
  return pointsOf([
    add(a, scale(s, wa / 2)),
    add(b, scale(s, wb / 2)),
    add(b, scale(s, -wb / 2)),
    add(a, scale(s, -wa / 2)),
  ]);
}

function Beams({
  rays,
  kind,
  roomLight,
}: {
  rays: Ray[];
  kind: SourceKind;
  roomLight: boolean;
}) {
  const laser = kind === "laser";
  // Гэрэлтэй өрөөнд цацраг цагаан цаасан дээр бүдэг харагдана
  const core = laser ? "#ff2a2a" : roomLight ? "#f59e0b" : "#fff5cf";
  const glow = laser ? "#ff1f1f" : "#fbbf24";
  const w0 = laser ? 2.2 : 4.5;
  // Гэрлийн хайрцгийн цацраг бага зэрэг тэлдэг, лазерынх тэлдэггүй
  const spread = laser ? 0 : 0.0045;
  const glowOpacity = roomLight ? (laser ? 0.22 : 0.18) : laser ? 0.75 : 0.6;
  const glowWidth = laser ? 10 : 18;

  return (
    <g pointerEvents="none">
      <g filter="url(#lab-beam-blur)" opacity={glowOpacity} stroke={glow} strokeLinecap="round">
        {rays.map((r, k) => (
          <g key={k}>
            <line
              x1={f1(r.start.x)}
              y1={f1(r.start.y)}
              x2={f1(r.end.x)}
              y2={f1(r.end.y)}
              strokeWidth={glowWidth}
            />
            {r.hit &&
              r.reflectedEnds.map((e, j) => (
                <line
                  key={j}
                  x1={f1(r.hit!.x)}
                  y1={f1(r.hit!.y)}
                  x2={f1(e.x)}
                  y2={f1(e.y)}
                  strokeWidth={r.reflectedDir ? glowWidth : glowWidth * 0.4}
                  opacity={r.reflectedDir ? 0.9 : 0.35}
                />
              ))}
            {r.hit && (
              <circle
                cx={f1(r.hit.x)}
                cy={f1(r.hit.y)}
                r={laser ? 10 : 16}
                fill={glow}
                stroke="none"
              />
            )}
          </g>
        ))}
      </g>
      <g opacity={roomLight ? 0.85 : 1}>
        {rays.map((r, k) => {
          const wHit = w0 + spread * dist(r.start, r.end);
          return (
            <g key={k}>
              <polygon points={beamPoly(r.start, r.end, w0, wHit)} fill={core} />
              {r.hit &&
                r.reflectedEnds.map((e, j) =>
                  r.reflectedDir ? (
                    // Мөнгөлсөн толь гэрлийн ~90%-ийг ойлгоно
                    <polygon
                      key={j}
                      points={beamPoly(r.hit!, e, wHit, wHit + spread * dist(r.hit!, e))}
                      fill={core}
                      opacity={0.9}
                    />
                  ) : (
                    <line
                      key={j}
                      x1={f1(r.hit!.x)}
                      y1={f1(r.hit!.y)}
                      x2={f1(e.x)}
                      y2={f1(e.y)}
                      stroke={core}
                      strokeWidth={laser ? 1.2 : 1.8}
                      opacity={roomLight ? 0.3 : 0.45}
                    />
                  ),
                )}
              {r.hit && (
                <circle
                  cx={f1(r.hit.x)}
                  cy={f1(r.hit.y)}
                  r={laser ? 2.6 : 4}
                  fill={r.side === "back" ? "#78716c" : "#fffbeb"}
                />
              )}
            </g>
          );
        })}
      </g>
    </g>
  );
}

/* ---------- Туслах горим: жинхэнэ нормаль ба өнцөг ---------- */

/** Цайвар цаас ба харанхуй өрөөнд аль алинд нь уншигдах шошго */
function AngleBadge({ at, fill, text }: { at: Vec; fill: string; text: string }) {
  const w = text.length * 7.6 + 14;
  return (
    <g transform={`translate(${f1(at.x)} ${f1(at.y)})`}>
      <rect x={-w / 2} y={-11} width={w} height={22} rx={11} fill="#0b1324" opacity={0.88} />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={13}
        fontWeight={700}
        fill={fill}
      >
        {text}
      </text>
    </g>
  );
}

function HelperOverlay({ ray, mirrorAngle }: { ray: Ray; mirrorAngle: number }) {
  if (!ray.hit || ray.side !== "front" || ray.thetaI === null) return null;
  const h = ray.hit;
  const n = fromHeading(mirrorAngle + 90);
  const toSrc = norm(sub(ray.start, h));
  const aIn = Math.atan2(toSrc.y, toSrc.x);
  const aN = Math.atan2(n.y, n.x);
  const top = add(h, scale(n, 210));
  const bottom = add(h, scale(n, -22));
  const labelAt = (a0: number, a1: number, r: number): Vec => {
    const m = midAngle(a0, a1);
    return { x: h.x + Math.cos(m) * r, y: h.y + Math.sin(m) * r };
  };
  const r = ray.reflectedDir;
  const aR = r ? Math.atan2(r.y, r.x) : 0;

  return (
    <g pointerEvents="none">
      <line
        x1={f1(bottom.x)}
        y1={f1(bottom.y)}
        x2={f1(top.x)}
        y2={f1(top.y)}
        stroke="#22d3ee"
        strokeWidth={2}
        strokeDasharray="8 6"
      />
      <path d={arcPath(h, 58, aIn, aN)} fill="none" stroke="#38bdf8" strokeWidth={2.2} />
      <AngleBadge
        at={labelAt(aIn, aN, 104)}
        fill="#7dd3fc"
        text={`θᵢ = ${ray.thetaI.toFixed(1)}°`}
      />
      {r && ray.thetaR !== null && (
        <>
          <path d={arcPath(h, 74, aN, aR)} fill="none" stroke="#fb923c" strokeWidth={2.2} />
          <AngleBadge
            at={labelAt(aN, aR, 120)}
            fill="#fdba74"
            text={`θᵣ = ${ray.thetaR.toFixed(1)}°`}
          />
        </>
      )}
    </g>
  );
}

/* ---------- Эргүүлэх бариул ---------- */

function Knob({
  at,
  color,
  title,
  onPointerDown,
}: {
  at: Vec;
  color: string;
  title: string;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <g
      transform={`translate(${f1(at.x)} ${f1(at.y)})`}
      onPointerDown={onPointerDown}
      className="cursor-grab"
      style={{ touchAction: "none" }}
      aria-hidden
    >
      <title>{title}</title>
      <circle r={18} fill="transparent" />
      <circle r={11} fill="#0b1324" stroke={color} strokeWidth={2} />
      <text
        y={0.5}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={14}
        fill="#f8fafc"
      >
        ↻
      </text>
    </g>
  );
}
