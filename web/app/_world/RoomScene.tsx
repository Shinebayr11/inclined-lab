"use client";

import { KeyboardControls, Loader, RoundedBox, useKeyboardControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { NoWebGL } from "./CharacterSelect";
import { BenchCamera, BenchPanel, BenchTable } from "./BenchLab";
import type { Bench as BenchState, SetBench } from "./benchState";
import type { Incline, SetIncline } from "./incline";
import { InclineCamera, InclinePanel, InclineTable } from "./InclineLab";
import Student, { type IKTargets, newIK } from "./Student";
import { type Anim, type Avatar, type PlayerState, RUN_SPEED, START, STEP_SPEED, WALK_SPEED } from "./avatar";

/* ============================================================
   3D ЛАБОРАТОРИЙН ӨРӨӨ
   Сурагч өрөөнд алхаж, туршилтын ширээнд E дарахад
   гэрлийн тусгалын туршилт нээгдэнэ.
   ============================================================ */

// Өрөө: x ∈ [-7, 7], z ∈ [-5, 5] (м). Самбар z = -5, цонх x = -7, хаалга x = 7
const ROOM = { w: 14, d: 10, h: 3.2 };
const RADIUS = 0.3;
const WALK = WALK_SPEED;
const RUN = RUN_SPEED;

type Box = { x: number; z: number; w: number; d: number };

const BENCHES: Box[] = [
  { x: -4, z: 0, w: 2.4, d: 0.8 },
  { x: -0.6, z: 0, w: 2.4, d: 0.8 },
  { x: -4, z: 2.6, w: 2.4, d: 0.8 },
  { x: -0.6, z: 2.6, w: 2.4, d: 0.8 },
];
const STOOLS: Box[] = BENCHES.flatMap((b) =>
  [-0.6, 0.6].map((dx) => ({ x: b.x + dx, z: b.z + 0.68, w: 0.36, d: 0.36 })),
);
const STATION: Box = { x: 3.6, z: -2.4, w: 1.8, d: 1.0 };
const TEACHER: Box = { x: -1.5, z: -3.7, w: 2.0, d: 0.8 };
const CABINET: Box = { x: 6.68, z: -1.6, w: 0.6, d: 3.4 };
// Налуу хавтгайн ширээ: цонхны дэргэд, урд буланд
const INCLINE: Box = { x: -5.0, z: -3.0, w: 2.0, d: 1.0 };
const OBSTACLES = [...BENCHES, ...STOOLS, STATION, INCLINE, TEACHER, CABINET];

// Туршилтын ширээний өмнөх зогсох цэг
type StationId = "optics" | "incline";
// Ширээ бүрийн өмнөх зогсох цэг
// seat — туршилт хийх үед сурагч зогсох цэг (ширээний ирмэгт ойр)
const STATIONS: Record<
  StationId,
  { box: Box; use: { x: number; z: number }; seat: { x: number; z: number }; label: string }
> = {
  optics: {
    box: STATION,
    use: { x: STATION.x, z: STATION.z + STATION.d / 2 + 0.55 },
    seat: { x: STATION.x, z: STATION.z + STATION.d / 2 + 0.24 },
    label: "🔦 Гэрлийн тусгалын туршилт",
  },
  incline: {
    box: INCLINE,
    use: { x: INCLINE.x, z: INCLINE.z + INCLINE.d / 2 + 0.55 },
    seat: { x: INCLINE.x, z: INCLINE.z + INCLINE.d / 2 + 0.24 },
    label: "📐 Налуу хавтгайн АҮК",
  },
};
const STATION_IDS = Object.keys(STATIONS) as StationId[];
const USE_RADIUS = 1.1;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function blocked(x: number, z: number) {
  if (Math.abs(x) > ROOM.w / 2 - RADIUS || Math.abs(z) > ROOM.d / 2 - RADIUS) return true;
  return OBSTACLES.some(
    (b) => Math.abs(x - b.x) < b.w / 2 + RADIUS && Math.abs(z - b.z) < b.d / 2 + RADIUS,
  );
}

// Хамгийн богино талаар нь эргэнэ
function dampAngle(a: number, target: number, rate: number, dt: number) {
  const d = Math.atan2(Math.sin(target - a), Math.cos(target - a));
  return a + d * (1 - Math.exp(-rate * dt));
}

/* ---------- Бүтэц (canvas-аар зурсан) ---------- */

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

function useFloorTexture() {
  return useMemo(() => {
    const t = canvasTexture(512, 512, (c) => {
      const n = 8;
      const s = 512 / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const l = 70 + ((i * 7 + j * 13) % 5) * 1.5;
          c.fillStyle = `hsl(210 8% ${l}%)`;
          c.fillRect(i * s, j * s, s, s);
          c.strokeStyle = "rgba(90,100,110,0.35)";
          c.strokeRect(i * s + 0.5, j * s + 0.5, s - 1, s - 1);
        }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(ROOM.w / 4, ROOM.d / 4);
    return t;
  }, []);
}

function useBoardTexture() {
  return useMemo(
    () =>
      canvasTexture(1024, 340, (c) => {
        c.fillStyle = "#24463a";
        c.fillRect(0, 0, 1024, 340);
        c.fillStyle = "rgba(255,255,255,0.9)";
        c.font = "bold 46px system-ui, sans-serif";
        c.fillText("Гэрлийн тусгалын хууль", 40, 80);
        c.font = "40px system-ui, sans-serif";
        c.fillText("Тусах өнцөг = Ойх өнцөг", 40, 150);
        c.font = "italic 56px Georgia, serif";
        c.fillText("θ₁ = θ₂", 40, 240);
        // Толь, нормаль, цацрагууд
        c.strokeStyle = "rgba(255,255,255,0.85)";
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(600, 290);
        c.lineTo(960, 290);
        c.stroke();
        c.setLineDash([12, 10]);
        c.beginPath();
        c.moveTo(780, 290);
        c.lineTo(780, 60);
        c.stroke();
        c.setLineDash([]);
        c.strokeStyle = "#ffd36b";
        c.beginPath();
        c.moveTo(640, 90);
        c.lineTo(780, 290);
        c.lineTo(920, 90);
        c.stroke();
      }),
    [],
  );
}

function usePosterTexture() {
  return useMemo(
    () =>
      canvasTexture(512, 360, (c) => {
        c.fillStyle = "#f7f4ec";
        c.fillRect(0, 0, 512, 360);
        c.fillStyle = "#1f2937";
        c.font = "bold 30px system-ui, sans-serif";
        c.fillText("Үелэх систем", 24, 44);
        const colors = ["#f2a65a", "#7cc6a4", "#79a7e3", "#e58fb0", "#c9b6f2", "#f0d36b"];
        for (let r = 0; r < 7; r++)
          for (let k = 0; k < 18; k++) {
            if (r === 0 && k > 0 && k < 17) continue;
            if ((r === 1 || r === 2) && k > 1 && k < 12) continue;
            c.fillStyle = colors[(k + r) % colors.length];
            c.fillRect(20 + k * 26.5, 70 + r * 38, 24, 34);
          }
      }),
    [],
  );
}

function useSafetyTexture() {
  return useMemo(
    () =>
      canvasTexture(360, 480, (c) => {
        c.fillStyle = "#fff8e1";
        c.fillRect(0, 0, 360, 480);
        c.fillStyle = "#b45309";
        c.fillRect(0, 0, 360, 70);
        c.fillStyle = "#fff";
        c.font = "bold 30px system-ui, sans-serif";
        c.fillText("Аюулгүй ажиллагаа", 22, 46);
        c.fillStyle = "#1f2937";
        c.font = "24px system-ui, sans-serif";
        [
          "1. Лазерыг нүд рүү",
          "   хэзээ ч бүү чиглүүл",
          "2. Толийг болгоомжтой бариарай",
          "3. Багшийн зааврыг сонс",
          "4. Ширээгээ цэвэр байлга",
        ].forEach((line, i) => c.fillText(line, 22, 120 + i * 44));
      }),
    [],
  );
}

// DOM-гүй 3D шошго (drei Html нь Suspense дахин ачаалахад DOM-оо эвддэг)
function useLabelTexture(text: string) {
  return useMemo(
    () =>
      canvasTexture(640, 120, (c) => {
        c.fillStyle = "rgba(10,17,32,0.88)";
        c.beginPath();
        c.roundRect(4, 4, 632, 112, 56);
        c.fill();
        c.strokeStyle = "rgba(252,211,77,0.6)";
        c.lineWidth = 4;
        c.stroke();
        c.fillStyle = "#fde68a";
        c.font = "bold 44px system-ui, sans-serif";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(text, 320, 62);
      }),
    [text],
  );
}

/* ---------- Өрөөний эд зүйлс ---------- */

const WINDOWS_Z = [-3, 0, 3];
const WIN = { w: 1.6, bottom: 0.9, top: 2.4 };

function Walls() {
  const wall = <meshStandardMaterial color="#e7ebee" roughness={0.95} />;
  const T = 0.12;
  // Цонхны нүхтэй зүүн хана: нар ороход шалан дээр цонхны хэлбэртэй гэрэл тусна
  const gaps = WINDOWS_Z.map((z) => [z - WIN.w / 2, z + WIN.w / 2]);
  const piers: [number, number][] = [];
  let from = -ROOM.d / 2;
  for (const [a, b] of gaps) {
    piers.push([from, a]);
    from = b;
  }
  piers.push([from, ROOM.d / 2]);
  const x = -ROOM.w / 2 - T / 2;

  return (
    <group>
      <mesh castShadow receiveShadow position={[x, WIN.bottom / 2, 0]}>
        <boxGeometry args={[T, WIN.bottom, ROOM.d]} />
        {wall}
      </mesh>
      <mesh castShadow receiveShadow position={[x, (WIN.top + ROOM.h) / 2, 0]}>
        <boxGeometry args={[T, ROOM.h - WIN.top, ROOM.d]} />
        {wall}
      </mesh>
      {piers.map(([a, b]) => (
        <mesh key={a} castShadow receiveShadow position={[x, (WIN.bottom + WIN.top) / 2, (a + b) / 2]}>
          <boxGeometry args={[T, WIN.top - WIN.bottom, b - a]} />
          {wall}
        </mesh>
      ))}
      {WINDOWS_Z.map((z) => (
        <group key={z} position={[-ROOM.w / 2, (WIN.bottom + WIN.top) / 2, z]}>
          <mesh>
            <boxGeometry args={[0.04, WIN.top - WIN.bottom, 0.05]} />
            <meshStandardMaterial color="#f5f5f5" />
          </mesh>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.05, 0.04, WIN.w]} />
            <meshStandardMaterial color="#f5f5f5" />
          </mesh>
          <mesh position={[0.06, -(WIN.top - WIN.bottom) / 2, 0]}>
            <boxGeometry args={[0.2, 0.04, WIN.w + 0.1]} />
            <meshStandardMaterial color="#d9dde1" />
          </mesh>
        </group>
      ))}
      {/* Цонхны гадна: тэнгэр ба ногоон талбай */}
      <mesh position={[-ROOM.w / 2 - 6, 1.5, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[40, 14]} />
        <meshBasicMaterial color="#bfe0ff" toneMapped={false} />
      </mesh>
      <mesh position={[-ROOM.w / 2 - 6, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12, 40]} />
        <meshBasicMaterial color="#8fbf7a" />
      </mesh>

      {/* Бусад хана: урд (самбар), хойд, баруун (хаалга) */}
      <mesh receiveShadow position={[0, ROOM.h / 2, -ROOM.d / 2 - T / 2]}>
        <boxGeometry args={[ROOM.w, ROOM.h, T]} />
        {wall}
      </mesh>
      <mesh receiveShadow position={[0, ROOM.h / 2, ROOM.d / 2 + T / 2]}>
        <boxGeometry args={[ROOM.w, ROOM.h, T]} />
        {wall}
      </mesh>
      <mesh receiveShadow position={[ROOM.w / 2 + T / 2, ROOM.h / 2, 0]}>
        <boxGeometry args={[T, ROOM.h, ROOM.d]} />
        {wall}
      </mesh>
      {/* Доод хэсгийн будаг */}
      {[
        { p: [0, 0.5, -ROOM.d / 2 + 0.005] as const, r: 0, l: ROOM.w },
        { p: [0, 0.5, ROOM.d / 2 - 0.005] as const, r: Math.PI, l: ROOM.w },
        { p: [ROOM.w / 2 - 0.005, 0.5, 0] as const, r: -Math.PI / 2, l: ROOM.d },
      ].map((s, i) => (
        <mesh key={i} position={s.p} rotation={[0, s.r, 0]} receiveShadow>
          <planeGeometry args={[s.l, 1]} />
          <meshStandardMaterial color="#b9c9d6" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function FloorAndCeiling({ dark }: { dark: boolean }) {
  const floor = useFloorTexture();
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM.w, ROOM.d]} />
        <meshStandardMaterial map={floor} roughness={0.55} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM.h, 0]}>
        <planeGeometry args={[ROOM.w, ROOM.d]} />
        <meshStandardMaterial color="#f4f5f6" />
      </mesh>
      {[-4, 0, 4].flatMap((x) =>
        [-2.5, 2.5].map((z) => (
          <mesh key={`${x},${z}`} rotation={[Math.PI / 2, 0, 0]} position={[x, ROOM.h - 0.01, z]}>
            <planeGeometry args={[1.2, 0.6]} />
            <meshBasicMaterial color={dark ? "#3a3f47" : "#ffffff"} toneMapped={false} />
          </mesh>
        )),
      )}
    </group>
  );
}

function Board() {
  const tex = useBoardTexture();
  return (
    <group position={[-1.5, 1.65, -ROOM.d / 2 + 0.03]}>
      <mesh>
        <boxGeometry args={[4.2, 1.5, 0.04]} />
        <meshStandardMaterial color="#9aa3ab" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, 0.025]}>
        <planeGeometry args={[4, 1.33]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.8, 0.06]}>
        <boxGeometry args={[4.2, 0.04, 0.12]} />
        <meshStandardMaterial color="#9aa3ab" metalness={0.6} roughness={0.35} />
      </mesh>
    </group>
  );
}

