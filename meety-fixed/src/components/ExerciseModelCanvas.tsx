import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { phaseToTime } from '../motion/sampler';
import { buildAthleticFigure, figureLookFor, muscleHighlights, type FigureStyle } from '../motion/muscles';
import type { MotionDefinition } from '../motion/types';
import { buildMotionRig, motionBounds, poseRig, restRig } from '../motion/modelRig';
import { buildPropScene } from '../motion/props';

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
  /** Illuminate the muscles the exercise works. */
  anatomy?: boolean;
  /** Neutral mannequin, or the figure with the textures the file shipped. */
  figureStyle?: FigureStyle;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
}

/** Loads the GLB once and keeps the rig plus the camera framing derived from it. */
function ExerciseRig({
  asset,
  motion,
  view,
  speed,
  playing,
  restartToken,
  seek,
  onKeyLabel,
  anatomy = false,
  figureStyle = 'statue',
  primaryMuscles = [],
  secondaryMuscles = [],
}: RiggedProps) {
  const gltf = useLoader(GLTFLoader, asset, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  // The figure the app shows is the shipped CC0 body given the build of someone who
  // trains: the muscle regions push the mesh out along its own normals, once, before the
  // rig reads the rest pose. The skeleton is untouched, so every loop plays on it.
  const rig = useMemo(() => {
    buildAthleticFigure(gltf.scene);
    return motion ? buildMotionRig(gltf.scene, motion) : null;
  }, [gltf, motion]);
  // Built while the scene is still in the rest pose the rig re-anchored it to: every
  // muscle region is measured in that pose. One look serves every movement.
  const look = useMemo(() => figureLookFor(gltf.scene), [gltf.scene]);
  const frame = useMemo(() => (rig ? motionBounds(rig) : { centre: [0, 0.85, 0] as [number, number, number], radius: 1 }), [rig]);
  // Implements and fixtures come from the same sampled state the bones use.
  const props = useMemo(() => (rig ? buildPropScene(rig.state) : null), [rig]);
  const phase = useRef(0);
  const label = useRef('');
  // Posed once after every jump; a paused loop does not need to re-pose the
  // skeleton sixty times a second while the reader studies one step.
  const needsPose = useRef(true);

  useEffect(() => {
    phase.current = 0;
    label.current = '';
    if (!rig) return;
    poseRig(rig, 0);
    props?.update();
    needsPose.current = true;
  }, [rig, props, restartToken]);

  useEffect(() => {
    if (!rig || !motion || !seek) return;
    phase.current = phaseToTime(rig.state, seek.phase) ?? 0;
    poseRig(rig, phase.current);
    props?.update();
    needsPose.current = true;
    // Only the token gates the jump: re-rendering with the same request must not
    // drag the loop back to the step the reader already looked at.
  }, [rig, motion, props, seek, seek?.token]);

  useEffect(() => {
    if (!rig) return undefined;
    return () => restRig(rig);
  }, [rig]);

  // The colours only change when the exercise or a switch changes, never per frame:
  // skinning carries the painted geometry through the loop.
  useEffect(() => {
    look.apply(figureStyle, anatomy ? muscleHighlights(primaryMuscles, secondaryMuscles) : null);
  }, [look, figureStyle, anatomy, primaryMuscles, secondaryMuscles]);

  useFrame((_, delta) => {
    if (!rig || !motion) return;
    if (playing) phase.current = (phase.current + (delta * speed) / motion.durationSeconds) % 1;
    else if (!needsPose.current) return;
    needsPose.current = false;
    const state = poseRig(rig, phase.current);
    props?.update();
    if (state.keyLabel !== label.current) {
      label.current = state.keyLabel;
      onKeyLabel?.(state.keyLabel, state.keyPhase);
    }
  });

  return (
    <>
      <primitive object={gltf.scene} dispose={null} />
      {props ? <primitive object={props.group} dispose={null} /> : null}
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

export default function ExerciseModelCanvas({
  asset,
  motion,
  view,
  speed,
  playing,
  restartToken,
  seek,
  onKeyLabel,
  anatomy,
  figureStyle,
  primaryMuscles,
  secondaryMuscles,
}: RiggedProps) {
  return (
    <Canvas camera={{ position: [0, 1.1, 3.4], fov: 36 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
      <color attach="background" args={['#171d1b']} />
      {/* Form lighting: enough ambient to keep the dark kit readable, a key light for the
          muscle highlights and a rim light so the back of the figure does not go flat. */}
      <ambientLight intensity={0.62} />
      <directionalLight position={[3.2, 4.6, 3.4]} intensity={2.4} />
      <directionalLight position={[-3.2, 1.8, -1.6]} intensity={1.5} />
      <directionalLight position={[0, 1.2, -4]} intensity={0.7} />
      <ExerciseRig
        asset={asset}
        motion={motion}
        view={view}
        speed={speed}
        playing={playing}
        restartToken={restartToken}
        seek={seek}
        onKeyLabel={onKeyLabel}
        anatomy={anatomy}
        figureStyle={figureStyle}
        primaryMuscles={primaryMuscles}
        secondaryMuscles={secondaryMuscles}
      />
    </Canvas>
  );
}
