/**
 * The app backdrop: the black marble showroom plate Saim approved
 * (Concept 2, Nov 15), animated as a slow cinematic dolly and
 * boomerang-looped so it runs seamlessly (20s, no jump). It IS the
 * approved image, in motion — behind the glass UI. Replaces the
 * real-time WebGL scene (kept in components/three/Scene3D.tsx).
 */
export default function ShowroomBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden" aria-hidden>
      <video
        className="h-full w-full object-cover"
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
