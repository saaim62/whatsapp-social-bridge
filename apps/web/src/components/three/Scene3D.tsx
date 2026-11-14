"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Grid, Lightformer, Sparkles } from "@react-three/drei";
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { useSceneStore } from "@/lib/scene-store";

/**
 * The persistent WebGL backdrop for the whole app: a dark cinematic
 * void, a gold "commerce core" (dark metallic icosahedron inside a
 * wireframe shell with gyroscope rings), zero-gravity shards, gold
 * and cyan dust, a fading shader floor grid, and a route-aware
 * camera rig. Post: bloom + slight chromatic aberration + vignette.
 * Loaded via next/dynamic with ssr:false from AppShell.
 */

const GOLD = "#d9a521";
const GOLD_LIGHT = "#f7e08c";
const CYAN = "#00f0ff";

/* ---------------------------------- core ---------------------------------- */

function CommerceCore() {
  const group = useRef<THREE.Group>(null);
  const wire = useRef<THREE.Mesh>(null);
  const rings = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (group.current) {
      group.current.rotation.y += delta * 0.12;
      group.current.position.y = Math.sin(t * 0.5) * 0.12;
    }
    if (wire.current) {
      wire.current.rotation.y -= delta * 0.07;
      wire.current.rotation.x = Math.sin(t * 0.22) * 0.25;
    }
    if (rings.current) {
      rings.current.rotation.z += delta * 0.05;
      rings.current.children.forEach((ring, i) => {
        ring.rotation.x += delta * (0.10 + i * 0.045);
        ring.rotation.y += delta * (0.06 + i * 0.03);
      });
    }
  });

  return (
    <group position={[2.7, 0.15, 0]}>
      <group ref={group}>
        {/* dark metallic core */}
        <mesh>
          <icosahedronGeometry args={[1.12, 0]} />
          <meshStandardMaterial color="#0b0b0e" metalness={0.95} roughness={0.24} flatShading />
        </mesh>
        {/* gold wireframe shell */}
        <mesh ref={wire}>
          <icosahedronGeometry args={[1.62, 0]} />
          <meshStandardMaterial
            color={GOLD}
            emissive={GOLD}
            emissiveIntensity={0.55}
            metalness={0.8}
            roughness={0.3}
            wireframe
            transparent
            opacity={0.4}
          />
        </mesh>
      </group>
      {/* gyroscope rings */}
      <group ref={rings}>
        <mesh rotation={[Math.PI / 2.4, 0.3, 0]}>
          <torusGeometry args={[2.25, 0.014, 8, 128]} />
          <meshStandardMaterial color="#201503" emissive={GOLD} emissiveIntensity={2.4} metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh rotation={[Math.PI / 1.8, -0.5, 0.6]}>
          <torusGeometry args={[2.62, 0.01, 8, 128]} />
          <meshStandardMaterial color="#03202a" emissive={CYAN} emissiveIntensity={1.5} metalness={0.6} roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}

/* ---------------------------------- shards --------------------------------- */

type ShardCfg = {
  position: [number, number, number];
  scale: number;
  speed: number;
  phase: number;
  gold: boolean;
};

function Shard({ cfg }: { cfg: ShardCfg }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!ref.current) return;
    ref.current.rotation.x = t * cfg.speed * 0.4 + cfg.phase;
    ref.current.rotation.y = t * cfg.speed * 0.3 + cfg.phase;
    ref.current.position.y = cfg.position[1] + Math.sin(t * cfg.speed + cfg.phase) * 0.22;
  });
  return (
    <mesh ref={ref} position={cfg.position} scale={cfg.scale}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial
        color={cfg.gold ? "#141002" : "#02141a"}
        emissive={cfg.gold ? GOLD : CYAN}
        emissiveIntensity={cfg.gold ? 1.1 : 0.8}
        metalness={0.7}
        roughness={0.3}
        flatShading
      />
    </mesh>
  );
}

