"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { type Anim, type Avatar, KIDS, PACE, animUrl, kidUrl } from "./avatar";

/* ============================================================
   3D СУРАГЧ (Microsoft Rocketbox, MIT)
   Энгийн хувцастай хүүхдийн дээр лабораторийн халат өмсгөнө:
   их бие, ханцуйг шэйдерээр будаж сул унжуулна, хормойг гуяыг
   дагаж хөдөлдөг тусдаа mesh болгоно. Загвар сантиметрээр.
   ============================================================ */

const HEIGHT = 1.58; // 8-р ангийн сурагчийн өндөр (м)
const U = 100; // загварын нэгж / метр
const ANIMS: Anim[] = ["idle", "walk", "run"];

const TORSO_BONES = /(Spine|Clavicle)/;
const SLEEVE_BONES = /(UpperArm|Forearm)/;
const HIP_BONES = /(Spine|Pelvis|Thigh)|^Bip02$/;
// Хормойн доор далд үлдэх ч бүсэлхийд завсар гаргахгүйн тулд будна
const UNDER_COAT = /Pelvis|^Bip02$/;

type CoatUniforms = {
  uCoat: { value: THREE.Color };
  uNeck: { value: THREE.Vector3 };
};

function dominantBones(mesh: THREE.SkinnedMesh) {
  const idx = mesh.geometry.getAttribute("skinIndex");
  const w = mesh.geometry.getAttribute("skinWeight");
  const names: string[] = [];
  for (let i = 0; i < idx.count; i++) {
    let best = 0;
    let bw = -1;
    for (let k = 0; k < 4; k++) {
      const wk = w.getComponent(i, k);
      if (wk > bw) [bw, best] = [wk, idx.getComponent(i, k)];
    }
    names.push(mesh.skeleton.bones[best]?.name ?? "");
  }
  return names;
}

/* Өндөр × өнцгийн нүд бүрийн хамгийн их радиусыг дээрээс доош үргэлжлүүлж,
   даавууг хамгийн өргөн цэгээсээ шулуун унжуулна. */
function hangStraight(
  pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  ids: number[],
  maxPush: number,
  pad: number,
) {
  if (!ids.length) return;
  const BIN_Y = 0.02 * U;
  const BIN_A = 48;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const i of ids) [y0, y1] = [Math.min(y0, pos.getY(i)), Math.max(y1, pos.getY(i))];
  const rows = Math.ceil((y1 - y0) / BIN_Y) + 1;
  const row = (i: number) => Math.floor((pos.getY(i) - y0) / BIN_Y);
  const box = Array.from({ length: rows }, () => [Infinity, -Infinity, Infinity, -Infinity]);
  for (const i of ids) {
    const b = box[row(i)];
    b[0] = Math.min(b[0], pos.getX(i));
    b[1] = Math.max(b[1], pos.getX(i));
    b[2] = Math.min(b[2], pos.getZ(i));
    b[3] = Math.max(b[3], pos.getZ(i));
  }
  const polar = (i: number) => {
    const r = row(i);
    const [x0, x1, z0, z1] = box[r];
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const a = Math.atan2(pos.getX(i) - cx, pos.getZ(i) - cz);
    const bin = Math.floor(((a + Math.PI) / (2 * Math.PI)) * BIN_A) % BIN_A;
    return { r, a, bin, cx, cz, rad: Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz) };
  };
  const hang = new Float32Array(rows * BIN_A);
  for (const i of ids) {
    const p = polar(i);
    hang[p.r * BIN_A + p.bin] = Math.max(hang[p.r * BIN_A + p.bin], p.rad);
  }
  for (let r = rows - 2; r >= 0; r--)
    for (let b = 0; b < BIN_A; b++)
      hang[r * BIN_A + b] = Math.max(hang[r * BIN_A + b], hang[(r + 1) * BIN_A + b]);
  // Хөрш өнцгүүдээр дундажлаж, нэг нүдэнд сэрвээ мэт товгор гаргахгүй
  for (let r = 0; r < rows; r++) {
    const row = hang.slice(r * BIN_A, (r + 1) * BIN_A);
    for (let b = 0; b < BIN_A; b++)
      hang[r * BIN_A + b] =
        (row[(b + BIN_A - 1) % BIN_A] + 2 * row[b] + row[(b + 1) % BIN_A]) / 4;
  }
  for (const i of ids) {
    const p = polar(i);
    const above = p.r + 1 < rows ? hang[(p.r + 1) * BIN_A + p.bin] : p.rad;
    const rad = Math.min(Math.max(p.rad, above), p.rad + maxPush) + pad;
    pos.setXYZ(i, p.cx + Math.sin(p.a) * rad, pos.getY(i), p.cz + Math.cos(p.a) * rad);
  }
}

/** Ханцуй мөрнөөс доош аажим нарийсна (1 см тутамд ≤ SLOPE): доорх цамцны ханцуйн ирмэг,
    мөрний товгор халатан дээр шат болж гарахгүй. Орой бүрийг зөвхөн гадагш түлхэнэ. */
