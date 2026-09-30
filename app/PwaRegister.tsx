"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/Olle-pwa-/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
