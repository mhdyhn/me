import { BufferAttribute, Color, DynamicDrawUsage, MeshStandardMaterial, Vector3, type Object3D } from 'three';

/**
 * Anatomy view: paints the muscles an exercise works onto the figure the way the big
 * training apps do — a neutral mannequin with the working muscles lit up.
 *
 * The shipped model is a MakeHuman figure whose rest pose is fixed: standing in a
 * relaxed A-pose, facing +z, left hand on +x, soles at y≈0, crown at y≈1.84. Regions
 * are therefore plain boxes and limb axes measured in that one pose, and
 * `tests/muscles.test.ts` pins the measurements to the real GLB so replacing the
 * model fails loudly instead of quietly painting the wrong limb.
 */

export type MuscleRegionId =
  | 'chest'
  | 'upper-chest'
  | 'lats'
  | 'mid-back'
  | 'upper-traps'
  | 'rotator-cuff'
  | 'erectors'
  | 'abs'
  | 'obliques'
  | 'core'
  | 'hip-flexors'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'adductors'
  | 'calves'
  | 'soleus'
  | 'biceps'
  | 'brachialis'
  | 'triceps'
  | 'forearms'
  | 'grip'
  | 'front-delts'
  | 'side-delts'
  | 'rear-delts'
  | 'shoulders';

/** One vertex of the figure, in the model's rest pose. */
export interface RestVertex {
  x: number;
  y: number;
  z: number;
  /** Dominant skinning bone of this vertex. */
  bone: string;
}

type Shape = (vertex: RestVertex) => number;

/**
 * Joint centres of the rest pose, read from `public/models/human.glb`. Every arm and
 * leg region is measured against these, so this is the one place to look when the
 * model is ever replaced. Only the figure's left side is listed; the body is
 * symmetric, so regions mirror around the midline.
 */
export const REST_JOINTS = {
  shoulder: [0.198, 1.48, 0.016],
  elbow: [0.377, 1.277, 0.019],
  wrist: [0.516, 1.144, 0.218],
  hip: [0.115, 0.991, -0.007],
  knee: [0.157, 0.537, 0.028],
  ankle: [0.202, 0.076, 0.008],
} as const satisfies Record<string, readonly [number, number, number]>;

interface Axis {
  /** Joint the bone starts at. */
  x: number;
  y: number;
  z: number;
  /** Unit-direction times the bone's length. */
  dx: number;
  dy: number;
  dz: number;
  /** Squared length, so a projection needs no square root. */
  lengthSq: number;
}

const axis = (from: readonly [number, number, number], to: readonly [number, number, number]): Axis => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  return { x: from[0], y: from[1], z: from[2], dx, dy, dz, lengthSq: dx * dx + dy * dy + dz * dz };
};

const upperArm = axis(REST_JOINTS.shoulder, REST_JOINTS.elbow);
const lowerArm = axis(REST_JOINTS.elbow, REST_JOINTS.wrist);

const mirror = (vertex: RestVertex): RestVertex => (vertex.x < 0 ? { ...vertex, x: -vertex.x } : vertex);

/** 0 outside the band, 1 inside it, with a soft rim so highlights fade instead of cutting. */
const soft = (value: number, min: number, max: number, margin = 0.035): number => {
  if (value < min - margin || value > max + margin) return 0;
  if (value >= min && value <= max) return 1;
  return Math.max(0, 1 - (value < min ? min - value : value - max) / margin);
};

/** The same shape on both halves of the body: every box below is written for the left side. */
const mirrored =
  (shape: Shape): Shape =>
  (v) =>
    shape(v.x < 0 ? { ...v, x: -v.x } : v);

const box =
  (min: readonly [number, number, number], max: readonly [number, number, number]): Shape =>
  mirrored((v) =>
    soft(v.x, min[0], max[0]) * soft(v.y, min[1], max[1]) * soft(v.z, min[2], max[2]),
  );

/**
 * Where a vertex sits along a bone: 0 at the near joint, 1 at the far joint. Plain
 * arithmetic on purpose — this runs for every vertex of the figure, so it allocates
 * nothing.
 */
