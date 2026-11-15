'use client';

import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Environment,
  Lightformer,
  MeshReflectorMaterial,
} from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useSceneStore } from '@/lib/scene-store';

/**
 * The persistent WebGL backdrop — the black marble showroom, v2.
 * Built to the plate Saim approved (Concept 2, Nov 15): a hall of
 * polished black-marble monoliths with THIN gold inlay edges, gold
 * coffer outlines on the ceiling, a mirror floor — 90% black, gold
 * as fine jewellery, never neon. Animated: the hall slides past in
 * a slow infinite dolly (one bay, wrapped seamlessly), reflections
 * glide, the far glow breathes. Direction: Saim, from the plate.
 */

const GOLD_DEEP = '#c9962a';
const FLOOR_Y = -2.2;
const ROW_X = 3.1;
const BAY = 2.9;
const ROW_Z = [2.2, -0.7, -3.6, -6.5, -9.4, -12.3];
const PANEL_H = 4.7;

/* ------------------------------ marble texture ----------------------------- */

/* Procedural black marble: near-black base, faint gold and white
   veins running vertically, soft tonal patches. Subtle on purpose —
   the gloss and reflections do most of the talking. */
function makeMarbleTexture() {
  const s = 512;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0b0b0d';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 60 + Math.random() * 150;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const light = Math.random() > 0.5;
      g.addColorStop(0, light ? 'rgba(255,246,224,0.028)' : 'rgba(0,0,0,0.22)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let v = 0; v < 24; v++) {
      const gold = v % 3 === 0;
      let x = Math.random() * s;
      let y = -10;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.strokeStyle = gold
        ? `rgba(201,150,42,${0.05 + Math.random() * 0.08})`
        : `rgba(226,226,232,${0.03 + Math.random() * 0.06})`;
      ctx.lineWidth = 0.7 + Math.random() * 1.1;
      while (y < s + 10) {
        y += 16 + Math.random() * 26;
        x += (Math.random() - 0.5) * 52;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* --------------------------------- monolith -------------------------------- */

const STRIP_PROPS = {
  color: '#1c1305',
  emissive: GOLD_DEEP,
  emissiveIntensity: 1.15,
  metalness: 0.4,
  roughness: 0.4,
} as const;

function Monolith({
  x,
  z,
  marble,
}: {
  x: number;
  z: number;
  marble: THREE.Texture;
}) {
  const inner = x > 0 ? x - 0.22 : x + 0.22;
  return (
    <group position={[x, FLOOR_Y + PANEL_H / 2, z]}>
      <mesh>
        <boxGeometry args={[0.42, PANEL_H, 1.7]} />
        <meshPhysicalMaterial
          map={marble}
          roughness={0.16}
          metalness={0.1}
          clearcoat={1}
          clearcoatRoughness={0.12}
          envMapIntensity={1.6}
        />
      </mesh>
      {/* gold inlay: two vertical front edges + the top edge — hairline thin */}
      {[-0.85, 0.85].map((dz) => (
        <mesh key={dz} position={[inner - x, 0, dz]}>
          <boxGeometry args={[0.02, PANEL_H, 0.02]} />
          <meshStandardMaterial {...STRIP_PROPS} />
        </mesh>
      ))}
      <mesh position={[inner - x, PANEL_H / 2, 0]}>
        <boxGeometry args={[0.02, 0.02, 1.72]} />
        <meshStandardMaterial {...STRIP_PROPS} />
      </mesh>
    </group>
  );
}

/* ------------------------------- ceiling coffers ---------------------------- */

/* Rectangular gold outlines on the ceiling, one per bay — the
   coffer rhythm from the plate, kept hairline and dim. */
function CeilingCoffers() {
  const centers = [0.75, -2.15, -5.05, -7.95, -10.85];
  return (
    <group position={[0, 3.3, 0]}>
      {centers.map((z) => (
        <group key={z} position={[0, 0, z]}>
          {[-1.1, 1.1].map((dz) => (
            <mesh key={dz} position={[0, 0, dz]}>
              <boxGeometry args={[ROW_X * 2, 0.02, 0.02]} />
              <meshStandardMaterial {...STRIP_PROPS} emissiveIntensity={0.95} />
            </mesh>
          ))}
          {[-ROW_X, ROW_X].map((x) => (
            <mesh key={x} position={[x, 0, 0]}>
              <boxGeometry args={[0.02, 0.02, 2.2]} />
              <meshStandardMaterial {...STRIP_PROPS} emissiveIntensity={0.95} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/* ------------------------------ the sliding hall ---------------------------- */

/* Colonnade + coffers in one group that slides toward the camera
   and wraps by exactly one bay — an endless slow walk through the
   showroom. Panels are uniform, so the wrap is invisible. */
function Hall() {
  const group = useRef<THREE.Group>(null);
  const marble = useMemo(() => makeMarbleTexture(), []);

  useFrame((state) => {
    if (group.current) {
      group.current.position.z = (state.clock.elapsedTime * 0.16) % BAY;
    }
  });

  return (
    <group ref={group}>
      {ROW_Z.map((z) => (
        <Monolith key={`l-${z}`} x={-ROW_X} z={z} marble={marble} />
      ))}
      {ROW_Z.map((z) => (
        <Monolith key={`r-${z}`} x={ROW_X} z={z} marble={marble} />
      ))}
      <CeilingCoffers />
    </group>
  );
}

/* ---------------------------------- floor ---------------------------------- */

function MirrorFloor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, -4]}>
      <planeGeometry args={[48, 48]} />
      <MeshReflectorMaterial
        blur={[280, 60]}
        resolution={1024}
        mixBlur={0.75}
        mixStrength={18}
        roughness={0.85}
        depthScale={1.1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.4}
        color="#050505"
        metalness={0.6}
        mirror={0.6}
      />
    </mesh>
  );
}

/* ------------------------------- far-end glow ------------------------------ */

function GlowPool() {
  const mesh = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2,
      );
      g.addColorStop(0, 'rgba(232,193,90,0.32)');
      g.addColorStop(0.45, 'rgba(217,165,33,0.09)');
      g.addColorStop(1, 'rgba(217,165,33,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  useFrame((state) => {
    if (mesh.current) {
      const s = 1 + Math.sin(state.clock.elapsedTime * 0.24) * 0.03;
      mesh.current.scale.set(13 * s, 7.5 * s, 1);
    }
  });

  return (
    <mesh ref={mesh} position={[0, 0.4, -17.5]} scale={[13, 7.5, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}

/* --------------------------------- lighting --------------------------------- */

/* One gold light that breathes slowly — reflections on the polished
   marble shift with it, which is what makes gloss read as gloss. */
function BreathingLight() {
  const light = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    if (light.current) {
      light.current.intensity =
        45 + Math.sin(state.clock.elapsedTime * 0.35) * 12;
    }
  });
  return (
    <pointLight
      ref={light}
      position={[0, 1.2, -4]}
      intensity={45}
      color="#d9a521"
      distance={30}
    />
  );
}

/* -------------------------------- camera rig ------------------------------- */

const ROUTE_CAMERAS: Record<string, [number, number, number]> = {
  '/': [0, 0.12, 8.8],
  '/products': [0.18, 0.06, 8.95],
  '/sources': [-0.18, 0.2, 8.85],
  '/settings': [0, 0.08, 9.05],
};

function CameraRig() {
  const { camera, pointer } = useThree();
  const target = useMemo(() => new THREE.Vector3(0, 0.12, 8.8), []);
  const lookTarget = useMemo(() => new THREE.Vector3(0, 0.05, -4), []);

  useFrame(() => {
    const { route, scroll } = useSceneStore.getState();
    const base = ROUTE_CAMERAS[route] ?? [0, 0.12, 8.9];
    target.set(
      base[0] + pointer.x * 0.15,
      base[1] + pointer.y * 0.08 + scroll * 0.18,
      base[2] - scroll * 0.3,
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
        camera={{ position: [0, 0.12, 8.8], fov: 52, near: 0.1, far: 70 }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#050505']} />
        <fog attach="fog" args={['#050505', 8, 20]} />

        <ambientLight intensity={0.22} />
        <hemisphereLight args={['#2a2118', '#000000', 0.35]} />
        <spotLight
          position={[0, 8, 7]}
          intensity={60}
          angle={0.65}
          penumbra={1}
          color="#fff6e0"
        />
        <BreathingLight />

        {/* Reflections for the polished marble: tall warm streaks down
            both sides + a soft top light + a whisper from the front. */}
        <Environment resolution={256}>
          <Lightformer
            form="rect"
            intensity={2.4}
            color="#ffedbe"
            scale={[1.4, 7, 1]}
            position={[-4.4, 1, -3]}
            rotation={[0, Math.PI / 2, 0]}
          />
          <Lightformer
            form="rect"
            intensity={2.4}
            color="#ffedbe"
            scale={[1.4, 7, 1]}
            position={[4.4, 1, -3]}
            rotation={[0, -Math.PI / 2, 0]}
          />
          <Lightformer
            form="rect"
            intensity={1.1}
            color="#ffffff"
            scale={[8, 1.2, 1]}
            position={[0, 5, -2]}
            rotation={[Math.PI / 2, 0, 0]}
          />
          <Lightformer
            form="rect"
            intensity={0.5}
            color="#ffe9b8"
            scale={[6, 3, 1]}
            position={[0, 1, 9]}
            rotation={[0, Math.PI, 0]}
          />
        </Environment>

        <GlowPool />
        <Hall />
        <MirrorFloor />

        <CameraRig />

        <EffectComposer multisampling={4}>
          <>
            <Bloom
              intensity={0.35}
              luminanceThreshold={0.72}
              luminanceSmoothing={0.25}
              mipmapBlur
            />
            <Vignette offset={0.28} darkness={0.6} />
          </>
        </EffectComposer>
      </Canvas>
    </div>
  );
}
