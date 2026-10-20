import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Монгол Ө, Ү үсэг cyrillic-ext дэд олонлогт байдаг тул хамт урьдчилан ачаална
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Гэрлийн тусгалын лаборатори",
  description:
    "8-р ангийн физикийн виртуал лаборатори: хавтгай толин дээрх тусгалын хуулийг протрактороор хэмжиж нээнэ.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="mn"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