function smoothSleeve(
  pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  nor: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  ids: number[],
  joints: THREE.Vector3[],
  /** Мөрний оройн (эгэмний) оройнууд: ханцуй тэднээс эхэлж нарийсна, өөрсдөө хөдлөхгүй */
  refs: number[],
  /** Ханцуйн зузаан: normal-ын дагуу биш, тэнхлэгээс радиусаар тэлнэ (доорх цамцны ханцуйн
      ирмэгийн normal доош харсан тул тэнхлэгийн дагуу гулсаж атираа гаргадаг) */
  pad: number,
) {
  if (!ids.length) return;
  const BIN_T = 0.01 * U;
  const BIN_A = 16;
  const SLOPE = 0.12 * BIN_T;
  const MAX = 0.02 * U;
  const segs = [
    [joints[0], joints[1]],
    [joints[1], joints[2]],
  ];
  const p = new THREE.Vector3();
  const measure = (i: number) => {
    p.fromBufferAttribute(pos, i);
    let best = { dist: Infinity, c: new THREE.Vector3(), t: 0, dir: new THREE.Vector3() };
    let offset = 0;
    for (const [a, b] of segs) {
      const d = b.clone().sub(a);
      const len = d.length();
      const u = THREE.MathUtils.clamp(p.clone().sub(a).dot(d) / (len * len), 0, 1);
      const c = a.clone().addScaledVector(d, u);
      const dist = p.distanceTo(c);
      if (dist < best.dist) best = { dist, c, t: offset + u * len, dir: d.normalize() };
      offset += len;
    }
    const r = p.clone().sub(best.c);
    const ref = new THREE.Vector3(0, 0, 1).addScaledVector(best.dir, -best.dir.z).normalize();
    const side = new THREE.Vector3().crossVectors(best.dir, ref);
    const ang = Math.atan2(r.dot(side), r.dot(ref));
    return {
      i,
      c: best.c,
      rhat: r.clone().normalize(),
      rad: r.length(),
      // Мөрний үеэс гадагш (гар тийш) байгаа эсэх
      lateral: p.clone().sub(joints[0]).dot(segs[0][1].clone().sub(joints[0])) > 0,
      tb: Math.floor(best.t / BIN_T),
      ab: Math.floor(((ang + Math.PI) / (2 * Math.PI)) * BIN_A) % BIN_A,
    };
  };
  const info = ids.map(measure).map((x) => ({ ...x, rad: x.rad + pad }));
  const cap = refs.map(measure).filter((x) => x.lateral && x.rad < 0.07 * U);
  const T = Math.max(...info.map((x) => x.tb), ...cap.map((x) => x.tb)) + 1;
  const raw = new Float32Array(T * BIN_A);
  for (const x of [...info, ...cap]) raw[x.tb * BIN_A + x.ab] = Math.max(raw[x.tb * BIN_A + x.ab], x.rad);
  // Мөрнөөс бугуй руу: радиус огцом багасахгүй, налуугаар л нарийсна
  const env = new Float32Array(T * BIN_A);
  for (let a = 0; a < BIN_A; a++)
    for (let t = 0; t < T; t++)
      env[t * BIN_A + a] = Math.max(raw[t * BIN_A + a], t ? env[(t - 1) * BIN_A + a] - SLOPE : 0);
  // Хөрш өнцгүүдээр жигдэлж, нэг талд нь сэрвээ гаргахгүй
  const sm = env.map((_, k) => {
    const t = Math.floor(k / BIN_A);
    const a = k % BIN_A;
    const at = (d: number) => env[t * BIN_A + ((a + d + BIN_A) % BIN_A)];
    return (at(-1) + 2 * at(0) + at(1)) / 4;
  });
  for (const x of info) {
    const r = Math.min(Math.max(x.rad, sm[x.tb * BIN_A + x.ab]), x.rad + MAX);
    pos.setXYZ(x.i, x.c.x + x.rhat.x * r, x.c.y + x.rhat.y * r, x.c.z + x.rhat.z * r);
    // Ханцуй хоолой хэлбэртэй: normal тэнхлэгээс гадагш (доорх ирмэгийн доош харсан normal харанхуй зураас гаргахгүй)
    nor.setXYZ(x.i, x.rhat.x, x.rhat.y, x.rhat.z);
  }
}

/** Мөрний оройг (эгэм, нурууны хэсэг) гарын тэнхлэгийн дагуу аажмаар бугалганы ясанд шилжүүлнэ:
    гар доош унжихад орой нь ханцуйн дээгүүр тусдаа бүрхүүл шиг хэлтэрч үлдэхгүй. */
function blendShoulder(mesh: THREE.SkinnedMesh, s: "L" | "R") {
  const bones = mesh.skeleton.bones;
  const A = bones.findIndex((b) => b.name === `Bip02_${s}_UpperArm`);
  const F = bones.findIndex((b) => b.name === `Bip02_${s}_Forearm`);
  if (A < 0 || F < 0) return;
  const S = bones[A].getWorldPosition(new THREE.Vector3());
  const dir = bones[F].getWorldPosition(new THREE.Vector3()).sub(S).normalize();
  const g = mesh.geometry;
  const pos = g.getAttribute("position");
  const idx = g.getAttribute("skinIndex");
  const w = g.getAttribute("skinWeight");
  const p = new THREE.Vector3();
  const T0 = -0.03 * U;
  const T1 = 0.08 * U;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    // Мөрний үеэс гадагш, суганаас дээш л (их бие, хүзүүг хөндөхгүй)
    if (Math.sign(p.x) !== Math.sign(S.x) || Math.abs(p.x) < Math.abs(S.x) - 0.02 * U || p.y < S.y - 0.06 * U) continue;
    p.sub(S);
    const t = p.dot(dir);
    if (t < T0 || t > T1 || p.addScaledVector(dir, -t).length() > 0.09 * U) continue;
    const k = THREE.MathUtils.smoothstep(t, T0, T1);
    // Жингийн векторыг цэвэр бугалга руу k-аар холино (байхгүй бол хамгийн бага жинтэй үүрийг эзэлнэ)
    const ids = [0, 1, 2, 3].map((j) => idx.getComponent(i, j));
    const ws = [0, 1, 2, 3].map((j) => w.getComponent(i, j) * (1 - k));
    let slot = ids.indexOf(A);
    if (slot < 0) {
      slot = ws.indexOf(Math.min(...ws));
      ids[slot] = A;
      ws[slot] = 0;
    }
    ws[slot] += k;
    const sum = ws.reduce((m, x) => m + x, 0) || 1;
    idx.setXYZW(i, ids[0], ids[1], ids[2], ids[3]);
    w.setXYZW(i, ws[0] / sum, ws[1] / sum, ws[2] / sum, ws[3] / sum);
  }
  idx.needsUpdate = true;
  w.needsUpdate = true;
}

/** Бэлхүүсэд их биеийн халатны жинг ташааны яс руу аажим шилжүүлнэ: хормой ташаанд холбогдсон тул
    нуруу хазайхад халатны доод хэсэг хормойн гадна гарч шүд мэт харагдахгүй. */
function blendWaist(mesh: THREE.SkinnedMesh, ids: number[], from: number, to: number) {
  const P = mesh.skeleton.bones.findIndex((b) => b.name === "Bip02_Pelvis");
  if (P < 0) return;
  const g = mesh.geometry;
  const pos = g.getAttribute("position");
  const idx = g.getAttribute("skinIndex");
  const w = g.getAttribute("skinWeight");
  for (const i of ids) {
    const k = 1 - THREE.MathUtils.smoothstep(pos.getY(i), to, from);
    if (k <= 0) continue;
    const bs = [0, 1, 2, 3].map((j) => idx.getComponent(i, j));
    const ws = [0, 1, 2, 3].map((j) => w.getComponent(i, j) * (1 - k));
    let slot = bs.indexOf(P);
    if (slot < 0) {
      slot = ws.indexOf(Math.min(...ws));
      bs[slot] = P;
      ws[slot] = 0;
    }
    ws[slot] += k;
    const sum = ws.reduce((m, x) => m + x, 0) || 1;
    idx.setXYZW(i, bs[0], bs[1], bs[2], bs[3]);
    w.setXYZW(i, ws[0] / sum, ws[1] / sum, ws[2] / sum, ws[3] / sum);
  }
  idx.needsUpdate = true;
  w.needsUpdate = true;
}

