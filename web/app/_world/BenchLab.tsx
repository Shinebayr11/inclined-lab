"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { dist, toRad } from "../_lab/geometry";
import {
  MAX_TRIALS,
  MIRROR_LEN,
  MIRROR_MAX,
  MIRROR_MIN,
  O,
  ORBIT_MAX,
  ORBIT_MIN,
  PAPER,
  PROTRACTOR_R,
  REQUIRED_ANGLES,
  SOURCE_HALF,
  type LightSource,
  type ProtractorState,
  type Ray,
  type Trial,
  aimedSource,
  distinctAngles,
  fillReadings,
  makeTrial,
  measuredTrials,
  orbitAngleOf,
  orbitPosition,
  placeSource,
  slitOf,
  traceBeam,
} from "../_lab/optics";
import { MeasurementTable, ResultsSummary, ScatterChart } from "../_lab/Results";
import { Card, Check, Segmented, Slider, Switch, primaryBtn, secondaryBtn } from "../_lab/ui";
import type { Bench, SetBench } from "./benchState";
import { useSheetTexture } from "./InclineLab";
import { travelMs } from "./avatar";
import type { IKTargets } from "./Student";

/* ============================================================
   3D ШИРЭЭН ДЭЭРХ ТУСГАЛЫН ТУРШИЛТ
   Тооцоо нь 2D хувилбартай ижил (optics.ts, SVG нэгж);
   энд зөвхөн SVG координатыг ширээний гадаргуу руу буулгана.
   ============================================================ */

/** 1 SVG нэгж = S метр (цаас ≈ 54 × 35 см) */
const S = 0.00065;
const LIFT = 0.0006;
// Цаасны төвөөс (м): хэмжилт бичих ажлын хуудас, өрөөний гэрлийн унтраалга
const NOTE = { x: 0.52, z: 0.3 };
const SWITCH = { x: 0.74, z: 0.33 };

const local = (x: number, y: number, h = 0): [number, number, number] => [
  (x - 450) * S,
  h,
  (y - 300) * S,
];

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const el = document.createElement("canvas");
  el.width = w;
  el.height = h;
  draw(el.getContext("2d")!);
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ---------- Цаас: толины шугам, O, нормаль, харандаагаар тэмдэглэсэн цацрагууд ---------- */

