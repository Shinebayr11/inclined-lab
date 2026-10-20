import {
  INITIAL_PROTRACTOR,
  INITIAL_SOURCE,
  type LightSource,
  type ProtractorState,
  type SourceKind,
  type Surface,
  type Trial,
} from "../_lab/optics";

/* ============================================================
   3D ширээн дээрх туршилтын төлөв. Өрөөнөөс гарч орсон ч
   хэмжилт алдагдахгүйн тулд LabWorld хадгална.
   ============================================================ */

export type Bench = {
  roomLight: boolean;
  sourceOn: boolean;
  kind: SourceKind;
  slits: 1 | 3;
  surface: Surface;
  source: LightSource;
  mirrorAngle: number;
  protractor: ProtractorState;
  zoom: 1 | 2 | 3;
  autoFill: boolean;
  trials: Trial[];
  nextId: number;
  checked: boolean;
};

export const INITIAL_BENCH: Bench = {
  roomLight: true,
  sourceOn: true,
  kind: "raybox",
  slits: 1,
  surface: "mirror",
  source: INITIAL_SOURCE,
  mirrorAngle: 0,
  protractor: INITIAL_PROTRACTOR,
  zoom: 1,
  autoFill: false,
  trials: [],
  nextId: 1,
  checked: false,
};

export type SetBench = (fn: (b: Bench) => Bench) => void;