function Posters() {
  const table = usePosterTexture();
  const safety = useSafetyTexture();
  return (
    <group>
      <mesh position={[-3.5, 1.7, ROOM.d / 2 - 0.02]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1.6, 1.12]} />
        <meshStandardMaterial map={table} roughness={0.8} />
      </mesh>
      <mesh position={[3.2, 1.7, -ROOM.d / 2 + 0.02]}>
        <planeGeometry args={[0.75, 1]} />
        <meshStandardMaterial map={safety} roughness={0.8} />
      </mesh>
    </group>
  );
}

function Door() {
  return (
    <group position={[ROOM.w / 2 - 0.02, 0, 3.6]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh position={[0, 1.07, 0]}>
        <boxGeometry args={[1.1, 2.14, 0.05]} />
        <meshStandardMaterial color="#8a6a4a" roughness={0.6} />
      </mesh>
      <mesh position={[0.42, 1.0, 0.05]}>
        <boxGeometry args={[0.14, 0.03, 0.05]} />
        <meshStandardMaterial color="#c9ced3" metalness={0.9} roughness={0.25} />
      </mesh>
    </group>
  );
}

function Beaker({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.045, 0.045, 0.14, 20, 1, true]} />
        <meshStandardMaterial color="#dff3ff" transparent opacity={0.35} roughness={0.05} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.03, 0]}>
        <cylinderGeometry args={[0.042, 0.042, 0.07, 20]} />
        <meshStandardMaterial color={color} transparent opacity={0.75} roughness={0.2} />
      </mesh>
    </group>
  );
}