const alongBone = (vertex: RestVertex, bone: Axis): number =>
  ((vertex.x - bone.x) * bone.dx + (vertex.y - bone.y) * bone.dy + (vertex.z - bone.z) * bone.dz) / bone.lengthSq;

/** How far in front of (+) or behind (−) the bone's axis a vertex sits. */
const acrossBone = (vertex: RestVertex, bone: Axis): number => {
  const t = Math.max(0, Math.min(1, alongBone(vertex, bone)));
  return vertex.z - (bone.z + bone.dz * t);
};

/** Distance from a joint, soft-edged, optionally hollow in the middle. */
const around =
  (joint: readonly [number, number, number], radius: number, inner = 0): Shape =>
  (v) =>
    soft(Math.hypot(v.x - joint[0], v.y - joint[1], v.z - joint[2]), inner, radius);

const limb =
  (bone: Axis, from: number, to: number): Shape =>
  (v) =>
    soft(alongBone(mirror(v), bone), from, to, 0.08);

const onBone =
  (pattern: RegExp, shape: Shape): Shape =>
  (v) =>
    pattern.test(v.bone) ? shape(v) : 0;

/** The deltoid sitting on the shoulder joint, split into its three heads. */
const deltoid = (part: 'front' | 'side' | 'back' | 'all'): Shape => (v) => {
  const vertex = mirror(v);
  if (vertex.x < 0.02) return 0;
  const cap = around(REST_JOINTS.shoulder, 0.155, 0.02)(vertex);
  if (part === 'all') return cap;
  const offset = acrossBone(vertex, upperArm);
  if (part === 'front') return cap * (offset > 0.008 ? soft(offset, 0.01, 0.3, 0.03) : 0);
  if (part === 'back') return cap * (offset < -0.008 ? soft(-offset, 0.01, 0.3, 0.03) : 0);
  return cap * (Math.abs(offset) <= 0.03 ? 1 : 0);
};

const armFront = onBone(/^upperarm_/, (v) => {
  const offset = acrossBone(mirror(v), upperArm);
  return offset > 0.004 ? soft(offset, 0.006, 0.3, 0.02) : 0;
});

const armBack = onBone(/^upperarm_/, (v) => {
  const offset = acrossBone(mirror(v), upperArm);
  return offset < -0.004 ? soft(-offset, 0.006, 0.3, 0.02) : 0;
});

/** Every region the anatomy view can paint, measured in the model's rest pose. */
export const REGION_SHAPES: Record<MuscleRegionId, Shape> = {
  chest: box([0.02, 1.25, 0.04], [0.21, 1.44, 0.4]),
  'upper-chest': box([0.02, 1.39, 0.04], [0.21, 1.52, 0.4]),
  lats: box([0.06, 1.13, -0.4], [0.25, 1.42, 0.06]),
  'mid-back': box([0.01, 1.28, -0.4], [0.21, 1.5, 0.03]),
  'upper-traps': box([0.01, 1.45, -0.4], [0.17, 1.62, 0.12]),
  'rotator-cuff': box([0.07, 1.4, -0.07], [0.22, 1.54, 0.1]),
  erectors: box([0, 1.02, -0.4], [0.09, 1.32, 0.06]),
  abs: box([0, 1.02, 0.02], [0.12, 1.26, 0.4]),
  obliques: box([0.1, 1.02, -0.03], [0.21, 1.25, 0.4]),
  core: box([0, 1.02, -0.4], [0.21, 1.32, 0.4]),
  'hip-flexors': box([0.02, 0.93, 0.02], [0.19, 1.1, 0.4]),
  glutes: box([0.02, 0.89, -0.4], [0.24, 1.06, -0.02]),
  quads: box([0.02, 0.49, 0.02], [0.25, 0.94, 0.4]),
  hamstrings: box([0.02, 0.47, -0.4], [0.25, 0.94, 0]),
  adductors: box([0, 0.49, -0.4], [0.065, 0.94, 0.4]),
  calves: onBone(/^calf_/, () => 1),
  soleus: onBone(/^calf_/, (v) => soft(v.y, 0.09, 0.29, 0.05) * (v.z < 0.03 ? 1 : 0)),
  biceps: onBone(/^upperarm_/, (v) => armFront(v) * limb(upperArm, 0.16, 1.06)(v)),
  brachialis: onBone(/^upperarm_/, (v) => armFront(v) * limb(upperArm, 0.45, 1.06)(v)),
  triceps: onBone(/^upperarm_/, (v) => armBack(v) * limb(upperArm, 0.16, 1.06)(v)),
  forearms: onBone(/^lowerarm_/, (v) => limb(lowerArm, -0.12, 1.08)(v)),
  grip: onBone(/^(hand|thumb|index|middle|ring|pinky)_/, () => 1),
  'front-delts': deltoid('front'),
  'side-delts': deltoid('side'),
  'rear-delts': deltoid('back'),
  shoulders: deltoid('all'),
};

