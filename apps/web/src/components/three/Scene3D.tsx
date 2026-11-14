"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, MeshTransmissionMaterial, RoundedBox } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { useSceneStore } from "@/lib/scene-store";

/**
 * The persistent WebGL backdrop — a dark studio of architectural
 * glass: five large frosted slabs with real light transmission,
 * catching warm gold and white reflections as they drift almost
 * imperceptibly. No particles, no wireframes, no neon. Depth comes
 * from the glass itself and a soft gold glow behind it. The camera
 * barely moves: a whisper of parallax, nothing that competes with
 * the work on screen. Loaded via next/dynamic ssr:false (AppShell).
 */

const GOLD = "#d9a521";
const GOLD_LIGHT = "#f7e08c";

/* ------------------------------ glass slabs ------------------------------- */

type SlabCfg = {
  position: [number, number, number];
  size: [number, number, number];
  rotation: [number, number, number];
  roughness: number;
  tint: string;
  tintDistance: number;
  phase: number;
};

/* Layered panes, right-weighted where the content column is emptier,
   fading into fog on the left. One language with the UI: glass slabs. */
const SLABS: SlabCfg[] = [
  { position: [3.1, 0.3, -0.5], size: [2.6, 3.6, 0.18], rotation: [0.06, -0.5, 0.04], roughness: 0.12, tint: GOLD, tintDistance: 2.8, phase: 0.0 },
  { position: [1.1, -0.8, -2.3], size: [3.4, 2.2, 0.16], rotation: [-0.04, -0.28, -0.03], roughness: 0.18, tint: "#f5efe2", tintDistance: 4.5, phase: 1.7 },
  { position: [5.0, 1.2, -2.9], size: [1.9, 2.6, 0.14], rotation: [0.1, -0.75, 0.08], roughness: 0.1, tint: "#f5efe2", tintDistance: 4.0, phase: 3.1 },
  { position: [-2.8, 0.9, -3.6], size: [2.8, 2.0, 0.15], rotation: [0.03, 0.42, -0.05], roughness: 0.22, tint: "#f5efe2", tintDistance: 5.0, phase: 4.4 },
  { position: [0.2, -1.6, -1.3], size: [4.2, 1.5, 0.14], rotation: [-0.38, -0.1, 0.02], roughness: 0.15, tint: GOLD, tintDistance: 3.4, phase: 5.6 },
];

function Slab({ cfg }: { cfg: SlabCfg }) {
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!ref.current) return;
    // Near-imperceptible drift — the glass breathes, it does not perform.
    ref.current.position.y = cfg.position[1] + Math.sin(t * 0.16 + cfg.phase) * 0.055;
    ref.current.rotation.y = cfg.rotation[1] + Math.sin(t * 0.05 + cfg.phase) * 0.03;
    ref.current.rotation.x = cfg.rotation[0] + Math.cos(t * 0.04 + cfg.phase) * 0.012;
  });

  return (
    <group ref={ref} position={cfg.position} rotation={cfg.rotation}>
      <RoundedBox args={cfg.size} radius={0.045} smoothness={4}>
        <MeshTransmissionMaterial
          transmission={1}
          thickness={0.55}
          roughness={cfg.roughness}
          ior={1.45}
          chromaticAberration={0.02}
          anisotropy={0.4}
          distortion={0}
          attenuationColor={cfg.tint}
          attenuationDistance={cfg.tintDistance}
          color="#e8e2d4"
          samples={6}
          resolution={512}
        />
      </RoundedBox>
    </group>
  );
}

/* ------------------------------- studio glow ------------------------------ */

/* One soft pool of warm light behind the glass — a radial gradient
   sprite, the way a product studio lights a dark set. */
function GlowPool() {
  const texture = useMemo(() => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, "rgba(232,193,90,0.55)");
      g.addColorStop(0.45, "rgba(217,165,33,0.16)");
      g.addColorStop(1, "rgba(217,165,33,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  return (
    <mesh position={[2.6, 0.4, -7.5]} scale={[13, 8.5, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} fog={false} />
    </mesh>
  );
}

/* -------------------------------- camera rig ------------------------------- */

/* Professional rig: the framing is near-identical on every route.
   What changes is a few centimetres of drift, not a camera show. */
const ROUTE_CAMERAS: Record<string, [number, number, number]> = {
  "/": [0, 0.4, 9.6],
  "/products": [0.14, 0.32, 9.75],
  "/sources": [-0.12, 0.48, 9.7],
  "/settings": [0, 0.36, 9.85],
};

function CameraRig() {
  const { camera, pointer } = useThree();
  const target = useMemo(() => new THREE.Vector3(0, 0.4, 9.6), []);
  const lookTarget = useMemo(() => new THREE.Vector3(0.3, 0.05, 0), []);

  useFrame(() => {
    const { route, scroll } = useSceneStore.getState();
    const base = ROUTE_CAMERAS[route] ?? [0, 0.4, 9.7];
    target.set(
      base[0] + pointer.x * 0.12,
      base[1] + pointer.y * 0.08 + scroll * 0.15,
      base[2],
    );
    camera.position.lerp(target, 0.03);
    camera.lookAt(lookTarget);
  });
  return null;
}

/* ---------------------------------- scene ---------------------------------- */

export default function Scene3D() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[1]" aria-hidden>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0.4, 9.6], fov: 50, near: 0.1, far: 60 }}
        gl={{ antialias: false, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#060605"]} />
        <fog attach="fog" args={["#060605", 11, 20]} />

        <ambientLight intensity={0.16} />
        <pointLight position={[7, 4, 5]} intensity={110} color={GOLD} distance={30} />
        <spotLight position={[-4, 9, 6]} intensity={50} angle={0.7} penumbra={1} color="#fff6e0" />

        {/* Studio reflections for the glass: warm key, soft white fill.
            Built from light formers — local, no CDN fetch. */}
        <Environment resolution={256}>
          <Lightformer form="rect" intensity={2.6} color={GOLD_LIGHT} scale={[5, 2, 1]} position={[0, 3, 4]} />
          <Lightformer form="rect" intensity={1.0} color="#ffffff" scale={[1, 5, 1]} position={[-5, 0, 2]} />
          <Lightformer form="rect" intensity={0.8} color="#fff1cf" scale={[6, 1, 1]} position={[0, 5, 0]} rotation={[Math.PI / 2, 0, 0]} />
        </Environment>

        <GlowPool />
        {SLABS.map((cfg, i) => (
          <Slab key={i} cfg={cfg} />
        ))}

        <CameraRig />

        <EffectComposer multisampling={4}>
          <>
            <Bloom intensity={0.32} luminanceThreshold={0.62} luminanceSmoothing={0.3} mipmapBlur />
            <Vignette offset={0.22} darkness={0.52} />
          </>
        </EffectComposer>
      </Canvas>
    </div>
  );
}