function Bench({ b, i }: { b: Box; i: number }) {
  return (
    <group position={[b.x, 0, b.z]}>
      <RoundedBox args={[b.w, 0.06, b.d]} radius={0.02} position={[0, 0.9, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#2c3238" roughness={0.4} />
      </RoundedBox>
      <mesh position={[0, 0.44, -0.05]} castShadow receiveShadow>
        <boxGeometry args={[b.w - 0.1, 0.86, b.d - 0.2]} />
        <meshStandardMaterial color="#cbb894" roughness={0.7} />
      </mesh>
      <Beaker position={[-0.8, 1.0, -0.15]} color={["#4fa3e3", "#e36f4f", "#6fd18a", "#e3c34f"][i % 4]} />
      <Beaker position={[-0.65, 1.0, -0.2]} color="#a78bfa" />
      <mesh position={[0.5, 0.935, 0.05]} rotation={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.3, 0.01, 0.22]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
    </group>
  );
}

function Stool({ s }: { s: Box }) {
  return (
    <group position={[s.x, 0, s.z]}>
      <mesh position={[0, 0.66, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.05, 24]} />
        <meshStandardMaterial color="#1f2937" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.33, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.64, 10]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.03, 20]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

function TeacherDesk() {
  return (
    <group position={[TEACHER.x, 0, TEACHER.z]}>
      <mesh position={[0, 0.76, 0]} castShadow receiveShadow>
        <boxGeometry args={[TEACHER.w, 0.05, TEACHER.d]} />
        <meshStandardMaterial color="#8a6a4a" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.38, -0.3]} castShadow>
        <boxGeometry args={[TEACHER.w - 0.1, 0.72, 0.04]} />
        <meshStandardMaterial color="#7a5c3f" roughness={0.6} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (TEACHER.w / 2 - 0.05), 0.38, 0]} castShadow>
          <boxGeometry args={[0.05, 0.76, TEACHER.d]} />
          <meshStandardMaterial color="#7a5c3f" roughness={0.6} />
        </mesh>
      ))}
      <group position={[0.3, 0.79, 0.05]}>
        <mesh castShadow>
          <boxGeometry args={[0.36, 0.02, 0.25]} />
          <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.12, -0.12]} rotation={[-0.25, 0, 0]}>
          <boxGeometry args={[0.36, 0.24, 0.01]} />
          <meshStandardMaterial color="#111827" emissive="#3b82f6" emissiveIntensity={0.35} />
        </mesh>
      </group>
    </group>
  );
}

