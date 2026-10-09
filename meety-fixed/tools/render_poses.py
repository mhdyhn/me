"""Offline stick-figure preview of the motion dumps (dev tool, not shipped)."""
import json, math, os, sys
from PIL import Image, ImageDraw

DUMP = "/tmp/motion-dump"
OUT = "/tmp/pose-sheets"

BONE_WIDTH = {
    'Root': 0, 'pelvis': 13, 'spine_01': 13, 'spine_02': 12, 'spine_03': 11,
    'neck_01': 7, 'head': 0,
    'clavicle': 7, 'upperarm': 8, 'lowerarm': 7, 'hand': 5,
    'thigh': 11, 'calf': 10, 'foot': 8, 'ball': 5,
}
FINGER_WIDTH = 1.6
SKIP = {'index', 'middle', 'pinky', 'ring', 'thumb'}


def width_for(name):
    base = name[:-2] if name.endswith(('_l', '_r')) else name
    if any(base.startswith(f) for f in SKIP):
        return FINGER_WIDTH
    return BONE_WIDTH.get(base, 3)


def rot_y(p, a):
    c, s = math.cos(a), math.sin(a)
    return (p[0] * c - p[2] * s, p[1], p[0] * s + p[2] * c)


def rotate(p, rotation):
    """Fixture rotation in degrees around X, then Y, then Z, matching the viewer."""
    rx, ry, rz = (math.radians(r) for r in rotation)
    x, y, z = p
    y, z = y * math.cos(rx) - z * math.sin(rx), y * math.sin(rx) + z * math.cos(rx)
    x, z = x * math.cos(ry) + z * math.sin(ry), -x * math.sin(ry) + z * math.cos(ry)
    x, y = x * math.cos(rz) - y * math.sin(rz), x * math.sin(rz) + y * math.cos(rz)
    return (x, y, z)


def rot_x(p, a):
    c, s = math.cos(a), math.sin(a)
    return (p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c)


def make_projector(yaw_deg, pitch_deg, scale, cx, cy):
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)

    def project(p):
        q = rot_x(rot_y(p, yaw), pitch)
        return (cx + q[0] * scale, cy - q[1] * scale, q[2])
    return project


def draw_figure(draw, project, points, parents, floor_y=0.0):
    segments = []
    for name, point in points.items():
        parent = parents.get(name)
        if not parent or parent not in points:
            continue
        width = width_for(name)
        if width <= 0:
            continue
        a, b = project(point), project(points[parent])
        segments.append((a, b, width))
    segments.sort(key=lambda s: -(s[0][2] + s[1][2]) / 2)
    for a, b, width in segments:
        depth = (a[2] + b[2]) / 2
        shade = max(90, min(235, int(215 - depth * 55)))
        color = (shade, shade - 15, shade - 30)
        draw.line([a[:2], b[:2]], fill=color, width=int(width))
    # head: circle sitting on the head joint, offset along the neck direction
    if 'head' in points and 'neck_01' in points:
        neck, head = points['neck_01'], points['head']
        direction = tuple(h - n for h, n in zip(head, neck))
        length = math.dist(neck, head) or 0.1
        unit = tuple(d / length for d in direction)
        centre = tuple(h - u * length * 0.25 for h, u in zip(head, unit))
        shown = project(centre)
        radius = max(5, int(0.085 * abs(project((0, 0.085, 0))[1] - project((0, 0, 0))[1])))
        draw.ellipse([shown[0] - radius, shown[1] - radius, shown[0] + radius, shown[1] + radius],
                     outline=(225, 205, 190), width=2)
    return segments


def draw_floor(draw, project, extent=2.0, step=0.25):
    for x in [i * step - extent for i in range(int(2 * extent / step) + 1)]:
        a = project((x, 0, -extent))
        b = project((x, 0, extent))
        draw.line([a[:2], b[:2]], fill=(48, 54, 58), width=1)
    for z in [i * step - extent for i in range(int(2 * extent / step) + 1)]:
        a = project((-extent, 0, z))
        b = project((extent, 0, z))
        draw.line([a[:2], b[:2]], fill=(48, 54, 58), width=1)


def fixture_parts(fixture):
    """The fixture box plus its parts, each as (centre, size, rotation)."""
    size = fixture.get('size')
    if not size:
        if fixture['kind'] == 'bench':
            size = [0.36, 0.45, 1.8]
        elif fixture['kind'] == 'pull-up-bar':
            size = [2.0, 0.05, 0.05]
        elif fixture['kind'] == 'seat':
            size = [0.46, 0.11, 0.46]
        else:
            size = [0.5, 1.0, 0.5]
    base = (fixture['position'], size, fixture.get('rotation') or [0, 0, 0])
    parts = [base]
    for part in fixture.get('parts') or []:
        centre = tuple(c + o for c, o in zip(fixture['position'], part['offset']))
        parts.append((centre, part['size'], part.get('rotation') or [0, 0, 0]))
    return parts


def box_corners(pos, size, rotation):
    half = [s / 2 for s in size]
    corners = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                local = (sx * half[0], sy * half[1], sz * half[2])
                rotated = rotate(local, rotation)
                corners.append(tuple(c + p for c, p in zip(rotated, pos)))
    return corners


