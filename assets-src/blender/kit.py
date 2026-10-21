"""Shared modelling helpers for the Rack & Roll asset scripts (Blender 5.x, run headless via `bpy`).

Units are game units (the ball has radius 12). Blender is Z-up; the glTF exporter
converts to Y-up, so Blender -Y becomes the game's +Z (toward the default camera).
"""
import math
import random

import bpy  # must come before bmesh
import bmesh  # noqa: E402
from mathutils import Matrix, Vector

rnd = random.Random(7)

# Material slots. The game replaces these by name with its shared PBR materials,
# so the colours here only matter for the preview render.
PALETTE = {
    'Stone': ((0.55, 0.52, 0.48), 0.85, 0.0),
    'Mortar': ((0.18, 0.16, 0.14), 0.95, 0.0),
    'Brick': ((0.52, 0.22, 0.14), 0.85, 0.0),
    'Oak': ((0.45, 0.24, 0.10), 0.45, 0.0),
    'DarkWood': ((0.16, 0.08, 0.04), 0.6, 0.0),
    'Plank': ((0.55, 0.30, 0.13), 0.6, 0.0),
    'Shingle': ((0.36, 0.17, 0.08), 0.75, 0.0),
    'Brass': ((0.83, 0.62, 0.30), 0.28, 1.0),
    'Iron': ((0.12, 0.11, 0.10), 0.5, 0.7),
    'Glass': ((1.0, 0.75, 0.4), 0.15, 0.0),
    'Hole': ((0.02, 0.015, 0.01), 1.0, 0.0),
    'Timber': ((0.36, 0.24, 0.14), 0.7, 0.0),
    'Leaf': ((0.12, 0.32, 0.08), 0.8, 0.0),
    'Bark': ((0.22, 0.14, 0.08), 0.9, 0.0),
    'Petal': ((0.9, 0.9, 0.9), 0.6, 0.0),
    'FlowerCenter': ((0.95, 0.75, 0.15), 0.7, 0.0),
}


_mats = {}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()  # the old material datablocks are gone



def mat(name):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    col, rough, metal = PALETTE[name]
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*col, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if name == 'Glass':
        bsdf.inputs['Emission Color'].default_value = (1.0, 0.65, 0.3, 1)
        bsdf.inputs['Emission Strength'].default_value = 3.0
    _mats[name] = m
    return m


# ---------- primitive makers (each returns a fresh bmesh centred on the origin) ----------

def bevel(bm, amount, segments=1):
    if amount > 0:
        bmesh.ops.bevel(bm, geom=bm.verts[:] + bm.edges[:], offset=amount, segments=segments,
                        profile=0.5, affect='EDGES', clamp_overlap=True)
    return bm


def box(sx, sy, sz, bev=0.0, seg=1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    return bevel(bm, min(bev, sx / 2.2, sy / 2.2, sz / 2.2), seg)


def cyl(r1, r2, h, segs=16, bev=0.0, seg=1):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=h)
    if bev > 0:
        caps = [e for e in bm.edges if len(e.link_faces) == 2 and abs(e.link_faces[0].normal.z) != abs(e.link_faces[1].normal.z)]
        bmesh.ops.bevel(bm, geom=caps, offset=bev, segments=seg, profile=0.5, affect='EDGES', clamp_overlap=True)
    return bm


def sphere(r, u=16, v=10):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r)
    return bm


def torus(R, r, major=32, minor=8):
    bm = bmesh.new()
    rings = []
    for i in range(major):
        a = 2 * math.pi * i / major
        ring = []
        for j in range(minor):
            b = 2 * math.pi * j / minor
            d = R + r * math.cos(b)
            ring.append(bm.verts.new((d * math.cos(a), d * math.sin(a), r * math.sin(b))))
        rings.append(ring)
    for i in range(major):
        for j in range(minor):
            a, b = rings[i], rings[(i + 1) % major]
            bm.faces.new((a[j], b[j], b[(j + 1) % minor], a[(j + 1) % minor]))
    return bm


