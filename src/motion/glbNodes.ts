import { Bone, Object3D, Vector3 } from 'three';

/**
 * Reads the node hierarchy of a GLB (binary glTF) without loading meshes.
 *
 * The movement sampler only needs the bones, and bones live in the JSON chunk,
 * so this keeps the offline tooling free of any decoder. The app itself uses
 * GLTFLoader, which handles the compression extensions.
 */

export interface GlbNode {
  name?: string;
  children?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  matrix?: number[];
}

export interface GlbJson {
  nodes?: GlbNode[];
  scenes?: { nodes?: number[] }[];
  scene?: number;
  skins?: { joints?: number[] }[];
}

function readChunk(bytes: Uint8Array, offset: number): { json: GlbJson; next: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(offset, true);
  const type = view.getUint32(offset + 4, true);
  const start = offset + 8;
  if (type !== 0x4e4f534a) throw new Error('First GLB chunk is not JSON');
  const text = new TextDecoder().decode(bytes.subarray(start, start + length));
  return { json: JSON.parse(text) as GlbJson, next: start + length };
}

/** Parses the JSON chunk of a GLB container. */
export function readGlbJson(bytes: Uint8Array): GlbJson {
  if (bytes.byteLength < 20) throw new Error('Not a GLB file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB file');
  return readChunk(bytes, 12).json;
}

export interface SkeletonScene {
  /** Wrapper that holds the root nodes, so the top bone always has a plain parent. */
  scene: Object3D;
  /** Joint names declared by the skin, in skin order. */
  joints: string[];
}

/** Builds the bone hierarchy of a GLB as plain three.js objects. */
export function buildSkeletonScene(json: GlbJson): SkeletonScene {
  const nodes = json.nodes ?? [];
  const jointIndices = new Set<number>();
  for (const skin of json.skins ?? []) for (const index of skin.joints ?? []) jointIndices.add(index);

  const objects = nodes.map((_node, index) =>
    jointIndices.has(index) ? new Bone() : new Object3D(),
  );
  nodes.forEach((node, index) => {
    const object = objects[index]!;
    object.name = node.name ?? `node_${index}`;
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
  });
  nodes.forEach((node, index) => {
    for (const child of node.children ?? []) objects[index]!.add(objects[child]!);
  });

  const scene = new Object3D();
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? nodes.map((_node, index) => index);
  const attached = new Set<number>();
  nodes.forEach((node) => {
    for (const child of node.children ?? []) attached.add(child);
  });
  for (const index of roots) {
    if (!attached.has(index)) scene.add(objects[index]!);
  }
  for (const index of jointIndices) {
    if (!attached.has(index)) scene.add(objects[index]!);
  }

  const joints = (json.skins ?? []).flatMap((skin) => (skin.joints ?? []).map((index) => objects[index]!.name));
  return { scene, joints };
}

/** World position of a bone in the currently applied pose. */
export function bonePosition(objects: Map<string, Object3D>, name: string): Vector3 {
  const object = objects.get(name);
  if (!object) throw new Error(`Unknown bone ${name}`);
  return new Vector3().setFromMatrixPosition(object.matrixWorld);
}