function Cabinet() {
  return (
    <group position={[CABINET.x, 0, CABINET.z]}>
      <mesh position={[0, 1.0, 0]} castShadow receiveShadow>
        <boxGeometry args={[CABINET.w, 2.0, CABINET.d]} />
        <meshStandardMaterial color="#d6dbe0" roughness={0.7} />
      </mesh>
      {[0.55, 1.05, 1.55].map((y) =>
        [-1.2, -0.6, 0, 0.6, 1.2].map((z, k) => (
          <mesh key={`${y},${z}`} position={[-CABINET.w / 2 - 0.02, y + 0.1, z]}>
            <cylinderGeometry args={[0.05, 0.05, 0.2, 14]} />
            <meshStandardMaterial
              color={["#60a5fa", "#f87171", "#34d399", "#fbbf24", "#a78bfa"][(k + y * 10) % 5]}
              transparent
              opacity={0.8}
              roughness={0.15}
            />
          </mesh>
        )),
      )}
    </group>
  );
}

/* ---------- Туршилтын ширээ ---------- */

// Цаасны төв: ширээний гадаргуу дээр, сурагч тал руу бага зэрэг
const PAPER_ORIGIN: [number, number, number] = [STATION.x, 0.93, STATION.z + 0.05];

// Шалан дээрх шар цагираг ба ширээний нэр
function StationMarker({ id }: { id: StationId }) {
  const ring = useRef<THREE.Mesh>(null);
  const { box, use, label: text } = STATIONS[id];
  const label = useLabelTexture(text);
  useFrame(({ clock }) => {
    const m = ring.current;
    if (!m) return;
    const s = 1 + 0.08 * Math.sin(clock.elapsedTime * 3);
    m.scale.set(s, s, 1);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.2 * Math.sin(clock.elapsedTime * 3);
  });
  return (
    <group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[use.x, 0.01, use.z]}>
        <ringGeometry args={[0.38, 0.46, 48]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.4} toneMapped={false} />
      </mesh>
      <sprite position={[box.x, 1.8, box.z]} scale={[1.6, 0.3, 1]}>
        <spriteMaterial map={label} transparent depthWrite={false} />
      </sprite>
    </group>
  );
}