/** Их бие, ханцуйг халат болгож тэлнэ. Халатны доод ирмэгийн өндрийг буцаана */
function tailorBody(mesh: THREE.SkinnedMesh): number {
  const g = mesh.geometry;
  if (g.userData.coatBottom !== undefined) return g.userData.coatBottom;
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const bones = dominantBones(mesh);
  const coat = new Float32Array(pos.count);
  const torso: number[] = [];
  const hips: number[] = [];
  const sleeves: Record<"L" | "R", number[]> = { L: [], R: [] };
  const caps: Record<"L" | "R", number[]> = { L: [], R: [] };
  const inflate = (i: number, t = 0.012 * U) =>
    pos.setXYZ(i, pos.getX(i) + nor.getX(i) * t, pos.getY(i) + nor.getY(i) * t, pos.getZ(i) + nor.getZ(i) * t);
  const shoulder = (["L", "R"] as const).map((s) =>
    mesh.skeleton.getBoneByName(`Bip02_${s}_UpperArm`)?.getWorldPosition(new THREE.Vector3()),
  );
  // Мөрний үеэс гадагш, суганаас дээш орших их биеийн орой гартай хамт хөдөлдөг хэсэг
  const onShoulder = (i: number) =>
    shoulder.some(
      (sh) =>
        !!sh &&
        Math.sign(pos.getX(i)) === Math.sign(sh.x) &&
        Math.abs(pos.getX(i)) > Math.abs(sh.x) - 0.02 * U &&
        pos.getY(i) > sh.y - 0.06 * U,
    );
  for (let i = 0; i < pos.count; i++) {
    if (TORSO_BONES.test(bones[i])) {
      coat[i] = 1;
      // Мөр (эгэм) нь T хэлбэрт өргөн тул унжуулахгүй, ханцуй шиг зузаална. Мөрний оройн их биеийн
      // хэсгийг ч унжуулбал гар доош буухад ханцуйн дээгүүр тусдаа бүрхүүл шиг хэлтэрч үлддэг.
      if (bones[i].includes("Spine") && !onShoulder(i)) torso.push(i);
      else {
        inflate(i);
        caps[pos.getX(i) > 0 ? "L" : "R"].push(i); // L тал нь +x
      }
    } else if (UNDER_COAT.test(bones[i])) {
      coat[i] = 1;
      hips.push(i);
    } else if (SLEEVE_BONES.test(bones[i])) {
      coat[i] = 1;
      sleeves[bones[i].includes("_L_") ? "L" : "R"].push(i);
    } else if (bones[i].includes("Thigh")) hips.push(i);
  }
  // Нуруу–ташааны ясны хил зигзаг тул халатны доод ирмэгийг хэвтээ шулуунаар зүснэ:
  // хамгийн доод нурууны оройноос дээшхи ташаа, гуяны оройг ч их биетэй хамт унжуулна
  const bottom = torso.reduce((m, i) => Math.min(m, pos.getY(i)), Infinity);
  for (const i of hips)
    if (pos.getY(i) >= bottom) {
      coat[i] = 1;
      torso.push(i);
    }
  const flat = torso.map((i) => [pos.getX(i), pos.getZ(i)]);
  hangStraight(pos, torso, 0.035 * U, 0.012 * U); // гар биеэр нэвтрэхгүйн тулд тэлэлт хязгаартай
  // Доод 5 см-т тэлэлтийг аажим бууруулна: тэлсэн, тэлээгүй оройн хоорондох гурвалжин
  // ирмэг дээр шүд гаргахгүй, халат биед зөөлөн шингэж хормойн доор орно
  const FADE = 0.05 * U;
  torso.forEach((i, n) => {
    const f = THREE.MathUtils.smoothstep(pos.getY(i), bottom, bottom + FADE);
    if (f < 1) pos.setXYZ(i, THREE.MathUtils.lerp(flat[n][0], pos.getX(i), f), pos.getY(i), THREE.MathUtils.lerp(flat[n][1], pos.getZ(i), f));
  });
  // Хормойн орой (доод ирмэгээс 4 см дээш) хүртэлх хэсэг ташаатай хамт, түүнээс 10 см дээш аажим нуруу руу
  blendWaist(mesh, torso, bottom + 0.14 * U, bottom + 0.04 * U);
  for (const s of ["L", "R"] as const) {
    blendShoulder(mesh, s);
    const joint = (n: string) =>
      mesh.skeleton.getBoneByName(`Bip02_${s}_${n}`)?.getWorldPosition(new THREE.Vector3());
    const joints = [joint("UpperArm"), joint("Forearm"), joint("Hand")];
    if (joints.every(Boolean)) smoothSleeve(pos, nor, sleeves[s], joints as THREE.Vector3[], caps[s], 0.012 * U);
    else for (const i of sleeves[s]) inflate(i);
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  g.computeBoundingSphere();
  g.setAttribute("aCoat", new THREE.BufferAttribute(coat, 1));
  g.userData.coatBottom = torso.reduce((m, i) => Math.min(m, pos.getY(i)), Infinity);
  return g.userData.coatBottom;
}

/** Халатны хормой: урд талаараа задгай, гуяыг дагаж савлана */
function buildSkirt(body: THREE.SkinnedMesh, coatBottom: number, material: THREE.Material) {
  const bones = body.skeleton.bones;
  const at = (n: string) => bones.findIndex((b) => b.name === n);
  const P = at("Bip02_Pelvis");
  const L = at("Bip02_L_Thigh");
  const R = at("Bip02_R_Thigh");
  const hip = bones[L].getWorldPosition(new THREE.Vector3()).y;
  const knee = bones[at("Bip02_L_Calf")].getWorldPosition(new THREE.Vector3()).y;
  const hem = knee + 0.35 * (hip - knee);
  // Их биеийн халаттай давхцаж эхэлснээр бүсэлхийд завсар гарахгүй
  const top = coatBottom + 0.04 * U;

  const pos = body.geometry.getAttribute("position");
  const names = dominantBones(body);
  const ids: number[] = [];
  for (let i = 0; i < pos.count; i++) if (HIP_BONES.test(names[i]) || TORSO_BONES.test(names[i])) ids.push(i);
  const hipIds = ids.filter((i) => pos.getY(i) <= top && pos.getY(i) >= hem);
  const cz = hipIds.reduce((s, i) => s + pos.getZ(i), 0) / Math.max(1, hipIds.length);

  const A = 48;
  const RINGS = 8;
  const binOf = (a: number) => Math.floor(((a + Math.PI) / (2 * Math.PI)) * A) % A;
  const ys = Array.from({ length: RINGS }, (_, j) => top + ((hem - top) * j) / (RINGS - 1));
  // Цагираг бүрийн өндөрт биеийн (дээд талд нь халатны) радиус өнцгөөр
  const rows = ys.map(() => new Float32Array(A));
  for (const i of ids) {
    const x = pos.getX(i);
    const z = pos.getZ(i) - cz;
    const b = binOf(Math.atan2(x, z));
    ys.forEach((y, j) => {
      if (Math.abs(pos.getY(i) - y) < 0.025 * U) rows[j][b] = Math.max(rows[j][b], Math.hypot(x, z));
    });
  }
  // Хөрш нүдний дээд утгаар хоосон нүдийг нөхөөд, дараа нь дунджаар жигдрүүлнэ (босоо судал гаргахгүй)
  const smooth = (row: Float32Array) => {
    const m = row.map((_, b) => Math.max(row[(b + A - 1) % A], row[b], row[(b + 1) % A]));
    return m.map((_, b) => (m[(b + A - 2) % A] + m[(b + A - 1) % A] + m[b] + m[(b + 1) % A] + m[(b + 2) % A]) / 5);
  };
  // Их биеийн халатны доод хэсэг (давхцах бүс) хормойн дотор бүрэн орно: огтлолцож шүд гаргахгүй
  const shell = new Float32Array(A);
  for (const i of ids) {
    const y = pos.getY(i);
    if (y < coatBottom - 0.01 * U || y > top + 0.12 * U) continue;
    const x = pos.getX(i);
    const z = pos.getZ(i) - cz;
    const b = binOf(Math.atan2(x, z));
    shell[b] = Math.max(shell[b], Math.hypot(x, z));
  }
  // Жигд дээд бүрхүүл: ±W нүдний дээд утгыг ±W-ээр дундажлахад анхны утгаас хэзээ ч бага болохгүй
  const W = 3;
  const around = (row: Float32Array, f: (v: number[]) => number) =>
    row.map((_, b) => f(Array.from({ length: 2 * W + 1 }, (_, d) => row[(b + d - W + A) % A])));
  const upper = (row: Float32Array) =>
    around(around(row, (v) => Math.max(...v)), (v) => v.reduce((m, x) => m + x, 0) / v.length);
  // Дээд цагираг халатны гадаргуу дээр, доошлох тусам бие бүрхэх хэмжээгээр шулуун унжина
  const radii: Float32Array[] = [upper(rows[0].map((r, b) => Math.max(r, shell[b]))).map((r) => r + 0.01 * U)];
  for (let j = 1; j < RINGS; j++) {
    const below = smooth(rows[j]);
    radii.push(radii[j - 1].map((r, b) => Math.max(r, below[b] + 0.022 * U) + 0.003 * U));
  }

  // Оройд хэвтээ бүс: хормой ба халатны завсрыг хаана (дээрээс харахад дотор тал харагдахгүй).
  // Халатны гадаргуугаас бага зэрэг дотор эхэлж, оройн цагирагтай ижил өндөрт байна.
  const waist = new Float32Array(A);
  for (const i of ids) {
    if (Math.abs(pos.getY(i) - top) > 0.015 * U) continue;
    const b = binOf(Math.atan2(pos.getX(i), pos.getZ(i) - cz));
    waist[b] = Math.max(waist[b], Math.hypot(pos.getX(i), pos.getZ(i) - cz));
  }
  for (let pass = 0; pass < A && waist.some((r) => r === 0); pass++)
    waist.forEach((r, b) => {
      if (!r) waist[b] = Math.max(waist[(b + A - 1) % A], waist[(b + 1) % A]);
    });
  ys.unshift(top);
  radii.unshift(waist.map((r, b) => Math.min(r - 0.005 * U, radii[0][b] - 0.01 * U)));

  const SEG = 72;
  const verts: number[] = [];
  const skinIndex: number[] = [];
  const skinWeight: number[] = [];
  const index: number[] = [];
  for (let j = 0; j < ys.length; j++) {
    const t = Math.max(0, j - 1) / (RINGS - 1);
    // Бүсэлхийд товчтой, хормой руугаа бага зэрэг задарна (рад)
    const open = 0.03 + 0.3 * t ** 1.5;
    for (let s = 0; s <= SEG; s++) {
      let a = open + ((2 * Math.PI - 2 * open) * s) / SEG;
      if (a > Math.PI) a -= 2 * Math.PI;
      const f = ((a + Math.PI) / (2 * Math.PI)) * A - 0.5;
      const b0 = Math.floor(f);
      const r = THREE.MathUtils.lerp(radii[j][(b0 + A) % A], radii[j][(b0 + 1 + A) % A], f - b0);
      verts.push(Math.sin(a) * r, ys[j], cz + Math.cos(a) * r);
      const side = Math.sin(a);
      const k = THREE.MathUtils.smoothstep(Math.abs(side), 0.1, 0.5) * t * 0.8;
      skinIndex.push(P, side > 0 ? L : R, 0, 0);
      skinWeight.push(1 - k, k, 0, 0);
      if (j > 0 && s > 0) {
        const c = j * (SEG + 1) + s;
        const p = c - (SEG + 1);
        index.push(p - 1, c - 1, p, p, c - 1, c);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const skirt = new THREE.SkinnedMesh(geo, material);
  skirt.bind(body.skeleton, body.bindMatrix);
  skirt.castShadow = true;
  skirt.frustumCulled = false;
  return skirt;
}

/** Хамгаалах нүдний шил: нүдний өндөрт байрлуулж толгойн ясанд холбоно */
function buildGoggles(model: THREE.Object3D, head: THREE.Mesh) {
  const bone = model.getObjectByName("Bip02_Head");
  if (!bone) return null;
  const pos = head.geometry.getAttribute("position");
  const base = bone.getWorldPosition(new THREE.Vector3()).y;
  let top = -Infinity;
  for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
  const eye = base + 0.45 * (top - base);
  let front = -Infinity;
  let back = Infinity;
  let half = 0;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getY(i) - eye) > 0.015 * U) continue;
    front = Math.max(front, pos.getZ(i));
    back = Math.min(back, pos.getZ(i));
    half = Math.max(half, Math.abs(pos.getX(i)));
  }
  const g = new THREE.Group();
  const w = half * 1.55;
  const h = 0.045 * U;
  const z = front - 0.012 * U;
  const lens = new THREE.Mesh(
    new RoundedBoxGeometry(w, h, 0.028 * U, 4, 0.012 * U),
    new THREE.MeshStandardMaterial({
      color: "#cdeeff",
      transparent: true,
      opacity: 0.22,
      roughness: 0.05,
      metalness: 0.1,
      depthWrite: false,
    }),
  );
  lens.position.z = z;
  const dark = new THREE.MeshStandardMaterial({ color: "#2b3440", roughness: 0.6 });
  const edge = 0.0035 * U;
  for (const [x, y, sx, sy] of [
    [0, h / 2, w, edge],
    [0, -h / 2, w, edge],
    [w / 2, 0, edge, h],
    [-w / 2, 0, edge, h],
  ]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.03 * U), dark);
    rim.position.set(x, y, z);
    g.add(rim);
  }
  // Толгойг тойрсон тууз: торусыг хэвтүүлж толгойн хэлбэрт сунгана
  const strap = new THREE.Mesh(new THREE.TorusGeometry(1, 0.04, 6, 40), dark);
  strap.rotation.x = Math.PI / 2;
  strap.scale.set(half * 1.06, ((front - back) / 2) * 1.04, 10);
  strap.position.z = (front + back) / 2;
  g.add(lens, strap);
  g.position.y = eye;
  g.traverse((o) => (o.castShadow = true));
  model.add(g);
  model.updateMatrixWorld(true);
  bone.attach(g);
  return g;
}

