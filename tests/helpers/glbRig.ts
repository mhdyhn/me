import { Bone, Group, Matrix4, Object3D, Quaternion, Vector3 } from 'three';

interface GltfNode {
  name?: string;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
  mesh?: number;
  skin?: number;
}

interface GltfDocument {
  nodes?: GltfNode[];
  scenes?: { nodes?: number[] }[];
  scene?: number;
  skins?: { joints?: number[] }[];
}

export interface GlbRig {
  root: Group;
  bones: Map<string, Bone>;
}

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;

/**
 * Reads the JSON chunk of a binary glTF container. The skeleton hierarchy lives
 * there, so tests can rebuild the rig without a DOM or the meshopt decoder.
 */
export function readGlbJson(bytes: Uint8Array): GltfDocument {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('Not a binary glTF file');
  const jsonLength = view.getUint32(12, true);
  const jsonType = view.getUint32(16, true);
  if (jsonType !== JSON_CHUNK) throw new Error('First GLB chunk is not JSON');
  const json = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength));
  return JSON.parse(json) as GltfDocument;
}

/** Rebuilds the node hierarchy of a GLB as three.js objects, marking joint nodes as bones. */
export function buildRigFromGlb(bytes: Uint8Array): GlbRig {
  const document_ = readGlbJson(bytes);
  const nodes = document_.nodes ?? [];
  const joints = new Set<number>((document_.skins ?? []).flatMap((skin) => skin.joints ?? []));

  const objects = nodes.map((_node, index) => (joints.has(index) ? new Bone() : new Object3D()));
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3(1, 1, 1);
  const matrix = new Matrix4();

  nodes.forEach((node, index) => {
    const object = objects[index]!;
    object.name = node.name ?? `node_${index}`;
    if (node.matrix) {
      matrix.fromArray(node.matrix);
      matrix.decompose(position, quaternion, scale);
    } else {
      position.fromArray(node.translation ?? [0, 0, 0]);
      quaternion.fromArray(node.rotation ?? [0, 0, 0, 1]);
      scale.fromArray(node.scale ?? [1, 1, 1]);
    }
    object.position.copy(position);
    object.quaternion.copy(quaternion);
    object.scale.copy(scale);
  });

  const children = new Set<number>();
  nodes.forEach((node, index) => {
    for (const childIndex of node.children ?? []) {
      objects[index]!.add(objects[childIndex]!);
      children.add(childIndex);
    }
  });

  const root = new Group();
  root.name = 'gltf-scene';
  const sceneIndex = document_.scene ?? 0;
  const sceneNodes = document_.scenes?.[sceneIndex]?.nodes ?? nodes.map((_, index) => index);
  for (const index of sceneNodes) {
    if (!children.has(index)) root.add(objects[index]!);
  }

  const bones = new Map<string, Bone>();
  for (const object of objects) {
    if ((object as Bone).isBone) bones.set(object.name, object as Bone);
  }

  return { root, bones };
}
