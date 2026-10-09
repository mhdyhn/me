/**
 * Offline rasteriser for the model, so a pose or a grip can be checked without a
 * browser (the dev machine has no headless browser). It draws the skinned mesh the
 * viewer draws, plus the bar as a real cylinder, into a PNG.
 *
 * Usage: npx vite-node tools/figure-view.ts -- <exerciseId> [--phase=0.3]
 *          [--view=front|side|three-quarter|hand|grip] [--zoom=<span>] [--focus=hands]
 *          [--out=/tmp/figure.png] [--debug]
 *
 * `front`/`side`/`three-quarter` frame the whole figure (`--zoom` sets the span in
 * metres, `--focus=hands` centres the crop on the grip). `hand` looks down the bar and
 * `grip` looks across it: those two are for checking a grip, not a whole movement.
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Vector3 } from 'three';
import { loadBrowserScene } from '../tests/helpers/glbScene';
import { loadRig } from '../tests/helpers/motionRig';
import { buildMotionRig, poseRig } from '../src/motion/modelRig';
import { motions } from '../src/motion/library';

const MESHES = ['Body', 'Clothes_1', 'Clothes_2'];
const SKIN: [number, number, number] = [214, 219, 222];
const KIT: [number, number, number] = [46, 56, 59];
const METAL: [number, number, number] = [185, 195, 198];
const LIGHT = new Vector3(0.35, 0.55, 0.75).normalize();

interface Camera {
  origin: Vector3;
  right: Vector3;
  up: Vector3;
  view: Vector3;
  scale: number;
  width: number;
  height: number;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function writePng(path: string, width: number, height: number, rgb: Uint8Array): void {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ]);
  writeFileSync(path, png);
}

function shade(colour: [number, number, number], normal: Vector3, ambient = 0.34): [number, number, number] {
  const light = Math.max(0, normal.dot(LIGHT));
  const k = ambient + (1 - ambient) * light;
  return [colour[0] * k, colour[1] * k, colour[2] * k];
}

interface Ray {
  x0: number; y0: number; z0: number;
  dx: number; dy: number; dz: number;
}

/** Depth where a view ray meets a cylinder, or null when it misses. */
function cylinderHit(camera: Camera, ray: Ray, axisOrigin: Vector3, axis: Vector3, radius: number): number | null {
  const n = axis;
  const bx = camera.view.dot(n);
  const w0x = ray.x0 - axisOrigin.x, w0y = ray.y0 - axisOrigin.y, w0z = ray.z0 - axisOrigin.z;
  const d = camera.view.dot(new Vector3(w0x, w0y, w0z));
  const e = n.dot(new Vector3(w0x, w0y, w0z));
  const denom = 1 - bx * bx;
  if (Math.abs(denom) < 1e-6) return null;
  const t = (bx * e - d) / denom;          // parameter along the view ray
  const s = (e - bx * d) / denom;          // parameter along the axis
  const closest = new Vector3(ray.x0 + t * camera.view.x, ray.y0 + t * camera.view.y, ray.z0 + t * camera.view.z);
  const onAxis = axisOrigin.clone().addScaledVector(n, s);
  const distance = closest.distanceTo(onAxis);
  if (distance > radius) return null;
  return t - Math.sqrt(Math.max(0, radius * radius - distance * distance));
}

