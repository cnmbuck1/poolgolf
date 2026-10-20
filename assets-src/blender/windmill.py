"""Hole 1 windmill: stone tower on an island, shingled cap, lattice sails, oak sweepers.

Nodes in the exported GLB:
  Body      static tower, island, door, windows, cap, hub housing (the game turns it to face front-left)
  Sails     child of Body; pivot at the hub, spins about its local Y axis (game -Z after export)
  Sweepers  root; pivot at the centre, spins about Z. Matches the physics spinner exactly:
            two crossing capsules of half-length ARM_LEN and radius ARM_R, at ball height.
  Edge      root; flush cobble ring around the pond

Run: python windmill.py -- <out_dir>
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from kit import (Part, Rx, Ry, Rz, T, bake_ao, box, cyl, export_glb, jitter, preview, prism, reset,
                 rnd, sphere, stadium, torus)
import bpy  # noqa: E402

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '.'

ARM_LEN = 82.0   # physics spinner half-length (levels.ts, Hole 1)
ARM_R = 8.0      # physics SPINNER_R
POND_R = 62.0

ISLAND_R = 41.0
ISLAND_H = 7.0
BASE_R = 34.0    # tower radius at the bottom
TOP_R = 26.0
TOWER_H = 122.0
CAP_H = 44.0
FRONT = -math.pi / 2  # angle of the -Y direction (faces the camera in game)


def radius_at(z):
    t = max(0.0, min(1.0, (z - ISLAND_H) / TOWER_H))
    return BASE_R + (TOP_R - BASE_R) * t


def stone_ring(part, r_out, z0, height, course_h, avg_w, depth, skip=None, mat_name='Stone'):
    """Courses of individually bevelled stones around a (tapering) cylinder."""
    courses = max(1, round(height / course_h))
    ch = height / courses
    for c in range(courses):
        zc = z0 + ch * (c + 0.5)
        r = r_out(zc) if callable(r_out) else r_out
        n = max(6, round(2 * math.pi * r / avg_w))
        offset = (c % 2) * 0.5 + rnd.uniform(-0.1, 0.1)
        for i in range(n):
            a = 2 * math.pi * (i + offset) / n
            if skip and skip(a, zc):
                continue
            w = 2 * math.pi * r / n - 1.3
            w *= rnd.uniform(0.85, 1.05)
            h = ch - 1.3 + rnd.uniform(-0.6, 0.3)
            d = depth * rnd.uniform(0.85, 1.1)
            bm = jitter(box(w, d, h, bev=1.4), 0.35)
            m = T(math.cos(a) * (r - d / 2 + 0.8), math.sin(a) * (r - d / 2 + 0.8), zc) @ Rz(a + math.pi / 2) @ Rx(rnd.uniform(-0.04, 0.04))
            part.add(bm, m, mat_name)


def ang_diff(a, b):
    return abs((a - b + math.pi) % (2 * math.pi) - math.pi)


DOOR_W, DOOR_H = 20.0, 34.0
WINDOWS = [(FRONT, 92.0), (FRONT + 1.15, 66.0), (FRONT - 1.15, 66.0)]
WIN_W, WIN_H = 11.0, 15.0


def opening(a, z):
    r = radius_at(z)
    if z < ISLAND_H + DOOR_H + 2 and ang_diff(a, FRONT) * r < DOOR_W / 2 + 4:
        return True
    for wa, wz in WINDOWS:
        if abs(z - wz) < WIN_H / 2 + 3 and ang_diff(a, wa) * r < WIN_W / 2 + 3:
            return True
    return False


def on_wall(a, z, out=0.0):
    """Matrix that places local XZ on the tower surface at angle a, height z (local -Y points outward)."""
    r = radius_at(z) + out
    return T(math.cos(a) * r, math.sin(a) * r, z) @ Rz(a + math.pi / 2)


def build_body():
    body = Part('Body')

    # Island: two courses of large stones, a mortar core and a capstone ring
    stone_ring(body, ISLAND_R, 0.0, ISLAND_H - 1.2, 3.6, 15, 7)
    body.add(cyl(ISLAND_R - 4, ISLAND_R - 4, ISLAND_H, 40), T(0, 0, ISLAND_H / 2), 'Mortar')
    n = 22
    for i in range(n):
        a = 2 * math.pi * i / n
        bm = jitter(box(2 * math.pi * (ISLAND_R - 3) / n - 1.0, 8, 2.4, bev=1.0), 0.25)
        body.add(bm, T(math.cos(a) * (ISLAND_R - 3.5), math.sin(a) * (ISLAND_R - 3.5), ISLAND_H - 0.6) @ Rz(a + math.pi / 2), 'Stone')

    # Tower: tapered mortar core with coursed stones on top
    body.add(cyl(BASE_R - 3, TOP_R - 3, TOWER_H, 40), T(0, 0, ISLAND_H + TOWER_H / 2), 'Mortar')
    stone_ring(body, radius_at, ISLAND_H, TOWER_H, 9.0, 15.5, 6.5, skip=opening)

    # Brass bands at the foot and under the cap
    body.add(torus(BASE_R + 0.6, 1.5, 48, 8), T(0, 0, ISLAND_H + 9.5), 'Brass')
    body.add(torus(TOP_R + 0.8, 1.6, 48, 8), T(0, 0, ISLAND_H + TOWER_H - 3), 'Brass')

    # Door: recessed oak planks, iron straps, brass ring, stone lintel and jambs
    zb = ISLAND_H
    for k in range(5):
        x = -DOOR_W / 2 + DOOR_W / 5 * (k + 0.5)
        body.add(box(DOOR_W / 5 - 0.5, 2.2, DOOR_H, bev=0.5), on_wall(FRONT, zb + DOOR_H / 2, -3.5) @ T(x, 0, 0), 'Oak')
    for zz in (zb + 8, zb + DOOR_H - 8):
        body.add(box(DOOR_W - 2, 1.0, 2.2, bev=0.3), on_wall(FRONT, zz, -2.2), 'Iron')
    body.add(torus(2.4, 0.5, 16, 6), on_wall(FRONT, zb + DOOR_H / 2, -1.8) @ T(5, 0, 0) @ Rx(math.pi / 2), 'Brass')
    body.add(jitter(box(DOOR_W + 10, 8, 6, bev=1.4), 0.3), on_wall(FRONT, zb + DOOR_H + 3, -1.5), 'Stone')
    for side in (-1, 1):
        for k in range(4):
            body.add(jitter(box(5, 7, DOOR_H / 4 - 1, bev=1.2), 0.3), on_wall(FRONT, zb + DOOR_H / 8 * (2 * k + 1), -1.2) @ T(side * (DOOR_W / 2 + 2.6), 0, 0), 'Stone')
    body.add(box(DOOR_W + 2, 6, 1.6, bev=0.5), on_wall(FRONT, zb + 1.0, 0.5), 'Stone')  # doorstep

    # Windows: dark glass, oak frame with mullions, stone sill
    for wa, wz in WINDOWS:
        body.add(box(WIN_W, 1.0, WIN_H), on_wall(wa, wz, -3.8), 'Glass')
        for x in (-WIN_W / 2, 0, WIN_W / 2):
            body.add(box(1.6, 2.4, WIN_H + 1.6, bev=0.4), on_wall(wa, wz, -3.0) @ T(x, 0, 0), 'Oak')
        for z in (-WIN_H / 2, 0, WIN_H / 2):
            body.add(box(WIN_W + 1.6, 2.4, 1.6, bev=0.4), on_wall(wa, wz, -3.0) @ T(0, 0, z), 'Oak')
        body.add(jitter(box(WIN_W + 6, 6, 2.6, bev=1.0), 0.2), on_wall(wa, wz - WIN_H / 2 - 2.4, 0.3), 'Stone')
        body.add(jitter(box(WIN_W + 6, 6, 3.2, bev=1.0), 0.2), on_wall(wa, wz + WIN_H / 2 + 2.6, -0.4), 'Stone')

    # Cap: oak eave ring, dark core, overlapping shingles, brass finial
    z_cap = ISLAND_H + TOWER_H
    body.add(cyl(TOP_R + 5, TOP_R + 5, 4, 40, bev=0.8), T(0, 0, z_cap + 1), 'Oak')
    body.add(cyl(TOP_R + 3, 1.5, CAP_H, 40), T(0, 0, z_cap + 3 + CAP_H / 2), 'DarkWood')
    rows = 8
    slope = math.atan2(CAP_H, TOP_R + 3)
    for row in range(rows):
        t = (row + 0.25) / rows
        z = z_cap + 3 + CAP_H * t
        r = (TOP_R + 3) * (1 - t) + 1.0
        n = max(5, round(2 * math.pi * r / 8.5))
        for i in range(n):
            a = 2 * math.pi * (i + 0.5 * (row % 2)) / n
            w = 2 * math.pi * r / n * 1.08
            sh = jitter(box(w, 1.3, CAP_H / rows * 1.9, bev=0.4), 0.15)
            m = T(math.cos(a) * (r + 0.9), math.sin(a) * (r + 0.9), z) @ Rz(a + math.pi / 2) @ Rx(-(math.pi / 2 - slope)) @ Rx(rnd.uniform(-0.05, 0.05))
            body.add(sh, m, 'Shingle')
    body.add(sphere(3.4, 16, 10), T(0, 0, z_cap + CAP_H + 5), 'Brass')
    body.add(cyl(0.9, 0.3, 14, 8), T(0, 0, z_cap + CAP_H + 13), 'Brass')

    # Hub housing on the front face
    hub_z = z_cap - 14
    hub_y = -(radius_at(hub_z) + 3)
    body.add(cyl(8.5, 7.5, 10, 24, bev=1.0), T(0, hub_y, hub_z) @ Rx(math.pi / 2), 'Brass')
    for k in range(6):
        a = 2 * math.pi * k / 6
        body.add(cyl(1.1, 1.1, 1.5, 8), T(math.cos(a) * 6.2, hub_y - 5.4, hub_z + math.sin(a) * 6.2) @ Rx(math.pi / 2), 'Iron')
    return body, (0.0, hub_y - 6.0, hub_z)


def build_sails():
    """Four lattice sails around local Y (the axle). Built in local space, origin at the hub."""
    sails = Part('Sails')
    L = 74.0
    for i in range(4):
        R = Ry(i * math.pi / 2)
        sails.add(box(4.2, 4.2, L, bev=0.8), R @ T(0, 0, L / 2 + 4), 'Oak')                      # stock
        sails.add(box(2.4, 2.6, L - 16, bev=0.5), R @ T(28, -0.6, (L - 16) / 2 + 18), 'Oak')       # outer rail
        for k in range(9):
            z = 18 + k * (L - 18) / 8
            sails.add(box(28.5, 2.2, 1.9, bev=0.5), R @ T(14.3, -1.2, z), 'Oak')                   # bars
        for k in range(5):
            x = 3.5 + k * 5.3
            sails.add(box(4.8, 1.0, L - 18, bev=0.25), R @ T(x, 1.4, (L - 18) / 2 + 18) @ Rx(rnd.uniform(-0.01, 0.01)), 'Plank')
    # Hub boss: brass cap, iron bolts, axle
    sails.add(cyl(9, 9, 6, 28, bev=1.4), Rx(math.pi / 2) @ T(0, 0, 0), 'Brass')
    sails.add(sphere(6.5, 20, 12), T(0, -3.5, 0), 'Brass')
    for k in range(8):
        a = 2 * math.pi * k / 8
        sails.add(cyl(0.9, 0.9, 1.6, 8), T(math.cos(a) * 7.2, -3.4, math.sin(a) * 7.2) @ Rx(math.pi / 2), 'Iron')
    sails.add(cyl(3.2, 3.2, 12, 16), T(0, 6, 0) @ Rx(math.pi / 2), 'Iron')
    return sails


def build_sweepers():
    """Oak paddles on a brass collar; footprint = the physics capsules (centre..ARM_LEN, radius ARM_R)."""
    sw = Part('Sweepers')
    inner = BASE_R + 3.5
    for i in range(4):
        R = Rz(i * math.pi / 2)
        sw.add(prism(stadium(inner, ARM_LEN, ARM_R - 0.2), 13.2, bev=1.6, seg=2), R @ T(0, 0, 1.6), 'Oak')
        sw.add(prism(stadium(ARM_LEN - 3.5, ARM_LEN, ARM_R + 0.1), 14.2, bev=0.6, seg=1), R @ T(0, 0, 1.1), 'Brass')   # brass shoe
        for x in (inner + 8, (inner + ARM_LEN) / 2, ARM_LEN - 9):
            sw.add(sphere(1.5, 10, 6), R @ T(x, 0, 14.6), 'Brass')
    sw.add(torus(inner + 0.5, 3.0, 56, 10), T(0, 0, 8.5), 'Brass')
    sw.add(cyl(inner + 0.5, inner + 0.5, 12, 56), T(0, 0, 8.4), 'Iron')
    return sw


def build_edge():
    edge = Part('Edge')
    n = 40
    for i in range(n):
        a = 2 * math.pi * (i + rnd.uniform(-0.15, 0.15)) / n
        r = POND_R + 4.5
        w = 2 * math.pi * r / n * rnd.uniform(0.75, 0.95)
        bm = jitter(box(w, rnd.uniform(7, 9.5), rnd.uniform(2.6, 3.6), bev=1.3), 0.5)
        edge.add(bm, T(math.cos(a) * r, math.sin(a) * r, 0.8) @ Rz(a + math.pi / 2 + rnd.uniform(-0.15, 0.15)), 'Stone')
    return edge


def main():
    reset()
    body_part, hub = build_body()
    body = body_part.build()
    sails_part = build_sails()
    sails = sails_part.build(parent=body)
    sails.location = hub
    sweep_part, edge_part = build_sweepers(), build_edge()
    sweep_part.build()
    edge_part.build()
    objs = [p.mesh_ob for p in (body_part, sails_part, sweep_part, edge_part)]
    bpy.context.view_layer.update()
    bake_ao(objs, distance=26.0, samples=32)
    os.makedirs(OUT, exist_ok=True)
    export_glb(os.path.join(OUT, 'windmill.glb'))
    if '--preview' in sys.argv:
        preview(os.path.join(OUT, 'windmill_preview.png'), target=(0, 0, 70), dist=420, elev=28, azim=-70)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
    print('windmill triangles', tris)


main()