/** Regions that stand for a whole area and paint their parts as well. */
const REGION_PARTS: Partial<Record<MuscleRegionId, MuscleRegionId[]>> = {
  core: ['abs', 'obliques', 'erectors'],
  shoulders: ['front-delts', 'side-delts', 'rear-delts'],
};

export interface MuscleHighlight {
  region: MuscleRegionId;
  /** 1 for a prime mover, less for a helper. */
  strength: number;
}

/** Muscle names of the catalogue, mapped to the region they paint. */
const ALIASES: Record<string, MuscleRegionId> = {
  chest: 'chest',
  'سینه': 'chest',
  'upper chest': 'upper-chest',
  'بالاسینه': 'upper-chest',
  lats: 'lats',
  'زیربغل': 'lats',
  'mid back': 'mid-back',
  'بخش میانی پشت': 'mid-back',
  'mid traps': 'mid-back',
  'بخش میانی ذوزنقه‌ای': 'mid-back',
  'upper traps': 'upper-traps',
  'عضلهٔ ذوزنقه‌ای فوقانی': 'upper-traps',
  'rotator cuff': 'rotator-cuff',
  'عضلات چرخانندهٔ شانه': 'rotator-cuff',
  'spinal erectors': 'erectors',
  'بازکننده‌های ستون فقرات': 'erectors',
  abs: 'abs',
  'عضلات شکم': 'abs',
  obliques: 'obliques',
  'عضلات مورب شکمی': 'obliques',
  core: 'core',
  'میان‌تنه': 'core',
  'hip flexors': 'hip-flexors',
  'خم‌کننده‌های لگن': 'hip-flexors',
  glutes: 'glutes',
  'عضلات سرینی': 'glutes',
  quads: 'quads',
  'چهارسر ران': 'quads',
  hamstrings: 'hamstrings',
  'همسترینگ': 'hamstrings',
  adductors: 'adductors',
  'نزدیک‌کننده‌های ران': 'adductors',
  calves: 'calves',
  'ساق پا': 'calves',
  'ساق': 'calves',
  soleus: 'soleus',
  'عضلهٔ نعلی': 'soleus',
  biceps: 'biceps',
  'جلو بازو': 'biceps',
  brachialis: 'brachialis',
  'عضلهٔ بازویی': 'brachialis',
  triceps: 'triceps',
  'پشت بازو': 'triceps',
  forearms: 'forearms',
  'ساعد': 'forearms',
  grip: 'grip',
  'قدرت گیرش': 'grip',
  shoulders: 'shoulders',
  'سرشانه': 'shoulders',
  'front delts': 'front-delts',
  'سرشانهٔ جلویی': 'front-delts',
  'side delts': 'side-delts',
  'بخش میانی سرشانه': 'side-delts',
  'rear delts': 'rear-delts',
  'پشت سرشانه': 'rear-delts',
};

