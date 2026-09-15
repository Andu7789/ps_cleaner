"use client";

import { useEffect } from "react";

export function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installability is a progressive enhancement — a failed
        // registration (unsupported browser, blocked by an extension)
        // shouldn't be surfaced to the user or block anything.
      });
    }
  }, []);

  return null;
}