def prism(outline, h, bev=0.0, seg=2):
    """Extrude a closed 2D outline (list of (x, y)) from z=0 to z=h, bevelling the top and bottom rims."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, 0)) for x, y in outline]
    f = bm.faces.new(vs)
    if f.normal.z > 0:
        f.normal_flip()
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [v for v in ext['geom'] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, h), verts=top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bev > 0:
        rims = [e for e in bm.edges if any(abs(fc.normal.z) > 0.9 for fc in e.link_faces)]
        bmesh.ops.bevel(bm, geom=rims, offset=bev, segments=seg, profile=0.5, affect='EDGES', clamp_overlap=True)
    return bm


def stadium(x0, x1, r, segs=10):
    """Plan outline of a capsule whose end-cap centres are at (x0, 0) and (x1, 0)."""
    pts = []
    for i in range(segs + 1):
        a = -math.pi / 2 + math.pi * i / segs
        pts.append((x1 + r * math.cos(a), r * math.sin(a)))
    for i in range(segs + 1):
        a = math.pi / 2 + math.pi * i / segs
        pts.append((x0 + r * math.cos(a), r * math.sin(a)))
    return pts


def jitter(bm, amount):
    for v in bm.verts:
        v.co += Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * amount
    return bm


def T(x=0.0, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))


def Rz(a):
    return Matrix.Rotation(a, 4, 'Z')


def Rx(a):
    return Matrix.Rotation(a, 4, 'X')


def Ry(a):
    return Matrix.Rotation(a, 4, 'Y')


# ---------- accumulator: many parts → one object with one primitive per material ----------

class Part:
    """Collects transformed bmesh parts and builds a single mesh object."""

    def __init__(self, name):
        self.name = name
        self.verts, self.faces, self.mat_idx, self.mats = [], [], [], []

    def add(self, bm, matrix, material):
        name = material
        if name not in self.mats:
            self.mats.append(name)
        mi = self.mats.index(name)
        off = len(self.verts)
        bm.verts.index_update()
        self.verts += [tuple(matrix @ v.co) for v in bm.verts]
        for f in bm.faces:
            self.faces.append([off + v.index for v in f.verts])
            self.mat_idx.append(mi)
        bm.free()
        return self

    def build(self, smooth_deg=40, uv_scale=100.0, parent=None):
        me = bpy.data.meshes.new(self.name)
        me.from_pydata(self.verts, [], self.faces)
        for m in self.mats:
            me.materials.append(mat(m))
        for p, mi in zip(me.polygons, self.mat_idx):
            p.material_index = mi
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        lim = math.radians(smooth_deg)
        for e in bm.edges:
            e.smooth = len(e.link_faces) == 2 and e.calc_face_angle(math.pi) < lim
        for f in bm.faces:
            f.smooth = True
        # Box-projected UVs in world units / uv_scale; the game's tiling textures do the rest.
        uv = bm.loops.layers.uv.new('UVMap')
        for f in bm.faces:
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            a, b = [(1, 2), (0, 2), (0, 1)][ax]
            for lp in f.loops:
                lp[uv].uv = (lp.vert.co[a] / uv_scale, lp.vert.co[b] / uv_scale)
        bm.to_mesh(me)
        bm.free()
        # An empty pivot named after the part, with the mesh as its child. Compression stores
        # quantization offsets on the mesh node, so the game only ever moves the pivot.
        pivot = bpy.data.objects.new(self.name, None)
        bpy.context.scene.collection.objects.link(pivot)
        ob = bpy.data.objects.new(self.name + 'Mesh', me)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = pivot
        if parent is not None:
            pivot.parent = parent
        self.mesh_ob = ob
        return pivot


# ---------- baking and export ----------

def bake_ao(objects, distance=30.0, samples=48):
    """Bake ambient occlusion into a vertex colour layer on each object (cheap contact shading in game)."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    if scene.world is None:
        scene.world = bpy.data.worlds.new('World')
    scene.world.light_settings.distance = distance
    for ob in objects:
        me = ob.data
        attr = me.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER')
        me.color_attributes.active_color = attr
        for o in bpy.context.scene.objects:
            o.select_set(False)
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        with bpy.context.temp_override(active_object=ob, selected_objects=[ob], object=ob):
            bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')


def export_glb(path, objects=None):
    for o in bpy.context.scene.objects:
        o.select_set(objects is None or o in objects)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_yup=True, export_apply=True,
        export_normals=True, export_materials='EXPORT', use_selection=objects is not None,
        export_vertex_color='ACTIVE', export_all_vertex_colors=False,
    )


def preview(path, target=(0, 0, 40), dist=320, elev=35, azim=-60, size=(900, 700), samples=24):
    """Quick Cycles render to check a model without the game."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new('World')
    w = scene.world
    bg = w.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.25, 0.2, 0.16, 1)
    bg.inputs['Strength'].default_value = 0.6
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 50
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    e, a = math.radians(elev), math.radians(azim)
    tgt = Vector(target)
    cam.location = tgt + Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e))) * dist
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    sun_data = bpy.data.lights.new('sun', 'SUN')
    sun_data.energy = 3.5
    sun_data.angle = math.radians(8)
    sun = bpy.data.objects.new('sun', sun_data)
    sun.rotation_euler = (math.radians(40), math.radians(10), math.radians(-30))
    scene.collection.objects.link(sun)
    ground = bpy.data.meshes.new('ground')
    ground.from_pydata([(-600, -600, 0), (600, -600, 0), (600, 600, 0), (-600, 600, 0)], [], [(0, 1, 2, 3)])
    g = bpy.data.objects.new('ground', ground)
    gm = bpy.data.materials.new('turf_preview')
    gm.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (0.1, 0.35, 0.08, 1)
    ground.materials.append(gm)
    scene.collection.objects.link(g)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for o in (cam, sun, g):
        bpy.data.objects.remove(o)
