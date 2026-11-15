"use client";

import { useEffect, useRef } from "react";

/**
 * The app backdrop: the black marble showroom plate Saim approved
 * (Concept 2, Nov 15) at full quality — the 2048×1152 master upscaled
 * to 3840×2160 (showroom-plate-4k.jpg), so retina screens DOWNscale
 * it and it renders like pure glass. No video: the AI-animated clip
 * was generated at 1248×704 and stayed soft no matter the upscale,
 * and decoding it full-screen cost performance.
 *
 * Motion is a slow parallax: the hall drifts a few pixels against
 * the mouse (lerp-smoothed, so it glides rather than snaps) plus a
 * faint autonomous breathing drift when the mouse is still. It is a
 * transform on one promoted layer — near-zero cost when idle.
 * prefers-reduced-motion renders it static.
 */
export default function ShowroomBackdrop() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let tx = 0; // mouse target
    let ty = 0;
    let cx = 0; // current (lerped)
    let cy = 0;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2; // -1..1
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const tick = (now: number) => {
      // faint autonomous drift so the hall breathes without the mouse
      const driftX = Math.sin(now / 26000) * 5;
      const driftY = Math.cos(now / 34000) * 3;
      const gx = -tx * 12 + driftX;
      const gy = -ty * 8 + driftY;
      cx += (gx - cx) * 0.045;
      cy += (gy - cy) * 0.045;
      el.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0) scale(1.09)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden" aria-hidden>
      <div ref={layerRef} className="absolute -inset-4 will-change-transform">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/showroom-plate-4k.jpg"
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      </div>
      {/* a whisper of darkening so the glass UI stays legible */}
      <div className="absolute inset-0 bg-black/25" />
    </div>
  );
}