function Station({
  bench,
  setBench,
  active,
  ik,
  onLight,
}: {
  bench: BenchState;
  setBench: SetBench;
  active: boolean;
  ik: React.RefObject<IKTargets>;
  onLight: (on: boolean) => void;
}) {
  return (
    <group>
      <group position={[STATION.x, 0, STATION.z]}>
        <RoundedBox args={[STATION.w, 0.06, STATION.d]} radius={0.02} position={[0, 0.9, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#1d2127" roughness={0.5} />
        </RoundedBox>
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <mesh key={`${sx},${sz}`} position={[sx * (STATION.w / 2 - 0.08), 0.44, sz * (STATION.d / 2 - 0.08)]} castShadow>
              <boxGeometry args={[0.05, 0.88, 0.05]} />
              <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.3} />
            </mesh>
          )),
        )}
      </group>
      <BenchTable
        bench={bench}
        setBench={setBench}
        active={active}
        origin={PAPER_ORIGIN}
        ikRef={ik}
        onLight={onLight}
      />
    </group>
  );
}

function Lab({
  bench,
  setBench,
  incline,
  seated,
  ik,
  lightOn,
  onLight,
}: {
  bench: BenchState;
  setBench: SetBench;
  incline: Incline;
  seated: StationId | null;
  ik: React.RefObject<IKTargets>;
  /** Сурагч унтраалга дарсны дараах бодит гэрэл */
  lightOn: boolean;
  onLight: (on: boolean) => void;
}) {
  const dark = !lightOn;
  return (
    <group>
      <FloorAndCeiling dark={dark} />
      <Walls />
      {/* Харанхуйлахад цонхны хөшиг татна */}
      {dark &&
        WINDOWS_Z.map((z) => (
          <mesh key={z} position={[-ROOM.w / 2 + 0.03, (WIN.bottom + WIN.top) / 2, z]} rotation={[0, Math.PI / 2, 0]} castShadow>
            <planeGeometry args={[WIN.w + 0.1, WIN.top - WIN.bottom + 0.1]} />
            <meshStandardMaterial color="#4b5563" roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
        ))}
      <Board />
      <Posters />
      <Door />
      {BENCHES.map((b, i) => (
        <Bench key={i} b={b} i={i} />
      ))}
      {STOOLS.map((s, i) => (
        <Stool key={i} s={s} />
      ))}
      <TeacherDesk />
      <Cabinet />
      <Station bench={bench} setBench={setBench} active={seated === "optics"} ik={ik} onLight={onLight} />
      <InclineTable incline={incline} center={INCLINE} active={seated === "incline"} ikRef={ik} />
      {!seated && STATION_IDS.map((id) => <StationMarker key={id} id={id} />)}
    </group>
  );
}