function dressBody(mat: THREE.MeshStandardMaterial, u: CoatUniforms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aCoat;\nvarying float vCoat;\nvarying vec3 vRest;",
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCoat = aCoat;\nvRest = position * 0.01;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying float vCoat;
        varying vec3 vRest;
        uniform vec3 uCoat;
        uniform vec3 uNeck;`,
      )
      // Халат: урд V зах дундуур өөрийн цамц харагдана; захын ирмэг, товч, нэрийн тэмдэг
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        bool isCoat = vCoat > 0.5;
        if (isCoat) {
          vec3 r = vRest - uNeck;
          bool front = r.z > 0.0;
          float vY = -0.2 + abs(r.x) * 1.9;
          vec3 c = uCoat;
          if (front && abs(r.x) < 0.12 && r.y > vY + 0.012) c = diffuseColor.rgb;
          else if (front && abs(r.x) < 0.13 && r.y > vY) c = uCoat * 0.78;
          else if (front && abs(r.x) < 0.0025) c = uCoat * 0.8;
          if (front) {
            for (int k = 0; k < 3; k++)
              if (length(r.xy - vec2(0.0, -0.25 - float(k) * 0.1)) < 0.007) c = vec3(0.45);
            if (r.x > 0.045 && r.x < 0.1 && r.y > -0.17 && r.y < -0.135)
              c = r.y > -0.145 ? vec3(0.12, 0.35, 0.75) : vec3(0.95);
          }
          diffuseColor.rgb = c;
        }`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nif (isCoat) roughnessFactor = 0.85;",
      )
      // Доорх хувцасны нугалаас халатан дээр хэт тод гарахгүй
      .replace(
        "#include <normal_fragment_maps>",
        "#include <normal_fragment_maps>\nif (isCoat) normal = normalize(mix(normal, nonPerturbedNormal, 0.6));",
      );
  };
  mat.customProgramCacheKey = () => "student-coat";
}

