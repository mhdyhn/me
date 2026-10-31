/**
 * Stick-figure renderer for the exercise illustrations.
 *
 * One skeleton, one set of proportions, one palette, one scale: every figure is drawn by the
 * same code, so the images match each other. A pose only supplies joint angles and equipment;
 * segment lengths never change.
 *
 * Model units: ground line at y = GROUND, standing hip at about (240, 124).
 * The whole model is mapped to the canvas by a single transform (scale S, centred on x = 240).
 *
 * Views:
 *   side - camera on the figure's left, facing right. Angles: 0 = right, 90 = up.
 *   end  - camera at the head end of a supine figure. Angles: 0 = out to the side, 90 = up.
 */

export const W = 480;
export const H = 320;
export const GROUND_CANVAS = 300; // canvas y of the floor line
export const GROUND = 296; // model y of the floor
export const S = 0.66; // model -> canvas scale (same for every image)

export const LEN = {
  torso: 92,
  neck: 12,
  head: 15,
  uarm: 60,
  farm: 54,
  hand: 10,
  thigh: 88,
  shin: 84,
  foot: 26,
  shoulderHalf: 24,
  hipHalf: 12,
};

export const PALETTE = {
  bg: '#171d1b',
  outline: '#0c100e',
  body: '#dfe6e0',
  bodyFar: '#8f9b93',
  equip: '#d9f66f',
  equipDark: '#48534d',
  ground: '#2a332f',
};

const rad = (deg) => (deg * Math.PI) / 180;
const add = ([x, y], [dx, dy]) => [x + dx, y + dy];
/** Side view: screen y grows downward, so the vertical component is negated. */
export const dir = (deg, len) => [len * Math.cos(rad(deg)), -len * Math.sin(rad(deg))];
/** End view: `side` is -1 for the figure's left (screen-left) limb, +1 for right. */
const endDir = (deg, len, side) => [side * len * Math.cos(rad(deg)), -len * Math.sin(rad(deg))];

const f = (n) => Number(n.toFixed(1));
const pt = ([x, y]) => `${f(x)},${f(y)}`;