function usePaperTexture(trials: Trial[]) {
  const tex = useMemo(
    () =>
      canvasTexture(PAPER.w * 2, PAPER.h * 2, (c) => {
        c.scale(2, 2);
        c.translate(-PAPER.x, -PAPER.y);
        c.fillStyle = "#fbfaf6";
        c.fillRect(PAPER.x, PAPER.y, PAPER.w, PAPER.h);
        c.lineCap = "round";
        const line = (a: { x: number; y: number }, b: { x: number; y: number }) => {
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.stroke();
        };
        // Толины шугам ба нормаль (ажлын хуудсан дээр урьдчилан зурсан)
        c.strokeStyle = "rgba(60,60,70,0.75)";
        c.lineWidth = 1.6;
        line({ x: O.x - MIRROR_LEN / 2 - 30, y: O.y }, { x: O.x + MIRROR_LEN / 2 + 30, y: O.y });
        c.setLineDash([7, 6]);
        c.strokeStyle = "rgba(60,60,70,0.55)";
        line({ x: O.x, y: O.y }, { x: O.x, y: PAPER.y + 30 });
        c.setLineDash([]);
        c.fillStyle = "#334155";
        c.font = "italic 18px Georgia, serif";
        c.fillText("N", O.x + 6, PAPER.y + 46);
        c.fillText("O", O.x + 8, O.y + 22);
        c.beginPath();
        c.arc(O.x, O.y, 3, 0, Math.PI * 2);
        c.fill();
        // Тэмдэглэсэн цацрагууд
        for (const t of trials) {
          if (Math.abs(t.mirrorAngle) >= 0.25) {
            const a = toRad(t.mirrorAngle + 90);
            c.setLineDash([4, 6]);
            c.strokeStyle = "rgba(100,116,139,0.6)";
            line(t.hit, { x: t.hit.x + Math.cos(a) * 260, y: t.hit.y - Math.sin(a) * 260 });
            c.setLineDash([]);
          }
          c.strokeStyle = "rgba(40,40,48,0.85)";
          c.lineWidth = 1.4;
          line(t.start, t.hit);
          line(t.hit, t.end);
          c.fillStyle = "rgba(40,40,48,0.9)";
          c.font = "15px system-ui, sans-serif";
          c.fillText(String(t.id), t.start.x + 6, t.start.y - 6);
          c.fillText(String(t.id) + "′", t.end.x + 6, t.end.y - 6);
        }
      }),
    [trials],
  );
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/* ---------- Протрактор: 0–180° хоёр эгнээ хуваарьтай ---------- */

const P_PX = 3; // 1 SVG нэгж = 3 px
function useProtractorTexture() {
  return useMemo(
    () =>
      canvasTexture(1000, 520, (c) => {
        const cx = 500;
        const cy = 500;
        const R = PROTRACTOR_R * P_PX;
        c.fillStyle = "rgba(186,230,253,0.22)";
        c.beginPath();
        c.arc(cx, cy, R, Math.PI, 0);
        c.closePath();
        c.fill();
        c.strokeStyle = "rgba(8,80,110,0.95)";
        c.lineWidth = 3;
        c.stroke();
        c.fillStyle = "rgba(8,60,90,0.95)";
        c.textAlign = "center";
        c.textBaseline = "middle";
        for (let d = 0; d <= 180; d++) {
          const a = toRad(d);
          const len = d % 10 === 0 ? 36 : d % 5 === 0 ? 24 : 13;
          c.lineWidth = d % 10 === 0 ? 2.4 : 1.4;
          c.beginPath();
          c.moveTo(cx + Math.cos(a) * R, cy - Math.sin(a) * R);
          c.lineTo(cx + Math.cos(a) * (R - len), cy - Math.sin(a) * (R - len));
          c.stroke();
          if (d % 10 === 0) {
            c.font = "bold 22px system-ui, sans-serif";
            c.fillText(String(d), cx + Math.cos(a) * (R - 56), cy - Math.sin(a) * (R - 56));
            c.font = "17px system-ui, sans-serif";
            c.fillText(String(180 - d), cx + Math.cos(a) * (R - 86), cy - Math.sin(a) * (R - 86));
          }
        }
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(cx - R, cy);
        c.lineTo(cx + R, cy);
        c.moveTo(cx, cy);
        c.lineTo(cx, cy - R + 40);
        c.stroke();
        c.beginPath();
        c.arc(cx, cy, 7, 0, Math.PI * 2);
        c.stroke();
      }),
    [],
  );
}

/* ---------- Цацраг ---------- */

function Segment({
  a,
  b,
  color,
  bright,
}: {
  a: { x: number; y: number };
  b: { x: number; y: number };
  color: string;
  bright: boolean;
}) {
  const [ax, , az] = local(a.x, a.y);
  const [bx, , bz] = local(b.x, b.y);
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return null;
  const pos: [number, number, number] = [(ax + bx) / 2, LIFT * 3, (az + bz) / 2];
  const rot: [number, number, number] = [0, Math.atan2(-dz, dx), 0];
  return (
    <group position={pos} rotation={rot}>
      <mesh>
        <boxGeometry args={[len, 0.0008, 0.0016]} />
        <meshBasicMaterial color={color} transparent opacity={bright ? 1 : 0.55} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[len, 0.009]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={bright ? 0.35 : 0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function Beams({ rays, color, bright }: { rays: Ray[]; color: string; bright: boolean }) {
  return (
    <>
      {rays.map((r, i) => (
        <group key={i}>
          <Segment a={r.start} b={r.end} color={color} bright={bright} />
          {r.hit &&
            r.reflectedEnds.map((e, k) => (
              <Segment key={k} a={r.hit!} b={e} color={color} bright={bright} />
            ))}
        </group>
      ))}
    </>
  );
}

/* ---------- Ширээн дээрх тоног төхөөрөмж ---------- */

/* ---------- Сурагчийн гараар хийгдэх үйлдэл ---------- */

/** Ширээн дээр харагдах төлөв: товч дарахад шууд биш, сурагчийн гар хүрч хийх үед өөрчлөгдөнө */
type Shown = {
  mirrorAngle: number;
  source: LightSource;
  protractor: ProtractorState;
  sourceOn: boolean;
  kind: Bench["kind"];
  slits: 1 | 3;
  surface: Bench["surface"];
  roomLight: boolean;
  trials: number;
};

const pick = (b: Bench): Shown => ({
  mirrorAngle: b.mirrorAngle,
  source: b.source,
  protractor: b.protractor,
  sourceOn: b.sourceOn,
  kind: b.kind,
  slits: b.slits,
  surface: b.surface,
  roomLight: b.roomLight,
  trials: b.trials.length,
});

const keyOf = (s: Shown) =>
  [
    s.mirrorAngle.toFixed(3),
    s.source.pos.x.toFixed(2),
    s.source.pos.y.toFixed(2),
    s.protractor.visible,
    s.protractor.pos.x.toFixed(2),
    s.protractor.pos.y.toFixed(2),
    s.protractor.rot.toFixed(2),
    s.sourceOn,
    s.kind,
    s.slits,
    s.surface,
    s.roomLight,
    s.trials,
  ].join("|");

type ActKind = "mirror" | "move" | "protractor" | "switch" | "surface" | "light" | "trace" | "write" | "sheet";
// [хүрэх, хийх, тавиад буцах] мс: эхлээд гар багажид хүрч, дараа нь багаж гартай хамт хөдөлнө
const TIMING: Record<ActKind, [number, number, number]> = {
  mirror: [380, 650, 250],
  move: [380, 700, 250],
  protractor: [380, 650, 250],
  switch: [420, 200, 250],
  surface: [420, 250, 250],
  light: [480, 200, 300],
  trace: [320, 2000, 250],
  write: [320, 1200, 250],
  sheet: [380, 400, 250],
};
type Act = { kind: ActKind; at: number; from: Shown; to: Shown };

const ease = (u: number) => u * u * (3 - 2 * u);
const lerp = THREE.MathUtils.lerp;

/** Үе шат: reach (хүрэх), act (хийх, u = 0..1), back (буцах), done */
function stageOf(a: Act, now: number) {
  const [r, m, k] = TIMING[a.kind];
  const e = now - a.at;
  const stage = e < r ? "reach" : e < r + m ? "act" : e < r + m + k ? "back" : "done";
  return { stage, u: THREE.MathUtils.clamp((e - r) / m, 0, 1) } as const;
}

/** Үйлдлийн явцад ширээн дээр харагдах төлөв */
function shownAt(a: Act, stage: string, u: number): Shown {
  const { from, to } = a;
  if (stage === "reach") return from;
  if (stage !== "act") return to;
  const k = ease(u);
  if (a.kind === "mirror" || a.kind === "move") {
    const pos = { x: lerp(from.source.pos.x, to.source.pos.x, k), y: lerp(from.source.pos.y, to.source.pos.y, k) };
    return { ...to, mirrorAngle: lerp(from.mirrorAngle, to.mirrorAngle, k), source: aimedSource(pos) };
  }
  if (a.kind === "protractor") {
    const p0 = from.protractor;
    const p1 = to.protractor;
    return {
      ...to,
      protractor: {
        visible: p0.visible || p1.visible,
        pos: { x: lerp(p0.pos.x, p1.pos.x, k), y: lerp(p0.pos.y, p1.pos.y, k) },
        rot: lerp(p0.rot, p1.rot, k),
      },
    };
  }
  // Харандаагаар зурж дуусахад л цаасан дээрх зураас үлдэнэ
  if (a.kind === "trace") return { ...to, trials: from.trials };
  return to;
}

export function BenchTable({
  bench,
  setBench,
  active,
  origin,
  ikRef,
  onLight,
}: {
  bench: Bench;
  setBench: SetBench;
  active: boolean;
  /** Цаасны төв (SVG 450,300) байрлах дэлхийн цэг */
  origin: [number, number, number];
  ikRef: React.RefObject<IKTargets>;
  /** Өрөөний гэрлийг сурагч унтраалга дарах агшинд солино */
  onLight: (on: boolean) => void;
}) {
  const [shown, setShown] = useState<Shown>(() => pick(bench));
  const shownRef = useRef<Shown>(shown);
  const act = useRef<Act | null>(null);
  const seen = useRef({ target: pick(bench), write: "" });
  const lightRef = useRef(bench.roomLight);
  // Гэрлийн хайрцгийг хулганаар чирэх үед гар шууд дагана
  const handOn = useRef(0);
  // Сурагчийн зогсох цэг (ширээний төвөөс x); бага зөрүүд байн байн гишгэхгүй
  const standX = useRef(0);
  // Ширээнээс босох агшинд нэг кадр зорилтыг дахин бичиж болох тул идэвхгүй болмогц цэвэрлэнэ
  const wasActive = useRef(false);
  const drawn = useMemo(() => bench.trials.slice(0, shown.trials), [bench.trials, shown.trials]);
  const paper = usePaperTexture(drawn);
  const sheet = useSheetTexture("θᵢ     θᵣ");
  const pencilLine = useRef<THREE.Group>(null);
  const world = useMemo(
    () => ({
      box: new THREE.Vector3(),
      look: new THREE.Vector3(),
      stand: new THREE.Vector3(),
      rest: new THREE.Vector3(),
      restR: new THREE.Vector3(),
      tmp: new THREE.Vector3(),
    }),
    [],
  );
  const protractorTex = useProtractorTexture();
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const count = shown.kind === "laser" ? 1 : shown.slits;
  const rays = useMemo(
    () => (shown.sourceOn ? traceBeam(shown.source, shown.mirrorAngle, count, shown.surface) : []),
    [shown.sourceOn, shown.source, shown.mirrorAngle, count, shown.surface],
  );
  const color = shown.kind === "laser" ? "#ff3b30" : "#ffe7a3";
  const slit = slitOf(shown.source);

  // Цаасан дээр чирэхэд эх үүсвэр хуруу/хулганыг дагаж, O руу чиглэнэ
  useEffect(() => {
    if (!active) return;
    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -origin[1]);
    const hit = new THREE.Vector3();
    let dragging = false;
    const toSvg = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      return { x: 450 + (hit.x - origin[0]) / S, y: 300 + (hit.z - origin[2]) / S };
    };
    const move = (p: { x: number; y: number }) => {
      handOn.current = performance.now();
      setBench((b) => ({ ...b, source: aimedSource(placeSource(p, b.mirrorAngle)) }));
    };
    const down = (e: PointerEvent) => {
      const p = toSvg(e);
      if (!p || p.x < PAPER.x || p.x > PAPER.x + PAPER.w || p.y < PAPER.y || p.y > PAPER.y + PAPER.h)
        return;
      dragging = true;
      move(p);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {} // хуруу аль хэдийн өргөгдсөн бол
    };
    const drag = (e: PointerEvent) => {
      if (!dragging) return;
      handOn.current = performance.now();
      const p = toSvg(e);
      if (p) move(p);
    };
    const up = () => (dragging = false);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", drag);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", drag);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [active, camera, gl, origin, setBench]);

  useFrame(() => {
    const now = performance.now();
    const target = pick(bench);
    const write = bench.trials.map((tr) => `${tr.measI},${tr.measR}`).join(";") + bench.checked;
    const was = seen.current.target;
    const dragging = now - handOn.current < 120;
    let kind: ActKind | null = null;
    if (target.trials > was.trials) kind = "trace";
    else if (target.trials === 0 && was.trials > 0) kind = "sheet";
    else if (target.mirrorAngle !== was.mirrorAngle) kind = "mirror";
    else if (target.source !== was.source) kind = dragging ? null : "move";
    else if (target.protractor !== was.protractor) kind = "protractor";
    else if (target.surface !== was.surface) kind = "surface";
    else if (target.sourceOn !== was.sourceOn || target.kind !== was.kind || target.slits !== was.slits)
      kind = "switch";
    else if (target.roomLight !== was.roomLight) kind = "light";
    else if (write !== seen.current.write && target.trials === was.trials) kind = "write";
    const changed = keyOf(target) !== keyOf(was);
    seen.current = { target, write };
    // Шинэ үйлдэл одоо харагдаж буй байрлалаас эхэлнэ; чирэх үед багаж шууд гарыг дагана
    if (kind) act.current = { kind, at: now, from: shownRef.current, to: target };
    else if (changed && !act.current) shownRef.current = target;
    else if (changed && act.current) act.current = { ...act.current, to: target };

    const a = act.current;
    const st = a ? stageOf(a, now) : null;
    const disp = a && st ? shownAt(a, st.stage, st.u) : shownRef.current;
    if (st?.stage === "done") act.current = null;
    if (keyOf(disp) !== keyOf(shownRef.current) || disp !== shownRef.current) {
      shownRef.current = disp;
      if (keyOf(disp) !== keyOf(shown)) setShown(disp);
    }
    if (disp.roomLight !== lightRef.current) {
      lightRef.current = disp.roomLight;
      onLight(disp.roomLight);
    }

    // Харандааны зураас үзүүрийг дагаж ургана
    const tr = a?.kind === "trace" ? bench.trials[bench.trials.length - 1] : null;
    let tip: { x: number; y: number } | null = null;
    if (tr && st && st.stage !== "done") {
      const u = st.stage === "reach" ? 0 : st.u;
      tip = u < 0.5
        ? { x: lerp(tr.start.x, tr.hit.x, u * 2), y: lerp(tr.start.y, tr.hit.y, u * 2) }
        : { x: lerp(tr.hit.x, tr.end.x, u * 2 - 1), y: lerp(tr.hit.y, tr.end.y, u * 2 - 1) };
      const g = pencilLine.current;
      if (g) {
        g.visible = true;
        const set = (m: THREE.Object3D, p: { x: number; y: number }, q: { x: number; y: number } | null) => {
          if (!q) return void (m.visible = false);
          const [ax, , az] = local(p.x, p.y);
          const [bx, , bz] = local(q.x, q.y);
          const len = Math.hypot(bx - ax, bz - az);
          m.visible = len > 1e-4;
          m.position.set((ax + bx) / 2, LIFT * 2, (az + bz) / 2);
          m.rotation.set(0, Math.atan2(-(bz - az), bx - ax), 0);
          m.scale.set(Math.max(len, 1e-4), 1, 1);
        };
        set(g.children[0], tr.start, u < 0.5 ? tip : tr.hit);
        set(g.children[1], tr.hit, u < 0.5 ? null : tip);
      }
    } else if (pencilLine.current) pencilLine.current.visible = false;

    if (!active) {
      if (wasActive.current) Object.assign(ikRef.current, { left: null, right: null, look: null, stand: null, pencil: false });
      wasActive.current = false;
      return;
    }
    wasActive.current = true;
    const t = ikRef.current;
    const at = (x: number, y: number, h: number, out: THREE.Vector3) => {
      const [wx, , wz] = local(x, y);
      return out.set(origin[0] + wx, origin[1] + h, origin[2] + wz);
    };
    const local3 = (x: number, h: number, z: number, out: THREE.Vector3) =>
      out.set(origin[0] + x, origin[1] + h, origin[2] + z);
    at(disp.source.pos.x, disp.source.pos.y, 0.034, world.box);
    let reach: THREE.Vector3 | null = null;
    let hold = 0.6;
    t.pencil = false;
    const working = a && st && (st.stage === "reach" || st.stage === "act");
    if (now - handOn.current < 900 && !working) {
      reach = world.box; // гэрлийн хайрцгийг барьж зөөнө
    } else if (a && st && working) {
      switch (a.kind) {
        case "mirror": {
          // Толины баруун үзүүрээс барьж эргүүлнэ
          const ang = toRad(disp.mirrorAngle);
          const r = MIRROR_LEN / 2 - 30;
          reach = at(O.x + Math.cos(ang) * r, O.y - Math.sin(ang) * r, 0.05, world.tmp);
          hold = 0.8;
          break;
        }
        case "move":
          reach = world.box;
          break;
        case "protractor":
          // Протракторыг хоёр хуруугаар чимхэж зөөнө
          reach = at(disp.protractor.pos.x, disp.protractor.pos.y, 0.006, world.tmp);
          hold = 0.45;
          break;
        case "switch":
          // Хайрцгийн унтраалгыг дарна
          reach = world.box.setY(origin[1] + 0.04);
          hold = 0.35;
          break;
        case "surface":
          // Толь/гадаргууг солихоор барина
          reach = at(O.x, O.y, 0.05, world.tmp);
          hold = 0.75;
          break;
        case "light":
          reach = local3(SWITCH.x, 0.045, SWITCH.z, world.tmp);
          hold = 0.3;
          break;
        case "trace":
          reach = tip ? at(tip.x, tip.y, 0.002, world.tmp) : null;
          t.pencil = true;
          break;
        case "write": {
          // Ажлын хуудсан дээр мөр мөрөөр бичнэ
          const u = st.stage === "reach" ? 0 : st.u;
          const line = Math.min(2, Math.floor(u * 3));
          const v = (u * 3) % 1;
          reach = local3(
            NOTE.x - 0.06 + 0.12 * v,
            0.003 + 0.004 * Math.abs(Math.sin(v * 40)),
            NOTE.z - 0.035 + line * 0.025,
            world.tmp,
          );
          t.pencil = true;
          break;
        }
        case "sheet":
          // Хуучин цаасыг алгаараа дарж солино
          reach = at(450, 330, 0.02, world.tmp);
          hold = 0.05;
          break;
      }
    }
    // Ажиллаж буй гар руу хагас алхам ойртоно
    if (reach) {
      const want = THREE.MathUtils.clamp((reach.x - origin[0]) * 0.6, -0.22, 0.22);
      if (Math.abs(want - standX.current) > 0.12) {
        // Бие очиж амжтал үйлдлийг хойшлуулна: гар хүрэхээс өмнө юм хөдлөхгүй
        if (a && st?.stage === "reach")
          a.at = Math.max(a.at, now + travelMs(Math.abs(want - standX.current)) - TIMING[a.kind][0]);
        standX.current = want;
      }
    }
    t.stand = world.stand.set(origin[0] + standX.current, 0, origin[2] + 0.62);
    const [ox, , oz] = local(O.x, O.y);
    t.look = reach ?? world.look.set(origin[0] + ox, origin[1], origin[2] + oz);
    // Сул гар ширээний ирмэг дээр; зурах үед зүүн гараар цаасаа дарна
    t.left =
      a?.kind === "trace" && working
        ? at(PAPER.x + 80, PAPER.y + PAPER.h - 40, 0.03, world.rest)
        : world.rest.set(t.stand.x - 0.2, origin[1] + 0.05, origin[2] + 0.39);
    t.gripL = 0.1;
    t.right = reach ?? world.restR.set(t.stand.x + 0.2, origin[1] + 0.05, origin[2] + 0.39);
    t.gripR = reach ? hold : 0.12;
  });

  const p = shown.protractor;
  const mirrorMat =
    shown.surface === "mirror" ? (
      <meshStandardMaterial color="#e8f0f6" metalness={0.75} roughness={0.08} />
    ) : (
      <meshStandardMaterial color="#b9b2a6" roughness={0.95} />
    );

  return (
    <group position={origin}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={local(PAPER.x + PAPER.w / 2, PAPER.y + PAPER.h / 2, LIFT)} receiveShadow>
        <planeGeometry args={[PAPER.w * S, PAPER.h * S]} />
        <meshStandardMaterial map={paper} roughness={0.95} />
      </mesh>
      {/* Харандаагаар зурж буй шугам (дуусахад цаасан дээр үлдэнэ) */}
      <group ref={pencilLine} visible={false}>
        {[0, 1].map((i) => (
          <mesh key={i}>
            <boxGeometry args={[1, 0.0004, 0.0012]} />
            <meshBasicMaterial color="#2a2a30" />
          </mesh>
        ))}
      </group>

      {/* Толь: урд тал нь O-г дайрсан шугам дээр, ар тал нь будагтай */}
      <group position={local(O.x, O.y)} rotation={[0, toRad(shown.mirrorAngle), 0]}>
        <mesh position={[0, 0.024, -0.0005]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[MIRROR_LEN * S, 0.044]} />
          {mirrorMat}
        </mesh>
        <mesh position={[0, 0.024, 0.0025]} castShadow>
          <boxGeometry args={[MIRROR_LEN * S, 0.046, 0.005]} />
          <meshStandardMaterial color="#1f2937" roughness={0.6} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[(s * MIRROR_LEN * S) / 2.3, 0.006, 0.012]} castShadow>
            <boxGeometry args={[0.03, 0.012, 0.03]} />
            <meshStandardMaterial color="#374151" roughness={0.5} />
          </mesh>
        ))}
      </group>

      {/* Гэрлийн хайрцаг / лазер */}
      <group position={local(shown.source.pos.x, shown.source.pos.y)} rotation={[0, toRad(shown.source.dir), 0]}>
        {shown.kind === "raybox" ? (
          <>
            <mesh position={[0, 0.016, 0]} castShadow>
              <boxGeometry args={[SOURCE_HALF * 2 * S, 0.032, 0.034]} />
              <meshStandardMaterial color="#111827" roughness={0.45} />
            </mesh>
            <mesh position={[SOURCE_HALF * S + 0.0005, 0.012, 0]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[shown.slits === 3 ? 0.02 : 0.004, 0.014]} />
              <meshBasicMaterial color={shown.sourceOn ? "#fff4c2" : "#3f3f46"} toneMapped={false} />
            </mesh>
          </>
        ) : (
          <>
            <mesh position={[0, 0.01, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.008, 0.008, SOURCE_HALF * 2 * S, 20]} />
              <meshStandardMaterial color="#9ca3af" metalness={0.7} roughness={0.3} />
            </mesh>
            <mesh position={[SOURCE_HALF * S, 0.01, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.004, 0.006, 0.006, 16]} />
              <meshBasicMaterial color={shown.sourceOn ? "#ff5a4f" : "#4b5563"} toneMapped={false} />
            </mesh>
          </>
        )}
      </group>
      {shown.sourceOn && (
        <pointLight position={local(slit.x, slit.y, 0.03)} color={color} intensity={0.25} distance={0.9} decay={2} />
      )}
      <Beams rays={rays} color={color} bright={!shown.roomLight} />

      {p.visible && (
        <group position={local(p.pos.x, p.pos.y, LIFT * 2)} rotation={[0, toRad(p.rot), 0]}>
          {/* Бүтцийн төв (500,260 px) нь хэмжилтийн төвөөс 240 px = 80 нэгж дээр */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -((500 - 260) / P_PX) * S]}>
            <planeGeometry args={[(1000 / P_PX) * S, (520 / P_PX) * S]} />
            <meshBasicMaterial map={protractorTex} transparent depthWrite={false} />
          </mesh>
        </group>
      )}

      {/* Хэмжилт бичих ажлын хуудас ба өрөөний гэрлийн унтраалга */}
      <mesh position={[NOTE.x, 0.001, NOTE.z]} rotation={[-Math.PI / 2, 0, -0.1]} receiveShadow>
        <planeGeometry args={[0.21, 0.15]} />
        <meshStandardMaterial map={sheet} roughness={0.9} />
      </mesh>
      <group position={[SWITCH.x, 0, SWITCH.z]}>
        <mesh position={[0, 0.02, 0]} castShadow>
          <boxGeometry args={[0.07, 0.04, 0.05]} />
          <meshStandardMaterial color="#e5e7eb" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.042, 0]} rotation={[shown.roomLight ? 0.35 : -0.35, 0, 0]}>
          <boxGeometry args={[0.02, 0.01, 0.026]} />
          <meshStandardMaterial color={shown.roomLight ? "#fbbf24" : "#6b7280"} roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}

