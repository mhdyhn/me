import { describe, expect, it } from 'vitest';
import { Vector3, type MeshStandardMaterial, type Object3D } from 'three';
import { exercises, muscleNames } from '../src/data/exercises';
import {
  ANATOMY_PALETTE,
  MUSCLE_REGION_IDS,
  REGION_SHAPES,
  REST_JOINTS,
  collectRestVertices,
  createMusclePaint,
  muscleHighlights,
  muscleRegion,
  unknownMuscles,
  type MuscleRegionId,
  type RestVertex,
} from '../src/motion/muscles';
import { loadBrowserScene } from './helpers/glbScene';

const BONES = {
  shoulder: 'upperarm_l',
  elbow: 'lowerarm_l',
  wrist: 'hand_l',
  hip: 'thigh_l',
  knee: 'calf_l',
  ankle: 'foot_l',
} as const;

const sceneVertices = async (): Promise<RestVertex[]> => {
  const gltf = await loadBrowserScene();
  return [...collectRestVertices(gltf.scene).values()].flat();
};

interface Box {
  x: [number, number];
  y: [number, number];
  z: [number, number];
}

const bounds = (region: MuscleRegionId, vertices: RestVertex[]): { count: number; box: Box } => {
  const painted = vertices.filter((vertex) => REGION_SHAPES[region](vertex) > 0.5);
  const box: Box = { x: [Infinity, -Infinity], y: [Infinity, -Infinity], z: [Infinity, -Infinity] };
  for (const vertex of painted) {
    box.x = [Math.min(box.x[0], vertex.x), Math.max(box.x[1], vertex.x)];
    box.y = [Math.min(box.y[0], vertex.y), Math.max(box.y[1], vertex.y)];
    box.z = [Math.min(box.z[0], vertex.z), Math.max(box.z[1], vertex.z)];
  }
  return { count: painted.length, box };
};

describe('muscle map', () => {
  /**
   * Every region is measured against the joints of the shipped figure, so the
   * measurements are pinned to the real file: a replaced model fails here instead of
   * quietly lighting up the wrong limb in the app.
   */
  it('measures the model exactly where the map says it does', async () => {
    const gltf = await loadBrowserScene();
    const joints = new Map<string, Vector3>();
    gltf.scene.traverse((object) => {
      if ((object as { isBone?: boolean }).isBone) {
        joints.set(object.name, new Vector3().setFromMatrixPosition(object.matrixWorld));
      }
    });
    for (const [key, bone] of Object.entries(BONES)) {
      const expected = REST_JOINTS[key as keyof typeof REST_JOINTS];
      const actual = joints.get(bone);
      expect(actual, `bone ${bone} exists`).toBeTruthy();
      expect(
        actual!.distanceTo(new Vector3(...expected)),
        `joint ${key} sits at the recorded spot`,
      ).toBeLessThan(0.005);
    }
  });

  it('knows every muscle the catalogue names', () => {
    expect(unknownMuscles(muscleNames)).toEqual([]);
  });

  it('lights up every region it declares, and only on the body', async () => {
    const vertices = await sceneVertices();
    expect(vertices.length).toBeGreaterThan(10000);
    for (const region of MUSCLE_REGION_IDS) {
      const { count, box } = bounds(region, vertices);
      expect(count, `region ${region} paints some of the figure`).toBeGreaterThan(20);
      expect(box.y[1], `region ${region} stays below the jaw`).toBeLessThan(1.7);
      expect(box.y[0], `region ${region} stays above the ankles`).toBeGreaterThan(-0.05);
    }
  });

  it('puts each muscle on the side of the body it belongs to', async () => {
    const vertices = await sceneVertices();
    const chest = bounds('chest', vertices);
    const lats = bounds('lats', vertices);
    const glutes = bounds('glutes', vertices);
    const abs = bounds('abs', vertices);
    // The chest and the abs face the camera the model faces; the lats and glutes are behind.
    expect(chest.box.z[0]).toBeGreaterThan(0.02);
    expect(abs.box.z[0]).toBeGreaterThan(0.02);
    expect(lats.box.z[1]).toBeLessThan(0.08);
    expect(glutes.box.z[1]).toBeLessThan(0.01);
    // Biceps sit in front of the upper arm, triceps behind it, and both stay on the arm.
    const biceps = vertices.filter((vertex) => REGION_SHAPES.biceps(vertex) > 0.5);
    const triceps = vertices.filter((vertex) => REGION_SHAPES.triceps(vertex) > 0.5);
    expect(biceps.length).toBeGreaterThan(40);
    expect(triceps.length).toBeGreaterThan(40);
    for (const vertex of [...biceps, ...triceps]) {
      expect(vertex.bone.startsWith('upperarm_'), `${vertex.bone} carries the arm highlight`).toBe(true);
    }
    // Hands and fingers are the only part that answers to grip.
    const grip = vertices.filter((vertex) => REGION_SHAPES.grip(vertex) > 0.5);
    expect(grip.length).toBeGreaterThan(1000);
    expect(grip.every((vertex) => /^(hand|thumb|index|middle|ring|pinky)_/.test(vertex.bone))).toBe(true);
    // Calves never paint the thigh, and the quads never paint the back of the leg.
    for (const vertex of vertices.filter((item) => REGION_SHAPES.calves(item) > 0.5)) {
      expect(vertex.bone.startsWith('calf_') || vertex.bone.startsWith('ball_')).toBe(true);
    }
    const quads = bounds('quads', vertices);
    expect(quads.box.z[0]).toBeGreaterThan(-0.08);
  });

  it('reads the muscle names of the catalogue, with their spelling variations', () => {
    expect(muscleRegion('سینه')).toBe('chest');
    expect(muscleRegion('بالاسینه')).toBe('upper-chest');
    expect(muscleRegion('عضلهٔ ذوزنقه‌ای فوقانی')).toBe('upper-traps');
    expect(muscleRegion('پشت بازو')).toBe('triceps');
    expect(muscleRegion('عضلهٔ نعلی')).toBe('soleus');
    expect(muscleRegion('یک عضلهٔ ناشناخته')).toBe(null);
  });

  it('gives every exercise a highlight on the body', () => {
    for (const exercise of exercises) {
      const highlights = muscleHighlights(exercise.primaryMuscles, exercise.secondaryMuscles);
      expect(highlights.length, `${exercise.id} lights up something`).toBeGreaterThan(0);
      expect(highlights.filter((item) => item.strength === 1).length, `${exercise.id} has a prime mover`).toBeGreaterThan(0);
    }
    const benchPress = muscleHighlights(['سینه'], ['پشت بازو', 'سرشانهٔ جلویی']);
    expect(benchPress.find((item) => item.region === 'chest')?.strength).toBe(1);
    expect(benchPress.find((item) => item.region === 'triceps')?.strength).toBe(0.4);
    // A bench press never claims the legs.
    expect(benchPress.some((item) => item.region === 'quads' || item.region === 'glutes')).toBe(false);
    // A whole-area name paints its parts too.
    const shoulderPress = muscleHighlights(['سرشانه'], []);
    for (const part of ['front-delts', 'side-delts', 'rear-delts'] as const) {
      expect(shoulderPress.find((item) => item.region === part)?.strength).toBe(1);
    }
  });
});

