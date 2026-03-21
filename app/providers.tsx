"use client";
import { CuteToast } from "@/app/CuteToast";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CuteToast />
    </>
  );
}