/* ---------- Сурагчийн удирдлага ба камер ---------- */

type Ctl = "forward" | "back" | "left" | "right" | "run" | "use";

const KEYS: { name: Ctl; keys: string[] }[] = [
  { name: "forward", keys: ["KeyW", "ArrowUp"] },
  { name: "back", keys: ["KeyS", "ArrowDown"] },
  { name: "left", keys: ["KeyA", "ArrowLeft"] },
  { name: "right", keys: ["KeyD", "ArrowRight"] },
  { name: "run", keys: ["ShiftLeft", "ShiftRight"] },
  { name: "use", keys: ["KeyE", "Enter"] },
];

type CamState = { yaw: number; pitch: number; lastDrag: number };

function Player({
  avatar,
  playerRef,
  camRef,
  using,
  seated,
  onNear,
  ik,
  firstPerson,
}: {
  avatar: Avatar;
  playerRef: React.RefObject<PlayerState>;
  camRef: React.RefObject<CamState>;
  ik: React.RefObject<IKTargets>;
  firstPerson: boolean;
  using: StationId | null;
  /** Ширээнд туршилт хийж байх үед алхахгүй, камерыг ширээний камер удирдана */
  seated: StationId | null;
  onNear: (near: StationId | null) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const [anim, setAnim] = useState<Anim>("idle");
  const animRef = useRef<Anim>("idle");
  const near = useRef<StationId | null>(null);
  const [, get] = useKeyboardControls<Ctl>();
  const camera = useThree((s) => s.camera);
  const goal = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const k = get();
    const state = playerRef.current;
    const cam = camRef.current;
    const fx = Math.sin(cam.yaw);
    const fz = Math.cos(cam.yaw);
    const fwd = Number(k.forward) - Number(k.back);
    const side = Number(k.right) - Number(k.left);
    // Камерын баруун тал = (-cos, 0, sin)
    let mx = fx * fwd - fz * side;
    let mz = fz * fwd + fx * side;
    const len = Math.hypot(mx, mz);
    let next: Anim = "idle";

    if (len > 0 && !using && !seated) {
      mx /= len;
      mz /= len;
      const step = (k.run ? RUN : WALK) * dt;
      if (!blocked(state.x + mx * step, state.z)) state.x += mx * step;
      if (!blocked(state.x, state.z + mz * step)) state.z += mz * step;
      state.heading = dampAngle(state.heading, Math.atan2(mx, mz), 10, dt);
      next = k.run ? "run" : "walk";
      // Урагш алхахад камер аажмаар ард нь орно
      if (fwd > 0 && performance.now() - cam.lastDrag > 1500)
        cam.yaw = dampAngle(cam.yaw, state.heading, 1.5, dt);
    }
    if (seated) {
      // Ширээний ирмэгт очиж (эсвэл багажийг дагаж) ширээ рүү харж зогсоно
      const seat = ik.current.stand ?? STATIONS[seated].seat;
      const dx = seat.x - state.x;
      const dz = seat.z - state.z;
      const d = Math.hypot(dx, dz);
      // Холоос алхаж очно; ойрхон бол ширээ рүү харсан чигээрээ хөлөө гишгэж (≤STEP_SPEED м/с) шилжинэ
      const far = d > 0.5;
      if (d > 1e-4) {
        const m = Math.min(d, (far ? WALK : Math.min(STEP_SPEED, d * 4)) * dt) / d;
        state.x += dx * m;
        state.z += dz * m;
      }
      if (far) next = "walk";
      state.heading = dampAngle(state.heading, far ? Math.atan2(dx, dz) : Math.PI, 8, dt);
    }
    const focus = using;
    if (focus) {
      const { box } = STATIONS[focus];
      const face = Math.atan2(box.x - state.x, box.z - state.z);
      state.heading = dampAngle(state.heading, face, 8, dt);
    }
    if (next !== animRef.current) {
      animRef.current = next;
      setAnim(next);
    }

    group.current?.position.set(state.x, 0, state.z);
    group.current?.rotation.set(0, state.heading, 0);
    if (seated) return;

    const dist = 3.8;
    const ty = 1.5;
    goal.set(
      clamp(state.x - fx * dist * Math.cos(cam.pitch), -ROOM.w / 2 + 0.25, ROOM.w / 2 - 0.25),
      Math.min(ty + dist * Math.sin(cam.pitch), ROOM.h - 0.2),
      clamp(state.z - fz * dist * Math.cos(cam.pitch), -ROOM.d / 2 + 0.25, ROOM.d / 2 - 0.25),
    );
    camera.position.lerp(goal, 1 - Math.exp(-10 * dt));
    camera.lookAt(state.x, ty, state.z);

    const isNear =
      STATION_IDS.find((id) => Math.hypot(state.x - STATIONS[id].use.x, state.z - STATIONS[id].use.z) < USE_RADIUS) ??
      null;
    if (isNear !== near.current) {
      near.current = isNear;
      onNear(isNear);
    }
  });

  return (
    <group ref={group}>
      <Student avatar={avatar} anim={anim} ikRef={ik} firstPerson={firstPerson} />
    </group>
  );
}