async function main() {
  const args = process.argv.slice(2);
  const id = args.find((a) => !a.startsWith('--')) ?? 'barbell-bench-press';
  const phaseArg = args.find((a) => a.startsWith('--phase='));
  const phase = phaseArg ? Number(phaseArg.split('=')[1]) : 0;
  const mode = (args.find((a) => a.startsWith('--view='))?.split('=')[1] ?? 'front') as
    'hand' | 'grip' | 'side' | 'front' | 'three-quarter';
  const out = args.find((a) => a.startsWith('--out='))?.split('=')[1] ?? `/tmp/figure-${id}-${mode}.png`;
  const motion = (motions as Record<string, (typeof motions)[keyof typeof motions]>)[id];
  if (!motion) throw new Error(`Unknown exercise ${id}`);

  const gltf = await loadBrowserScene();
  const rig = buildMotionRig(gltf.scene, motion);
  poseRig(rig, phase);
  gltf.scene.updateMatrixWorld(true);

  const width = 900;
  const height = mode === 'hand' || mode === 'grip' ? 700 : 760;
  const centre = new Vector3();
  let radius = 0.001;
  for (const position of rig.state.worldPosition.values()) {
    centre.add(position);
    radius = Math.max(radius, position.length());
  }
  centre.divideScalar(rig.state.worldPosition.size);
  const seat = rig.state.equipment[0]?.position?.clone() ?? new Vector3(0, 1, 0);
  const hand = rig.state.worldPosition.get('hand_l')!.clone();
  const knucklePoint = rig.state.worldPosition.get('index_01_l')!.clone().lerp(rig.state.worldPosition.get('pinky_01_l')!, 0.5);
  const handForward = knucklePoint.clone().sub(rig.state.worldPosition.get('hand_l')!).normalize();

  const camera: Camera = { origin: new Vector3(), right: new Vector3(), up: new Vector3(), view: new Vector3(), scale: 0.002, width, height };
  const cameraAxis = rig.state.equipment[0]
    ? new Vector3(1, 0, 0).applyQuaternion(rig.state.equipment[0].quaternion).normalize()
    : new Vector3(1, 0, 0);
  if (mode === 'grip' || mode === 'hand') {
    // Two close-ups of the same grip. `grip` looks across the bar (the profile in
    // which fingers wrapping it are unmistakable); `hand` looks down the bar, which
    // shows how the shaft sits in the palm and where the fingertips end up.
    // `seat` is the bar's own centre for a two-hand bar, which is half a body away
    // from the hand being inspected; frame the left hand's grip point instead.
    const focus = hand.clone().addScaledVector(handForward, 0.05);
    if (mode === 'grip') {
      camera.view.copy(new Vector3().crossVectors(cameraAxis, handForward)).normalize();
      if (camera.view.lengthSq() < 1e-8) camera.view.set(0, 0, 1);
      camera.right.copy(cameraAxis).normalize();
    } else {
      camera.view.copy(cameraAxis).addScaledVector(handForward, 0.35).normalize();
      camera.right.copy(new Vector3().crossVectors(camera.view, handForward)).normalize();
      if (camera.right.lengthSq() < 1e-6) camera.right.set(0, 0, 1);
    }
    camera.up.copy(new Vector3().crossVectors(camera.right, camera.view)).normalize();
    camera.scale = (Number((args.find((a) => a.startsWith('--span=')) ?? '--span=0.34').split('=')[1])) / width;
    camera.origin.copy(focus).addScaledVector(camera.view, -1.5);
  } else {
    const yaw = mode === 'side' ? Math.PI / 2 : mode === 'three-quarter' ? Math.PI / 5 : 0;
    camera.view.set(Math.sin(yaw), 0.12, Math.cos(yaw)).normalize();
    camera.right.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
    // `project` maps +up to the top of the image, so the up vector must be
    // view x right (right x view points down and flips the picture vertically).
    camera.up.crossVectors(camera.view, camera.right).normalize();
    const zoom = args.find((a) => a.startsWith('--zoom='));
    const focusHands = args.includes('--focus=hands');
    const span = zoom ? Number(zoom.split('=')[1]) : radius * 2.4;
    camera.scale = span / width;
    const focus = focusHands
      ? new Vector3().addVectors(hand, rig.state.worldPosition.get('hand_r') ?? hand).multiplyScalar(0.5)
      : centre;
    camera.origin.copy(focus).addScaledVector(camera.view, -radius * 4);
  }

  const colour = new Uint8Array(width * height * 3).fill(18);
  let meshPixels = 0;
  let coveredPixels = 0;
  const depth = new Float32Array(width * height).fill(Infinity);
  const background = 0.02;

  const project = (point: Vector3) => {
    const rel = point.clone().sub(camera.origin);
    const u = rel.dot(camera.right);
    const v = rel.dot(camera.up);
    const w = rel.dot(camera.view);
    return { x: camera.width / 2 + u / camera.scale, y: camera.height / 2 - v / camera.scale, w };
  };

  const drawn = new Map<string, number>();
  const pixelBounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, count: 0 };
  gltf.scene.traverse((object: any) => {
    if (!MESHES.includes(object.name) || typeof object.getVertexPosition !== 'function') return;
    const before = drawn.get(object.name) ?? 0;
    const geometry = object.geometry;
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    const base = object.name === 'Body' ? SKIN : KIT;
    const cache = new Map<number, Vector3>();
    const vertex = (i: number) => {
      let point = cache.get(i);
      if (!point) {
        point = new Vector3();
        object.getVertexPosition(i, point);
        cache.set(i, point);
      }
      return point;
    };
    for (let triangle = 0; triangle < count; triangle += 3) {
      const ia = index ? index.getX(triangle) : triangle;
      const ib = index ? index.getX(triangle + 1) : triangle + 1;
      const ic = index ? index.getX(triangle + 2) : triangle + 2;
      const a = vertex(ia), b = vertex(ib), c = vertex(ic);
      if (mode === 'hand' || mode === 'grip') {
        const centroid = new Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3);
        const rel = centroid.clone().sub(seat);
        const along = rel.dot(cameraAxis);
        const offAxis = rel.clone().addScaledVector(cameraAxis, -along).length();
        if (offAxis > 0.13) continue;
      }
      drawn.set(object.name, (drawn.get(object.name) ?? 0) + 1);
      let pa = project(a), pb = project(b), pc = project(c);
      pixelBounds.minX = Math.min(pixelBounds.minX, pa.x, pb.x, pc.x);
      pixelBounds.maxX = Math.max(pixelBounds.maxX, pa.x, pb.x, pc.x);
      pixelBounds.minY = Math.min(pixelBounds.minY, pa.y, pb.y, pc.y);
      pixelBounds.maxY = Math.max(pixelBounds.maxY, pa.y, pb.y, pc.y);
      pixelBounds.count += 1;
      void before;
      const minX = Math.max(0, Math.floor(Math.min(pa.x, pb.x, pc.x)));
      const maxX = Math.min(width - 1, Math.ceil(Math.max(pa.x, pb.x, pc.x)));
      const minY = Math.max(0, Math.floor(Math.min(pa.y, pb.y, pc.y)));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(pa.y, pb.y, pc.y)));
      if (minX > maxX || minY > maxY) continue;
      let area = (pb.x - pa.x) * (pc.y - pa.y) - (pc.x - pa.x) * (pb.y - pa.y);
      if (Math.abs(area) < 1e-9) continue;
      // Views built from an arbitrary basis may flip the winding; make it consistent so
      // the barycentric test below always accepts the inside of the triangle.
      if (area < 0) {
        const swap = pb;
        pb = pc;
        pc = swap;
        area = -area;
      }
      const normal = new Vector3().crossVectors(
        new Vector3().subVectors(b, a),
        new Vector3().subVectors(c, a),
      ).normalize();
      if (normal.dot(camera.view) > 0) normal.negate();
      const rgb = shade(base, normal);
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((pb.x - px) * (pc.y - py) - (pc.x - px) * (pb.y - py)) / area;
          const w1 = ((pc.x - px) * (pa.y - py) - (pa.x - px) * (pc.y - py)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const w = w0 * pa.w + w1 * pb.w + w2 * pc.w;
          coveredPixels += 1;
          const at = y * width + x;
          if (w >= depth[at]!) continue;
          depth[at] = w;
          meshPixels += 1;
          colour[at * 3] = rgb[0];
          colour[at * 3 + 1] = rgb[1];
          colour[at * 3 + 2] = rgb[2];
        }
      }
    }
  });

  for (const placement of rig.state.equipment) {
    if (placement.kind === 'cable') continue;
    const axis = new Vector3(1, 0, 0).applyQuaternion(placement.quaternion).normalize();
    const radius = placement.kind === 'barbell' ? 0.014 : 0.017;
    const length = mode === 'hand' ? 0.07 : placement.kind === 'barbell' ? 0.42 : 0.085;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const u = (x + 0.5 - width / 2) * camera.scale;
        const v = (height / 2 - (y + 0.5)) * camera.scale;
        const origin = camera.origin.clone().addScaledVector(camera.right, u).addScaledVector(camera.up, v);
        const ray: Ray = { x0: origin.x, y0: origin.y, z0: origin.z, dx: camera.view.x, dy: camera.view.y, dz: camera.view.z };
        const hit = cylinderHit(camera, ray, placement.position, axis, radius);
        if (hit === null) continue;
        // Keep the bar inside its own length, so a dumbbell is not a long rod.
        const rel = origin.clone().sub(placement.position);
        const along = camera.view.dot(rel) + hit * 1;
        const n = axis;
        const bx = camera.view.dot(n);
        const w0 = rel;
        const d = camera.view.dot(w0);
        const e = n.dot(w0);
        const denom = 1 - bx * bx;
        const s = (e - bx * d) / denom;
        if (Math.abs(s) > length) continue;
        const at = y * width + x;
        if (hit >= depth[at]!) continue;
        const surface = new Vector3(ray.x0 + hit * camera.view.x, ray.y0 + hit * camera.view.y, ray.z0 + hit * camera.view.z);
        const onAxis = placement.position.clone().addScaledVector(n, s);
        const normal = surface.clone().sub(onAxis).normalize();
        const rgb = shade(METAL, normal, 0.4);
        depth[at] = hit;
        colour[at * 3] = rgb[0];
        colour[at * 3 + 1] = rgb[1];
        colour[at * 3 + 2] = rgb[2];
        void along;
      }
    }
  }

  if (process.argv.includes('--debug')) {
    gltf.scene.traverse((object: any) => {
      if (!object.isMesh && !object.isSkinnedMesh) return;
      const box = new (require('three').Box3)();
      console.log('mesh', object.name, 'type', object.type, 'skin', !!object.skeleton, 'matrixWorld translation',
        object.matrixWorld.elements.slice(12, 15).map((n: number) => +n.toFixed(3)).join(','),
        'scale', object.matrixWorld.elements.slice(0, 3).map((n: number) => +n.toFixed(3)).join(','), 'box', box.min.toArray().length ? '' : '');
    });
    for (const [name, count] of drawn) console.log('drawn triangles from', name, count);
    console.log('camera', { view: camera.view.toArray().map((n) => +n.toFixed(2)), scale: camera.scale, origin: camera.origin.toArray().map((n) => +n.toFixed(2)) });
    console.log('seat', seat.toArray().map((n: number) => +n.toFixed(3)).join(','), 'hand', hand.toArray().map((n) => +n.toFixed(3)).join(','));
    console.log('projected mesh pixel bounds', JSON.stringify(pixelBounds));
    console.log('mesh pixels written', meshPixels, '| inside-triangle hits', coveredPixels);
  }
  writePng(out, width, height, colour);
  console.log(`wrote ${out} (${width}x${height}) for ${id} at phase ${phase} [${mode}]`);
  void background;
}

await main();
