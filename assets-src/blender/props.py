"""Reusable course pieces and props.

walls.glb    modular wall kit (pieces are 48 units long, 26 wide, footprint = physics capsule radius 13)
               StoneSection / StoneEnd, BrickSection / BrickEnd  (bodies, cap centre at x=0 for ends)
               CapSection / CapEnd                               (oak caps with brass bolts, sit on top)
cup.glb      brass-rimmed cup with a visibly deep liner (cup radius 21)
lantern.glb  brass carriage lantern on a mahogany corner post (Glass is emissive)
rocks.glb    three small rock clusters for decoration (Rocks1..3)
decor.glb    Barrel (oak staves, iron hoops) and Planter (oak box, brass caps)

Run: python props.py -- <out_dir> [--preview]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from kit import (Part, Rx, Rz, T, bake_ao, box, cyl, export_glb, jitter, preview, prism, reset,  # noqa: E402
                 rnd, sphere, torus)
import bmesh  # noqa: E402  (kit has already imported bpy)
import bpy  # noqa: E402

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '.'

SEC = 48.0        # section length
HALF_W = 13.0     # wall half width = physics WALL_R
BODY_H = 34.0
CAP_H = 6.0


def sector(r, a0, a1, segs=6):
    pts = [(0.0, 0.0)]
    for i in range(segs + 1):
        a = a0 + (a1 - a0) * i / segs
        pts.append((r * math.cos(a), r * math.sin(a)))
    return pts


def stone_section():
    p = Part('StoneSection')
    p.add(box(SEC, HALF_W * 2 - 4, BODY_H - 1), T(SEC / 2, 0, BODY_H / 2), 'Mortar')
    courses = 4
    ch = BODY_H / courses
    for c in range(courses):
        cuts = [0, 16, 32, 48] if c % 2 == 0 else [0, 8, 24, 40, 48]
        for x0, x1 in zip(cuts, cuts[1:]):
            x0j = x0 + (0.7 if x0 > 0 else 0.35)
            x1j = x1 - (0.7 if x1 < SEC else 0.35)
            w, h = x1j - x0j, ch - 1.4 + rnd.uniform(-0.4, 0.2)
            bm = jitter(box(w, HALF_W * 2 - rnd.uniform(0, 1.2), h, bev=1.5), 0.4)
            p.add(bm, T((x0j + x1j) / 2, rnd.uniform(-0.3, 0.3), ch * (c + 0.5)), 'Stone')
    return p


def stone_end():
    p = Part('StoneEnd')
    p.add(cyl(HALF_W - 2, HALF_W - 2, BODY_H - 1, 20), T(0, 0, BODY_H / 2), 'Mortar')
    courses = 4
    ch = BODY_H / courses
    for c in range(courses):
        n = 3
        off = (c % 2) * 0.5
        for i in range(n):
            a0 = -math.pi / 2 + math.pi * (i + off * (i > 0)) / n
            a1 = -math.pi / 2 + math.pi * (i + 1 + off * (i + 1 < n)) / n
            g = 0.035
            bm = prism(sector(HALF_W - rnd.uniform(0, 0.6), a0 + g, a1 - g, 5), ch - 1.4, bev=1.3, seg=1)
            jitter(bm, 0.35)
            p.add(bm, T(0.4, 0, ch * c + 0.7), 'Stone')
    return p


def brick_section():
    p = Part('BrickSection')
    p.add(box(SEC, HALF_W * 2 - 3, BODY_H - 0.5), T(SEC / 2, 0, BODY_H / 2), 'Mortar')
    courses = 6
    ch = BODY_H / courses
    for c in range(courses):
        cuts = [0, 16, 32, 48] if c % 2 == 0 else [0, 8, 24, 40, 48]
        for side in (-1, 1):
            for x0, x1 in zip(cuts, cuts[1:]):
                x0j, x1j = x0 + 0.6, x1 - 0.6
                bm = jitter(box(x1j - x0j, 7.5, ch - 1.0, bev=0.7), 0.12)
                p.add(bm, T((x0j + x1j) / 2, side * (HALF_W - 3.6), ch * (c + 0.5)), 'Brick')
    return p


def brick_end():
    p = Part('BrickEnd')
    p.add(cyl(HALF_W - 1.5, HALF_W - 1.5, BODY_H - 2, 20), T(0, 0, BODY_H / 2 - 0.75), 'Mortar')
    courses = 6
    ch = BODY_H / courses
    for c in range(courses):
        n = 5
        off = (c % 2) * 0.5
        for i in range(n):
            a0 = -math.pi / 2 + math.pi * max(0, i - off) / n
            a1 = -math.pi / 2 + math.pi * min(n, i + 1 - off) / n
            if a1 - a0 < 0.1:
                continue
            outer = sector(HALF_W, a0 + 0.03, a1 - 0.03, 4)[1:]
            inner = [(x * (HALF_W - 7) / HALF_W, y * (HALF_W - 7) / HALF_W) for x, y in outer][::-1]
            bm = prism(outer + inner, ch - 1.0, bev=0.6, seg=1)
            p.add(jitter(bm, 0.1), T(0, 0, ch * c + 0.5), 'Brick')
        # Brass corner strap on every other course for the "metallic accent"
    p.add(torus(HALF_W + 0.3, 0.9, 24, 6), T(0, 0, BODY_H - 4), 'Brass')
    return p


def cap_section():
    p = Part('CapSection')
    p.add(box(SEC - 0.6, HALF_W * 2 + 2.5, CAP_H, bev=1.8, seg=2), T(SEC / 2, 0, CAP_H / 2), 'Oak')
    for x in (12, 36):
        for y in (-HALF_W + 2.5, HALF_W - 2.5):
            p.add(sphere(1.4, 10, 6), T(x, y, CAP_H), 'Brass')
    return p


def cap_end():
    p = Part('CapEnd')
    r = HALF_W + 1.25
    pts = [(math.cos(a) * r, math.sin(a) * r) for a in [-math.pi / 2 + math.pi * i / 16 for i in range(17)]]
    pts = [(-0.3, r)] + [(-0.3, -r)] + pts
    p.add(prism(pts, CAP_H, bev=1.8, seg=2), T(0, 0, 0), 'Oak')
    p.add(sphere(1.4, 10, 6), T(6, 0, CAP_H), 'Brass')
    return p


def cup():
    p = Part('Cup')
    R = 21.0
    # Liner: open cylinder with inward-facing walls so the depth reads from above
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=40, radius1=R, radius2=R, depth=34)
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    p.add(bm, T(0, 0, -17), 'Hole')
    p.add(cyl(R, R, 1, 40), T(0, 0, -34), 'Hole')
    # Brass collar visible just inside the lip, and a rolled rim on the turf
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=48, radius1=R + 0.05, radius2=R + 0.05, depth=7)
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    p.add(bm, T(0, 0, -3.5), 'Brass')
    p.add(torus(R + 1.6, 1.9, 56, 10), T(0, 0, 0.2), 'Brass')
    ring = [(math.cos(a) * (R + 6.5), math.sin(a) * (R + 6.5)) for a in [2 * math.pi * i / 56 for i in range(56)]]
    hole = [(math.cos(a) * (R + 2.5), math.sin(a) * (R + 2.5)) for a in [2 * math.pi * i / 56 for i in range(56)]]
    bm = bmesh.new()
    outer = [bm.verts.new((x, y, 0.35)) for x, y in ring]
    inner = [bm.verts.new((x, y, 0.35)) for x, y in hole]
    for i in range(56):
        j = (i + 1) % 56
        bm.faces.new((outer[i], outer[j], inner[j], inner[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    p.add(bm, T(), 'Brass')
    return p


def lantern_post():
    p = Part('Lantern')
    # Mahogany post with stepped mouldings (the game's rail sits at y=0 of this piece)
    p.add(box(30, 30, 4, bev=1.2), T(0, 0, 2), 'Oak')
    p.add(box(26, 26, 18, bev=1.5), T(0, 0, 13), 'Oak')
    p.add(box(30, 30, 3, bev=1.0), T(0, 0, 23.5), 'Oak')
    p.add(box(22, 22, 2, bev=0.6), T(0, 0, 26), 'Brass')
    base = 27.0
    # Lantern: brass base, four corner posts, glass, roof, chimney, ring
    p.add(cyl(9.5, 8.5, 3, 4, bev=0.6), T(0, 0, base + 1.5) @ Rz(math.pi / 4), 'Brass')
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.add(box(1.4, 1.4, 22, bev=0.3), T(sx * 6.5, sy * 6.5, base + 14), 'Brass')
    p.add(box(12, 12, 20), T(0, 0, base + 14), 'Glass')
    p.add(cyl(1.0, 0.8, 5, 8), T(0, 0, base + 6.5), 'Plank')     # candle
    p.add(cyl(9.8, 9.8, 2, 4, bev=0.5), T(0, 0, base + 25) @ Rz(math.pi / 4), 'Brass')
    p.add(cyl(11.5, 2.0, 8, 4, bev=0.4), T(0, 0, base + 30) @ Rz(math.pi / 4), 'Brass')
    p.add(cyl(1.8, 1.8, 3, 10), T(0, 0, base + 35), 'Brass')
    p.add(torus(3.0, 0.7, 16, 6), T(0, 0, base + 39) @ Rx(math.pi / 2), 'Brass')
    for k in range(4):  # scroll brackets under the roof corners
        a = math.pi / 4 + k * math.pi / 2
        p.add(torus(2.2, 0.45, 12, 5), T(math.cos(a) * 8.5, math.sin(a) * 8.5, base + 23) @ Rz(a) @ Rx(math.pi / 2), 'Brass')
    return p


def barrel():
    """Oak barrel: 18 bulging staves, iron hoops, plank lid. 44 tall, ~16 radius."""
    p = Part('Barrel')
    H, R_MID, R_END, n = 44.0, 16.0, 13.5, 18
    rows = 8
    for i in range(n):
        a0 = 2 * math.pi * i / n + 0.012
        a1 = 2 * math.pi * (i + 1) / n - 0.012
        bm = bmesh.new()
        grid = []
        for k in range(rows + 1):
            z = H * k / rows
            r = R_END + (R_MID - R_END) * math.sin(math.pi * k / rows)
            row = []
            for a, rr in ((a0, r), (a1, r), (a1, r - 1.6), (a0, r - 1.6)):
                row.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, z)))
            grid.append(row)
        for k in range(rows):
            lo, hi = grid[k], grid[k + 1]
            for j in range(4):
                bm.faces.new((lo[j], lo[(j + 1) % 4], hi[(j + 1) % 4], hi[j]))
        bm.faces.new(grid[0][::-1])
        bm.faces.new(grid[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        jitter(bm, 0.12)
        p.add(bm, T(), 'Oak' if i % 3 else 'Plank')
    for z, rr in ((4.5, R_END + 0.9), (13, R_MID - 0.6), (31, R_MID - 0.6), (39.5, R_END + 0.9)):
        p.add(cyl(rr + 0.4, rr + 0.4, 2.6, 40), T(0, 0, z), 'Iron')
    for k in range(5):
        y = -R_END + 3 + k * (2 * R_END - 6) / 4
        w = 2 * math.sqrt(max(1.0, (R_END - 1.5) ** 2 - y ** 2))
        p.add(box(w, (2 * R_END - 6) / 4 - 0.5, 1.6, bev=0.3), T(0, y, H - 2.5), 'Plank')
    p.add(cyl(R_END - 1, R_END - 1, 1, 32), T(0, 0, H - 3.4), 'DarkWood')
    p.add(cyl(1.6, 1.6, 2.2, 10), T(5, -4, H - 1.0), 'DarkWood')  # bung
    return p


def planter():
    """Square oak planter with brass corner caps; the game plants a fern in it (soil top at z=34)."""
    p = Part('Planter')
    W, H = 46.0, 36.0
    for side in range(4):
        R = Rz(side * math.pi / 2)
        for k in range(4):
            z = 3 + k * (H - 4) / 4 + (H - 4) / 8
            p.add(box(W - 6, 2.8, (H - 4) / 4 - 0.8, bev=0.5), R @ T(0, W / 2 - 1.6, z), 'Oak')
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.add(box(6.5, 6.5, H, bev=1.0), T(sx * (W / 2 - 2.2), sy * (W / 2 - 2.2), H / 2), 'DarkWood')
            p.add(box(7.4, 7.4, 3, bev=0.6), T(sx * (W / 2 - 2.2), sy * (W / 2 - 2.2), H + 0.8), 'Brass')
            p.add(sphere(1.6, 10, 6), T(sx * (W / 2 - 2.2), sy * (W / 2 - 2.2), H + 2.6), 'Brass')
    p.add(box(W - 5, W - 5, 2), T(0, 0, H - 2), 'Mortar')  # soil
    p.add(box(W + 2, W + 2, 3, bev=0.8), T(0, 0, 1.5), 'DarkWood')  # plinth
    return p


def rock_cluster(name, n, spread, size):
    p = Part(name)
    for i in range(n):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        for v in bm.verts:
            v.co *= 1 + rnd.uniform(-0.18, 0.18)
        s = size * rnd.uniform(0.5, 1.1)
        a = rnd.uniform(0, 2 * math.pi)
        d = rnd.uniform(0, spread)
        m = T(math.cos(a) * d, math.sin(a) * d, s * 0.25) @ Rz(rnd.uniform(0, 6.28)) @ Rx(rnd.uniform(-0.3, 0.3))
        bmesh.ops.scale(bm, vec=(s * rnd.uniform(1.0, 1.5), s, s * rnd.uniform(0.5, 0.8)), verts=bm.verts)
        p.add(bm, m, 'Stone')
    return p


def export_set(name, parts, ao=26.0):
    reset()
    pivots = []
    for i, part in enumerate(parts):
        pv = part.build()
        pv.location.x = i * 70  # spread out for baking so pieces don't occlude each other
        pivots.append(pv)
    objs = [p.mesh_ob for p in parts]
    bpy.context.view_layer.update()
    bake_ao(objs, distance=ao, samples=32)
    for pv in pivots:
        pv.location.x = 0
    export_glb(os.path.join(OUT, f'{name}.glb'))
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs}
    print(name, tris)
    return objs


def main():
    os.makedirs(OUT, exist_ok=True)
    export_set('walls', [stone_section(), stone_end(), brick_section(), brick_end(), cap_section(), cap_end()], ao=14.0)
    export_set('cup', [cup()], ao=20.0)
    export_set('lantern', [lantern_post()], ao=10.0)
    export_set('rocks', [rock_cluster('Rocks1', 5, 10, 9), rock_cluster('Rocks2', 3, 6, 7), rock_cluster('Rocks3', 7, 16, 8)], ao=12.0)
    export_set('decor', [barrel(), planter()], ao=16.0)
    if '--preview' in sys.argv:
        # Lay out a sample wall run (two sections + both ends, stone and brick) for a visual check
        reset()
        parts = [('StoneSection', stone_section), ('StoneEnd', stone_end), ('CapSection', cap_section), ('CapEnd', cap_end),
                 ('BrickSection', brick_section), ('BrickEnd', brick_end), ('Lantern', lantern_post)]
        made = {n: f().build() for n, f in parts}
        made['StoneSection'].location = (0, 0, 0)
        dup = made['StoneSection'].copy(); bpy.context.scene.collection.objects.link(dup); dup.location = (SEC, 0, 0)
        made['StoneEnd'].location = (2 * SEC, 0, 0)
        e2 = made['StoneEnd'].copy(); bpy.context.scene.collection.objects.link(e2); e2.rotation_euler.z = math.pi
        for k in range(2):
            c = made['CapSection'] if k == 0 else made['CapSection'].copy()
            if k: bpy.context.scene.collection.objects.link(c)
            c.location = (k * SEC, 0, BODY_H)
        made['CapEnd'].location = (2 * SEC, 0, BODY_H)
        ce = made['CapEnd'].copy(); bpy.context.scene.collection.objects.link(ce); ce.location = (0, 0, BODY_H); ce.rotation_euler.z = math.pi
        made['BrickSection'].location = (0, -70, 0)
        made['BrickEnd'].location = (SEC, -70, 0)
        made['Lantern'].location = (140, -40, 0)
        preview(os.path.join(OUT, 'props_preview.png'), target=(60, -30, 15), dist=260, elev=30, azim=-60)


main()