describe('anatomy view', () => {
  const paintedMaterial = (root: Object3D, name: string) => {
    let material: MeshStandardMaterial | null = null;
    root.traverse((object) => {
      const mesh = object as unknown as { isMesh?: boolean; name: string; material: MeshStandardMaterial };
      if (mesh.isMesh && mesh.name === name) material = mesh.material;
    });
    return material!;
  };

  const colourAt = (root: Object3D, name: string, index: number) => {
    const geometry = (() => {
      let found: { getAttribute(name: string): { getX(i: number): number; getY(i: number): number; getZ(i: number): number } | undefined } | null = null;
      root.traverse((object) => {
        const mesh = object as unknown as { isMesh?: boolean; name: string; geometry: typeof found };
        if (mesh.isMesh && mesh.name === name) found = mesh.geometry;
      });
      return found!;
    })();
    const colour = geometry.getAttribute('color')!;
    return new Vector3(colour.getX(index), colour.getY(index), colour.getZ(index));
  };

  it('paints the working muscle and leaves the rest of the figure neutral', async () => {
    const gltf = await loadBrowserScene();
    const shipped = { body: paintedMaterial(gltf.scene, 'Body'), suit: paintedMaterial(gltf.scene, 'Clothes_1') };
    const paint = createMusclePaint(gltf.scene);
    const rest = collectRestVertices(gltf.scene).get('Body')!;

    paint.apply(muscleHighlights(['سینه'], ['پشت بازو']));
    const strongest = (region: MuscleRegionId) =>
      rest.reduce((best, vertex, index) => (REGION_SHAPES[region](vertex) > REGION_SHAPES[region](rest[best]!) ? index : best), 0);
    const chestIndex = strongest('chest');
    const quadIndex = strongest('quads');
    expect(chestIndex, 'the chest has vertices to paint').toBeGreaterThan(-1);
    expect(quadIndex, 'the quads have vertices to paint').toBeGreaterThan(-1);
    expect(colourAt(gltf.scene, 'Body', chestIndex).distanceTo(new Vector3(ANATOMY_PALETTE.prime.r, ANATOMY_PALETTE.prime.g, ANATOMY_PALETTE.prime.b))).toBeLessThan(0.12);
    expect(colourAt(gltf.scene, 'Body', quadIndex).distanceTo(new Vector3(ANATOMY_PALETTE.body.r, ANATOMY_PALETTE.body.g, ANATOMY_PALETTE.body.b))).toBeLessThan(0.02);

    // The mannequin material is the one on screen, and it ignores the file's textures.
    expect(paintedMaterial(gltf.scene, 'Body')).not.toBe(shipped.body);
    expect(paintedMaterial(gltf.scene, 'Body').vertexColors).toBe(true);
    expect(paintedMaterial(gltf.scene, 'Clothes_1')).not.toBe(shipped.suit);
    expect(paintedMaterial(gltf.scene, 'Clothes_1').map).toBe(null);

    // Switching the view off hands the figure back exactly as the file had it.
    paint.apply(null);
    expect(paintedMaterial(gltf.scene, 'Body')).toBe(shipped.body);
    expect(paintedMaterial(gltf.scene, 'Clothes_1')).toBe(shipped.suit);
    expect(paintedMaterial(gltf.scene, 'Body').vertexColors).toBe(false);
  });

  it('keeps the colours under the skinning of the loop', async () => {
    const gltf = await loadBrowserScene();
    const paint = createMusclePaint(gltf.scene);
    paint.apply(muscleHighlights(['چهارسر ران', 'عضلات سرینی'], []));
    // Nothing in the paint path writes to the skeleton: a movement can be played on the
    // same scene and the colours ride along with the skinned geometry.
    const before = new Vector3().setFromMatrixPosition(gltf.scene.matrixWorld);
    gltf.scene.updateMatrixWorld(true);
    expect(new Vector3().setFromMatrixPosition(gltf.scene.matrixWorld).distanceTo(before)).toBeLessThan(1e-9);
    const material = paintedMaterial(gltf.scene, 'Body');
    expect(material.vertexColors).toBe(true);
    expect(material.map).toBe(null);
  });
});
