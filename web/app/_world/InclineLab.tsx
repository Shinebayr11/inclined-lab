"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { currentStudent, saveSession } from "../_ai/classLog";
import type { JudgeResult } from "../_ai/judge";
import { INCLINE_RUBRIC } from "../_ai/rubrics";
import { AiCheck, StudentBar } from "../_ai/ui";
import { Card, Check, Segmented, Slider, primaryBtn, secondaryBtn } from "../_lab/ui";
import { travelMs } from "./avatar";
import type { IKTargets } from "./Student";
import {
  F_MAX,
  H_MAX,
  H_MIN,
  type Incline,
  type InclineRow,
  L,
  MASSES,
  PULL_MS,
  REQUIRED_HEIGHTS,
  WEIGH_MS,
  SURFACES,
  type SetIncline,
  type SurfaceKind,
  INITIAL_INCLINE,
  angleOf,
  efficiency,
  gaugeAt,
  parseNum,
  progress,
  pullForce,
  readOff,
  weightOf,
} from "./incline";

/* ============================================================
   3D НАЛУУ ХАВТГАЙН ШИРЭЭ
   Ширээний урт тэнхлэг (x) дагуу налуу; сурагч урд ирмэгт (+z) зогсож
   динамометрийг баруун гараараа барьж жигнэж, налуугаар татна.
   ============================================================ */

const TOP = 0.93; // ширээний гадаргуу
const BOARD_X = -0.5; // налуугийн доод үзүүр
const BOARD_Z = 0.24; // гар хүрэхээр урд ирмэгт ойр
const STAND_Z = 0.74; // сурагч зогсох цэг (ширээний төвөөс)
const HOLD = { x: 0.36, y: TOP + 0.34, z: 0.4 }; // жинлэхэд динамометр барих цэг
const HAND = 0.15; // баруун гар биеийн төвөөс +x тийш
const SHEET = { x: 0.56, z: 0.34 }; // хүснэгт бичих ажлын хуудас
const TRAY = { x: 0.82, z: 0.18 }; // нэмэлт жингийн тавиур

const T = 0.015; // самбарын зузаан
const BLOCK = { l: 0.1, h: 0.05, w: 0.07 };
const DYN = 0.18; // динамометрийн урт
const S0 = 0.06; // брусын эхлэх байрлал самбар дагуу
const S1 = L - BLOCK.l - DYN - 0.06;

const SURFACE_LOOK: Record<SurfaceKind, { color: string; roughness: number }> = {
  wood: { color: "#c9a273", roughness: 0.7 },
  glass: { color: "#cfe6ee", roughness: 0.08 },
  sand: { color: "#8f7c5c", roughness: 1 },
};

function useRulerTexture() {
  return useMemo(() => {
    const el = document.createElement("canvas");
    el.width = 1600;
    el.height = 120;
    const c = el.getContext("2d")!;
    c.fillStyle = "#fff";
    c.fillRect(0, 0, 1600, 120);
    c.fillStyle = "#1f2937";
    c.strokeStyle = "#1f2937";
    c.font = "bold 26px system-ui, sans-serif";
    c.textAlign = "center";
    for (let cm = 0; cm <= 80; cm++) {
      const x = 10 + cm * 19.5;
      const len = cm % 10 === 0 ? 46 : cm % 5 === 0 ? 32 : 18;
      c.lineWidth = cm % 10 === 0 ? 3 : 1.6;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, len);
      c.stroke();
      if (cm % 10 === 0) c.fillText(String(cm), x, 84);
    }
    const t = new THREE.CanvasTexture(el);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
}

/** Мөртэй ажлын хуудас (хүснэгт бичих) */
export function useSheetTexture(header: string) {
  return useMemo(() => {
    const el = document.createElement("canvas");
    el.width = 420;
    el.height = 300;
    const c = el.getContext("2d")!;
    c.fillStyle = "#fbfaf6";
    c.fillRect(0, 0, 420, 300);
    c.strokeStyle = "#94a3b8";
    c.lineWidth = 2;
    for (let y = 70; y < 300; y += 46) {
      c.beginPath();
      c.moveTo(20, y);
      c.lineTo(400, y);
      c.stroke();
    }
    c.fillStyle = "#1f2937";
    c.font = "bold 26px system-ui, sans-serif";
    c.fillText(header, 40, 50);
    const t = new THREE.CanvasTexture(el);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [header]);
}

// Их бие нь +x чиглэлд, дэгээ нь -x үзүүрт; заагчийг useFrame-ээс хөдөлгөнө
function Dynamometer({ pointer }: { pointer: React.RefObject<THREE.Mesh | null> }) {
  return (
    <group>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.014, 0.014, DYN, 20]} />
        <meshStandardMaterial color="#e5e7eb" transparent opacity={0.85} roughness={0.2} />
      </mesh>
      <mesh position={[DYN / 2 + 0.01, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.016, 0.016, 0.02, 20]} />
        <meshStandardMaterial color="#2563eb" roughness={0.4} />
      </mesh>
      {/* Хуваарь ба улаан заагч */}
      <mesh position={[0, 0.0145, 0]}>
        <boxGeometry args={[DYN * 0.8, 0.001, 0.01]} />
        <meshStandardMaterial color="#fde68a" />
      </mesh>
      <mesh ref={pointer} position={[-DYN * 0.4, 0.016, 0]}>
        <boxGeometry args={[0.004, 0.004, 0.016]} />
        <meshBasicMaterial color="#dc2626" />
      </mesh>
      <mesh position={[-DYN / 2 - 0.012, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.002, 0.002, 0.024, 6]} />
        <meshStandardMaterial color="#6b7280" metalness={0.8} />
      </mesh>
    </group>
  );
}