/* ---------- Сурагчийн нүдээр харах камер ---------- */

const EYE_FOV = 55;

function EyeCamera({ active, ik, zoom }: { active: boolean; ik: React.RefObject<IKTargets>; zoom: number }) {
  const look = useMemo(() => new THREE.Vector3(), []);
  const was = useRef(false);
  useFrame(({ camera, size }, delta) => {
    const cam = camera as THREE.PerspectiveCamera;
    if (!active) {
      // Горимоос гарахад линз, дэлгэцийн шилжилтийг сэргээнэ
      if (was.current) {
        was.current = false;
        cam.fov = EYE_FOV;
        cam.clearViewOffset();
        cam.updateProjectionMatrix();
      }
      return;
    }
    const t = ik.current;
    const k = 1 - Math.exp(-10 * Math.min(delta, 0.05));
    if (!was.current) look.copy(t.look ?? t.eye);
    was.current = true;
    cam.position.lerp(t.eye, k);
    if (t.look) look.lerp(t.look, k * 0.6);
    cam.lookAt(look);
    // Томруулах нь ойртож харах мэт: линзийг нарийсгана
    cam.fov += (EYE_FOV / Math.sqrt(zoom) - cam.fov) * k;
    // Өргөн дэлгэцэнд баруун самбарын ард ажлын талбай орохгүйн тулд дүрсийг зүүн тийш шилжүүлнэ
    if (size.width >= 1024) cam.setViewOffset(size.width, size.height, 205, 0, size.width, size.height);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  });
  return null;
}

function Lights({ dark }: { dark: boolean }) {
  const k = dark ? 0 : 1;
  return (
    <>
      <hemisphereLight args={["#f3f7ff", "#9a9184", dark ? 0.06 : 0.55]} />
      <ambientLight intensity={dark ? 0.03 : 0.12} />
      {/* Цонхоор орох нар */}
      <directionalLight
        position={[-14, 7, 1.5]}
        intensity={2.2 * k}
        color="#fff2dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-camera-far={40}
      />
      {[-4, 0, 4].map((x) => (
        <pointLight key={x} position={[x, ROOM.h - 0.3, 0]} intensity={1.6 * k} distance={9} decay={1.6} color="#f4f8ff" />
      ))}
    </>
  );
}

