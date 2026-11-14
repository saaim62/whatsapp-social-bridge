"use client";

import { useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, MeshReflectorMaterial } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { useSceneStore } from "@/lib/scene-store";

/**
 * The persistent WebGL backdrop — the black marble showroom.
 * Two receding rows of glossy black monolith panels, each outlined
 * by thin gold edge-light, standing on a mirror-polished floor with
 * gold light bars overhead, all of it fading into fog. The camera
 * sits in the hall and breathes — a slow dolly, a whisper of
 * parallax. The glass UI floats inside this space. Direction picked
 * by Saim from a rendered plate (Concept 2, Nov 15). Loaded via
 * next/dynamic with ssr:false from AppShell.
 */

const GOLD = "#d9a521";
const GOLD_LIGHT = "#f7e08c";
const FLOOR_Y = -2.2;
const ROW_X = 3.35;
const ROW_Z = [2.0, -0.9, -3.8, -6.7, -9.6, -12.5];
const HEIGHTS = [4.8, 4.55, 4.8, 4.4, 4.7, 4.5];

/* ------------------------------- monoliths -------------------------------- */

const STRIP_PROPS = { color: "#1a1206", emissive: GOLD, emissiveIntensity: 2.6, metalness: 0.4, roughness: 0.4 } as const;

function Monolith({ x, z, height }: { x: number; z: number; height: number }) {
  const inner = x > 0 ? x - 0.19 : x + 0.19; // inner face plane
  return (
    <group position={[x, FLOOR_Y + height / 2, z]}>
      {/* polished black stone slab — broad face to the hall */}
      <mesh>
        <boxGeometry args={[0.38, height, 1.6]} />
        <meshPhysicalMaterial
          color="#0a0a0c"
          roughness={0.08}
          metalness={0.15}
          clearcoat={1}
          clearcoatRoughness={0.08}
          envMapIntensity={1.25}
        />
      </mesh>
      {/* gold edge-light: both vertical front edges + the top edge */}
      <mesh position={[inner - x, 0, -0.8]}>
        <boxGeometry args={[0.035, height, 0.035]} />
        <meshStandardMaterial {...STRIP_PROPS} />
      </mesh>
      <mesh position={[inner - x, 0, 0.8]}>
        <boxGeometry args={[0.035, height, 0.035]} />
        <meshStandardMaterial {...STRIP_PROPS} />
      </mesh>
      <mesh position={[inner - x, height / 2, 0]}>
        <boxGeometry args={[0.035, 0.035, 1.64]} />
        <meshStandardMaterial {...STRIP_PROPS} />
      </mesh>
    </group>
  );
}

function Colonnade() {
  return (
    <>
      {ROW_Z.map((z, i) => (
        <Monolith key={`l-${i}`} x={-ROW_X} z={z} height={HEIGHTS[i]} />
      ))}
      {ROW_Z.map((z, i) => (
        <Monolith key={`r-${i}`} x={ROW_X} z={z} height={HEIGHTS[(i + 2) % HEIGHTS.length]} />
      ))}
    </>
  );
}

/* ------------------------------ ceiling light ------------------------------ */

/* Gold light bars across the ceiling + long rails down both sides —
   the coffer rhythm from the plate, simplified to pure light lines. */
function CeilingLight() {
  return (
    <group position={[0, 3.35, 0]}>
      {ROW_Z.map((z, i) => (
        <mesh key={i} position={[0, 0, z + 0.4]}>
          <boxGeometry args={[ROW_X * 2, 0.045, 0.045]} />
          <meshStandardMaterial {...STRIP_PROPS} emissiveIntensity={1.9} />
        </mesh>
      ))}
      {[-ROW_X, ROW_X].map((x) => (
        <mesh key={x} position={[x, 0, -5.2]}>
          <boxGeometry args={[0.045, 0.045, 15.5]} />
          <meshStandardMaterial {...STRIP_PROPS} emissiveIntensity={1.9} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------------------------------- floor ---------------------------------- */

/* Mirror-polished black floor — blurred reflections, like wet marble. */
function MirrorFloor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, -4]}>
      <planeGeometry args={[48, 48]} />
      <MeshReflectorMaterial
        blur={[300, 90]}
        resolution={1024}
        mixBlur={0.9}
        mixStrength={14}
        roughness={0.92}
        depthScale={1.1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.4}
        color="#050505"
        metalness={0.55}
        mirror={0.55}
      />
    </mesh>
  );
}

/* ------------------------------- far-end glow ------------------------------ */

/* The lit far end of the hall — one soft pool of warm light. */
function GlowPool() {
  const texture = useMemo(() => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, "rgba(232,193,90,0.5)");
      g.addColorStop(0.45, "rgba(217,165,33,0.14)");
      g.addColorStop(1, "rgba(217,165,33,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  return (
    <mesh position={[0, 0.7, -17.5]} scale={[18, 10, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} fog={false} />
    </mesh>
  );
}

/* -------------------------------- camera rig ------------------------------- */

/* In the hall, looking down its length. Slow breathing dolly,
   small parallax, route changes shift the stance by centimetres. */
const ROUTE_CAMERAS: Record<string, [number, number, number]> = {
  "/": [0, 0.15, 8.8],
  "/products": [0.22, 0.08, 8.95],
  "/sources": [-0.22, 0.24, 8.85],
  "/settings": [0, 0.1, 9.05],
};

function CameraRig() {
  const { camera, pointer } = useThree();
  const target = useMemo(() => new THREE.Vector3(0, 0.15, 8.8), []);
  const lookTarget = useMemo(() => new THREE.Vector3(0, 0.1, -4), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const { route, scroll } = useSceneStore.getState();
    const base = ROUTE_CAMERAS[route] ?? [0, 0.15, 8.9];
    target.set(
      base[0] + pointer.x * 0.16,
      base[1] + pointer.y * 0.09 + scroll * 0.18,
      base[2] + Math.sin(t * 0.07) * 0.3 - scroll * 0.3,
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
        camera={{ position: [0, 0.15, 8.8], fov: 55, near: 0.1, far: 70 }}
        gl={{ antialias: false, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#050505"]} />
        <fog attach="fog" args={["#050505", 9, 23]} />

        <ambientLight intensity={0.14} />
        <spotLight position={[0, 8, 7]} intensity={55} angle={0.65} penumbra={1} color="#fff6e0" />
        <pointLight position={[0, 1.2, -5]} intensity={55} color={GOLD} distance={30} />

        {/* Reflections for the polished stone: tall warm strips down
            both sides of the hall + a soft top light. Local, no CDN. */}
        <Environment resolution={256}>
          <Lightformer form="rect" intensity={1.5} color={GOLD_LIGHT} scale={[1, 6, 1]} position={[-5, 1, -3]} rotation={[0, Math.PI / 2, 0]} />
          <Lightformer form="rect" intensity={1.5} color={GOLD_LIGHT} scale={[1, 6, 1]} position={[5, 1, -3]} rotation={[0, -Math.PI / 2, 0]} />
          <Lightformer form="rect" intensity={0.8} color="#ffffff" scale={[7, 1, 1]} position={[0, 5, -2]} rotation={[Math.PI / 2, 0, 0]} />
        </Environment>

        <GlowPool />
        <Colonnade />
        <CeilingLight />
        <MirrorFloor />

        <CameraRig />

        <EffectComposer multisampling={4}>
          <>
            <Bloom intensity={0.5} luminanceThreshold={0.5} luminanceSmoothing={0.3} mipmapBlur />
            <Vignette offset={0.24} darkness={0.55} />
          </>
        </EffectComposer>
      </Canvas>
    </div>
  );
}