/* ---------- Гар, толгойн IK: туршилтын багажийг жинхэнээр барина ---------- */

/** Дэлхийн координатаар: аль гараа хаашаа сунгах, хаашаа харах, хаана зогсох */
export type IKTargets = {
  left: THREE.Vector3 | null;
  right: THREE.Vector3 | null;
  look: THREE.Vector3 | null;
  stand: THREE.Vector3 | null;
  /** Хурууны атгалт: 0 — алга дэлгэсэн, 1 — бүрэн атгасан */
  gripL: number;
  gripR: number;
  /** Баруун гарт харандаа барина; тэгвэл right нь харандааны үзүүр */
  pencil: boolean;
  /** Student бичнэ: нүдний байрлал (сурагчийн нүдээр харах камерт) */
  eye: THREE.Vector3;
};

export const newIK = (): IKTargets => ({
  left: null,
  right: null,
  look: null,
  stand: null,
  gripL: 0.15,
  gripR: 0.15,
  pencil: false,
  eye: new THREE.Vector3(),
});

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qp = new THREE.Quaternion();

/** Ясыг эргүүлж, түүний хүүхэд ясыг (child) хүссэн цэг рүү чиглүүлнэ */
function aimBone(bone: THREE.Object3D, child: THREE.Vector3, goal: THREE.Vector3) {
  const at = bone.getWorldPosition(_a);
  const from = _b.subVectors(child, at).normalize();
  const to = _c.subVectors(goal, at).normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(from, to);
  turn.multiply(bone.getWorldQuaternion(_q));
  bone.parent!.getWorldQuaternion(_qp).invert();
  bone.quaternion.copy(_qp.multiply(turn));
  bone.updateMatrixWorld(true);
}

/** Хоёр ястай мөч (мөр–тохой–бугуй, гуя–өвдөг–шагай): дунд үеийг pole тийш нугалж үзүүрийг зорилт руу аваачна */
function solveLimb(chain: THREE.Bone[], target: THREE.Vector3, w: number, bend: THREE.Vector3) {
  const [upper, fore, hand] = chain;
  const keepU = upper.quaternion.clone();
  const keepF = fore.quaternion.clone();
  const S = upper.getWorldPosition(new THREE.Vector3());
  const E = fore.getWorldPosition(new THREE.Vector3());
  const H = hand.getWorldPosition(new THREE.Vector3());
  const a = S.distanceTo(E);
  const b = E.distanceTo(H);
  const dir = new THREE.Vector3().subVectors(target, S);
  const d = THREE.MathUtils.clamp(dir.length(), Math.abs(a - b) + 1e-4, (a + b) * 0.999);
  dir.normalize();
  const x = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  const pole = bend.clone();
  pole.addScaledVector(dir, -pole.dot(dir)).normalize();
  const elbow = S.clone().addScaledVector(dir, x).addScaledVector(pole, h);
  aimBone(upper, E, elbow);
  aimBone(fore, fore.localToWorld(hand.position.clone()), S.clone().addScaledVector(dir, d));
  // Хөдөлгөөнөөс IK руу зөөлөн шилжинэ (slerpQuaternions зорилтоо хуулбараар авна)
  upper.quaternion.slerpQuaternions(keepU, upper.quaternion.clone(), w);
  fore.quaternion.slerpQuaternions(keepF, fore.quaternion.clone(), w);
  upper.updateMatrixWorld(true);
}

const UP = new THREE.Vector3(0, 1, 0);
// Алхам: хугацаа (с), эхлэх зөрүү (м), хөл өргөх өндөр (м)
const STEP_T = 0.22;
const STEP_AT = 0.05;
const STEP_LIFT = 0.05;

/** Ясны дэлхийн эргэлтийг world-space turn-оор өөрчилнө (w-ээр холино) */
function turnBone(bone: THREE.Object3D, turn: THREE.Quaternion, w = 1) {
  const now = bone.getWorldQuaternion(new THREE.Quaternion());
  const next = turn.clone().multiply(now);
  now.slerp(next, w);
  bone.quaternion.copy(bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(now));
  bone.updateMatrixWorld(true);
}

type Hand = { hand: THREE.Bone; fingers: THREE.Bone[][]; side: 1 | -1 };

/** Алганы хүрээ: хурууны чиглэл d ба алганы нормаль n (ясны байрлалаас; тэнхлэгийн тохиролцооноос үл хамаарна) */
function palmFrame({ hand, fingers, side }: Hand) {
  const H = hand.getWorldPosition(new THREE.Vector3());
  const I = fingers[1][0].getWorldPosition(new THREE.Vector3());
  const P = fingers[4][0].getWorldPosition(new THREE.Vector3());
  const T = fingers[0][1].getWorldPosition(new THREE.Vector3());
  const d = I.add(P).multiplyScalar(0.5).sub(H).normalize();
  const t = T.sub(H).normalize();
  // A хэлбэрийн амрах байрлалаас шалгав: зүүн гарт d×t, баруунд t×d нь алганы тал
  const n = new THREE.Vector3().crossVectors(d, t).multiplyScalar(side).normalize();
  return { d, n };
}

/** Алгыг доош, хурууг урагш бага зэрэг доош чиглүүлнэ (ширээ тулах, юм барих байрлал) */
function orientHand(h: Hand, forward: THREE.Vector3, w: number) {
  const { d, n } = palmFrame(h);
  const nGoal = new THREE.Vector3(0, -1, 0);
  const dGoal = forward.clone().multiplyScalar(Math.cos(0.35)).addScaledVector(UP, -Math.sin(0.35));
  const q1 = new THREE.Quaternion().setFromUnitVectors(n, nGoal);
  const d1 = d.applyQuaternion(q1);
  const flat = (v: THREE.Vector3) => v.addScaledVector(nGoal, -v.dot(nGoal)).normalize();
  const q2 = new THREE.Quaternion().setFromUnitVectors(flat(d1), flat(dGoal));
  turnBone(h.hand, q2.multiply(q1), w);
}