export default function RoomScene({
  avatar,
  playerRef,
  bench,
  setBench,
  incline,
  setIncline,
  onEnterLab,
  onChangeAvatar,
}: {
  avatar: Avatar;
  playerRef: React.RefObject<PlayerState>;
  bench: BenchState;
  setBench: SetBench;
  incline: Incline;
  setIncline: SetIncline;
  onEnterLab: () => void;
  onChangeAvatar: () => void;
}) {
  const cam = useRef<CamState>({ yaw: 0, pitch: 0.32, lastDrag: 0 });
  const [near, setNear] = useState<StationId | null>(null);
  const [using, setUsing] = useState<StationId | null>(null);
  const [seated, setSeated] = useState<StationId | null>(null);
  const nearRef = useRef<StationId | null>(null);
  const seatedRef = useRef<StationId | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  // Камер сурагчийн ард эхэлнэ
  useLayoutEffect(() => {
    cam.current.yaw = playerRef.current.heading;
  }, [playerRef]);

  // Ширээнд гараа сунгах хөдөлгөөний дараа камер ширээ рүү ойртоно
  useEffect(() => {
    if (!using) return;
    const t = setTimeout(() => {
      setUsing(null);
      setSeated(using);
      seatedRef.current = using;
    }, 900);
    return () => clearTimeout(t);
  }, [using]);

  // Туршилтын ширээнээс зорилт руу сунгасан гар, харцыг чөлөөлнө
  const ik = useRef<IKTargets>(newIK());
  // Туршилтыг сурагчийн нүдээр эсвэл хажуугаас харах
  const [view, setView] = useState<"eyes" | "side">("eyes");
  // Өрөөний гэрэл товч дармагц биш, сурагч унтраалга дарах агшинд солигдоно
  const [lightOn, setLightOn] = useState(bench.roomLight);

  const leaveBench = () => {
    const at = seatedRef.current;
    setSeated(null);
    seatedRef.current = null;
    Object.assign(ik.current, { left: null, right: null, look: null, stand: null, pencil: false });
    // Ширээний ирмэгээс зогсох цэг рүү буцна (ирмэгт мөргөлдөөнд гацахгүй)
    if (at) Object.assign(playerRef.current, STATIONS[at].use);
    setBench((b) => ({ ...b, roomLight: true }));
    setLightOn(true);
  };

  const onNear = (v: StationId | null) => {
    nearRef.current = v;
    setNear(v);
  };
  const use = () => {
    if (nearRef.current && !seatedRef.current) setUsing(nearRef.current);
  };

  return (
    <main
      className="relative h-dvh w-full touch-none select-none overflow-hidden bg-[#050A14] text-slate-100"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).tagName !== "CANVAS" || seatedRef.current) return;
        drag.current = { x: e.clientX, y: e.clientY };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const c = cam.current;
        c.yaw -= (e.clientX - drag.current.x) * 0.006;
        c.pitch = clamp(c.pitch + (e.clientY - drag.current.y) * 0.004, 0.05, 0.9);
        c.lastDrag = performance.now();
        drag.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <KeyboardControls map={KEYS} onChange={(name, pressed) => name === "use" && pressed && use()}>
        <Canvas
          shadows="percentage"
          dpr={[1, 1.75]}
          camera={{ fov: 55, near: 0.05, far: 80, position: [START.x - 2, 2.2, START.z] }}
          fallback={<NoWebGL onSkip={onEnterLab} />}
        >
          <color attach="background" args={["#bfe0ff"]} />
          <Lights dark={!lightOn} />
          <Lab
            bench={bench}
            setBench={setBench}
            incline={incline}
            seated={seated}
            ik={ik}
            lightOn={lightOn}
            onLight={setLightOn}
          />
          <BenchCamera active={seated === "optics" && view === "side"} zoom={bench.zoom} origin={PAPER_ORIGIN} />
          <InclineCamera active={seated === "incline" && view === "side"} center={INCLINE} />
          <EyeCamera active={!!seated && view === "eyes"} ik={ik} zoom={seated === "optics" ? bench.zoom : 1} />
          <Suspense fallback={null}>
            <Player
              avatar={avatar}
              playerRef={playerRef}
              camRef={cam}
              using={using}
              seated={seated}
              onNear={onNear}
              ik={ik}
              firstPerson={!!seated && view === "eyes"}
            />
          </Suspense>
        </Canvas>
      </KeyboardControls>
      <Loader />

      {seated === "optics" ? (
        <BenchPanel
          bench={bench}
          setBench={setBench}
          onLeave={leaveBench}
          onOpen2D={onEnterLab}
          view={view}
          onView={setView}
        />
      ) : seated === "incline" ? (
        <InclinePanel incline={incline} setIncline={setIncline} onLeave={leaveBench} view={view} onView={setView} />
      ) : (
      <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        <button
          type="button"
          onClick={onChangeAvatar}
          className="pointer-events-auto rounded-xl border border-[#22304D] bg-[#0A1120]/85 px-4 py-2 text-sm font-medium text-slate-200 backdrop-blur hover:bg-[#132038]"
        >
          ← Дүр солих
        </button>
        <button
          type="button"
          onClick={onEnterLab}
          className="pointer-events-auto rounded-xl border border-[#22304D] bg-[#0A1120]/85 px-4 py-2 text-sm font-medium text-slate-200 backdrop-blur hover:bg-[#132038]"
        >
          2D туршилт руу →
        </button>
      </div>

      {near && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
          <button
            type="button"
            onClick={use}
            className="pointer-events-auto rounded-2xl bg-amber-400 px-6 py-3 font-semibold text-slate-900 shadow-xl transition hover:bg-amber-300"
          >
            {using ? "Туршилтыг бэлдэж байна…" : (
              <>
                <kbd className="mr-2 rounded bg-slate-900/15 px-2 py-0.5 font-mono">E</kbd>
                {STATIONS[near].label} эхлүүлэх
              </>
            )}
          </button>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-[#22304D] bg-[#0A1120]/80 px-4 py-3 text-xs leading-relaxed text-slate-300 backdrop-blur">
        <p>
          <kbd className="font-mono text-slate-100">W A S D</kbd> / сум — алхах ·{" "}
          <kbd className="font-mono text-slate-100">Shift</kbd> — гүйх
        </p>
        <p>Хулганаар чирж камерыг эргүүлнэ</p>
        <p className="text-amber-200">Ширээний өмнөх шар цагираг руу очоод E дарна уу</p>
      </div>
      </>
      )}
    </main>
  );
}