def faces_of(corners):
    """The six faces of a box given its eight corners in (x, y, z) sign order."""
    at = lambda sx, sy, sz: corners[((sx + 1) // 2) * 4 + ((sy + 1) // 2) * 2 + (sz + 1) // 2]
    return [
        [at(-1, -1, -1), at(1, -1, -1), at(1, 1, -1), at(-1, 1, -1)],   # back
        [at(-1, -1, 1), at(1, -1, 1), at(1, 1, 1), at(-1, 1, 1)],       # front
        [at(-1, -1, -1), at(-1, -1, 1), at(-1, 1, 1), at(-1, 1, -1)],   # left
        [at(1, -1, -1), at(1, -1, 1), at(1, 1, 1), at(1, 1, -1)],       # right
        [at(-1, -1, -1), at(1, -1, -1), at(1, -1, 1), at(-1, -1, 1)],   # bottom
        [at(-1, 1, -1), at(1, 1, -1), at(1, 1, 1), at(-1, 1, 1)],       # top
    ]


def draw_box(draw, project, pos, size, rotation, fill):
    corners = box_corners(pos, size, rotation)
    faces = faces_of(corners)
    # Paint the faces back to front so the closest one ends up on top.
    faces.sort(key=lambda face: sum(project(c)[2] for c in face) / 4)
    for face in faces:
        draw.polygon([project(c)[:2] for c in face], fill=fill)
    for a, b in EDGES:
        pa, pb = project(corners[a]), project(corners[b])
        draw.line([pa[:2], pb[:2]], fill=(120, 130, 140), width=2)


# Corner index pairs of a box's twelve edges, in (x, y, z) sign order.
EDGES = [
    (a, b)
    for a in range(8)
    for b in range(a + 1, 8)
    if bin(a ^ b).count('1') == 1
]


def draw_props(draw, project, fixtures, equipment):
    for fixture in fixtures or []:
        for pos, size, rotation in fixture_parts(fixture):
            draw_box(draw, project, pos, size, rotation, (52, 60, 66))
    for item in equipment or []:
        pos = item['position']
        if item['kind'] == 'cable' and item.get('anchor'):
            pa, pb = project(item['anchor']), project(pos)
            draw.line([pa[:2], pb[:2]], fill=(180, 180, 120), width=2)
            draw.ellipse([pa[0] - 4, pa[1] - 4, pa[0] + 4, pa[1] + 4], outline=(180, 180, 120), width=2)
        length = 0.42 if item['kind'] == 'barbell' else 0.09
        quat = item['quaternion']
        x, y, z, w = quat
        axis = (1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w))
        a = tuple(p - ax * length for p, ax in zip(pos, axis))
        b = tuple(p + ax * length for p, ax in zip(pos, axis))
        pa, pb = project(a), project(b)
        draw.line([pa[:2], pb[:2]], fill=(205, 205, 210), width=3)
        for end in (a, b):
            for offset in (-0.03, 0.03):
                c = tuple(p + ax * offset for p, ax in zip(end, axis))
                c1 = tuple(p + off for p, off in zip(c, rot_y((0, 0.05, 0), 0)))
                pc, pc1 = project(c), project(c1)
                draw.line([pc[:2], pc1[:2]], fill=(150, 150, 155), width=2)


def render_sheet(motion, views, panels=8):
    rig = json.load(open(os.path.join(DUMP, 'rig.json')))
    parents = rig['parents']
    frames = motion['frames']
    positions = [p for frame in frames for p in frame['bones'].values()]
    extra = []
    for frame in frames:
        extra += [e['position'] for e in frame['equipment']]
        for fixture in motion.get('fixtures') or []:
            extra.append([c + d for c, d in zip(fixture['position'], [0.3, 0.6, 0.6])])
    everything = positions + extra
    panel_w, panel_h = 300, 320
    cols = 4
    rows = math.ceil(panels / cols) * len(views)
    sheet = Image.new('RGB', (cols * panel_w, rows * panel_h), (24, 28, 30))
    draw = ImageDraw.Draw(sheet)
    for view_index, (yaw, pitch) in enumerate(views):
        ys = [rot_x(rot_y(p, math.radians(yaw)), math.radians(pitch))[1] for p in everything]
        top, bottom = max(ys), min(ys)
        scale = min(panel_h / ((top - bottom) * 1.25), 165)
        cy = (top + bottom) / 2
        for index, frame in enumerate(frames[:panels]):
            col, row = index % cols, index // cols + view_index * math.ceil(panels / cols)
            ox, oy = col * panel_w, row * panel_h
            project = make_projector(yaw, pitch, scale, ox + panel_w / 2, oy + panel_h / 2 + cy * scale)
            draw_floor(draw, project)
            draw_props(draw, project, motion.get('fixtures'), frame['equipment'])
            draw_figure(draw, project, {k: tuple(v) for k, v in frame['bones'].items()}, parents)
            draw.text((ox + 10, oy + 8), f"t={frame['t']:.3f} {frame['label']}", fill=(200, 210, 210))
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{motion['id']}.png")
    sheet.save(path)
    return path


if __name__ == '__main__':
    views = [(28, 12), (90, 8)]
    for motion_id in (sys.argv[1:] or ['barbell-squat']):
        motion = json.load(open(os.path.join(DUMP, f'motion-{motion_id}.json')))
        print(render_sheet(motion, views))
