"use client";

import { useEffect, useRef } from "react";

/**
 * The app backdrop: the black marble showroom plate Saim approved
 * (Concept 2, Nov 15), animated as a slow cinematic dolly and
 * boomerang-looped so it runs seamlessly (20s, no jump). It IS the
 * approved image, in motion — behind the glass UI.
 *
 * Playback is forced from JS (muted as a property + explicit play())
 * because attribute-only autoplay can stall on the poster frame.
 * A slow Ken Burns drift on the element (globals.css .showroom-video)
 * layers on top, so the backdrop breathes even if a browser throttles
 * the video itself.
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
        className="showroom-video h-full w-full object-cover"
        src="/showroom-loop.mp4"
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