function ShardField() {
  const shards = useMemo<ShardCfg[]>(() => {
    const rng = (seed: number) => {
      const x = Math.sin(seed * 127.1) * 43758.5453;
      return x - Math.floor(x);
    };
    return Array.from({ length: 16 }, (_, i) => {
      const angle = (i / 16) * Math.PI * 2 + rng(i + 3) * 0.5;
      const radius = 3.6 + rng(i + 11) * 2.6;
      return {
        position: [
          1.2 + Math.cos(angle) * radius,
          -1.4 + rng(i + 23) * 3.6,
          -1.5 - rng(i + 31) * 2.5,
        ] as [number, number, number],
        scale: 0.05 + rng(i + 41) * 0.1,
        speed: 0.4 + rng(i + 53) * 0.9,
        phase: rng(i + 67) * Math.PI * 2,
        gold: i % 3 !== 2,
      };
    });
  }, []);
  return (
    <>
      {shards.map((cfg, i) => (
        <Shard key={i} cfg={cfg} />
      ))}
    </>
  );
}

/* -------------------------------- camera rig ------------------------------- */

const ROUTE_CAMERAS: Record<string, [number, number, number]> = {
  "/": [0, 0.55, 9.2],
  "/products": [0.45, 0.2, 10.3],
  "/sources": [-0.5, 0.85, 9.6],
  "/settings": [0, 0.1, 10.7],
};

function CameraRig() {
  const { camera, pointer } = useThree();
  const target = useMemo(() => new THREE.Vector3(0, 0.55, 9.2), []);
  const lookTarget = useMemo(() => new THREE.Vector3(0.4, 0.1, 0), []);

  useFrame(() => {
    const { route, scroll } = useSceneStore.getState();
    const base = ROUTE_CAMERAS[route] ?? [0, 0.5, 9.8];
    target.set(
      base[0] + pointer.x * 0.45,
      base[1] + pointer.y * 0.28 + scroll * 0.7,
      base[2],
    );
    camera.position.lerp(target, 0.045);
    camera.lookAt(lookTarget);
  });
  return null;
}

/* ---------------------------------- scene ---------------------------------- */

export default function Scene3D() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[1]" aria-hidden>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0.55, 9.2], fov: 55, near: 0.1, far: 60 }}
        gl={{ antialias: false, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#050505"]} />
        <fog attach="fog" args={["#050505", 10, 19]} />

        <ambientLight intensity={0.22} />
        <pointLight position={[7, 4, 5]} intensity={140} color={GOLD} distance={30} />
        <pointLight position={[-8, -2, 4]} intensity={70} color={CYAN} distance={30} />
        <spotLight position={[0, 9, 6]} intensity={60} angle={0.6} penumbra={1} color="#fff4d6" />

        {/* Local HDRI-style reflections built from light formers — no CDN fetch. */}
        <Environment resolution={256}>
          <Lightformer form="rect" intensity={3.2} color={GOLD_LIGHT} scale={[5, 2, 1]} position={[0, 3, 4]} />
          <Lightformer form="rect" intensity={1.6} color={CYAN} scale={[1, 4, 1]} position={[-5, 0, 2]} />
          <Lightformer form="rect" intensity={1.1} color="#ffffff" scale={[6, 1, 1]} position={[0, 5, 0]} rotation={[Math.PI / 2, 0, 0]} />
        </Environment>

        <CommerceCore />
        <ShardField />

        <Sparkles count={130} scale={[17, 9, 7]} position={[0, 0.6, -1]} size={2.4} speed={0.25} opacity={0.65} color={GOLD_LIGHT} />
        <Sparkles count={70} scale={[17, 9, 7]} position={[0, 0.4, -2]} size={1.6} speed={0.18} opacity={0.5} color={CYAN} />

        {/* Cinematic shader floor */}
        <Grid
          position={[0, -2.35, 0]}
          args={[10, 10]}
          cellSize={0.55}
          cellThickness={0.6}
          cellColor="#151312"
          sectionSize={2.75}
          sectionThickness={1.1}
          sectionColor="#8a6a1c"
          fadeDistance={13}
          fadeStrength={2.2}
          infiniteGrid
        />

        <CameraRig />

        <EffectComposer multisampling={4}>
          <>
            <Bloom intensity={0.8} luminanceThreshold={0.22} luminanceSmoothing={0.25} mipmapBlur />
            <ChromaticAberration offset={[0.00035, 0.00035]} />
            <Vignette offset={0.24} darkness={0.62} />
          </>
        </EffectComposer>
      </Canvas>
    </div>
  );
}