/** Хуруунуудыг алганы тал руу нугална; эрхий хуруу бага */
function curlFingers(h: Hand, grip: number, w: number) {
  const { n } = palmFrame(h);
  const g = (0.12 + 0.88 * grip) * w;
  h.fingers.forEach((chain, i) => {
    const base = chain[0].getWorldPosition(new THREE.Vector3());
    const dir = chain[1].getWorldPosition(new THREE.Vector3()).sub(base).normalize();
    const axis = new THREE.Vector3().crossVectors(dir, n).normalize();
    const angles = i === 0 ? [0.25, 0.35, 0.3] : [1.0, 1.2, 0.9];
    chain.forEach((bone, j) => turnBone(bone, new THREE.Quaternion().setFromAxisAngle(axis, angles[j] * g)));
  });
}

type Props = {
  avatar: Avatar;
  anim: Anim;
  ikRef?: React.RefObject<IKTargets>;
  /** Сурагчийн нүдээр харах үед толгойг камераас нууна */
  firstPerson?: boolean;
};

// useAnimations action-ыг нэрээр нь кэшлэдэг тул дүр солигдоход шинээр mount хийнэ
export default function Student(props: Props) {
  return <StudentBody key={props.avatar.kid} {...props} />;
}

function StudentBody({ avatar, anim, ikRef, firstPerson = false }: Props) {
  const gltf = useGLTF(kidUrl(avatar.kid), false);
  const clipJson = useLoader(
    THREE.FileLoader,
    ANIMS.map((a) => animUrl(avatar.kid, a)),
  ) as string[];
  const root = useRef<THREE.Group>(null);

  const pencil = useRef<THREE.Group>(null);
  const { model, uniforms, skirtMat, goggles, headMesh, scale } = useMemo(() => {
    const m = cloneSkinned(gltf.scene);
    m.updateMatrixWorld(true);
    const neck = m.getObjectByName("Bip02_Neck")?.getWorldPosition(new THREE.Vector3());
    const u: CoatUniforms = {
      uCoat: { value: new THREE.Color() },
      uNeck: { value: (neck ?? new THREE.Vector3()).multiplyScalar(1 / U) },
    };
    const skirtMaterial = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide });
    let body: THREE.SkinnedMesh | undefined;
    let head: THREE.Mesh | undefined;
    let top = 0;
    m.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone();
      mesh.geometry.computeBoundingBox();
      top = Math.max(top, mesh.geometry.boundingBox!.max.y);
      const name = (mesh.material as THREE.Material).name;
      if (name === "body") body = mesh;
      if (name === "head") head = mesh;
    });
    if (body) {
      const coatBottom = tailorBody(body);
      dressBody(body.material as THREE.MeshStandardMaterial, u);
      body.parent?.add(buildSkirt(body, coatBottom, skirtMaterial));
    }
    const g = head ? buildGoggles(m, head) : null;
    return { model: m, uniforms: u, skirtMat: skirtMaterial, goggles: g, headMesh: head ?? null, scale: HEIGHT / top };
  }, [gltf.scene]);

  // Насанд хүрэгчийн хөдөлгөөнийг хүүхдийн өндөрт тааруулна
  const clips = useMemo(() => {
    const kidRoot = model.getObjectByName("Bip02")?.position ?? new THREE.Vector3();
    return clipJson.map((text, i) => {
      const { rootRest, clip } = JSON.parse(text) as { rootRest: number[]; clip: THREE.AnimationClipJSON };
      const c = THREE.AnimationClip.parse(clip);
      // Насанд хүрэгчийн хурууны хөдөлгөөн хүүхдийн ясанд мушгирч харагддаг тул хурууг өөрсдөө удирдана
      c.tracks = c.tracks.filter((t) => !t.name.includes("Finger"));
      c.name = ANIMS[i];
      const k = kidRoot.y / rootRest[1];
      for (const t of c.tracks) {
        if (t.name !== "Bip02.position") continue;
        for (let j = 0; j < t.values.length; j += 3) {
          t.values[j] = kidRoot.x;
          t.values[j + 1] = kidRoot.y + (t.values[j + 1] - rootRest[1]) * k;
          t.values[j + 2] = kidRoot.z;
        }
      }
      return c;
    });
  }, [clipJson, model]);

  const { actions } = useAnimations(clips, root);

  // Гарын гинж, хуруу, толгойн урд чиглэл (амрах байрлалаас)
  const rig = useMemo(() => {
    const bone = (n: string) => model.getObjectByName(n) as THREE.Bone | undefined;
    const arm = (s: "L" | "R") => {
      const c = [bone(`Bip02_${s}_UpperArm`), bone(`Bip02_${s}_Forearm`), bone(`Bip02_${s}_Hand`)];
      return c.every(Boolean) ? (c as THREE.Bone[]) : null;
    };
    const hand = (s: "L" | "R"): Hand | null => {
      const h = bone(`Bip02_${s}_Hand`);
      const fingers = [0, 1, 2, 3, 4].map((i) =>
        [`${i}`, `${i}1`, `${i}2`].map((k) => bone(`Bip02_${s}_Finger${k}`)),
      );
      if (!h || fingers.some((c) => c.some((b) => !b))) return null;
      return { hand: h, fingers: fingers as THREE.Bone[][], side: s === "L" ? 1 : -1 };
    };
    const head = bone("Bip02_Head") ?? null;
    const headFwd = new THREE.Vector3(0, 0, 1);
    if (head) headFwd.applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()).invert());
    // Тонгойхдоо нэг нугаламаар хугарахгүй: ташаа ба нурууны ясанд хуваарилна (twist — дээд хэсэгт)
    const torso = (
      [
        ["Bip02_Pelvis", 0.3, 0],
        ["Bip02_Spine", 0.2, 0],
        ["Bip02_Spine1", 0.25, 0.5],
        ["Bip02_Spine2", 0.25, 0.5],
      ] as const
    )
      .map(([n, lean, twist]): { bone: THREE.Bone | undefined; lean: number; twist: number } => ({ bone: bone(n), lean, twist }))
      .filter((x): x is { bone: THREE.Bone; lean: number; twist: number } => !!x.bone);
    // Гуя–шилбэ–шагай: зогсож байхад тавхайг шалан дээр тогтооно
    const legs = (["L", "R"] as const)
      .map((s) => [bone(`Bip02_${s}_Thigh`), bone(`Bip02_${s}_Calf`), bone(`Bip02_${s}_Foot`)])
      .filter((c): c is THREE.Bone[] => c.every(Boolean));
    const left = arm("L");
    const right = arm("R");
    const handL = hand("L");
    const handR = hand("R");
    // IK-ээр өөрчилдөг бүх яс
    const touched = [
      ...(left ?? []),
      ...(right ?? []),
      ...torso.map((x) => x.bone),
      ...legs.flat(),
      head,
    ].filter((b): b is THREE.Bone => !!b);
    // Хурууг кадр бүр амрах байрлалаас нь эхлүүлж нугална
    const fingers = [...(handL?.fingers.flat() ?? []), ...(handR?.fingers.flat() ?? [])];
    const fingerRest = fingers.map((b) => b.quaternion.clone());
    return { left, right, handL, handR, head, headFwd, torso, legs, touched, fingers, fingerRest };
  }, [model]);
  const fade = useRef({ left: 0, right: 0, look: 0, gripL: 0.15, gripR: 0.15, lean: 0, twist: 0, feet: 0 });
  // Хөл бүрийн гишгэсэн цэг (дэлхийн) ба алхмын явц (t < 0 — шалан дээр тогтсон)
  const steps = useRef<{ at: THREE.Vector3; from: THREE.Vector3; to: THREE.Vector3; t: number }[] | null>(null);
  // AnimationMixer нь утга нь өөрчлөгдөөгүй ясыг дахин бичдэггүй тул IK-ийн эргэлт дараагийн кадрт
  // хуримтлагдана. Mixer-ээс өмнө (priority -1) өмнөх кадрын анимацийн утгыг буцааж тавина:
  // mixer шинэ утга бичвэл түүгээр, бичихгүй бол яг өмнөх анимацийн утгаараа үлдэнэ.
  const pose = useMemo(() => ({ anim: rig.touched.map((b) => b.quaternion.clone()) }), [rig]);
  useFrame(() => rig.touched.forEach((b, i) => b.quaternion.copy(pose.anim[i])), -1);
  const last = useMemo(
    () => ({
      left: new THREE.Vector3(),
      right: new THREE.Vector3(),
      look: new THREE.Vector3(),
      // Гар зорилт руу шууд үсрэхгүй, хурдасч удааширч хөдөлнө
      curL: new THREE.Vector3(),
      curR: new THREE.Vector3(),
      // Өмнөх кадрын биеийн байрлал (хурдыг тооцож дараагийн гишгэх цэгийг таамаглана)
      body: new THREE.Vector3(),
      leanDir: new THREE.Vector3(0, 0, 1),
    }),
    [],
  );

  // useAnimations-ийн дараа ажиллаж, хөдөлгөөний дээр гар, хуруу, толгойг засна
  useFrame(({ clock }, delta) => {
    const t = ikRef?.current;
    const dt = Math.min(delta, 0.05);
    rig.fingers.forEach((b, i) => b.quaternion.copy(rig.fingerRest[i]));
    rig.touched.forEach((b, i) => pose.anim[i].copy(b.quaternion));
    const k = 1 - Math.exp(-6 * dt);
    const body = model.getWorldQuaternion(new THREE.Quaternion());
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(body);
    // Гар хүрэхгүй хол зорилт руу биеэ урагш тонгойлгоно (бодит сурагч шиг)
    let need = 0;
    // Тонгойх чиглэл: хамгийн хол зорилт руу (хажуу тийш сунгахад хажуу тийш хазайна)
    const leanDir = forward.clone();
    for (const side of ["left", "right"] as const) {
      const chain = rig[side];
      const goal = t?.[side];
      if (!chain || !goal) continue;
      const S = chain[0].getWorldPosition(new THREE.Vector3());
      const reach = S.distanceTo(chain[1].getWorldPosition(new THREE.Vector3())) +
        chain[1].getWorldPosition(new THREE.Vector3()).distanceTo(chain[2].getWorldPosition(new THREE.Vector3()));
      const n = THREE.MathUtils.clamp((S.distanceTo(goal) - reach * 0.9) / 0.3, 0, 1);
      if (n > need) {
        need = n;
        const d = goal.clone().sub(S).setY(0);
        if (d.lengthSq() > 1e-4) leanDir.copy(d.normalize());
      }
    }
    fade.current.lean += (need - fade.current.lean) * (1 - Math.exp(-4 * dt));

    // Анимацийн тавхайн байрлал = хөл "байх ёстой" цэг (тонгойхоос өмнө авна)
    const bodyAt = model.getWorldPosition(new THREE.Vector3());
    const vel = bodyAt.clone().sub(last.body).divideScalar(Math.max(dt, 1e-3)).clampLength(0, 1);
    last.body.copy(bodyAt);
    const want = rig.legs.map((c) => c[2].getWorldPosition(new THREE.Vector3()));
    const footRot = rig.legs.map((c) => c[2].getWorldQuaternion(new THREE.Quaternion()));

    // Хол сунгахад ташаа, нуруугаараа жигд тонгойно
    if (fade.current.lean > 0.01) {
      last.leanDir.lerp(leanDir, k).normalize();
      const axis = new THREE.Vector3().crossVectors(UP, last.leanDir).normalize();
      for (const x of rig.torso)
        turnBone(x.bone, new THREE.Quaternion().setFromAxisAngle(axis, 0.65 * x.lean * fade.current.lean));
    }
    // Хоёр гарын дундаж зорилт руу их биеэ эргүүлнэ (хажуу тийш сунгахад мөр нь дагана)
    const hl = t?.left ?? null;
    const hr = t?.right ?? null;
    let yaw = 0;
    if (hl || hr) {
      const d = (hl && hr ? hl.clone().add(hr).multiplyScalar(0.5) : (hl ?? hr)!.clone()).sub(bodyAt);
      d.y = 0;
      if (d.lengthSq() > 1e-4)
        yaw = 0.5 * THREE.MathUtils.clamp(Math.atan2(forward.clone().cross(d).y, forward.dot(d)), -0.8, 0.8);
    }
    fade.current.twist += (yaw - fade.current.twist) * k;
    if (Math.abs(fade.current.twist) > 0.005)
      for (const x of rig.torso)
        if (x.twist) turnBone(x.bone, new THREE.Quaternion().setFromAxisAngle(UP, fade.current.twist * x.twist));

    // Зогсож байхад тавхай шалан дээрээ тогтоно; бие холдоход нэг нэгээр нь өргөж алхам хийнэ
    // Алхаж эхлэхэд хөлийг шууд суллана (тавхай шалан дээр чирэгдэхгүй)
    fade.current.feet += (Number(anim === "idle") - fade.current.feet) * (1 - Math.exp(-12 * dt));
    const fw = fade.current.feet;
    if (fw < 0.01 || rig.legs.length === 0) steps.current = null;
    else {
      steps.current ??= want.map((p) => ({ at: p.clone(), from: p.clone(), to: p.clone(), t: -1 }));
      const s = steps.current;
      const flat = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
      // Нөгөө хөл газардах дөхөхөд дараагийн алхам эхэлнэ (хоёулаа зэрэг өргөгдөхгүй)
      if (s.every((f) => f.t < 0 || f.t > 0.6)) {
        let pick = -1;
        let most = STEP_AT;
        s.forEach((f, i) => {
          const d = flat(f.at, want[i]);
          if (f.t < 0 && d > most) [most, pick] = [d, i];
        });
        if (pick >= 0) {
          const f = s[pick];
          f.from.copy(f.at);
          f.to.copy(want[pick]).addScaledVector(vel, STEP_T);
          f.t = 0;
        }
      }
      rig.legs.forEach((c, i) => {
        const f = s[i];
        if (f.t >= 0) {
          f.t = Math.min(1, f.t + dt / STEP_T);
          const e = f.t * f.t * (3 - 2 * f.t);
          f.at.lerpVectors(f.from, f.to, e);
          f.at.y = THREE.MathUtils.lerp(f.from.y, want[i].y, e) + Math.sin(Math.PI * f.t) * STEP_LIFT;
          if (f.t >= 1) f.t = -1;
        } else f.at.y = want[i].y; // шалнаас өргөгдөхгүй, анимацийн шагайн өндөр
        solveLimb(c, f.at, fw, forward);
        // Тавхай анимацийн чиглэлээ хадгална (шалтай зэрэгцээ)
        const foot = c[2];
        const q = foot.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(footRot[i]);
        foot.quaternion.slerp(q, fw);
        foot.updateMatrixWorld(true);
      });
    }
    for (const side of ["left", "right"] as const) {
      const goal = t?.[side] ?? null;
      const cur = side === "left" ? last.curL : last.curR;
      const chain = rig[side];
      const hand = side === "left" ? rig.handL : rig.handR;
      // Шинээр сунгахад гар одоо байгаа газраасаа эхэлнэ
      if (goal && fade.current[side] < 0.05 && chain) chain[2].getWorldPosition(cur);
      if (goal) last[side].copy(goal);
      // Суллахад хурдан буулгана: бие холдоход гар хуучин цэг рүүгээ сунгаж үлдэхгүй
      fade.current[side] += (Number(!!goal) - fade.current[side]) * (goal ? k : 1 - Math.exp(-14 * dt));
      const w = fade.current[side];
      if (!chain || w <= 0.01) continue;
      const travel = cur.distanceTo(last[side]);
      cur.lerp(last[side], 1 - Math.exp(-9 * dt));
      // Хол сунгахдаа нуман замаар өргөөд буулгана, тайван үед бага зэрэг амьсгална
      const wrist = cur.clone().addScaledVector(UP, Math.min(travel, 0.3) * 0.45);
      wrist.y += 0.003 * Math.sin(clock.elapsedTime * 2.1 + (side === "left" ? 0 : 1.7));
      const pencilOn = side === "right" && !!t?.pencil;
      // Харандаа барихад бугуй үзүүрээс дээш, сурагч тийш байна
      if (pencilOn) wrist.addScaledVector(UP, 0.085).addScaledVector(forward, -0.025);
      // Юм атгахад алганы төв (бугуйгаас ~5 см) нь бариулын цэг дээр ирнэ
      else if ((t?.[side === "left" ? "gripL" : "gripR"] ?? 0) > 0.3)
        wrist.addScaledVector(forward, -0.05 * Math.cos(0.35)).addScaledVector(UP, 0.05 * Math.sin(0.35));
      const outward = new THREE.Vector3(side === "left" ? 1 : -1, 0, 0).applyQuaternion(body);
      solveLimb(chain, wrist, w, new THREE.Vector3(0, -1, 0).addScaledVector(outward, 0.6));
      if (hand) orientHand(hand, forward, w);
    }
    // Хуруу: юм барихгүй үед хагас атгасан тайван байрлал, барихад IK-ийн атгалт
    for (const side of ["left", "right"] as const) {
      const hand = side === "left" ? rig.handL : rig.handR;
      if (!hand) continue;
      const gripKey = side === "left" ? "gripL" : "gripR";
      const on = fade.current[side] > 0.01;
      const want = !on ? 0.3 : side === "right" && t?.pencil ? 0.75 : (t?.[gripKey] ?? 0.3);
      fade.current[gripKey] += (want - fade.current[gripKey]) * (1 - Math.exp(-10 * dt));
      curlFingers(hand, fade.current[gripKey], 1);
    }

    // Харандаа гарт бэхлэгдэнэ: үзүүр нь бугуйгаас доош, урагш (хүрэхгүй үед ч гараас салахгүй)
    const pen = pencil.current;
    if (pen && root.current) {
      const show = !!t?.pencil && fade.current.right > 0.5 && !!rig.right;
      pen.visible = show;
      if (show) {
        const tip = rig.right![2].getWorldPosition(new THREE.Vector3()).addScaledVector(UP, -0.085).addScaledVector(forward, 0.025);
        const top = tip.clone().addScaledVector(UP, 0.12).addScaledVector(forward, -0.05);
        const mid = tip.clone().add(top).multiplyScalar(0.5);
        const dir = top.sub(tip).normalize();
        pen.position.copy(root.current.worldToLocal(mid));
        const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
        pen.quaternion.copy(root.current.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));
      }
    }

    const look = t?.look ?? null;
    if (look) last.look.copy(look);
    fade.current.look += (Number(!!look) - fade.current.look) * k;
    if (rig.head && fade.current.look > 0.01) {
      const head = rig.head;
      const at = head.getWorldPosition(new THREE.Vector3());
      const fwd = rig.headFwd.clone().applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
      const to = last.look.clone().sub(at).normalize();
      // Толгойг хэт эргүүлэхгүй: зорилт руу 70% хүртэл
      const turn = new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(fwd, to), 0.7 * fade.current.look);
      turn.multiply(head.getWorldQuaternion(new THREE.Quaternion()));
      head.quaternion.copy(head.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(turn));
      head.updateMatrixWorld(true);
    }
    // Нүдний байрлал: толгойн ясны дээр, нүүрний урд
    if (t && rig.head) {
      rig.head.getWorldPosition(t.eye).addScaledVector(UP, 0.075).addScaledVector(forward, 0.09);
    }
  });

  // Сурагчийн нүдээр харах үед толгой, үс, нүдний шил камерыг халхлахгүй
  useEffect(() => {
    headMesh?.layers.set(firstPerson ? 31 : 0);
    goggles?.traverse((o) => o.layers.set(firstPerson || !avatar.goggles ? 31 : 0));
  }, [firstPerson, headMesh, goggles, avatar.goggles]);

  useEffect(() => {
    uniforms.uCoat.value.set(avatar.coat);
    skirtMat.color.set(avatar.coat);
  }, [avatar.coat, uniforms, skirtMat]);

  useEffect(() => {
    const a = actions[anim];
    if (!a) return;
    a.reset().setEffectiveTimeScale(PACE[anim]).fadeIn(0.3).play();
    return () => void a.fadeOut(0.3);
  }, [anim, actions]);

  return (
    <group ref={root}>
      <primitive object={model} scale={scale} />
      <group ref={pencil} visible={false}>
        <mesh>
          <cylinderGeometry args={[0.0035, 0.0035, 0.13, 6]} />
          <meshStandardMaterial color="#f2c230" roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.072, 0]}>
          <coneGeometry args={[0.0035, 0.014, 6]} />
          <meshStandardMaterial color="#3b2f2a" />
        </mesh>
      </group>
    </group>
  );
}

for (const k of KIDS) useGLTF.preload(kidUrl(k.value), false);