function Block({ mass }: { mass: number }) {
  const extra = Math.round(mass / 0.1) - 1;
  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={[BLOCK.l, BLOCK.h, BLOCK.w]} />
        <meshStandardMaterial color="#9a6a3a" roughness={0.75} />
      </mesh>
      {Array.from({ length: extra }, (_, i) => (
        <mesh key={i} position={[-0.02 + i * 0.04, BLOCK.h / 2 + 0.012, 0]} castShadow>
          <cylinderGeometry args={[0.016, 0.016, 0.024, 20]} />
          <meshStandardMaterial color="#c9a227" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function Stand({ x, z, height }: { x: number; z: number; height: number }) {
  return (
    <group position={[x, TOP, z]}>
      <mesh position={[0, 0.006, 0]} castShadow>
        <boxGeometry args={[0.16, 0.012, 0.1]} />
        <meshStandardMaterial color="#374151" roughness={0.5} />
      </mesh>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.006, 0.006, height, 12]} />
        <meshStandardMaterial color="#d1d5db" metalness={0.85} roughness={0.25} />
      </mesh>
    </group>
  );
}

/* ---------- Сурагчийн гараар хийгдэх тохиргоо ---------- */

/** Ширээн дээр харагдах төлөв: товч дарахад шууд биш, сурагч гараараа хийх үед өөрчлөгдөнө */
type IShown = { h: number; mass: number; surface: SurfaceKind; rows: number; tray: number };
type IKind = "height" | "mass" | "surface" | "write" | "sheet";
// [хүрэх, хийх, тавиад буцах] мс
const ITIMING: Record<IKind, [number, number, number]> = {
  height: [380, 700, 250],
  mass: [380, 800, 250],
  surface: [420, 250, 250],
  write: [320, 1200, 250],
  sheet: [380, 400, 250],
};
type IAct = { kind: IKind; at: number; from: IShown; to: IShown };
const extraOf = (m: number) => Math.round(m / 0.1) - 1; // брус дээрх нэмэлт жингийн тоо

function iStage(a: IAct, now: number) {
  const [r, m, k] = ITIMING[a.kind];
  const e = now - a.at;
  const stage = e < r ? "reach" : e < r + m ? "act" : e < r + m + k ? "back" : "done";
  return { stage, u: THREE.MathUtils.clamp((e - r) / m, 0, 1) } as const;
}

function iShownAt(a: IAct, stage: string, u: number): IShown {
  const { from, to } = a;
  if (stage === "reach") return from;
  if (a.kind === "height" && stage === "act") {
    const k = u * u * (3 - 2 * u);
    return { ...to, h: THREE.MathUtils.lerp(from.h, to.h, k) };
  }
  // Жин нэмэхэд гар тавьж дуусахад, хасахад өргөмөгц брус дээрх тоо өөрчлөгдөнө; зөөж буй жин тавиурт ч үгүй
  if (a.kind === "mass" && stage === "act") {
    const tray = 2 - Math.max(extraOf(from.mass), extraOf(to.mass));
    return { ...to, mass: to.mass > from.mass ? from.mass : to.mass, tray };
  }
  return to;
}

export function InclineTable({
  incline,
  center,
  active,
  ikRef,
}: {
  incline: Incline;
  /** Ширээний төв (x, z) */
  center: { x: number; z: number; w: number; d: number };
  /** Сурагч энэ ширээнд туршилт хийж байгаа эсэх */
  active: boolean;
  ikRef: React.RefObject<IKTargets>;
}) {
  const ruler = useRulerTexture();
  const sheet = useSheetTexture("h      P      F      η");
  const block = useRef<THREE.Group>(null);
  const dyn = useRef<THREE.Group>(null);
  const string = useRef<THREE.Mesh>(null);
  const pointer = useRef<THREE.Mesh>(null);
  const carried = useRef<THREE.Group>(null);
  // Сурагчийн зогсох цэг (ширээний төвөөс x); бага зөрүүд байн байн гишгэхгүй
  const standX = useRef(0);
  // Ширээнээс босох агшинд нэг кадр зорилтыг дахин бичиж болох тул идэвхгүй болмогц цэвэрлэнэ
  const wasActive = useRef(false);
  const pick = (s: Incline): IShown => ({
    h: s.h,
    mass: s.mass,
    surface: s.surface,
    rows: s.rows.length,
    tray: 2 - extraOf(s.mass),
  });
  const [shown, setShown] = useState<IShown>(() => pick(incline));
  const shownRef = useRef<IShown>(shown);
  const act = useRef<IAct | null>(null);
  const seen = useRef({ target: pick(incline), write: "" });
  const a = angleOf(shown.h);
  const look = SURFACE_LOOK[shown.surface];
  const topX = BOARD_X + L * Math.cos(a);
  const along = useMemo(() => new THREE.Vector3(Math.cos(a), Math.sin(a), 0), [a]);
  const up = useMemo(() => new THREE.Vector3(-Math.sin(a), Math.cos(a), 0), [a]);
  // IK-д дамжуулах дэлхийн цэгүүд (кадр бүрт шинээр үүсгэхгүй)
  const world = useMemo(
    () => ({
      grip: new THREE.Vector3(),
      look: new THREE.Vector3(),
      stand: new THREE.Vector3(),
      rest: new THREE.Vector3(),
      restR: new THREE.Vector3(),
      tmp: new THREE.Vector3(),
    }),
    [],
  );
  // Брус, динамометр, сурагчийн гарыг үйлдлийн явцаар хөдөлгөнө
  useFrame(() => {
    const now = performance.now();
    const target = pick(incline);
    const write =
      incline.draftP + "," + incline.draftF + ";" + incline.rows.map((r) => r.P + "," + r.F).join(";") + incline.checked;
    const was = seen.current.target;
    let kind: IKind | null = null;
    if (target.rows > was.rows) kind = "write";
    else if (target.rows === 0 && was.rows > 0) kind = "sheet";
    else if (target.h !== was.h) kind = "height";
    else if (target.mass !== was.mass) kind = "mass";
    else if (target.surface !== was.surface) kind = "surface";
    else if (write !== seen.current.write && seen.current.write !== "") kind = "write";
    seen.current = { target, write };
    if (kind) act.current = { kind, at: now, from: shownRef.current, to: target };
    else if (!act.current) shownRef.current = target;

    const cur = act.current;
    const st = cur ? iStage(cur, now) : null;
    const disp = cur && st ? iShownAt(cur, st.stage, st.u) : shownRef.current;
    if (st?.stage === "done") act.current = null;
    shownRef.current = disp;
    if (disp.h !== shown.h || disp.mass !== shown.mass || disp.surface !== shown.surface || disp.tray !== shown.tray)
      setShown(disp);

    const p = progress(incline, now);
    if (pointer.current)
      pointer.current.position.x = -DYN * 0.4 + DYN * 0.8 * Math.min(1, gaugeAt(incline, now) / F_MAX);
    const b = block.current;
    const d = dyn.current;
    if (!b || !d) return;
    const base = new THREE.Vector3(BOARD_X, TOP, BOARD_Z);
    const onBoard = (s: number, lift: number) =>
      base.clone().addScaledVector(along, s).addScaledVector(up, T + lift);
    let grip: THREE.Vector3 | null = null;

    if (incline.action === "weigh") {
      // Брусыг налуунаас авч динамометрт дүүжлээд баруун гартаа өргөнө
      const hang = new THREE.Vector3(HOLD.x, HOLD.y - 0.02 - DYN - 0.012 - BLOCK.h / 2, HOLD.z);
      const k = THREE.MathUtils.smoothstep(p, 0.05, 0.45);
      b.position.lerpVectors(onBoard(S0 + BLOCK.l / 2, BLOCK.h / 2), hang, k);
      b.position.y += Math.sin(k * Math.PI) * 0.08;
      b.rotation.set(0, 0, a * (1 - k));
      d.position.set(b.position.x, b.position.y + BLOCK.h / 2 + 0.012 + DYN / 2, b.position.z);
      d.rotation.set(0, 0, Math.PI / 2);
      grip = d.position.clone().add(new THREE.Vector3(0, DYN / 2 + 0.02, 0));
    } else {
      const pulling = incline.action === "pull";
      // Эхлэл ба төгсгөлд зөөлөн, дунд нь жигд хурдтай
      const s = pulling ? S0 + (S1 - S0) * Math.min(1, Math.max(0, (p * PULL_MS - 250) / (PULL_MS - 500))) : S0;
      b.position.copy(onBoard(s + BLOCK.l / 2, BLOCK.h / 2));
      b.rotation.set(0, 0, a);
      if (pulling) {
        d.position.copy(onBoard(s + BLOCK.l + 0.035 + DYN / 2, 0.025));
        d.rotation.set(0, 0, a);
        grip = d.position.clone().addScaledVector(along, DYN / 2 + 0.025);
      } else {
        d.position.set(0.35, TOP + 0.016, 0.42);
        d.rotation.set(0, 0.3, 0);
      }
    }
    if (string.current) {
      const on = incline.action === "pull";
      string.current.visible = on;
      if (on) {
        string.current.position.copy(b.position).addScaledVector(along, BLOCK.l / 2 + 0.017);
        string.current.rotation.set(0, 0, a + Math.PI / 2);
      }
    }

    // Гартай хамт зөөгдөж буй жин
    let reach: THREE.Vector3 | null = grip;
    let hold = incline.action === "weigh" ? 0.85 : 0.9;
    const working = cur && st && (st.stage === "reach" || st.stage === "act");
    const blockTop = world.tmp.copy(b.position).addScaledVector(up, BLOCK.h / 2 + 0.03).clone();
    const trayTop = new THREE.Vector3(TRAY.x, TOP + 0.05, TRAY.z);
    const c = carried.current;
    if (c) c.visible = false;
    let pencil = false;
    if (!reach && cur && st && working) {
      switch (cur.kind) {
        case "height":
          // Штативын хавчаарыг атгаж налууг өргөнө / буулгана
          reach = world.tmp.set(topX + 0.03, TOP + disp.h + 0.01, BOARD_Z - 0.02);
          hold = 0.85;
          break;
        case "mass": {
          // Тавиураас жин авч брус дээр тавина (эсвэл эсрэгээр)
          const adding = cur.to.mass > cur.from.mass;
          const [from, to] = adding ? [trayTop, blockTop] : [blockTop, trayTop];
          if (st.stage === "reach") reach = from.clone();
          else {
            const k = st.u * st.u * (3 - 2 * st.u);
            reach = from.clone().lerp(to, k);
            reach.y += Math.sin(k * Math.PI) * 0.08;
            if (c) {
              c.visible = true;
              c.position.copy(reach).add(new THREE.Vector3(0, -0.035, 0));
              c.scale.set(1, Math.abs(extraOf(cur.to.mass) - extraOf(cur.from.mass)), 1);
            }
          }
          hold = 0.6;
          break;
        }
        case "surface":
          // Налуу самбарыг алгаар дарж гадаргууг солино
          reach = world.tmp.set(BOARD_X, TOP, BOARD_Z).addScaledVector(along, L * 0.55).addScaledVector(up, T + 0.012);
          hold = 0.1;
          break;
        case "write": {
          // Ажлын хуудсан дээр мөр мөрөөр бичнэ
          const u = st.stage === "reach" ? 0 : st.u;
          const line = Math.min(2, Math.floor(u * 3));
          const v = (u * 3) % 1;
          reach = world.tmp.set(
            SHEET.x - 0.06 + 0.12 * v,
            TOP + 0.003 + 0.004 * Math.abs(Math.sin(v * 40)),
            SHEET.z - 0.035 + line * 0.025,
          );
          pencil = true;
          break;
        }
        case "sheet":
          // Хуучин хуудсыг алгаараа дарж солино
          reach = world.tmp.set(SHEET.x, TOP + 0.02, SHEET.z);
          hold = 0.05;
          break;
      }
    }

    if (!active) {
      if (wasActive.current) Object.assign(ikRef.current, { left: null, right: null, look: null, stand: null, pencil: false });
      wasActive.current = false;
      return;
    }
    wasActive.current = true;
    const t = ikRef.current;
    t.pencil = pencil;
    const toWorld = (v: THREE.Vector3, out: THREE.Vector3) => out.set(center.x + v.x, v.y, center.z + v.z);
    const front = center.z + center.d / 2 - 0.06;
    const move = reach ? Math.abs(reach.x - HAND - standX.current) : 0;
    if (reach && move > 0.15) {
      // Бие очиж амжтал үйлдлийг хойшлуулна: гар хүрэхээс өмнө юм хөдлөхгүй
      if (cur && st?.stage === "reach")
        cur.at = Math.max(cur.at, now + travelMs(move) - ITIMING[cur.kind][0]);
      standX.current = reach.x - HAND;
    }
    const sx = center.x + standX.current;
    t.right = reach ? toWorld(reach, world.grip) : world.restR.set(sx + 0.2, TOP + 0.05, front);
    t.gripR = reach ? hold : 0.12;
    t.look = reach ? toWorld(reach, world.look) : toWorld(b.position, world.look);
    // Багажийг дагаж хажуу тийш алхана: баруун гар нь ажиллаж буй цэгийн яг өмнө
    t.stand = world.stand.set(sx, 0, center.z + STAND_Z);
    // Сул (зүүн) гар ширээний ирмэг дээр тулна
    t.left = world.rest.set(sx - 0.2, TOP + 0.05, front);
    t.gripL = 0.12;
  });

  return (
    <group position={[center.x, 0, center.z]}>
      <RoundedBox args={[center.w, 0.06, center.d]} radius={0.02} position={[0, 0.9, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#d9c3a0" roughness={0.6} />
      </RoundedBox>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx},${sz}`} position={[sx * (center.w / 2 - 0.08), 0.44, sz * (center.d / 2 - 0.08)]} castShadow>
            <boxGeometry args={[0.05, 0.88, 0.05]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.3} />
          </mesh>
        )),
      )}

      {/* Налуу самбар: доод үзүүрээрээ ширээнд, дээд үзүүрээрээ штативт тулна */}
      <group position={[BOARD_X, TOP, BOARD_Z]} rotation={[0, 0, a]}>
        <mesh position={[L / 2, T / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[L, T, 0.12]} />
          <meshStandardMaterial color={look.color} roughness={look.roughness} />
        </mesh>
        <mesh position={[L / 2, T / 2 + 0.0003, 0.062]}>
          <planeGeometry args={[L, T * 0.9]} />
          <meshStandardMaterial map={ruler} />
        </mesh>
      </group>
      <Stand x={topX + 0.03} z={BOARD_Z - 0.1} height={0.6} />
      <mesh position={[topX + 0.03, TOP + shown.h - 0.012, BOARD_Z - 0.02]} castShadow>
        <boxGeometry args={[0.04, 0.025, 0.16]} />
        <meshStandardMaterial color="#1f2937" roughness={0.5} />
      </mesh>

      <group ref={block}>
        <Block mass={shown.mass} />
      </group>
      <group ref={dyn}>
        <Dynamometer pointer={pointer} />
      </group>
      <mesh ref={string}>
        <cylinderGeometry args={[0.0012, 0.0012, 0.034, 6]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      {/* Нэмэлт жингийн тавиур ба гарт зөөгдөж буй жин */}
      <group position={[TRAY.x, TOP, TRAY.z]}>
        <mesh position={[0, 0.006, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.12, 0.012, 0.07]} />
          <meshStandardMaterial color="#374151" roughness={0.6} />
        </mesh>
        {Array.from({ length: Math.max(0, shown.tray) }, (_, i) => (
          <mesh key={i} position={[-0.025 + i * 0.05, 0.024, 0]} castShadow>
            <cylinderGeometry args={[0.016, 0.016, 0.024, 20]} />
            <meshStandardMaterial color="#c9a227" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}
      </group>
      <group ref={carried} visible={false}>
        <mesh castShadow>
          <cylinderGeometry args={[0.016, 0.016, 0.024, 20]} />
          <meshStandardMaterial color="#c9a227" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
      {/* Хүснэгт бичих ажлын хуудас */}
      <mesh position={[SHEET.x, TOP + 0.001, SHEET.z]} rotation={[-Math.PI / 2, 0, 0.12]} receiveShadow>
        <planeGeometry args={[0.21, 0.15]} />
        <meshStandardMaterial map={sheet} roughness={0.9} />
      </mesh>
    </group>
  );
}

/* ---------- Ширээ рүү ойртох камер ---------- */

// Ширээний эсрэг талаас: сурагч камер руу харж ажиллана, налуу хоёрын дунд
export function InclineCamera({ active, center }: { active: boolean; center: { x: number; z: number } }) {
  const goal = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }, delta) => {
    if (!active) return;
    // Өргөн дэлгэцэнд самбар баруун талд, нарийнд доор нь байрлана
    const wide = size.width >= 1024;
    const far = size.width / size.height < 1.2 ? 1.6 : 1;
    // Энэ өнцгөөс дэлгэцийн баруун тал нь -x; самбарын зайг -x тийш шилжүүлж гаргана
    look.set(center.x - (wide ? 0.42 : 0.12), TOP + (wide ? 0.25 : 0), center.z + 0.35);
    goal.set(look.x, TOP + 0.95 * far, center.z - 1.6 * far);
    camera.position.lerp(goal, 1 - Math.exp(-6 * Math.min(delta, 0.05)));
    camera.lookAt(look);
  });
  return null;
}

/* ---------- Динамометрийн томруулсан хуваарь (сурагч өөрөө уншина) ---------- */

function Gauge({ incline }: { incline: Incline }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      setValue(gaugeAt(incline, now));
      if (progress(incline, now) < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [incline]);

  const H = 240;
  const y = (v: number) => 14 + (v / F_MAX) * (H - 28);
  return (
    <svg viewBox={`0 0 120 ${H}`} className="h-60 w-28 shrink-0" role="img" aria-label="Динамометрийн хуваарь">
      <rect x="30" y="4" width="60" height={H - 8} rx="10" fill="#e5e7eb" stroke="#94a3b8" />
      <rect x="44" y="10" width="32" height={H - 20} fill="#fef9c3" />
      {Array.from({ length: F_MAX * 10 + 1 }, (_, i) => {
        const v = i / 10;
        const major = i % 10 === 0;
        const half = i % 5 === 0;
        return (
          <g key={i}>
            <line x1="44" x2={major ? 64 : half ? 58 : 52} y1={y(v)} y2={y(v)} stroke="#1f2937" strokeWidth={major ? 1.4 : 0.7} />
            {major && (
              <text x="70" y={y(v) + 4} fontSize="11" fill="#1f2937" fontFamily="system-ui">
                {i / 10}
              </text>
            )}
          </g>
        );
      })}
      <polygon points={`40,${y(value)} 32,${y(value) - 5} 32,${y(value) + 5}`} fill="#dc2626" />
      <line x1="40" x2="80" y1={y(value)} y2={y(value)} stroke="#dc2626" strokeWidth="1.6" />
      <text x="60" y={H - 2} fontSize="9" textAnchor="middle" fill="#475569">
        Н
      </text>
    </svg>
  );
}

/* ---------- Самбар ---------- */

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

function EfficiencyChart({ rows }: { rows: InclineRow[] }) {
  const pts = rows.flatMap((r) => {
    const e = efficiency(r);
    return e === null ? [] : [{ h: r.h, e, s: r.surface }];
  });
  const W = 300;
  const Hh = 160;
  const x = (h: number) => 34 + ((h - H_MIN) / (H_MAX - H_MIN)) * (W - 48);
  const y = (e: number) => Hh - 24 - e * (Hh - 40);
  const color: Record<SurfaceKind, string> = { wood: "#f59e0b", glass: "#38bdf8", sand: "#a78bfa" };
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full" role="img" aria-label="АҮК ба налуугийн өндрийн график">
      <line x1="34" x2={W - 10} y1={Hh - 24} y2={Hh - 24} stroke="#475569" />
      <line x1="34" x2="34" y1="10" y2={Hh - 24} stroke="#475569" />
      {[0, 0.5, 1].map((e) => (
        <text key={e} x="28" y={y(e) + 4} fontSize="10" textAnchor="end" fill="#94a3b8">
          {e * 100}%
        </text>
      ))}
      {[0.1, 0.2, 0.3, 0.4].map((h) => (
        <text key={h} x={x(h)} y={Hh - 8} fontSize="10" textAnchor="middle" fill="#94a3b8">
          {h.toFixed(1)}
        </text>
      ))}
      <text x={W - 10} y={Hh - 28} fontSize="10" textAnchor="end" fill="#94a3b8">
        h, м
      </text>
      {pts.map((p, i) => (
        <circle key={i} cx={x(p.h)} cy={y(p.e)} r="4.5" fill={color[p.s]} />
      ))}
    </svg>
  );
}

export function InclinePanel({
  incline,
  setIncline,
  onLeave,
  view,
  onView,
}: {
  incline: Incline;
  setIncline: SetIncline;
  onLeave: () => void;
  view: "eyes" | "side";
  onView: (v: "eyes" | "side") => void;
}) {
  const [now, setNow] = useState(() => performance.now());
  const busy = progress(incline, now) < 1;
  // Үйлдэл дуусахад товчнуудыг сэргээнэ
  useEffect(() => {
    if (!busy) return;
    const ms = incline.action === "weigh" ? WEIGH_MS : PULL_MS;
    const t = setTimeout(() => setNow(performance.now()), Math.max(50, incline.actionAt + ms - performance.now() + 30));
    return () => clearTimeout(t);
  }, [busy, incline.action, incline.actionAt]);

  const set = (patch: Partial<Incline>) => setIncline((s) => ({ ...s, ...patch }));
  const start = (action: "weigh" | "pull") => {
    const t = performance.now();
    setNow(t);
    setIncline((s) => ({
      ...s,
      action,
      actionAt: t,
      weighedMass: action === "weigh" ? s.mass : s.weighedMass,
    }));
  };

  const weighed = incline.weighedMass === incline.mass && !(incline.action === "weigh" && busy);
  const pulled = incline.action === "pull" && !busy;
  const typed = incline.autoFill || (parseNum(incline.draftP) !== null && parseNum(incline.draftF) !== null);
  const block = !weighed
    ? "1. Эхлээд «Жинг хэмжих» дарж брусын жинг (P) хэмжинэ үү."
    : !pulled
      ? "2. «Налуугаар жигд татах» дарж F-ийг хэмжинэ үү."
      : !typed
        ? "Динамометрээс уншсан P ба F-ийг доорх нүдэнд бичнэ үү."
        : null;
  const next = !weighed ? "weigh" : !pulled ? "pull" : "record";

  function record() {
    if (block) return;
    setIncline((s) => {
      const trueP = weightOf(s.mass);
      const trueF = pullForce(s.h, s.mass, s.surface);
      const row: InclineRow = {
        id: s.nextId,
        h: s.h,
        mass: s.mass,
        surface: s.surface,
        P: s.autoFill ? readOff(trueP) : s.draftP.trim(),
        F: s.autoFill ? readOff(trueF) : s.draftF.trim(),
        trueP,
        trueF,
      };
      // Ижил ачаагаар дахин хэмжихэд P хэвээр үлдэнэ
      return { ...s, rows: [...s.rows, row], nextId: s.nextId + 1, action: "idle", draftF: "", checked: false };
    });
  }

  const valid = incline.rows.filter((r) => efficiency(r) !== null);
  const heights = new Set(valid.map((r) => r.h.toFixed(2))).size;
  const canCheck = heights >= REQUIRED_HEIGHTS;
  const byHeight = [...valid].sort((p, q) => p.h - q.h);
  const rising =
    byHeight.length >= 2 && efficiency(byHeight[byHeight.length - 1])! > efficiency(byHeight[0])!;
  const meanErr =
    valid.reduce((s, r) => s + Math.abs(efficiency(r)! - (r.trueP * r.h) / (r.trueF * L)), 0) /
    Math.max(1, valid.length);

  const tasks = [
    { done: incline.weighedMass !== null, text: "Брусын жинг (P) динамометрээр хэмж" },
    { done: incline.rows.length > 0, text: "Налуугаар жигд татаж F-ийг хэмжээд бич" },
    { done: heights >= REQUIRED_HEIGHTS, text: `h-ийг өөрчилж ${REQUIRED_HEIGHTS} удаа хэмж` },
    { done: incline.checked, text: "АҮК-ийг тооцоолоод шалга" },
  ];

  // Багшийн самбарт энэ сурагчийн налуугийн туршилтыг бүртгэнэ
  function logSession(r: JudgeResult | null) {
    saveSession({
      student: currentStudent(),
      lab: "incline",
      at: Date.now(),
      stepsDone: tasks.filter((t) => t.done).length + (r ? 1 : 0),
      stepsTotal: tasks.length + 1,
      slips: 0,
      meanErr: valid.length ? meanErr * 100 : null,
      covered: r?.covered ?? [],
      negated: r?.negated ?? [],
      missing: r?.missing ?? INCLINE_RUBRIC.map((x) => x.id),
    });
  }

  const input =
    "w-16 rounded-md border border-[#22304D] bg-[#0B1324] px-1.5 py-1 text-right font-mono text-xs outline-none focus:border-sky-600";

  return (
    <aside className="absolute inset-x-0 bottom-0 max-h-[55dvh] space-y-4 overflow-y-auto border-t border-[#16223A] bg-[#081124]/95 p-4 backdrop-blur lg:inset-y-0 lg:left-auto lg:max-h-none lg:w-[420px] lg:border-l lg:border-t-0">
      <button
        type="button"
        onClick={onLeave}
        className="rounded-lg px-3 py-1.5 text-sm font-medium text-sky-300 transition hover:bg-[#132038]"
      >
        ← Ширээнээс босох
      </button>
      <StudentBar
        onNext={() => {
          logSession(incline.judged);
          setIncline(() => INITIAL_INCLINE);
        }}
      />
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
        <h2 className="text-lg font-bold">📐 Налуу хавтгайн АҮК</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Брусыг налуугаар жигд татахад зарцуулсан бүрэн ажил (F·l) ба өргөсөн ашигтай ажлыг
          (P·h) харьцуулна: η = P·h / (F·l).
        </p>
      </header>

      <ol className="space-y-1.5 rounded-xl border border-[#1D2A45] bg-[#0B1324] p-3 text-sm">
        {tasks.map((t, i) => (
          <li key={i} className={t.done ? "text-emerald-300" : "text-slate-300"}>
            {t.done ? "✓" : `${i + 1}.`} {t.text}
          </li>
        ))}
      </ol>

      <Card title="⚙️ Тохиргоо">
        <Slider
          label={`Налуугийн өндөр h = ${incline.h.toFixed(2)} м (l = ${L} м)`}
          value={incline.h}
          min={H_MIN}
          max={H_MAX}
          step={0.05}
          display={`${((angleOf(incline.h) * 180) / Math.PI).toFixed(0)}°`}
          onChange={(h) => !busy && set({ h, action: "idle", draftF: "" })}
        />
        <Segmented
          label="Ачаа (брус + жин)"
          value={incline.mass}
          options={MASSES.map((m) => ({ value: m, label: `${m * 1000} г`, disabled: busy }))}
          onChange={(m) => set({ mass: m, action: "idle", draftP: "", draftF: "" })}
        />
        <Segmented
          label="Налуугийн гадаргуу"
          value={incline.surface}
          options={SURFACES.map((s) => ({ value: s.value, label: s.label, disabled: busy }))}
          onChange={(v) => set({ surface: v, action: "idle", draftF: "" })}
        />
      </Card>

      <Card title="🧪 Хэмжилт">
        <div className="flex items-start gap-4">
          <Gauge incline={incline} />
          <div className="flex-1 space-y-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => start("weigh")}
              className={next === "weigh" && !busy ? primaryBtn : secondaryBtn}
            >
              1 · ⚖️ Жинг хэмжих (P)
            </button>
            <button
              type="button"
              disabled={busy || incline.weighedMass !== incline.mass}
              onClick={() => start("pull")}
              className={next === "pull" && !busy ? primaryBtn : secondaryBtn}
            >
              2 · ▶ Налуугаар жигд татах (F)
            </button>
            <p className="text-xs leading-relaxed text-slate-400">
              {busy
                ? incline.action === "weigh"
                  ? "Пүрш тогтох хүртэл хүлээгээд заалтыг унш."
                  : "Татаж байх үеийн заалтыг унш — зүү бага зэрэг хэлбэлзэнэ."
                : "Хуваарь 0.1 Н. Улаан заагчийг уншина."}
            </p>
            {!incline.autoFill && (
              <div className="grid grid-cols-2 gap-2">
                {(["P", "F"] as const).map((k) => (
                  <label key={k} className="text-xs text-slate-400">
                    Уншсан {k}, Н
                    <input
                      inputMode="decimal"
                      placeholder="0.00"
                      value={k === "P" ? incline.draftP : incline.draftF}
                      disabled={k === "P" ? !weighed : !pulled}
                      onChange={(e) => set(k === "P" ? { draftP: e.target.value } : { draftF: e.target.value })}
                      className={`${input} mt-1 w-full disabled:opacity-40`}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        {block && (
          <p className="rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
            {block}
          </p>
        )}
        <button type="button" onClick={record} disabled={!!block} className={primaryBtn}>
          3 · ✏️ Хүснэгтэд бичих
        </button>
        <Check
          label="Заалтыг автоматаар бөглөх"
          hint="Унтраавал динамометрээс уншсанаа өөрөө бичнэ"
          checked={incline.autoFill}
          onChange={(v) => set({ autoFill: v })}
        />

        {incline.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="p-1 text-left">№</th>
                  <th className="p-1">h, м</th>
                  <th className="p-1">P, Н</th>
                  <th className="p-1">F, Н</th>
                  <th className="p-1">P·h</th>
                  <th className="p-1">F·l</th>
                  <th className="p-1">η</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {incline.rows.map((r) => {
                  const e = efficiency(r);
                  const field = (k: "P" | "F") => (
                    <input
                      inputMode="decimal"
                      aria-label={`${r.id}-р мөрийн ${k}`}
                      value={r[k]}
                      disabled={incline.checked}
                      onChange={(ev) =>
                        setIncline((s) => ({
                          ...s,
                          rows: s.rows.map((x) => (x.id === r.id ? { ...x, [k]: ev.target.value } : x)),
                        }))
                      }
                      className={input}
                    />
                  );
                  const P = Number(r.P.replace(",", "."));
                  const F = Number(r.F.replace(",", "."));
                  return (
                    <tr key={r.id} className="border-t border-[#16223A] text-center font-mono">
                      <td className="p-1 text-left">
                        {r.id}
                        <span className="ml-1 font-sans text-[10px] text-slate-500">
                          {SURFACES.find((s) => s.value === r.surface)?.label}
                        </span>
                      </td>
                      <td className="p-1">{r.h.toFixed(2)}</td>
                      <td className="p-1">{field("P")}</td>
                      <td className="p-1">{field("F")}</td>
                      <td className="p-1">{e === null ? "—" : (P * r.h).toFixed(3)}</td>
                      <td className="p-1">{e === null ? "—" : (F * L).toFixed(3)}</td>
                      <td className="p-1 text-amber-200">{e === null ? "—" : pct(e)}</td>
                      <td className="p-1">
                        <button
                          type="button"
                          aria-label={`${r.id}-р мөрийг устгах`}
                          onClick={() => setIncline((s) => ({ ...s, rows: s.rows.filter((x) => x.id !== r.id) }))}
                          className="text-slate-500 hover:text-rose-300"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <button
          type="button"
          onClick={() => set({ checked: true })}
          disabled={!canCheck || incline.checked}
          className="w-full rounded-xl border border-emerald-700/50 bg-emerald-950/40 px-4 py-2.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {incline.checked
            ? "Шалгасан ✓"
            : canCheck
              ? "✅ АҮК-ийг шалгах"
              : `Шалгахад дахин ${REQUIRED_HEIGHTS - heights} өөр өндрөөр хэмжинэ`}
        </button>
        {incline.checked && (
          <div className="space-y-2 rounded-xl border border-[#1D2A45] bg-[#0B1324] p-3 text-xs leading-relaxed text-slate-300">
            <p>
              Дундаж алдаа: <span className="font-mono text-amber-200">±{(meanErr * 100).toFixed(1)}%</span>
            </p>
            <p>
              {rising
                ? "Налуу өндөр (эгц) байх тусам АҮК ихэсч байна: үрэлтийн хүч cosα-тай хамт багасдаг."
                : "Таны хэмжилтээр өндөр ихсэхэд АҮК өсөөгүй байна. Жигд татсан эсэх, P ба F-ийг зөв уншсан эсэхээ шалга."}
            </p>
            <p>АҮК 100%-иас үргэлж бага: ажлын нэг хэсэг үрэлтийг давахад зарцуулагддаг.</p>
          </div>
        )}
        {incline.checked && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-300">✍️ Дүгнэлт</p>
            <textarea
              value={incline.conclusion}
              onChange={(e) => set({ conclusion: e.target.value })}
              rows={3}
              placeholder="АҮК яагаад 100%-д хүрдэггүй вэ? Өндөр, гадаргуу АҮК-д хэрхэн нөлөөлсөн бэ?"
              className="w-full resize-none rounded-xl border border-[#22304D] bg-[#0B1324] p-3 text-sm outline-none placeholder:text-slate-600 focus:border-sky-600"
            />
            <AiCheck
              text={incline.conclusion}
              rubric={INCLINE_RUBRIC}
              onResult={(r) => {
                set({ judged: r });
                logSession(r);
              }}
            />
          </div>
        )}
        <EfficiencyChart rows={incline.rows} />
        <p className="text-center text-[11px] text-slate-500">
          ● Мод · <span className="text-sky-300">●</span> Шил · <span className="text-violet-300">●</span> Зүлгүүр
        </p>
        {incline.rows.length > 0 && (
          <button
            type="button"
            onClick={() => set({ rows: [], nextId: 1, checked: false })}
            className={secondaryBtn}
          >
            🗒 Шинэ хүснэгт
          </button>
        )}
      </Card>
    </aside>
  );
}
