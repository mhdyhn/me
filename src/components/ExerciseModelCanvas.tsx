import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { phaseToTime } from '../motion/sampler';
import type { MotionDefinition } from '../motion/types';
import { buildMotionRig, motionBounds, poseRig, restRig } from '../motion/modelRig';

type ViewAngle = 'front' | 'side' | 'back';

/** Jump the loop to the key of one written step (phase 0…4). */
export interface SeekRequest {
  phase: number;
  token: number;
}

interface RiggedProps {
  asset: string;
  motion: MotionDefinition | null;
  view: ViewAngle;
  speed: number;
  playing: boolean;
  restartToken: number;
  seek?: SeekRequest | null;
  onKeyLabel?: (label: string, phase: number) => void;
}

/** Loads the GLB once and keeps the rig plus the camera framing derived from it. */
function ExerciseRig({ asset, motion, view, speed, playing, restartToken, seek, onKeyLabel }: RiggedProps) {
  const gltf = useLoader(GLTFLoader, asset, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  const rig = useMemo(() => (motion ? buildMotionRig(gltf.scene, motion) : null), [gltf, motion]);
  const frame = useMemo(() => (rig ? motionBounds(rig) : { centre: [0, 0.85, 0] as [number, number, number], radius: 1 }), [rig]);
  const phase = useRef(0);
  const label = useRef('');

  useEffect(() => {
    phase.current = 0;
    label.current = '';
    if (!rig) return;
    poseRig(rig, 0);
  }, [rig, restartToken]);

  useEffect(() => {
    if (!rig || !motion || !seek) return;
    phase.current = phaseToTime(rig.state, seek.phase) ?? 0;
    poseRig(rig, phase.current);
    // The phase index only matters through the token, so a re-render cannot re-seek.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rig, motion, seek?.token]);

  useEffect(() => {
    if (!rig) return undefined;
    return () => restRig(rig);
  }, [rig]);

  useFrame((_, delta) => {
    if (!rig || !motion) return;
    if (playing) phase.current = (phase.current + (delta * speed) / motion.durationSeconds) % 1;
    const state = poseRig(rig, phase.current);
    if (state.keyLabel !== label.current) {
      label.current = state.keyLabel;
      onKeyLabel?.(state.keyLabel, state.keyPhase);
    }
  });

  return (
    <>
      <primitive object={gltf.scene} dispose={null} />
      <CameraControls view={view} target={frame.centre} radius={frame.radius} />
    </>
  );
}

/** Frames the camera on the movement and keeps it stable while the loop plays. */
function CameraControls({ view, target, radius }: { view: ViewAngle; target: [number, number, number]; radius: number }) {
  const { camera, gl } = useThree();
  const controls = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const control = new OrbitControls(camera, gl.domElement);
    const fov = ((camera as PerspectiveCamera).fov || 36) * (Math.PI / 180);
    const distance = Math.min(9, Math.max(2.4, (radius / Math.tan(fov / 2)) * 1.15));
    control.enableDamping = true;
    control.dampingFactor = 0.08;
    control.enablePan = false;
    control.minDistance = Math.max(1.6, distance * 0.55);
    control.maxDistance = distance * 2.1;
    control.target.set(target[0], target[1], target[2]);
    controls.current = control;
    const positions: Record<ViewAngle, [number, number, number]> = {
      front: [0, target[1] + 0.15, distance],
      side: [distance, target[1] + 0.15, 0],
      back: [0, target[1] + 0.15, -distance],
    };
    camera.position.set(...positions[view]);
    camera.lookAt(target[0], target[1], target[2]);
    control.update();
    return () => {
      control.dispose();
      controls.current = null;
    };
  }, [camera, gl, view, target, radius]);

  useFrame(() => controls.current?.update());
  return null;
}

export default function ExerciseModelCanvas({ asset, motion, view, speed, playing, restartToken, seek, onKeyLabel }: RiggedProps) {
  return (
    <Canvas camera={{ position: [0, 1.1, 3.4], fov: 36 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
      <color attach="background" args={['#171d1b']} />
      <ambientLight intensity={1.3} />
      <directionalLight position={[3, 5, 4]} intensity={2.2} />
      <directionalLight position={[-3, 2, -2]} intensity={1.1} />
      <ExerciseRig
        asset={asset}
        motion={motion}
        view={view}
        speed={speed}
        playing={playing}
        restartToken={restartToken}
        seek={seek}
        onKeyLabel={onKeyLabel}
      />
    </Canvas>
  );
}
