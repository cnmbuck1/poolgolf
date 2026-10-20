"""Garden course pieces.

garden.glb
  TimberSection   fairway edging, 48 long x 20 wide (= physics EDGE_R * 2) x 16 tall, laid along the outline
  TimberPost      corner post that hides the joint at every outline vertex
  Hedge           clipped box-hedge cell, 60 long x 34 deep x 40 tall, tiles along borders
  Tree            ornamental tree (~230 tall) with a rounded canopy
  Flower          small flowering plant (petals tinted per instance in the game)
  Paver1..3       irregular stepping stones
  LampPost        iron garden lamp post with a brass lantern (Glass is emissive)

Run: python garden.py -- <out_dir> [--preview]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from kit import (Part, Rx, Ry, Rz, T, bake_ao, box, cyl, export_glb, jitter, preview, prism, reset,  # noqa: E402
                 rnd, sphere, stadium, torus)
import bmesh  # noqa: E402  (kit has already imported bpy)
import bpy  # noqa: E402

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '.'
SEC = 48.0


def blob(r, subdiv=1, wobble=0.22):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    for v in bm.verts:
        v.co *= 1 + rnd.uniform(-wobble, wobble)
    return bm


def timber_section():
    """Two stacked sleepers with iron straps; the edging the ball banks off."""
    p = Part('TimberSection')
    for k, (z, h) in enumerate(((0, 8.2), (8.0, 8.4))):
        bm = jitter(box(SEC - 0.8, 19.6 - k * 0.8, h, bev=1.6, seg=2), 0.12)
        p.add(bm, T(SEC / 2, 0, z + h / 2), 'Timber')
    for x in (10, SEC - 10):
        p.add(box(3, 21, 15.5, bev=0.4), T(x, 0, 8.2), 'Iron')
        for y in (-9.9, 9.9):
            p.add(sphere(1.1, 8, 5), T(x, y, 12), 'Iron')
    return p


def timber_post():
    p = Part('TimberPost')
    p.add(jitter(box(25, 25, 24, bev=2.2, seg=2), 0.15), T(0, 0, 12), 'Timber')
    p.add(box(27, 27, 2.4, bev=0.8), T(0, 0, 24.6), 'Brass')
    p.add(cyl(4.5, 2.5, 4, 12, bev=0.5), T(0, 0, 27.6), 'Brass')
    p.add(sphere(2.6, 12, 8), T(0, 0, 30.4), 'Brass')
    return p


def hedge():
    """A clipped hedge: a solid core covered in leafy lumps, slightly irregular like real topiary."""
    p = Part('Hedge')
    L, W, H = 60.0, 34.0, 40.0
    p.add(box(L - 2, W - 6, H - 6, bev=4, seg=2), T(L / 2, 0, (H - 6) / 2), 'Leaf')
    for i in range(18):
        side = rnd.choice(('top', 'front', 'back', 'top'))
        x = rnd.uniform(2, L - 2)
        if side == 'top':
            y, z = rnd.uniform(-W / 2 + 5, W / 2 - 5), H - 6 + rnd.uniform(-1, 2)
        else:
            y = (W / 2 - 4) * (1 if side == 'front' else -1)
            z = rnd.uniform(6, H - 8)
        r = rnd.uniform(7, 10)
        p.add(blob(r, 2, 0.14), T(x, y, z) @ Rz(rnd.uniform(0, 6.3)), 'Leaf')
    return p


def tree():
    p = Part('Tree')
    # Trunk with flare and two limbs
    p.add(cyl(13, 7, 110, 12, bev=0), T(0, 0, 55), 'Bark')
    p.add(cyl(18, 13, 10, 12), T(0, 0, 5), 'Bark')
    for a, tilt in ((0.6, 0.65), (3.4, 0.55), (5.0, 0.7)):
        p.add(cyl(5, 2.5, 60, 8), T(0, 0, 95) @ Rz(a) @ Rx(tilt) @ T(0, 0, 28), 'Bark')
    # Canopy: overlapping rounded clumps
    clumps = [((0, 0, 175), 62)]
    for k in range(9):
        a = k * 2 * math.pi / 9 + rnd.uniform(-0.2, 0.2)
        d = rnd.uniform(38, 58)
        clumps.append(((math.cos(a) * d, math.sin(a) * d, rnd.uniform(140, 200)), rnd.uniform(34, 46)))
    for (x, y, z), r in clumps:
        p.add(blob(r, 3, 0.07), T(x, y, z), 'Leaf')
    return p


def flower():
    p = Part('Flower')
    p.add(cyl(0.6, 0.5, 14, 5), T(0, 0, 7), 'Leaf')
    for a in (0.3, 2.5, 4.4):
        lf = sphere(1.0, 5, 3)
        bmesh.ops.scale(lf, vec=(5.5, 1.6, 0.4), verts=lf.verts)
        p.add(lf, T(0, 0, 3) @ Rz(a) @ Ry(-0.5) @ T(4.5, 0, 0), 'Leaf')
    for k in range(5):
        pt = sphere(1.0, 5, 3)
        bmesh.ops.scale(pt, vec=(3.0, 1.7, 0.5), verts=pt.verts)
        p.add(pt, T(0, 0, 14.5) @ Rz(k * 2 * math.pi / 5) @ Ry(-0.25) @ T(2.8, 0, 0), 'Petal')
    p.add(sphere(1.5, 6, 4), T(0, 0, 15), 'FlowerCenter')
    return p


def paver(name):
    p = Part(name)
    pts = []
    n = 9
    for i in range(n):
        a = 2 * math.pi * i / n
        r = rnd.uniform(11, 15)
        pts.append((math.cos(a) * r * 1.2, math.sin(a) * r))
    bm = prism(pts, 3.0, bev=1.0, seg=2)
    p.add(jitter(bm, 0.25), T(0, 0, -0.6), 'Stone')
    return p


def lamp_post():
    p = Part('LampPost')
    p.add(cyl(9, 7, 6, 16, bev=1), T(0, 0, 3), 'Iron')
    p.add(cyl(3.2, 2.4, 100, 12), T(0, 0, 56), 'Iron')
    for z in (14, 92):
        p.add(torus(3.6, 0.9, 16, 6), T(0, 0, z), 'Brass')
    base = 106.0
    p.add(cyl(8.5, 6.5, 3, 4, bev=0.5), T(0, 0, base) @ Rz(math.pi / 4), 'Brass')
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.add(box(1.3, 1.3, 20, bev=0.3), T(sx * 6, sy * 6, base + 11.5), 'Brass')
    p.add(box(11, 11, 18), T(0, 0, base + 11.5), 'Glass')
    p.add(cyl(10.5, 2.0, 8, 4, bev=0.4), T(0, 0, base + 25) @ Rz(math.pi / 4), 'Brass')
    p.add(sphere(2.2, 10, 6), T(0, 0, base + 30), 'Brass')
    return p


def main():
    os.makedirs(OUT, exist_ok=True)
    reset()
    parts = [timber_section(), timber_post(), hedge(), tree(), flower(), paver('Paver1'), paver('Paver2'), paver('Paver3'), lamp_post()]
    pivots = []
    for i, part in enumerate(parts):
        pv = part.build()
        pv.location.x = i * 300  # spread out so pieces don't occlude each other while baking
        pivots.append(pv)
    meshes = [pt.mesh_ob for pt in parts]
    bpy.context.view_layer.update()
    bake_ao(meshes, distance=18.0, samples=32)
    for pv in pivots:
        pv.location.x = 0
    export_glb(os.path.join(OUT, 'garden.glb'))
    print('garden', {m.name: sum(len(p.vertices) - 2 for p in m.data.polygons) for m in meshes})
    if '--preview' in sys.argv:
        for i, pv in enumerate(pivots):
            pv.location = ((i % 5) * 150 - 300, (i // 5) * 220, 0)
        preview(os.path.join(OUT, 'garden_preview.png'), target=(0, 100, 60), dist=900, elev=28, azim=-75)


main()
