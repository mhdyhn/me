import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Object3D,
} from 'three';
import type { EquipmentPlacement, MotionState } from './sampler';
import type { MotionFixture } from './types';

/**
 * Props for the in-app viewer: the same implements and fixtures the offline
 * renderer draws, built as three.js objects and synced to the sampled pose. The
 * sizes match `tools/render_poses.py` so a barbell looks the same in both.
 */
export interface PropScene {
  group: Group;
  update(): void;
}

const HALF_BAR = 0.42;
const PLATE_INSET = 0.33;

const metal = new MeshStandardMaterial({ color: 0xb9c3c6, metalness: 0.65, roughness: 0.35 });
const plate = new MeshStandardMaterial({ color: 0x3b4247, metalness: 0.35, roughness: 0.55 });
const benchMat = new MeshStandardMaterial({ color: 0x2b3236, metalness: 0.1, roughness: 0.85 });
const cableMat = new LineBasicMaterial({ color: 0xd6d78a });

/** A cylinder whose length runs along the local X axis, like a bar. */
const alongX = (mesh: Mesh, offsetX: number) => {
  mesh.rotation.z = Math.PI / 2;
  mesh.position.x = offsetX;
  return mesh;
};

function buildBarbell(): Group {
  const group = new Group();
  group.add(alongX(new Mesh(new CylinderGeometry(0.014, 0.014, HALF_BAR * 2, 12), metal), 0));
  for (const side of [-1, 1]) {
    group.add(alongX(new Mesh(new CylinderGeometry(0.11, 0.11, 0.028, 16), plate), side * PLATE_INSET));
  }
  return group;
}

function buildDumbbell(): Group {
  const group = new Group();
  group.add(alongX(new Mesh(new CylinderGeometry(0.017, 0.017, 0.17, 10), metal), 0));
  for (const side of [-1, 1]) {
    group.add(alongX(new Mesh(new CylinderGeometry(0.078, 0.078, 0.036, 14), plate), side * 0.072));
  }
  return group;
}

/** Rope from the pulley to the hand, plus the pulley itself. */
function buildCable(placement: EquipmentPlacement): { group: Group; line: Line; pulley: Object3D | null } {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const line = new Line(geometry, cableMat);
  line.frustumCulled = false;
  const group = new Group();
  group.add(line);
  const pulley = placement.anchor ? new Mesh(new SphereGeometry(0.032, 10, 8), metal) : null;
  if (pulley) group.add(pulley);
  return { group, line, pulley };
}

const defaultSize = (fixture: MotionFixture): [number, number, number] => {
  if (fixture.size) return fixture.size;
  if (fixture.kind === 'bench') return [0.36, 0.45, 1.8];
  if (fixture.kind === 'pull-up-bar') return [2.0, 0.05, 0.05];
  return [0.5, 1.0, 0.5];
};

/** Fixture rotation in degrees, applied around X, then Y, then Z like the renderer. */
const fixtureQuaternion = (rotation: [number, number, number]): Quaternion => {
  const [rx, ry, rz] = rotation.map((value) => (value * Math.PI) / 180) as [number, number, number];
  const about = (x: number, y: number, z: number, angle: number) =>
    new Quaternion().setFromAxisAngle(new Vector3(x, y, z), angle);
  return about(0, 0, 1, rz).multiply(about(0, 1, 0, ry)).multiply(about(1, 0, 0, rx));
};

export function buildPropScene(state: MotionState): PropScene {
  const group = new Group();
  group.name = 'movement-props';

  const tracked: { object: Object3D; placement: EquipmentPlacement }[] = [];
  const cables: { line: Line; pulley: Object3D | null; placement: EquipmentPlacement }[] = [];

  state.equipment.forEach((placement) => {
    if (placement.kind === 'cable') {
      const cable = buildCable(placement);
      group.add(cable.group);
      cables.push({ line: cable.line, pulley: cable.pulley, placement });
      return;
    }
    const object = placement.kind === 'barbell' ? buildBarbell() : buildDumbbell();
    group.add(object);
    tracked.push({ object, placement });
  });

  state.fixtures.forEach((fixture) => {
    const size = defaultSize(fixture);
    const mesh = new Mesh(new BoxGeometry(size[0], size[1], size[2]), benchMat);
    mesh.position.fromArray(fixture.position);
    mesh.quaternion.copy(fixtureQuaternion(fixture.rotation ?? [0, 0, 0]));
    // Fixtures never move, so no frustum culling surprises on a tilted box.
    mesh.frustumCulled = false;
    group.add(mesh);
  });

  const point = new Vector3();
  const update = () => {
    for (const { object, placement } of tracked) {
      object.position.copy(placement.position);
      object.quaternion.copy(placement.quaternion);
    }
    for (const { line, pulley, placement } of cables) {
      const attribute = line.geometry.getAttribute('position');
      const anchor = placement.anchor ?? placement.position;
      attribute.setXYZ(0, anchor.x, anchor.y, anchor.z);
      attribute.setXYZ(1, placement.position.x, placement.position.y, placement.position.z);
      attribute.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      if (pulley) pulley.position.copy(point.copy(anchor));
    }
  };

  update();
  return { group, update };
}