/** Loose matching: ZWNJ, Arabic yeh/kaf and letter case are not the reader's problem. */
export const normaliseMuscleName = (name: string): string =>
  name
    .replace(/\u200c/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const ALIAS_TABLE = new Map<string, MuscleRegionId>(
  Object.entries(ALIASES).map(([name, region]) => [normaliseMuscleName(name), region]),
);

/** Region of a muscle name, or null when the catalogue uses a name the view cannot paint. */
export const muscleRegion = (name: string): MuscleRegionId | null => ALIAS_TABLE.get(normaliseMuscleName(name)) ?? null;

/** Muscles an exercise asked for that the anatomy view does not know how to paint. */
export const unknownMuscles = (names: string[]): string[] => names.filter((name) => muscleRegion(name) === null);

/** Regions an exercise lights up, prime movers first. */
export function muscleHighlights(primary: string[], secondary: string[]): MuscleHighlight[] {
  const highlights = new Map<MuscleRegionId, number>();
  const add = (region: MuscleRegionId, strength: number) => {
    for (const part of [region, ...(REGION_PARTS[region] ?? [])]) {
      if ((highlights.get(part) ?? 0) < strength) highlights.set(part, strength);
    }
  };
  for (const name of primary) {
    const region = muscleRegion(name);
    if (region) add(region, 1);
  }
  for (const name of secondary) {
    const region = muscleRegion(name);
    if (region) add(region, 0.4);
  }
  return [...highlights].map(([region, strength]) => ({ region, strength }));
}

export const ANATOMY_PALETTE = {
  /** Neutral mannequin the highlights sit on. */
  body: new Color('#d8dcdd'),
  /** Prime mover. */
  prime: new Color('#df4526'),
  /** Helper muscle. */
  helper: new Color('#c9776a'),
} as const;

/**
 * Meshes the view repaints: the skin, the suit that covers chest, back, hips and legs,
 * and the shoes. Head, hair and eyes keep the textures they came with.
 */
const PAINTED_MESHES = ['Body', 'Clothes_1', 'Clothes_2'];

interface MeshLike {
  isMesh?: boolean;
  name: string;
  material: MeshStandardMaterial;
  geometry: {
    getAttribute(name: string): { count: number; getComponent(index: number, component: number): number } | undefined;
    setAttribute(name: string, attribute: BufferAttribute): void;
  };
  skeleton?: { bones: { name: string }[] };
  getVertexPosition?(index: number, target: Vector3): Vector3;
}

/**
 * Reads the rest-pose vertices of every mesh the anatomy view paints. The scene must
 * be in its rest pose — straight from the loader, or after a movement was played on it
 * and the rest skeleton re-anchored it.
 */
export function collectRestVertices(root: Object3D): Map<string, RestVertex[]> {
  root.updateMatrixWorld(true);
  const result = new Map<string, RestVertex[]>();
  root.traverse((object) => {
    const mesh = object as unknown as MeshLike;
    if (!mesh.isMesh || !PAINTED_MESHES.includes(mesh.name) || !mesh.geometry || !mesh.skeleton) return;
    if (!mesh.geometry.getAttribute('skinIndex') || typeof mesh.getVertexPosition !== 'function') return;
    const position = mesh.geometry.getAttribute('position')!;
    const skinIndex = mesh.geometry.getAttribute('skinIndex')!;
    const skinWeight = mesh.geometry.getAttribute('skinWeight')!;
    const boneNames = mesh.skeleton.bones.map((bone) => bone.name);
    const vertices: RestVertex[] = [];
    const point = new Vector3();
    for (let index = 0; index < position.count; index += 1) {
      mesh.getVertexPosition(index, point);
      let best = 0;
      let weight = -1;
      for (let slot = 0; slot < 4; slot += 1) {
        const value = skinWeight.getComponent(index, slot);
        if (value > weight) {
          weight = value;
          best = skinIndex.getComponent(index, slot);
        }
      }
      vertices.push({ x: point.x, y: point.y, z: point.z, bone: boneNames[best] ?? '' });
    }
    result.set(mesh.name, vertices);
  });
  return result;
}

/** Colour of one vertex under a set of highlights, or the plain mannequin colour. */
export function vertexMuscleColour(vertex: RestVertex, highlights: MuscleHighlight[]): Color {
  if (highlights.length === 0) return ANATOMY_PALETTE.body.clone();
  let strength = 0;
  for (const highlight of highlights) {
    strength = Math.max(strength, REGION_SHAPES[highlight.region](vertex) * highlight.strength);
  }
  return ANATOMY_PALETTE.body.clone().lerp(ANATOMY_PALETTE.prime, Math.min(1, strength));
}

/**
 * How much each region grows the figure, as a peak fraction of the figure's height — the
 * build of someone who trains, sculpted procedurally so the app ships no second model.
 * Fractions rather than metres keep the shape intact if the model is ever replaced.
 */
export const ATHLETIC_BUILD: Partial<Record<MuscleRegionId, number>> = {
  chest: 0.011,
  'upper-chest': 0.009,
  lats: 0.012,
  'mid-back': 0.007,
  'upper-traps': 0.007,
  'rotator-cuff': 0.005,
  'front-delts': 0.008,
  'side-delts': 0.011,
  'rear-delts': 0.008,
  shoulders: 0.011,
  biceps: 0.009,
  brachialis: 0.006,
  triceps: 0.01,
  forearms: 0.005,
  // The waist only firms up: the athletic read comes from the chest, shoulders, arms and
  // legs, and a barrel waist would undo it.
  abs: 0.0025,
  obliques: 0.003,
  erectors: 0.005,
  'hip-flexors': 0.003,
  glutes: 0.011,
  quads: 0.011,
  hamstrings: 0.01,
  adductors: 0.005,
  calves: 0.008,
  soleus: 0.005,
};

/**
 * Shaping on top of a region: the two halves of the chest meet at the sternum, so the
 * middle of the body stays where it is while the muscles beside it grow. Without this the
 * chest would rise as one slab.
 */
const BUILD_SHAPING: Partial<Record<MuscleRegionId, Shape>> = {
  // The pectorals sit high on the ribcage: the shape tapers into the sternum and into the
  // belly, so the chest grows where a chest does instead of pushing the waist out with it.
  chest: (v) => soft(Math.abs(v.x), 0.02, 0.4, 0.05) * soft(v.y, 1.31, 1.44, 0.04),
  'upper-chest': (v) => soft(Math.abs(v.x), 0.02, 0.4, 0.05) * soft(v.y, 1.36, 1.52, 0.04),
  glutes: (v) => soft(Math.abs(v.x), 0.02, 0.4, 0.03),
  lats: (v) => soft(Math.abs(v.x), 0.05, 0.4, 0.03),
};

/** Meshes the build sculpts: the figure itself plus what it wears over muscle. */
const SCULPTED_MESHES = ['Body', 'Clothes_1'];

/** A suit over a muscle follows it, but only part of the way, or the shirt balloons. */
const SUIT_FOLLOW = 0.6;

const sculptedScenes = new WeakSet<Object3D>();

interface QuantisedAttribute {
  array: ArrayLike<number>;
  itemSize: number;
  normalized: boolean;
  needsUpdate: boolean;
}

interface SculptGeometry {
  getAttribute(name: string): QuantisedAttribute | undefined;
  setAttribute(name: string, attribute: BufferAttribute | unknown): void;
  index?: { array: ArrayLike<number> } | null;
  computeVertexNormals?(): void;
  computeBoundingSphere?(): void;
  computeBoundingBox?(): void;
}

interface SculptableMesh {
  isMesh?: boolean;
  name: string;
  geometry?: SculptGeometry;
}

/**
 * The shipped model stores positions and normals as normalised 16-bit integers, so `raw`
 * carries no meaning until it is divided by the range of the storage type. Writing has to
 * undo that same scaling — a plain `setXYZ` would round a metre into an integer and
 * collapse the figure.
 */
const storageRange = (attribute: QuantisedAttribute): number => {
  if (!attribute.normalized) return 1;
  const array = attribute.array;
  if (array instanceof Int8Array) return 127;
  if (array instanceof Uint8Array) return 255;
  if (array instanceof Int16Array) return 32767;
  if (array instanceof Uint16Array) return 65535;
  return 1;
};

const readComponent = (attribute: QuantisedAttribute, range: number, index: number, component: number): number =>
  Number(attribute.array[index * attribute.itemSize + component]) / range;

const writeComponent = (
  attribute: QuantisedAttribute,
  range: number,
  index: number,
  component: number,
  value: number,
): void => {
  const store = attribute.array as unknown as { [position: number]: number };
  store[index * attribute.itemSize + component] =
    range === 1 ? value : Math.max(-range, Math.min(range, Math.round(value * range)));
};

/** Smooths a per-vertex field over the mesh edges, so a muscle never ends in a crease. */
const smoothField = (field: Float32Array, indices: Uint32Array, passes = 1): Float32Array => {
  let current = field;
  for (let pass = 0; pass < passes; pass += 1) {
    const sum = new Float32Array(current.length);
    const count = new Float32Array(current.length);
    for (let index = 0; index < indices.length; index += 3) {
      for (let corner = 0; corner < 3; corner += 1) {
        const a = indices[index + corner]!;
        const b = indices[index + ((corner + 1) % 3)]!;
        sum[a] = (sum[a] ?? 0) + current[b]!;
        count[a] = (count[a] ?? 0) + 1;
        sum[b] = (sum[b] ?? 0) + current[a]!;
        count[b] = (count[b] ?? 0) + 1;
      }
    }
    const next = new Float32Array(current.length);
    for (let index = 0; index < current.length; index += 1) {
      const average = count[index]! > 0 ? sum[index]! / count[index]! : current[index]!;
      next[index] = current[index]! * 0.42 + average * 0.58;
    }
    current = next;
  }
  return current;
};

/**
 * Gives the figure the build of someone who trains, by pushing vertices out along their own
 * normals inside the muscle regions. It runs once per loaded scene, in the rest pose, and
 * leaves the skeleton untouched — so every movement plays on the sculpted body.
 */
export function buildAthleticFigure(root: Object3D): void {
  if (sculptedScenes.has(root)) return;
  sculptedScenes.add(root);
  const rest = collectRestVertices(root);
  root.updateMatrixWorld(true);

  root.traverse((object) => {
    const mesh = object as unknown as SculptableMesh;
    const vertices = rest.get(mesh?.name ?? '');
    if (!mesh?.isMesh || !vertices || !SCULPTED_MESHES.includes(mesh.name) || !mesh.geometry) return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    if (!position || !normal) return;
    const positionRange = storageRange(position);
    const normalRange = storageRange(normal);

    let lowest = Infinity;
    let highest = -Infinity;
    for (let index = 0; index < vertices.length; index += 1) {
      const y = readComponent(position, positionRange, index, 1);
      if (y < lowest) lowest = y;
      if (y > highest) highest = y;
    }
    const height = Math.max(0.001, highest - lowest);
    const follow = mesh.name === 'Body' ? 1 : SUIT_FOLLOW;

    const bulge = new Float32Array(vertices.length);
    for (let index = 0; index < vertices.length; index += 1) {
      const vertex = vertices[index]!;
      let peak = 0;
      for (const [region, amount] of Object.entries(ATHLETIC_BUILD) as [MuscleRegionId, number][]) {
        const shaping = BUILD_SHAPING[region];
        const weight = REGION_SHAPES[region](vertex) * (shaping ? shaping(vertex) : 1);
        peak = Math.max(peak, weight * amount);
      }
      bulge[index] = peak * height * follow;
    }
    const indices = geometry.index
      ? Uint32Array.from(geometry.index.array as ArrayLike<number>)
      : Uint32Array.from({ length: vertices.length }, (_, index) => index);
    const smoothed = smoothField(bulge, indices);

    let moved = false;
    for (let index = 0; index < vertices.length; index += 1) {
      const distance = smoothed[index]!;
      if (distance === 0) continue;
      moved = true;
      for (let component = 0; component < 3; component += 1) {
        const point = readComponent(position, positionRange, index, component);
        const direction = readComponent(normal, normalRange, index, component);
        writeComponent(position, positionRange, index, component, point + direction * distance);
      }
    }
    if (!moved) return;

    position.needsUpdate = true;
    // Recomputing needs a float target: the shipped normal buffer is quantised, and
    // three writes recomputed normals as plain numbers.
    const recalculated = new Float32Array(vertices.length * 3);
    geometry.setAttribute('normal', new BufferAttribute(recalculated, 3));
    geometry.computeVertexNormals?.();
    geometry.computeBoundingSphere?.();
    geometry.computeBoundingBox?.();
  });
}

export interface MusclePaint {
  /**
   * Shows the working muscles. Passing nothing paints the plain mannequin and lets the
   * figure keep that look until the reader asks for the textures again.
   */
  apply(highlights: MuscleHighlight[] | null): void;
  /** True while the anatomy look is on. */
  readonly active: boolean;
}

interface PaintEntry {
  mesh: MeshLike;
  /** Material the file shipped with. */
  original: MeshStandardMaterial;
  /** Neutral material the anatomy look paints on. */
  mannequin: MeshStandardMaterial;
  vertices: RestVertex[];
  colours: Float32Array;
  attribute: BufferAttribute;
}

/**
 * Builds the anatomy look for one loaded figure. The scene must still be in its rest
 * pose: every region is measured in that pose. Painting happens only when the colours
 * change — while a movement plays, the geometry keeps the colours it already has and
 * skinning carries them along, so the loop costs nothing.
 */
export function createMusclePaint(root: Object3D): MusclePaint {
  const rest = collectRestVertices(root);
  const entries: PaintEntry[] = [];

  root.traverse((object) => {
    const mesh = object as unknown as MeshLike;
    const vertices = rest.get(mesh?.name ?? '');
    if (!mesh?.isMesh || !vertices) return;
    const original = mesh.material;
    const mannequin = original.clone();
    mannequin.map = null;
    mannequin.color.copy(ANATOMY_PALETTE.body);
    mannequin.roughness = 0.6;
    mannequin.metalness = 0;
    mannequin.vertexColors = true;
    const colours = new Float32Array(vertices.length * 3);
    const attribute = new BufferAttribute(colours, 3, false);
    attribute.setUsage(DynamicDrawUsage);
    mesh.geometry.setAttribute('color', attribute);
    entries.push({ mesh, original, mannequin, vertices, colours, attribute });
  });

  let active = false;

  const write = (highlights: MuscleHighlight[]) => {
    for (const entry of entries) {
      for (let index = 0; index < entry.vertices.length; index += 1) {
        const colour = vertexMuscleColour(entry.vertices[index]!, highlights);
        entry.colours[index * 3] = colour.r;
        entry.colours[index * 3 + 1] = colour.g;
        entry.colours[index * 3 + 2] = colour.b;
      }
      entry.attribute.needsUpdate = true;
    }
  };

  return {
    get active() {
      return active;
    },
    apply(highlights) {
      const wanted = highlights !== null;
      if (wanted) write(highlights);
      for (const entry of entries) {
        // The neutral material ignores the file's textures, so swapping it in is enough
        // to show the mannequin; swapping back restores the figure the file shipped.
        entry.mesh.material = wanted ? entry.mannequin : entry.original;
        entry.mesh.material.needsUpdate = true;
      }
      active = wanted;
    },
  };
}

/** One paint per loaded scene: the scene is shared by every movement on a page. */
const paints = new WeakMap<Object3D, MusclePaint>();

export const musclePaintFor = (scene: Object3D): MusclePaint => {
  const existing = paints.get(scene);
  if (existing) return existing;
  const paint = createMusclePaint(scene);
  paints.set(scene, paint);
  return paint;
};

export const MUSCLE_REGION_IDS = Object.keys(REGION_SHAPES) as MuscleRegionId[];
