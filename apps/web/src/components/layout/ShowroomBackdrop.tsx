"use client";

import { useEffect, useRef } from "react";

/**
 * The app backdrop: the black marble showroom plate Saim approved
 * (Concept 2, Nov 15), animated as a slow cinematic dolly and
 * boomerang-looped so it runs seamlessly (20s, no jump). It IS the
 * approved image, in motion — behind the glass UI.
 *
 * The animated clip was generated from the plate at only 1248×704
 * and pixelated on retina screens, so the shipped loop is that clip
 * Lanczos-upscaled to 1920×1088 with a light sharpen, boomerang-
 * looped (20s, seamless); the poster is the full-res plate
 * (2048×1152) for a crisp first paint. Playback is forced from JS
 * (muted as a property + explicit play()) because attribute-only
 * autoplay can stall on the poster frame. No CSS animation runs on
 * the element, and the glass panels use a light backdrop blur —
 * heavy blur over a moving full-screen video was the jank source.
 */
export default function ShowroomBackdrop() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    const tryPlay = () => {
      el.play().catch(() => {
        /* a later effect run or interaction will retry */
      });
    };
    tryPlay();
    el.addEventListener("pause", tryPlay);
    return () => el.removeEventListener("pause", tryPlay);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden" aria-hidden>
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        src="/showroom-loop-hd.mp4"
        poster="/showroom-poster.jpg"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      />
      {/* a whisper of darkening so the glass UI stays legible */}
      <div className="absolute inset-0 bg-black/25" />
    </div>
  );
}