/* ---------- Ширээ рүү ойртох камер ---------- */

export function BenchCamera({
  active,
  zoom,
  origin,
}: {
  active: boolean;
  zoom: 1 | 2 | 3;
  origin: [number, number, number];
}) {
  const goal = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }, delta) => {
    if (!active) return;
    if (zoom === 1) {
      // Ерөнхий харагдац: ширээний эсрэг талаас — сурагч камер руу харж ажиллана.
      // Энэ өнцгөөс дэлгэцийн баруун тал нь -x тул самбарын зайг -x тийш шилжүүлнэ
      const wide = size.width >= 1024;
      const far = size.width / size.height < 1.2 ? 1.5 : 1;
      look.set(origin[0] - (wide ? 0.3 : 0.05), origin[1] + (wide ? 0.18 : 0), origin[2] + 0.3);
      goal.set(look.x, origin[1] + 0.8 * far, origin[2] - 1.2 * far);
      camera.position.lerp(goal, 1 - Math.exp(-6 * Math.min(delta, 0.05)));
      camera.lookAt(look);
      return;
    }
    // Томруулахад O цэг рүү ойртоно; өргөн дэлгэцэнд баруун самбарын ард орохгүй
    const [ox, , oz] = local(O.x, O.y - 70);
    const k = (zoom - 1) / 2;
    const side = size.width >= 1024 ? 0.14 / zoom : 0;
    look.set(origin[0] + ox * k + side, origin[1], origin[2] + (oz - 0.03) * k);
    const far = size.width / size.height < 1.2 ? 1.6 : 1;
    goal.set(look.x, origin[1] + (0.6 * far) / zoom, look.z + (0.36 * far) / zoom);
    const t = 1 - Math.exp(-6 * Math.min(delta, 0.05));
    camera.position.lerp(goal, t);
    camera.lookAt(look);
  });
  return null;
}