/** Limb as an outlined capsule: dark outline first, then the fill on top. */
function limb(points, width, color) {
  const d = points.map(pt).join(' ');
  return (
    `<polyline points="${d}" fill="none" stroke="${PALETTE.outline}" stroke-width="${width + 5}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<polyline points="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

function head([x, y], color) {
  return (
    `<circle cx="${f(x)}" cy="${f(y)}" r="${LEN.head + 2.5}" fill="${PALETTE.outline}"/>` +
    `<circle cx="${f(x)}" cy="${f(y)}" r="${LEN.head}" fill="${color}"/>`
  );
}

/** Side view. Far limbs are muted and drawn first; near limbs are full colour on top. */
function sideFigure(p) {
  const hip = p.root;
  const shoulder = add(hip, dir(p.torso, LEN.torso));
  const neckEnd = add(shoulder, dir(p.torso, LEN.neck));
  const headCenter = add(neckEnd, dir(p.torso, LEN.head + 2));

  const arm = (uarm, farm, from = shoulder) => {
    const elbow = add(from, dir(uarm, LEN.uarm));
    const wrist = add(elbow, dir(farm, LEN.farm));
    const hand = add(wrist, dir(farm, LEN.hand));
    return { elbow, wrist, hand };
  };
  const leg = (thigh, shin, foot) => {
    const knee = add(hip, dir(thigh, LEN.thigh));
    const ankle = add(knee, dir(shin, LEN.shin));
    const toe = add(ankle, dir(foot, LEN.foot));
    return { knee, ankle, toe };
  };

  const near = arm(p.uarm, p.farm);
  const far = p.far ?? {};
  const farA = arm(far.uarm ?? p.uarm, far.farm ?? p.farm);
  const nearL = leg(p.thigh, p.shin, p.foot ?? 0);
  const farL = leg(far.thigh ?? p.thigh + 7, far.shin ?? p.shin - 7, far.foot ?? p.foot ?? 0);

  const parts = [
    limb([shoulder, farA.elbow, farA.wrist, farA.hand], 14, PALETTE.bodyFar),
    limb([hip, farL.knee, farL.ankle, farL.toe], 18, PALETTE.bodyFar),
    limb([hip, shoulder], 46, PALETTE.body),
    limb([shoulder, neckEnd], 12, PALETTE.body),
    head(headCenter, PALETTE.body),
    limb([hip, nearL.knee, nearL.ankle, nearL.toe], 18, PALETTE.body),
    limb([shoulder, near.elbow, near.wrist, near.hand], 14, PALETTE.body),
  ];
  return { svgBody: parts.join(''), grips: [near.wrist], hip, shoulder };
}

/**
 * End view of a supine figure (camera at the head). Shoulders at x = 240 +/- 34, y = 186.
 * pose.arms = { L: [uarm, farm], R: [uarm, farm] }; angles in end-view convention.
 */
function endFigure(p) {
  const cx = p.cx ?? 240;
  const shY = 186;
  const sh = { L: [cx - 34, shY], R: [cx + 34, shY] };
  const chain = (origin, [a1, a2], side) => {
    const e = add(origin, endDir(a1, LEN.uarm, side));
    const w = add(e, endDir(a2, LEN.farm, side));
    return [origin, e, w];
  };
  const armL = chain(sh.L, p.arms.L, -1);
  const armR = chain(sh.R, p.arms.R, 1);
  const parts = [
    limb(armL, 14, PALETTE.body),
    limb([[cx - 22, 190], [cx + 22, 190]], 56, PALETTE.body),
    head([cx, 176], PALETTE.body),
    limb(armR, 14, PALETTE.body),
  ];
  return { svgBody: parts.join(''), grips: [armL[2], armR[2]] };
}

/** Equipment in model coordinates. `at: 'grip'` = midpoint of grips; `at: 'grips'` = all grips. */
function equipment(items, fig) {
  const dark = PALETTE.equipDark;
  const eq = PALETTE.equip;
  const mid =
    fig.grips.length > 1
      ? [(fig.grips[0][0] + fig.grips[1][0]) / 2, (fig.grips[0][1] + fig.grips[1][1]) / 2]
      : fig.grips[0];
  const out = [];
  for (const item of items ?? []) {
    const at = item.at === 'grip' ? mid : item.at === 'grips' ? fig.grips : item.at;
    switch (item.t) {
      case 'bench': {
        // side-view flat bench: pad + two uprights
        const { x, y, w } = item;
        out.push(
          `<rect x="${f(x - w / 2)}" y="${f(y)}" width="${f(w)}" height="13" rx="5" fill="${dark}"/>` +
            `<rect x="${f(x - w / 2 + 20)}" y="${f(y + 13)}" width="12" height="${f(GROUND - y - 13)}" fill="${dark}"/>` +
            `<rect x="${f(x + w / 2 - 32)}" y="${f(y + 13)}" width="12" height="${f(GROUND - y - 13)}" fill="${dark}"/>`,
        );
        break;
      }
      case 'benchEnd': {
        // end-view flat bench: pad seen end-on + two legs
        const { x, y } = item;
        out.push(
          `<rect x="${f(x - 70)}" y="${f(y)}" width="140" height="12" rx="4" fill="${dark}"/>` +
            `<rect x="${f(x - 58)}" y="${f(y + 12)}" width="12" height="${f(GROUND - y - 12)}" fill="${dark}"/>` +
            `<rect x="${f(x + 46)}" y="${f(y + 12)}" width="12" height="${f(GROUND - y - 12)}" fill="${dark}"/>`,
        );
        break;
      }
      case 'bar': {
        // barbell lying across the picture plane (end view): horizontal shaft + plates
        const len = item.len ?? 260;
        const inset = item.inset ?? 15;
        const [cx, cy] = at;
        const plate = (px) => `<rect x="${f(px - 6)}" y="${f(cy - 30)}" width="12" height="60" rx="3" fill="${eq}"/>`;
        out.push(
          `<line x1="${f(cx - len / 2)}" y1="${f(cy)}" x2="${f(cx + len / 2)}" y2="${f(cy)}" stroke="${eq}" stroke-width="6" stroke-linecap="round"/>` +
            plate(cx - len / 2 + inset) +
            plate(cx + len / 2 - inset),
        );
        break;
      }
      case 'barSide': {
        // barbell seen end-on from the side: a dot at the grip with one plate behind it
        const [cx, cy] = at;
        out.push(
          `<rect x="${f(cx - 8)}" y="${f(cy - 34)}" width="14" height="68" rx="3" fill="${eq}"/>` +
            `<circle cx="${f(cx)}" cy="${f(cy)}" r="6" fill="${eq}"/>`,
        );
        break;
      }
      case 'dumbbell': {
        const hands = Array.isArray(at[0]) ? at : [at];
        for (const [hx, hy] of hands) {
          out.push(
            `<line x1="${f(hx - 14)}" y1="${f(hy)}" x2="${f(hx + 14)}" y2="${f(hy)}" stroke="${eq}" stroke-width="6" stroke-linecap="round"/>` +
              `<rect x="${f(hx - 22)}" y="${f(hy - 13)}" width="8" height="26" rx="2" fill="${eq}"/>` +
              `<rect x="${f(hx + 14)}" y="${f(hy - 13)}" width="8" height="26" rx="2" fill="${eq}"/>`,
          );
        }
        break;
      }
      case 'cable': {
        const [ax, ay] = item.anchor;
        const targets = Array.isArray(at[0]) ? at : [at];
        for (const [hx, hy] of targets) {
          out.push(`<line x1="${f(ax)}" y1="${f(ay)}" x2="${f(hx)}" y2="${f(hy)}" stroke="${eq}" stroke-width="3"/>`);
        }
        out.push(`<circle cx="${f(ax)}" cy="${f(ay)}" r="8" fill="${dark}" stroke="${eq}" stroke-width="2"/>`);
        break;
      }
      case 'pullbar': {
        // overhead lat-pulldown bar or machine top rail
        out.push(
          `<line x1="${f(item.x - item.len / 2)}" y1="${f(item.y)}" x2="${f(item.x + item.len / 2)}" y2="${f(item.y)}" stroke="${dark}" stroke-width="8" stroke-linecap="round"/>`,
        );
        break;
      }
      case 'post': {
        out.push(`<rect x="${f(item.x)}" y="${f(item.y)}" width="10" height="${f(item.h)}" rx="3" fill="${dark}"/>`);
        break;
      }
      case 'box': {
        const { x, y, w, h } = item;
        out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="6" fill="${dark}"/>`);
        break;
      }
      default:
        throw new Error(`unknown equipment type: ${item.t}`);
    }
  }
  return out.join('');
}

