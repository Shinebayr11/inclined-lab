"use client";

import { Loader, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { Check, Segmented, primaryBtn, secondaryBtn } from "../_lab/ui";
import Student from "./Student";
import { type Avatar, COATS, KIDS } from "./avatar";

/* ============================================================
   ДҮР СОНГОХ ДЭЛГЭЦ
   ============================================================ */

function Swatches({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; swatch?: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm text-slate-300">
        {label}: <span className="text-slate-400">{options.find((o) => o.value === value)?.label}</span>
      </p>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            aria-label={o.label}
            title={o.label}
            onClick={() => onChange(o.value)}
            className={`h-9 w-9 rounded-full border-2 transition ${
              value === o.value
                ? "border-sky-400 ring-2 ring-sky-400/40"
                : "border-[#22304D] hover:border-slate-400"
            }`}
            style={{ background: o.swatch ?? o.value }}
          />
        ))}
      </div>
    </div>
  );
}

export function NoWebGL({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-300">
      <p>Энэ хөтөч 3D (WebGL) дэмжихгүй байна.</p>
      <button type="button" onClick={onSkip} className={`${primaryBtn} max-w-xs`}>
        Шууд туршилт руу орох
      </button>
    </div>
  );
}

export default function CharacterSelect({
  avatar,
  onChange,
  onEnter,
  onSkip,
}: {
  avatar: Avatar;
  onChange: (a: Avatar) => void;
  onEnter: () => void;
  onSkip: () => void;
}) {
  const set =
    <K extends keyof Avatar>(k: K) =>
    (v: Avatar[K]) =>
      onChange({ ...avatar, [k]: v });

  return (
    <main className="flex min-h-dvh flex-col bg-[#050A14] text-slate-100 lg:h-dvh lg:flex-row">
      <div className="relative h-[55dvh] lg:h-auto lg:flex-1">
        <Canvas
          shadows="percentage"
          camera={{ position: [0, 1.3, 3.6], fov: 35 }}
          fallback={<NoWebGL onSkip={onSkip} />}
        >
          <color attach="background" args={["#0a1222"]} />
          <hemisphereLight args={["#cfe0ff", "#1b2233", 1.1]} />
          <directionalLight
            position={[2.5, 4, 3]}
            intensity={2.4}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight position={[-3, 2, -2]} intensity={1.4} color="#7fb3ff" />
          <Suspense fallback={null}>
            <Student avatar={avatar} anim="idle" />
          </Suspense>
          <mesh receiveShadow position={[0, -0.04, 0]}>
            <cylinderGeometry args={[0.7, 0.75, 0.08, 48]} />
            <meshStandardMaterial color="#1b2740" />
          </mesh>
          <OrbitControls
            target={[0, 1, 0]}
            enablePan={false}
            minDistance={2}
            maxDistance={5}
            minPolarAngle={0.9}
            maxPolarAngle={1.65}
          />
        </Canvas>
        <Loader />
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-slate-400">
          Хулганаар чирж эргүүлнэ
        </p>
      </div>

      <aside className="w-full space-y-5 overflow-y-auto border-t border-[#16223A] bg-[#081124] p-5 lg:w-96 lg:border-l lg:border-t-0">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-400">
            Физикийн виртуал лаборатори
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Дүрээ сонго</h1>
          <p className="mt-1 text-sm text-slate-400">
            Лабораторид өөрийн дүрээр орж, туршилтын ширээ рүү алхаарай.
          </p>
        </header>
        <Segmented label="Сурагч" value={avatar.kid} options={KIDS} onChange={set("kid")} />
        <Swatches label="Халат" value={avatar.coat} options={COATS} onChange={set("coat")} />
        <Check
          label="🥽 Хамгаалах нүдний шил"
          hint="Лабораторид нүдээ хамгаалж зүүнэ"
          checked={avatar.goggles}
          onChange={set("goggles")}
        />
        <div className="space-y-2 pt-2">
          <button type="button" onClick={onEnter} className={primaryBtn}>
            Лабораторид орох →
          </button>
          <button type="button" onClick={onSkip} className={secondaryBtn}>
            3D-гүйгээр шууд туршилт руу
          </button>
        </div>
      </aside>
    </main>
  );
}