/* ---------- Удирдлагын самбар ---------- */

export function BenchPanel({
  bench,
  setBench,
  onLeave,
  onOpen2D,
  view,
  onView,
}: {
  bench: Bench;
  setBench: SetBench;
  onLeave: () => void;
  onOpen2D: () => void;
  view: "eyes" | "side";
  onView: (v: "eyes" | "side") => void;
}) {
  const set = (patch: Partial<Bench>) => setBench((b) => ({ ...b, ...patch }));
  const count = bench.kind === "laser" ? 1 : bench.slits;
  const main = bench.sourceOn
    ? (traceBeam(bench.source, bench.mirrorAngle, count, bench.surface)[0] ?? null)
    : null;
  const measured = measuredTrials(bench.trials);
  const distinct = distinctAngles(measured);
  const canCheck = distinct >= REQUIRED_ANGLES;
  const orbit = Math.round(orbitAngleOf(bench.source.pos, bench.mirrorAngle));
  const duplicate =
    main?.hit &&
    main.thetaI !== null &&
    bench.trials.some(
      (t) =>
        Math.abs(t.trueI - main.thetaI!) < 0.25 &&
        Math.abs(t.mirrorAngle - bench.mirrorAngle) < 0.25 &&
        dist(t.hit, main.hit!) < 2,
    );
  const block = !bench.sourceOn
    ? "Эх үүсвэрээ асаа."
    : bench.surface === "rough"
      ? "Барзгар гадаргуу дээр ойсон гэрэл олон зүг тардаг тул нэг цацрагийг тэмдэглэх боломжгүй."
      : !main?.hit
        ? "Цацраг толинд тусахгүй байна — эх үүсвэрийг толь руу чиглүүл."
        : main.side === "back"
          ? "Цацраг толины ар талд тусаж байна."
          : bench.trials.length >= MAX_TRIALS
            ? "Цаас дүүрлээ — «Шинэ цаас» дарна уу."
            : duplicate
              ? "Энэ цацрагийг аль хэдийн тэмдэглэсэн. Эх үүсвэрийг зөөгөөд дахин тэмдэглэ."
              : null;

  const tasks = [
    { done: !bench.roomLight, text: "Өрөөний гэрлийг унтраа" },
    { done: bench.trials.length > 0, text: "Цацрагийг цаасан дээр тэмдэглэ" },
    {
      done: bench.protractor.visible && dist(bench.protractor.pos, O) < 1.5,
      text: "Протракторыг O цэгт тавь",
    },
    { done: distinct >= REQUIRED_ANGLES, text: `${REQUIRED_ANGLES} өөр өнцгөөр хэмж` },
    { done: bench.checked, text: "Хэмжилтээ шалга" },
  ];

  function trace() {
    if (block || !main) return;
    const t = makeTrial(bench.nextId, main, bench.mirrorAngle);
    if (!t) return;
    setBench((b) => ({
      ...b,
      trials: [...b.trials, b.autoFill ? fillReadings(t) : t],
      nextId: b.nextId + 1,
    }));
  }

  return (
    <aside className="absolute inset-x-0 bottom-0 max-h-[55dvh] space-y-4 overflow-y-auto border-t border-[#16223A] bg-[#081124]/95 p-4 backdrop-blur lg:inset-y-0 lg:left-auto lg:max-h-none lg:w-[400px] lg:border-l lg:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onLeave}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-sky-300 transition hover:bg-[#132038]"
        >
          ← Ширээнээс босох
        </button>
        <button
          type="button"
          onClick={onOpen2D}
          className="rounded-lg px-3 py-1.5 text-xs text-slate-400 transition hover:bg-[#132038]"
        >
          2D хувилбар
        </button>
      </div>
      <Segmented
        label="Харах өнцөг"
        value={view}
        options={[
          { value: "eyes", label: "👀 Миний нүдээр" },
          { value: "side", label: "🎥 Хажуугаас" },
        ]}
        onChange={onView}
      />
      <header>
        <h2 className="text-lg font-bold">🔦 Гэрлийн тусгалын туршилт</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Цаасан дээр чирж гэрлийн эх үүсвэрийг зөөнө. Цацрагийг тэмдэглээд протрактороор
          нормалиас хэмжинэ.
        </p>
      </header>

      <ol className="space-y-1.5 rounded-xl border border-[#1D2A45] bg-[#0B1324] p-3 text-sm">
        {tasks.map((t, i) => (
          <li key={i} className={t.done ? "text-emerald-300" : "text-slate-300"}>
            {t.done ? "✓" : `${i + 1}.`} {t.text}
          </li>
        ))}
      </ol>

      <Card title="⚙️ Тоног төхөөрөмж">
        <Switch
          label="💡 Өрөөний гэрэл"
          status={bench.roomLight ? "Асаалттай" : "Унтраасан — цацраг тод харагдана"}
          checked={bench.roomLight}
          tone="sky"
          onChange={(v) => set({ roomLight: v })}
        />
        <Switch
          label="🔦 Эх үүсвэр"
          status={bench.sourceOn ? "Асаалттай" : "Унтраалттай"}
          checked={bench.sourceOn}
          onChange={(v) => set({ sourceOn: v })}
        />
        <Segmented
          label="Эх үүсвэрийн төрөл"
          value={bench.kind}
          options={[
            { value: "raybox", label: "Гэрлийн хайрцаг" },
            { value: "laser", label: "Лазер" },
          ]}
          onChange={(v) => set({ kind: v })}
        />
        <Segmented
          label="Цацраг"
          value={bench.slits}
          options={[
            { value: 1, label: "1 ангархай" },
            { value: 3, label: "3 ангархай", disabled: bench.kind === "laser" },
          ]}
          onChange={(v) => set({ slits: v })}
        />
        <Segmented
          label="Гадаргуу"
          value={bench.surface}
          options={[
            { value: "mirror", label: "Гөлгөр толь" },
            { value: "rough", label: "Барзгар" },
          ]}
          onChange={(v) => set({ surface: v })}
        />
        <Slider
          label="Эх үүсвэрийг O-г тойруулах"
          value={orbit}
          min={ORBIT_MIN}
          max={ORBIT_MAX}
          step={1}
          display={null}
          valueText={`нормалиас ${Math.abs(orbit)}°`}
          onChange={(a) =>
            setBench((b) => {
              const pos = orbitPosition(a, dist(b.source.pos, O), b.mirrorAngle);
              return { ...b, source: aimedSource(placeSource(pos, b.mirrorAngle)) };
            })
          }
        />
        <Slider
          label="Толины эргэлт"
          value={bench.mirrorAngle}
          min={MIRROR_MIN}
          max={MIRROR_MAX}
          step={0.5}
          display={`${bench.mirrorAngle}°`}
          onChange={(a) =>
            setBench((b) => ({
              ...b,
              mirrorAngle: a,
              source: aimedSource(placeSource(b.source.pos, a)),
            }))
          }
        />
      </Card>

      <Card title="🧰 Хэрэгсэл">
        <button
          type="button"
          onClick={() =>
            setBench((b) => ({ ...b, protractor: { visible: true, pos: O, rot: b.mirrorAngle } }))
          }
          className={secondaryBtn}
        >
          📐 Протракторыг O цэгт тавих
        </button>
        <Check
          label="Протракторыг харуулах"
          checked={bench.protractor.visible}
          onChange={(v) => setBench((b) => ({ ...b, protractor: { ...b.protractor, visible: v } }))}
        />
        <Segmented
          label="🔍 Томруулах"
          value={bench.zoom}
          options={[
            { value: 1, label: "1×" },
            { value: 2, label: "2×" },
            { value: 3, label: "3×" },
          ]}
          onChange={(v) => set({ zoom: v })}
        />
      </Card>

      <Card
        title="📋 Хэмжилт"
        aside={
          <span className="font-mono text-xs text-slate-400">
            {bench.trials.length}/{MAX_TRIALS}
          </span>
        }
      >
        <button type="button" onClick={trace} disabled={!!block} className={primaryBtn}>
          ✏️ Цацрагийг харандаагаар тэмдэглэх
        </button>
        {block && <p className="-mt-2 text-xs text-slate-500">{block}</p>}
        <Check
          label="Өнцгийг автоматаар бөглөх"
          hint="Унтраавал протрактороос уншсан утгаа өөрөө бичнэ"
          checked={bench.autoFill}
          onChange={(v) =>
            setBench((b) => ({ ...b, autoFill: v, trials: v ? b.trials.map(fillReadings) : b.trials }))
          }
        />
        <MeasurementTable
          trials={bench.trials}
          checked={bench.checked}
          autoFill={bench.autoFill}
          onChange={(id, field, value) =>
            setBench((b) => ({
              ...b,
              trials: b.trials.map((t) => (t.id === id ? { ...t, [field]: value } : t)),
            }))
          }
          onRemove={(id) => setBench((b) => ({ ...b, trials: b.trials.filter((t) => t.id !== id) }))}
        />
        <button
          type="button"
          onClick={() => set({ checked: true })}
          disabled={!canCheck || bench.checked}
          className="w-full rounded-xl border border-emerald-700/50 bg-emerald-950/40 px-4 py-2.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {bench.checked
            ? "Шалгасан ✓"
            : canCheck
              ? "✅ Хэмжилтээ шалгах"
              : `Шалгахад дахин ${REQUIRED_ANGLES - distinct} өөр өнцгийн хэмжилт хэрэгтэй`}
        </button>
        {bench.checked && <ResultsSummary rows={measured} />}
        <ScatterChart rows={measured} checked={bench.checked} />
        {bench.trials.length > 0 && (
          <button
            type="button"
            onClick={() => set({ trials: [], nextId: 1, checked: false })}
            className={secondaryBtn}
          >
            🗒 Шинэ цаас
          </button>
        )}
      </Card>
    </aside>
  );
}