/** Equipment drawn beneath the figure; everything else (bars, cables) is drawn on top of the hands. */
const UNDER = new Set(["bench", "benchEnd", "box", "post", "pullbar"]);

/** The smallest box that holds every drawn point of the figure, in model units. */
function modelBounds(inner) {
  const numbers = [];
  const points = [...inner.matchAll(/points="([^"]+)"/g)].flatMap((match) => match[1].trim().split(/\s+/));
  for (const pair of points) {
    const [x, y] = pair.split(',').map(Number);
    if (!Number.isNaN(x) && !Number.isNaN(y)) numbers.push([x, y]);
  }
  for (const match of inner.matchAll(/\b(cx|cy|x|y|x1|y1|x2|y2)="(-?[\d.]+)"/g)) {
    const value = Number(match[2]);
    if (!Number.isNaN(value)) numbers.push(match[1] === 'cx' || match[1] === 'x' || match[1] === 'x1' || match[1] === 'x2' ? [value, 0] : [0, value]);
  }
  for (const match of inner.matchAll(/<rect[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/g)) {
    numbers.push([Number(match[1]), Number(match[2])]);
  }
  if (!numbers.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return {
    minX: Math.min(...numbers.map((point) => point[0])),
    maxX: Math.max(...numbers.map((point) => point[0])),
    minY: Math.min(...numbers.map((point) => point[1])),
    maxY: Math.max(...numbers.map((point) => point[1])),
  };
}

/** The margin kept between the figure and the edge of the canvas. */
const MARGIN = 8;

/**
 * The transform of one pose. The scale never changes, so every figure keeps the same size;
 * the figure is only shifted when it would otherwise fall out of the canvas (a dip or a
 * hanging movement hangs below the floor line).
 */
export function poseTransform(pose, inner) {
  const tx = W / 2 - 240 * S;
  let ty = GROUND_CANVAS - GROUND * S;
  const bounds = modelBounds(inner);
  const top = bounds.minY * S + ty;
  const bottom = bounds.maxY * S + ty;
  if (bottom > H - MARGIN) ty -= bottom - (H - MARGIN);
  if (bounds.minY * S + ty < MARGIN) ty += MARGIN - (bounds.minY * S + ty);
  return { tx, ty, transform: `translate(${f(tx)} ${f(ty)}) scale(${S})` };
}

/** Build one SVG from a pose. pose.view: 'side' (default) or 'end'. */
export function renderPose(pose, meta = {}) {
  const fig = pose.view === 'end' ? endFigure(pose) : sideFigure(pose);
  const under = equipment((pose.equip ?? []).filter((e) => UNDER.has(e.t)), fig);
  const over = equipment((pose.equip ?? []).filter((e) => !UNDER.has(e.t)), fig);
  const { transform } = poseTransform(pose, under + fig.svgBody + over);
  const floor = `<line x1="0" y1="${GROUND_CANVAS}" x2="${W}" y2="${GROUND_CANVAS}" stroke="${PALETTE.ground}" stroke-width="2"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${meta.label ?? ''}">` +
    `<rect width="${W}" height="${H}" fill="${PALETTE.bg}"/>` +
    floor +
    `<g transform="${transform}">` +
    under +
    fig.svgBody +
    over +
    `</g>` +
    `</svg>`
  );
}
