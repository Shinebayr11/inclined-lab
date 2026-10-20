"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import ReflectionLab from "../_lab/ReflectionLab";
import {
  type Avatar,
  DEFAULT_AVATAR,
  type PlayerState,
  START,
  loadAvatar,
  saveAvatar,
} from "./avatar";
import { type Bench, INITIAL_BENCH } from "./benchState";
import { INITIAL_INCLINE, type Incline } from "./incline";

/* ============================================================
   ДҮР СОНГОХ → 3D ӨРӨӨНД АЛХАХ → ТУРШИЛТ
   three.js зөвхөн хөтөч дээр ачаалагдана.
   ============================================================ */

function Splash() {
  return (
    <div className="flex h-dvh items-center justify-center bg-[#050A14] text-sm text-slate-400">
      3D лаборатори ачаалж байна…
    </div>
  );
}

const CharacterSelect = dynamic(() => import("./CharacterSelect"), { ssr: false, loading: Splash });
const RoomScene = dynamic(() => import("./RoomScene"), { ssr: false, loading: Splash });

type Stage = "select" | "room" | "lab";

export default function LabWorld() {
  const [stage, setStage] = useState<Stage>("select");
  // Сонголт зөвхөн клиент дээр зурагдах тул серверийн HTML-тэй зөрчилдөхгүй
  const [avatar, setAvatar] = useState<Avatar>(() =>
    typeof window === "undefined" ? DEFAULT_AVATAR : (loadAvatar() ?? DEFAULT_AVATAR),
  );
  // Туршилтыг нэг нээсэн бол хэмжилт алдагдахгүйн тулд нууж л хадгална
  const [labOpened, setLabOpened] = useState(false);
  const player = useRef<PlayerState>({ ...START });
  // 3D ширээн дээрх хэмжилт өрөөнөөс гарч орсон ч хадгалагдана
  const [bench, setBench] = useState<Bench>(INITIAL_BENCH);
  const [incline, setIncline] = useState<Incline>(INITIAL_INCLINE);

  const enterLab = useCallback(() => {
    setLabOpened(true);
    setStage("lab");
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      {stage === "select" && (
        <CharacterSelect
          avatar={avatar}
          onChange={setAvatar}
          onEnter={() => {
            saveAvatar(avatar);
            setStage("room");
          }}
          onSkip={enterLab}
        />
      )}
      {stage === "room" && (
        <RoomScene
          avatar={avatar}
          playerRef={player}
          bench={bench}
          setBench={setBench}
          incline={incline}
          setIncline={setIncline}
          onEnterLab={enterLab}
          onChangeAvatar={() => setStage("select")}
        />
      )}
      {labOpened && (
        <div hidden={stage !== "lab"}>
          <div className="sticky top-0 z-30 border-b border-[#16223A] bg-[#050A14]/90 px-4 py-2 backdrop-blur md:px-10">
            <button
              type="button"
              onClick={() => setStage("room")}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-sky-300 transition hover:bg-[#132038]"
            >
              ← Лабораторийн өрөө рүү буцах
            </button>
          </div>
          <ReflectionLab />
        </div>
      )}
    </>
  );
}
