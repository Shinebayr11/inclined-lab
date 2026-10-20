"use client";

import dynamic from "next/dynamic";

// Бүртгэл зөвхөн хөтчийн localStorage-д байдаг тул серверт зурахгүй
const TeacherBoard = dynamic(() => import("./TeacherBoard"), { ssr: false });

export default function TeacherLoader() {
  return <TeacherBoard />;
}
