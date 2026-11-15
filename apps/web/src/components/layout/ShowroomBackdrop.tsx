"use client";

import { useEffect, useRef } from "react";

import { useSceneStore } from "@/lib/scene-store";

/**
 * The app backdrop: the black marble showroom plate Saim approved
 * (Concept 2, Nov 15) at full quality — the 2048×1152 master upscaled
 * to 7680×4320 WebP (showroom-plate-8k.webp, ~1 MB), so retina
 * screens DOWNscale it and it stays sharp even at full zoom.
 * No video: the AI-animated clip was generated at 1248×704 and
 * stayed soft no matter the upscale, and decoding it full-screen
 * cost performance.
 *
 * Motion has three inputs, composed every frame (all lerp-smoothed,
 * so everything glides rather than snaps):
 *  1. Idle zoom loop — a perpetual push-in / pull-back at a CONSTANT
 *     rate (~72s cycle, triangle wave — no eased dead zones at the
 *     turnarounds, where a cosine loop was imperceptible), so the
 *     hall is never a stuck wall when untouched.
 *  2. Scroll zoom — the main pane's scroll progress (scene-store,
 *     fed by AppShell's <main> onScroll) zooms the hall in as you
 *     scroll down and back out as you scroll up; heavily smoothed
 *     (lerp 0.022) so it glides instead of chasing the scrollbar.
 *  3. Mouse parallax — the hall shifts a few pixels against the
 *     mouse, plus a faint autonomous drift.
 * It is one transform on one promoted layer. prefers-reduced-motion
 * renders it static.
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
    let sZoom = 0; // scroll zoom (lerped)
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2; // -1..1
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const tick = (now: number) => {
      // 1) idle zoom loop — constant-rate push-in / pull-back (~72s)
      const phase = (now % 72000) / 72000;
      const amb = phase < 0.5 ? phase * 2 : 2 - phase * 2;
      // 2) scroll zoom — main pane scroll progress drives the zoom
      const scrollTarget = useSceneStore.getState().scroll * 0.12;
      sZoom += (scrollTarget - sZoom) * 0.022;
      // 3) mouse parallax + faint autonomous drift
      const driftX = Math.sin(now / 26000) * 5;
      const driftY = Math.cos(now / 34000) * 3;
      const gx = -tx * 12 + driftX;
      const gy = -ty * 8 + driftY;
      cx += (gx - cx) * 0.045;
      cy += (gy - cy) * 0.045;
      const scale = 1.09 + amb * 0.13 + sZoom;
      el.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
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
          src="/showroom-plate-8k.webp"
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
