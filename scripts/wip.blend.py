"""Builds the work-in-progress builder bot and writes public/models/wip.glb.

Run: npm run wip   (Blender headless, rerunnable, no inputs)
Previews: npm run wip -- --preview <dir>   also renders a strip of frames per clip into <dir>.

The bot is one skinned mesh: every part is rigidly weighted to one bone, so nothing can come apart.
Every bone points along +Y with no roll, so a pose bone's local axes are the world axes at rest:
  rx > 0 tips the top of a bone toward the camera (-Y is the bot's front), arms swing forward with rx < 0
  ry > 0 rolls toward -X (the bot's right), rz > 0 turns to face +X (the bot's left, screen right)
Clips are written as functions of time, sampled every frame, so easing, overshoot and the antenna's spring
are plain Python. All clips start and end near rest so the page can crossfade any pair.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "models", "wip.glb")
FPS = 30
ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
PREVIEW = ARGS[ARGS.index("--preview") + 1] if "--preview" in ARGS else None
HIDE = 0.001  # props are "hidden" by scale; zero would make a singular bone matrix

# ---------------------------------------------------------------- palette (sRGB hex -> linear)


def hexc(h):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return tuple(lin(int(h[i : i + 2], 16)) for i in (1, 3, 5)) + (1.0,)


C = {
    "shell": hexc("#f4efe6"),
    "vest": hexc("#ff7a3d"),
    "stripe": hexc("#fff2b8"),
    "hat": hexc("#ffc93c"),
    "hatdark": hexc("#e8a91f"),
    "limb": hexc("#55607e"),
    "joint": hexc("#3a4260"),
    "boot": hexc("#2b3cff"),
    "eye": hexc("#1b1f33"),
    "glint": hexc("#ffffff"),
    "cheek": hexc("#ff9fa8"),
    "mouth": hexc("#3a2230"),
    "red": hexc("#ff4d5e"),
    "wood": hexc("#c58b52"),
    "wooddark": hexc("#9c6838"),
    "board": hexc("#fffaf0"),
    "ink": hexc("#1b1f33"),
    "cone": hexc("#ff6a2b"),
    "white": hexc("#ffffff"),
    "brick": hexc("#c8553d"),
    "steel": hexc("#9aa3b5"),
    "steeldark": hexc("#6b7489"),
    "screen": hexc("#2b3cff"),
    "crate": hexc("#d9a066"),
}

# ---------------------------------------------------------------- bones: name, parent, pivot

BONES = [
    ("rig", None, (0, 0, 0)),
    ("root", "rig", (0, 0, 0)),
    ("hips", "root", (0, 0, 0.55)),
    ("body", "hips", (0, 0, 0.6)),
    ("head", "body", (0, 0, 1.3)),
    ("hat", "head", (0, 0, 1.92)),
    ("antenna", "hat", (0, 0, 2.12)),
    ("eye_L", "head", (0.17, -0.37, 1.72)),
    ("eye_R", "head", (-0.17, -0.37, 1.72)),
    ("smile", "head", (0, -0.41, 1.56)),
    ("mouth_o", "head", (0, -0.41, 1.56)),
    ("arm_L", "body", (0.56, 0, 1.18)),
    ("fore_L", "arm_L", (0.56, 0, 0.95)),
    ("hand_L", "fore_L", (0.56, 0, 0.74)),
    ("arm_R", "body", (-0.56, 0, 1.18)),
    ("fore_R", "arm_R", (-0.56, 0, 0.95)),
    ("hand_R", "fore_R", (-0.56, 0, 0.74)),
    ("thigh_L", "hips", (0.2, 0, 0.52)),
    ("shin_L", "thigh_L", (0.2, 0, 0.31)),
    ("foot_L", "shin_L", (0.2, 0, 0.11)),
    ("thigh_R", "hips", (-0.2, 0, 0.52)),
    ("shin_R", "thigh_R", (-0.2, 0, 0.31)),
    ("foot_R", "shin_R", (-0.2, 0, 0.11)),
    ("hammer", "hand_R", (-0.56, 0, 0.72)),
    ("plank", "body", (-0.42, 0, 1.38)),
    ("crate", "root", (0, -0.62, 0)),
    ("laptop", "crate", (0, -0.62, 0.74)),
    ("sign", "rig", (1.5, -0.25, 0)),
    ("cone", "rig", (-1.4, -0.1, 0)),
    ("bricks", "rig", (-1.85, 0.55, 0)),
]
PIVOT = {n: Vector(p) for n, _, p in BONES}
PROPS = ("hammer", "plank", "crate")  # hidden unless a clip shows them; laptop rides on the crate
THIGH, SHIN = 0.21, 0.2

# ---------------------------------------------------------------- geometry, built straight into one bmesh

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
bm = bmesh.new()
DEFORM = bm.verts.layers.deform.verify()
COL = bm.loops.layers.float_color.new("Col")
GROUP = {n: i for i, (n, _, _) in enumerate(BONES)}


def M(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    s = Matrix.Diagonal(Vector(scale)).to_4x4()
    return Matrix.Translation(Vector(loc)) @ Euler([math.radians(a) for a in rot]).to_matrix().to_4x4() @ s


def finish(verts, bone, color, smooth=True):
    faces = {f for v in verts for f in v.link_faces}
    for v in verts:
        v[DEFORM][GROUP[bone]] = 1.0
    for f in faces:
        f.smooth = smooth
        for l in f.loops:
            l[COL] = color
    return verts


def ball(bone, color, loc, r, scale=(1, 1, 1), rot=(0, 0, 0), seg=(20, 12)):
    v = bmesh.ops.create_uvsphere(bm, u_segments=seg[0], v_segments=seg[1], radius=r, matrix=M(loc, rot, scale))["verts"]
    return finish(v, bone, color)


def box(bone, color, loc, size, rot=(0, 0, 0), bevel=0.04, smooth=True, seg=3):
    v = bmesh.ops.create_cube(bm, size=1, matrix=M(loc, rot, size))["verts"]
    if bevel:
        edges = list({e for x in v for e in x.link_edges})
        geom = bmesh.ops.bevel(bm, geom=edges + v, offset=bevel, segments=seg, profile=0.5, affect="EDGES", clamp_overlap=True)
        v = list(set(v) | set(geom["verts"]))
        v = [x for x in v if x.is_valid]
    return finish(v, bone, color, smooth)


def cyl(bone, color, loc, r1, r2, depth, rot=(0, 0, 0), seg=16, smooth=True):
    v = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=depth, matrix=M(loc, rot))["verts"]
    return finish(v, bone, color, smooth)


def capsule(bone, color, a, b, r):
    """A limb segment: a cylinder between two points with balls on the ends hiding the joints."""
    a, b = Vector(a), Vector(b)
    d = b - a
    mid = (a + b) / 2
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    m = Matrix.Translation(mid) @ q.to_matrix().to_4x4()
    v = bmesh.ops.create_cone(bm, cap_ends=False, cap_tris=False, segments=14, radius1=r, radius2=r, depth=d.length, matrix=m)["verts"]
    finish(v, bone, color)
    ball(bone, color, b, r * 1.02, seg=(14, 8))


def mesh_from(obj, bone, color, matrix):
    """Copies an evaluated object (the WIP text) into the bmesh."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    nv = [bm.verts.new(matrix @ v.co) for v in me.vertices]
    for p in me.polygons:
        try:
            bm.faces.new([nv[i] for i in p.vertices])
        except ValueError:
            pass
    finish(nv, bone, color, smooth=False)
    bpy.data.meshes.remove(me)


def text(body, bone, color, loc, size, rot=(90, 0, 0)):
    cu = bpy.data.curves.new("t", "FONT")
    cu.body = body
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.extrude = 0.025
    cu.bevel_depth = 0.006
    cu.resolution_u = 3
    ob = bpy.data.objects.new("t", cu)
    bpy.context.scene.collection.objects.link(ob)
    mesh_from(ob, bone, color, M(loc, rot, (size, size, size)))
    bpy.data.objects.remove(ob)


# body: a chunky rounded shell wearing a safety vest
box("body", C["shell"], (0, 0, 0.92), (0.86, 0.66, 0.72), bevel=0.2, seg=4)
box("body", C["vest"], (0, -0.005, 0.95), (0.9, 0.69, 0.5), bevel=0.17, seg=4)
for x in (-0.24, 0.24):
    box("body", C["stripe"], (x, -0.35, 0.95), (0.09, 0.02, 0.5), bevel=0.008)
box("body", C["stripe"], (0, -0.352, 0.82), (0.6, 0.02, 0.07), bevel=0.008)
for z in (1.02, 0.9):
    ball("body", C["joint"], (0, -0.35, z), 0.035, seg=(10, 6))
ball("body", C["shell"], (0, 0, 0.62), 0.25, scale=(1.3, 1.1, 0.5))
# neck
cyl("head", C["joint"], (0, 0, 1.33), 0.11, 0.11, 0.12)

# head: a big soft rounded cube, face on its front
box("head", C["shell"], (0, 0, 1.68), (0.82, 0.7, 0.66), bevel=0.24, seg=5)
ball("head", C["cheek"], (0.3, -0.33, 1.6), 0.06, scale=(1, 0.35, 0.65), seg=(12, 8))
ball("head", C["cheek"], (-0.3, -0.33, 1.6), 0.06, scale=(1, 0.35, 0.65), seg=(12, 8))
for s, n in ((1, "eye_L"), (-1, "eye_R")):
    ball(n, C["eye"], (0.17 * s, -0.355, 1.72), 0.075, scale=(0.85, 0.45, 1.15), seg=(16, 10))
    ball(n, C["glint"], (0.17 * s + 0.025, -0.39, 1.755), 0.022, scale=(1, 0.5, 1), seg=(8, 6))
    # ear bolts
    cyl("head", C["joint"], (0.43 * s, 0, 1.66), 0.08, 0.08, 0.06, rot=(0, 90, 0))
    cyl("head", C["steel"], (0.47 * s, 0, 1.66), 0.05, 0.04, 0.05, rot=(0, 90, 0))
# smile: an arc of beads; the "O" mouth hides behind it until a clip scales it up
for i in range(13):
    a = math.pi + math.pi * i / 12
    c = Vector((0.075 * math.cos(a), -0.37, 1.6 + 0.06 * math.sin(a)))
    ball("smile", C["mouth"], c, 0.02, seg=(8, 6))
ball("mouth_o", C["mouth"], (0, -0.36, 1.56), 0.06, scale=(1, 0.4, 1.2), seg=(14, 8))

# hard hat
hat = bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=14, radius=0.47, matrix=M((0, 0, 1.86), scale=(1, 0.95, 0.72)))["verts"]
cut = [v for v in hat if v.co.z < 1.86 - 1e-4]
bmesh.ops.delete(bm, geom=cut, context="VERTS")
hat = [v for v in hat if v.is_valid]
finish(hat, "hat", C["hat"])
cyl("hat", C["hat"], (0, -0.06, 1.87), 0.55, 0.53, 0.05, seg=32)
cyl("hat", C["hatdark"], (0, 0, 1.885), 0.475, 0.475, 0.035, seg=32)
box("hat", C["hatdark"], (0, 0, 2.06), (0.12, 0.8, 0.12), bevel=0.05)
box("hat", C["hatdark"], (0, -0.42, 1.96), (0.16, 0.06, 0.14), rot=(-25, 0, 0), bevel=0.03)
# antenna with a red bobble
cyl("antenna", C["joint"], (0, 0, 2.22), 0.025, 0.02, 0.22, seg=8)
ball("antenna", C["red"], (0, 0, 2.36), 0.065, seg=(14, 8))

# arms
for s, sd in ((1, "L"), (-1, "R")):
    x = 0.56 * s
    ball(f"arm_{sd}", C["joint"], (x, 0, 1.18), 0.11, seg=(14, 8))
    capsule(f"arm_{sd}", C["limb"], (x, 0, 1.18), (x, 0, 0.96), 0.075)
    capsule(f"fore_{sd}", C["limb"], (x, 0, 0.96), (x, 0, 0.78), 0.07)
    ball(f"hand_{sd}", C["shell"], (x, 0, 0.71), 0.105, scale=(1, 0.9, 1.05), seg=(16, 10))
    ball(f"hand_{sd}", C["shell"], (x - 0.07 * s, -0.04, 0.74), 0.045, seg=(10, 6))  # thumb
    # legs
    lx = 0.2 * s
    capsule(f"thigh_{sd}", C["limb"], (lx, 0, 0.52), (lx, 0, 0.32), 0.085)
    capsule(f"shin_{sd}", C["limb"], (lx, 0, 0.32), (lx, 0, 0.14), 0.08)
    box(f"foot_{sd}", C["boot"], (lx, -0.06, 0.07), (0.22, 0.32, 0.14), bevel=0.06)
    box(f"foot_{sd}", C["joint"], (lx, -0.07, 0.012), (0.23, 0.33, 0.025), bevel=0.01)

# hammer: handle runs on down from the fist, head across it; the striking face points back so it lands face-down on a forward swing
cyl("hammer", C["wood"], (-0.56, 0, 0.6), 0.03, 0.035, 0.5, seg=10)
box("hammer", C["steel"], (-0.56, 0.02, 0.36), (0.12, 0.3, 0.12), bevel=0.025)
box("hammer", C["steeldark"], (-0.56, 0.18, 0.36), (0.13, 0.04, 0.13), bevel=0.015)

# plank over the right shoulder, running front to back
box("plank", C["wood"], (-0.42, 0, 1.42), (0.16, 1.5, 0.08), bevel=0.02)
for y in (-0.6, 0.6):
    box("plank", C["wooddark"], (-0.42, y, 1.42), (0.165, 0.04, 0.085), bevel=0.005)

# crate with a laptop on it, in front of the bot; the screen faces the bot so the camera sees the lid
box("crate", C["crate"], (0, -0.62, 0.36), (0.66, 0.42, 0.72), bevel=0.03)
for z in (0.12, 0.6):
    box("crate", C["wooddark"], (0, -0.835, z), (0.68, 0.03, 0.08), bevel=0.01)
box("crate", C["wooddark"], (0, -0.835, 0.36), (0.08, 0.03, 0.62), rot=(0, 52, 0), bevel=0.01)
box("laptop", C["steel"], (0, -0.6, 0.745), (0.52, 0.34, 0.03), bevel=0.012)
box("laptop", C["steel"], (0, -0.76, 0.9), (0.52, 0.03, 0.32), rot=(-12, 0, 0), bevel=0.012)
box("laptop", C["screen"], (0, -0.742, 0.9), (0.46, 0.008, 0.27), rot=(-12, 0, 0), bevel=0.004)
ball("laptop", C["white"], (0, -0.78, 0.91), 0.04, scale=(1, 0.2, 1), seg=(12, 6))

# the WIP sign: two posts, a board, the word and a hazard band
sx, sy = PIVOT["sign"].x, PIVOT["sign"].y
for x in (-0.36, 0.36):
    box("sign", C["wood"], (sx + x, sy + 0.04, 0.6), (0.08, 0.08, 1.2), bevel=0.02)
box("sign", C["board"], (sx, sy, 0.98), (0.98, 0.06, 0.56), bevel=0.04)
text("WIP", "sign", C["ink"], (sx, sy - 0.035, 1.03), 0.34)
for i in range(7):
    x = sx - 0.42 + i * 0.14
    box("sign", C["ink"] if i % 2 else C["hat"], (x, sy - 0.034, 0.78), (0.14, 0.012, 0.09), bevel=0)
# traffic cone
cx, cy = PIVOT["cone"].x, PIVOT["cone"].y
box("cone", C["cone"], (cx, cy, 0.025), (0.5, 0.5, 0.05), bevel=0.02)
cyl("cone", C["cone"], (cx, cy, 0.36), 0.2, 0.04, 0.62, seg=20)
cyl("cone", C["white"], (cx, cy, 0.34), 0.122, 0.104, 0.09, seg=20)
cyl("cone", C["white"], (cx, cy, 0.16), 0.168, 0.15, 0.08, seg=20)
# brick stack
bx, by = PIVOT["bricks"].x, PIVOT["bricks"].y
for i, (x, z, r) in enumerate([(-0.15, 0.09, 2), (0.16, 0.09, -3), (0.0, 0.27, 6), (-0.05, 0.45, -8)]):
    box("bricks", C["brick"], (bx + x, by, z), (0.3, 0.17, 0.17), rot=(0, 0, r), bevel=0.025)

# ---------------------------------------------------------------- objects

scene = bpy.context.scene

me = bpy.data.meshes.new("wip")
bm.to_mesh(me)
bm.free()
me.color_attributes.active_color_name = "Col"
me.color_attributes.render_color_index = me.color_attributes.active_color_index

arm = bpy.data.objects.new("rig", bpy.data.armatures.new("rig"))
scene.collection.objects.link(arm)
bot = bpy.data.objects.new("bot", me)
scene.collection.objects.link(bot)
for n, _, _ in BONES:
    bot.vertex_groups.new(name=n)
bot.parent = arm
bot.modifiers.new("rig", "ARMATURE").object = arm

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
for n, parent, p in BONES:
    eb = arm.data.edit_bones.new(n)
    eb.head = p
    eb.tail = Vector(p) + Vector((0, 0.12, 0))
    eb.roll = 0
    if parent:
        eb.parent = arm.data.edit_bones[parent]
        eb.use_connect = False
bpy.ops.object.mode_set(mode="OBJECT")
for pb in arm.pose.bones:
    pb.rotation_mode = "XYZ"

# ---------------------------------------------------------------- animation helpers


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


EASE = {
    "lin": lambda u: u,
    "io": lambda u: 4 * u**3 if u < 0.5 else 1 - (-2 * u + 2) ** 3 / 2,
    "i": lambda u: u**3,
    "o": lambda u: 1 - (1 - u) ** 3,
    "back": lambda u: 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2,
    "el": lambda u: 0 if u == 0 else 1 if u == 1 else 2 ** (-10 * u) * math.sin((u * 10 - 0.75) * 2 * math.pi / 3) + 1,
    "snap": lambda u: 1 - (1 - u) ** 5,
}


def K(t, *keys):
    """Piecewise eased curve: keys are (time, value) or (time, value, ease into this key). Values are numbers or tuples."""
    if t <= keys[0][0]:
        return keys[0][1]
    for a, b in zip(keys, keys[1:]):
        if t <= b[0]:
            u = EASE[b[2] if len(b) > 2 else "io"](clamp((t - a[0]) / max(b[0] - a[0], 1e-6)))
            if isinstance(a[1], tuple):
                return tuple(x + (y - x) * u for x, y in zip(a[1], b[1]))
            return a[1] + (b[1] - a[1]) * u
    return keys[-1][1]


def pulse(t, t0, dur):
    """0 -> 1 -> 0 over dur starting at t0, smooth."""
    u = (t - t0) / dur
    return math.sin(math.pi * u) ** 2 if 0 < u < 1 else 0.0


def wobble(t, t0, amp, freq=4.0, decay=4.0):
    """A decaying shake after an impact at t0."""
    if t < t0:
        return 0.0
    d = t - t0
    return amp * math.exp(-decay * d) * math.sin(2 * math.pi * freq * d)


class Pose(dict):
    def b(self, n):
        return self.setdefault(n, [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0])

    def r(self, n, x=0, y=0, z=0):
        p = self.b(n)
        p[3] += x
        p[4] += y
        p[5] += z
        return self

    def l(self, n, x=0, y=0, z=0):
        p = self.b(n)
        p[0] += x
        p[1] += y
        p[2] += z
        return self

    def s(self, n, x=1, y=1, z=1):
        p = self.b(n)
        p[6] *= x
        p[7] *= y
        p[8] *= z
        return self


def base(P):
    """Relaxed stance every clip builds on: arms a touch out, elbows soft, props away."""
    P.r("arm_L", y=-6).r("arm_R", y=6).r("fore_L", x=-10).r("fore_R", x=-10)
    for n in PROPS:
        P.s(n, HIDE, HIDE, HIDE)
    P.s("mouth_o", HIDE, HIDE, HIDE)


def show(P, n, k):
    """Scales a prop in from hidden; k = 0 hidden, 1 shown (overshoot allowed)."""
    v = max(k, HIDE) / HIDE
    P.s(n, v, v, v)


def crouch(P, d, lean=0.0):
    """Drops the hips by d with both feet planted: thigh forward, shin back, foot level."""
    d = clamp(d, -0.05, 0.38)
    a = math.degrees(math.acos(clamp(1 - max(d, 0) / (THIGH + SHIN), -1, 1)))
    for sd in "LR":
        P.r(f"thigh_{sd}", x=-a).r(f"shin_{sd}", x=2 * a).r(f"foot_{sd}", x=-a)
    P.l("hips", z=-d)
    P.r("body", x=a * 0.25 + lean)


def blink(P, t, t0, dur=0.16):
    k = 1 - 0.92 * pulse(t, t0, dur)
    P.s("eye_L", 1, 1, k).s("eye_R", 1, 1, k)


def squash(P, k):
    """k < 0 squashes the torso, k > 0 stretches it, volume roughly kept."""
    P.s("body", 1 - 0.5 * k, 1 - 0.5 * k, 1 + k)


def walk(P, phase, amp=1.0, arms=True):
    s = math.sin(phase)
    c = math.cos(phase)
    P.r("thigh_L", x=-28 * amp * s).r("thigh_R", x=28 * amp * s)
    P.r("shin_L", x=35 * amp * max(0, c)).r("shin_R", x=35 * amp * max(0, -c))
    P.r("foot_L", x=-10 * amp * s).r("foot_R", x=10 * amp * s)
    P.l("hips", z=0.035 * amp * abs(c) - 0.01 * amp)
    P.r("body", z=6 * amp * s, x=3 * amp).r("head", z=-4 * amp * s)
    if arms:
        P.r("arm_L", x=24 * amp * s).r("arm_R", x=-24 * amp * s)


def look(P, yaw, pitch=0.0, eyes=True):
    P.r("head", z=yaw, x=pitch, y=-yaw * 0.12)
    if eyes:
        ex, ez = clamp(yaw / 30, -1, 1) * 0.03, clamp(-pitch / 20, -1, 1) * 0.02
        P.l("eye_L", x=ex, z=ez).l("eye_R", x=ex, z=ez)


def eyes(P, k):
    P.s("eye_L", k, 1, k).s("eye_R", k, 1, k)


def happy_eyes(P, k):
    """Squints into upturned arcs: k = 0 normal, 1 fully happy."""
    P.s("eye_L", 1 + 0.15 * k, 1, 1 - 0.65 * k).s("eye_R", 1 + 0.15 * k, 1, 1 - 0.65 * k)
    P.l("eye_L", z=0.015 * k).l("eye_R", z=0.015 * k)


def mouth_o(P, k):
    """Swaps the smile for an open "O" mouth: k = 0 smile, 1 O."""
    show(P, "mouth_o", k)
    s = max(1 - k, HIDE)
    P.s("smile", s, s, s)


def jiggle(P, n, t, t0, amp, freq=5.0, axis="y"):
    P.r(n, **{axis: wobble(t, t0, amp, freq)})


# ---------------------------------------------------------------- clips


def idle(t):
    P = Pose()
    base(P)
    br = math.sin(2 * math.pi * t / 2)
    squash(P, 0.022 * br)
    P.r("head", x=1.5 * math.sin(2 * math.pi * t / 2 + 0.6))
    yaw = K(t, (0, 0), (0.7, 0), (1.05, 30, "back"), (1.8, 30), (2.15, -26, "back"), (2.9, -26), (3.35, 0), (4, 0))
    tilt = K(t, (0, 0), (0.7, 0), (1.05, 7, "back"), (1.8, 7), (2.15, -7, "back"), (2.9, -7), (3.35, 0), (4, 0))
    look(P, yaw, -3 * pulse(t, 0.9, 1.0))
    P.r("head", y=tilt)
    blink(P, t, 1.5)
    blink(P, t, 3.45)
    blink(P, t, 3.68)
    sway = math.sin(2 * math.pi * t / 4)
    P.r("arm_L", x=4 * sway, y=-2 * br).r("arm_R", x=-4 * sway, y=2 * br)
    P.r("body", y=1.5 * sway)
    tap = sum(pulse(t, t0, 0.22) for t0 in (2.4, 2.65))
    P.r("foot_R", x=-18 * tap)
    return P


def wave(t):
    P = Pose()
    base(P)
    dip = K(t, (0, 0), (0.25, 0.08), (0.42, -0.02, "o"), (0.6, 0, "io"), (2.6, 0), (2.8, 0.04), (3.1, 0))
    crouch(P, max(dip, 0))
    P.l("root", z=K(t, (0, 0), (0.28, 0), (0.4, 0.12, "o"), (0.55, 0, "i"), (3.2, 0)))
    squash(P, K(t, (0, 0), (0.25, -0.1), (0.4, 0.1), (0.55, -0.12), (0.75, 0.02, "back"), (0.9, 0), (3.2, 0)))
    up = K(t, (0, 0), (0.3, -0.05), (0.62, 1, "back"), (2.45, 1), (2.85, 0, "io"), (3.2, 0))
    P.r("arm_R", y=150 * up, x=-15 * up)
    w = math.sin(2 * math.pi * 2.6 * (t - 0.6)) if 0.6 < t < 2.5 else 0
    ramp = clamp((t - 0.6) / 0.2) * clamp((2.5 - t) / 0.2)
    P.r("fore_R", y=28 * w * ramp - 20 * up, x=10 * up)
    P.r("hand_R", y=12 * w * ramp)
    P.r("body", y=-4 * up + 3 * w * ramp, z=-8 * up)
    P.r("arm_L", y=-12 * up, x=8 * up).r("fore_L", x=-25 * up)
    look(P, -6 * up, -4 * up)
    P.r("head", y=12 * up + 4 * w * ramp)
    happy_eyes(P, clamp(up * 1.2))
    P.s("smile", 1 + 0.35 * up, 1, 1 + 0.35 * up)
    blink(P, t, 2.9)
    return P


def hammer(t):
    P = Pose()
    base(P)
    face = K(t, (0, 0), (0.15, -6), (0.55, 74, "back"), (4.25, 74), (4.75, 0, "io"), (5.2, 0))
    P.r("root", z=face)
    P.l("root", x=K(t, (0, 0), (0.6, 0.4), (4.2, 0.4), (4.8, 0), (5.2, 0)), y=K(t, (0, 0), (0.6, 0.45), (4.2, 0.45), (4.8, 0), (5.2, 0)))
    steps = clamp(t / 0.6) if t < 0.6 else clamp((t - 4.2) / 0.6) if 4.2 < t < 4.8 else 0
    if 0 < steps < 1:
        walk(P, steps * 2 * math.pi, 0.8 * math.sin(math.pi * steps), arms=False)
    show(P, "hammer", K(t, (0, 0), (0.45, 0), (0.7, 1, "back"), (4.0, 1), (4.15, 1.2), (4.3, 0, "i"), (5.2, 0)))
    # strikes: (impact time, windup length, size)
    strikes = [(1.3, 0.45, 0.8), (1.85, 0.3, 0.8), (2.4, 0.3, 0.85), (3.55, 0.6, 1.25)]
    arm, fore, lean, hop, sq = -15.0, -20.0, 0.0, 0.0, 0.0
    for i, (ti, wl, big) in enumerate(strikes):
        prev = strikes[i - 1][0] if i else 0.7
        if prev < t <= ti + 0.25:
            u0 = ti - wl
            arm = K(t, (prev, -80 if i else -15), (u0 + wl * 0.85, -165 * min(big, 1.05) - 10 * (big - 0.8), "o"), (ti, -84, "i"), (ti + 0.25, -80, "o"))
            fore = K(t, (prev, -10 if i else -20), (u0 + wl * 0.85, -55 * big, "o"), (ti, -5, "i"), (ti + 0.25, -12))
            lean = K(t, (prev, 6 if i else 0), (u0 + wl * 0.85, -12 * big, "o"), (ti, 16 * big, "i"), (ti + 0.25, 6))
            if big > 1:
                hop = K(t, (prev, 0), (u0 + wl * 0.6, 0), (u0 + wl * 0.9, 0.14, "o"), (ti, 0, "i"), (ti + 0.25, 0))
            sq = -0.13 * big * math.exp(-14 * max(t - ti, 0)) if t > ti else 0.06 * pulse(t, u0, wl)
    if t > strikes[-1][0] + 0.25:
        k = K(t, (3.8, 1), (4.2, 0))
        arm, fore, lean = -80 * k - 15 * (1 - k), -12 * k - 20 * (1 - k), 6 * k
    P.r("arm_R", x=arm, y=-6).r("fore_R", x=fore).r("body", x=lean)
    P.l("root", z=hop)
    squash(P, sq)
    P.r("arm_L", x=-35 * K(t, (0.6, 0), (1.0, 1), (3.9, 1), (4.3, 0)), y=-14).r("fore_L", x=-50 * K(t, (0.6, 0), (1.0, 1), (3.9, 1), (4.3, 0)))
    for ti, _, big in strikes:
        jiggle(P, "sign", t, ti, 4 * big, 6, "y")
        jiggle(P, "sign", t, ti, 2.5 * big, 5, "x")
        if t > ti:
            k = math.exp(-10 * (t - ti))
            P.s("eye_L", 1.1, 1, 1 - 0.6 * k).s("eye_R", 1.1, 1, 1 - 0.6 * k)
    look(P, -10, 8 * K(t, (0.6, 0), (1.0, 1), (3.9, 1), (4.3, 0)))
    # proud nod at the end
    P.r("head", x=-10 * pulse(t, 4.7, 0.45))
    happy_eyes(P, pulse(t, 3.9, 1.1))
    mouth_o(P, 0.9 * pulse(t, 3.45, 0.45))
    return P


def dance(t):
    P = Pose()
    base(P)
    B = 0.4  # one beat
    beat = t / B
    on = clamp(t / 0.3) * clamp((4.8 - t) / 0.35)
    bounce = abs(math.sin(math.pi * beat))
    if t < 1.6:  # side steps with arm pumps
        crouch(P, 0.07 * (1 - bounce) * on)
        P.l("root", x=0.14 * math.sin(math.pi * beat / 2) * on)
        side = math.sin(math.pi * beat)
        P.r("body", y=9 * side * on, z=6 * side * on).r("head", y=-8 * side * on)
        pump = math.sin(math.pi * beat)
        P.r("arm_L", x=(-50 - 25 * pump) * on, y=-10 * on).r("fore_L", x=(-80 + 20 * pump) * on)
        P.r("arm_R", x=(-50 + 25 * pump) * on, y=10 * on).r("fore_R", x=(-80 - 20 * pump) * on)
        P.r("thigh_L", x=-20 * max(0, side) * on).r("shin_L", x=30 * max(0, side) * on)
        P.r("thigh_R", x=-20 * max(0, -side) * on).r("shin_R", x=30 * max(0, -side) * on)
    elif t < 2.4:  # spin with arms out
        u = clamp((t - 1.6) / 0.8)
        P.r("root", z=360 * EASE["io"](u))
        P.l("root", z=0.12 * math.sin(math.pi * u))
        out = math.sin(math.pi * u)
        P.r("arm_L", y=-85 * out).r("arm_R", y=85 * out).r("fore_L", x=10 * out).r("fore_R", x=10 * out)
        P.r("thigh_R", x=-40 * out).r("shin_R", x=70 * out)
        squash(P, 0.08 * out)
        happy_eyes(P, out)
        P.r("antenna", y=0)
    elif t < 4.0:  # robot moves: snap between stiff poses on the beat
        poses = [
            dict(aL=(-90, 0), fL=(0, 0), aR=(0, 60), fR=(0, -80), hd=20, bd=-6),
            dict(aL=(0, -60), fL=(0, 80), aR=(-90, 0), fR=(0, 0), hd=-20, bd=6),
            dict(aL=(-170, 0), fL=(0, 0), aR=(-20, 10), fR=(-90, 0), hd=10, bd=-4),
            dict(aL=(-20, -10), fL=(-90, 0), aR=(-170, 0), fR=(0, 0), hd=-10, bd=4),
        ]
        i = int((t - 2.4) / B)
        u = EASE["snap"](clamp(((t - 2.4) - i * B) / 0.12))
        a = poses[(i - 1) % 4] if i else dict(aL=(0, 0), fL=(0, 0), aR=(0, 0), fR=(0, 0), hd=0, bd=0)
        b = poses[i % 4]
        mix = lambda k: tuple(x + (y - x) * u for x, y in zip(a[k], b[k])) if isinstance(a[k], tuple) else a[k] + (b[k] - a[k]) * u
        P.r("arm_L", *mix("aL")).r("fore_L", *mix("fL")).r("arm_R", *mix("aR")).r("fore_R", *mix("fR"))
        P.r("head", z=mix("hd")).r("body", z=mix("bd"))
        crouch(P, 0.05 * (1 - bounce))
        eyes(P, 1 + 0.15 * pulse(t, 2.4 + i * B, 0.2))
    else:  # disco point and back to rest
        k = K(t, (4.0, 0), (4.15, 1, "back"), (4.45, 1), (4.8, 0))
        P.r("arm_L", y=-150 * k, x=-20 * k).r("fore_L", y=-10 * k)
        P.r("arm_R", y=40 * k, x=10 * k).r("fore_R", x=-110 * k, y=0)
        P.r("body", y=-10 * k).r("head", y=12 * k, z=15 * k)
        P.r("thigh_R", x=-15 * k, y=10 * k).r("shin_R", x=15 * k)
        happy_eyes(P, k)
        mouth_o(P, 0.7 * k)
    if t < 2.4 or t >= 4.0:
        P.r("head", x=4 * bounce * on)
    return P


def jump(t):
    P = Pose()
    base(P)
    d = K(t, (0, 0), (0.35, 0.2, "o"), (0.45, 0, "i"), (1.12, 0), (1.22, 0.17, "o"), (1.55, -0.02, "io"), (1.7, 0), (2.6, 0))
    crouch(P, max(d, 0), lean=12 * K(t, (0, 0), (0.35, 1), (0.45, -0.3), (1.0, 0), (1.22, 0.6), (1.6, 0)))
    air = clamp((t - 0.45) / 0.67)
    z = 4 * 0.85 * air * (1 - air) if 0.45 < t < 1.12 else 0
    z += 0.06 * (pulse(t, 1.75, 0.3) + pulse(t, 2.1, 0.3))
    P.l("root", z=z)
    P.r("root", z=360 * EASE["io"](air) if 0.45 < t < 1.12 else 0)
    squash(P, K(t, (0, 0), (0.35, -0.16), (0.47, 0.18, "o"), (0.75, 0.03), (1.12, 0.1), (1.2, -0.2, "o"), (1.45, 0.06, "o"), (1.65, 0), (2.6, 0)))
    tuck = math.sin(math.pi * air) if 0.45 < t < 1.12 else 0
    for sd in "LR":
        P.r(f"thigh_{sd}", x=-50 * tuck).r(f"shin_{sd}", x=85 * tuck).r(f"foot_{sd}", x=-20 * tuck)
    arms = K(t, (0, 0), (0.35, 40, "o"), (0.5, -165, "o"), (1.05, -165), (1.2, -60, "o"), (1.5, -150, "back"), (2.25, -150), (2.6, 0, "io"))
    pump = 18 * (pulse(t, 1.75, 0.3) + pulse(t, 2.1, 0.3))
    P.r("arm_L", x=arms, y=-12 - pump).r("arm_R", x=arms, y=12 + pump)
    P.r("fore_L", x=-20 * (1 - tuck)).r("fore_R", x=-20 * (1 - tuck))
    look(P, 0, K(t, (0, 0), (0.35, 12), (0.5, -15), (1.1, -8), (1.22, 10), (1.6, -10), (2.3, -10), (2.6, 0)))
    happy_eyes(P, K(t, (0, 0), (0.45, 0), (0.55, 1), (2.3, 1), (2.6, 0)))
    mouth_o(P, K(t, (0, 0), (0.45, 0), (0.55, 1), (1.12, 1), (1.3, 0.7), (2.3, 0.7), (2.6, 0)))
    eyes(P, 1 + 0.25 * pulse(t, 0.0, 0.4))
    for n, a in (("sign", 3), ("cone", 6)):
        jiggle(P, n, t, 1.13, a, 7, "y")
    return P


def trip(t):
    P = Pose()
    base(P)
    walking = t < 1.0
    if walking:
        walk(P, 2 * math.pi * 1.25 * t, clamp(t / 0.2))
    P.l("root", y=K(t, (0, 0), (1.0, -0.42, "lin"), (1.45, -0.62, "o"), (3.7, -0.62), (4.5, 0), (4.8, 0)))
    if 3.75 < t < 4.5:
        walk(P, -2 * math.pi * 1.5 * (t - 3.75), math.sin(math.pi * (t - 3.75) / 0.75) * 0.7)
    fall = K(t, (0, 0), (0.95, 0), (1.12, -8, "o"), (1.45, 82, "i"), (1.58, 76, "o"), (1.7, 82, "o"), (2.35, 82), (2.95, 0, "io"), (4.8, 0))
    P.r("root", x=fall)
    P.l("root", z=0.46 * clamp(fall / 82) ** 1.5 + 0.06 * pulse(t, 1.45, 0.25))
    # the right foot catches
    P.r("thigh_R", x=K(t, (0.95, 0), (1.05, 25), (1.45, 10), (1.8, 0)) * (t > 0.95))
    # arms flail on the way down, then reach forward
    flail = math.sin(2 * math.pi * 6 * t) * pulse(t, 0.95, 0.55)
    reach = K(t, (0.95, 0), (1.35, 1, "o"), (2.3, 1), (2.7, 0))
    P.r("arm_L", x=-60 * flail - 150 * reach, y=-30 * pulse(t, 0.95, 0.55)).r("arm_R", x=60 * flail - 150 * reach, y=30 * pulse(t, 0.95, 0.55))
    # face-down, legs kick
    kick = math.sin(2 * math.pi * 3 * (t - 1.6)) * K(t, (1.6, 0), (1.7, 1), (2.1, 1), (2.3, 0))
    P.r("thigh_L", x=30 * kick).r("thigh_R", x=-30 * kick).r("shin_L", x=40 * max(kick, 0)).r("shin_R", x=40 * max(-kick, 0))
    squash(P, -0.18 * math.exp(-10 * max(t - 1.45, 0)) if t > 1.45 else 0)
    # the hat pops off, spins and lands back on
    hop = K(t, (1.45, 0), (1.7, 0.45, "o"), (2.05, 0, "i"), (2.15, 0.06, "o"), (2.25, 0, "i")) if 1.45 < t < 2.25 else 0
    P.l("hat", z=hop * 0.6, y=hop * 0.5).r("hat", x=-260 * clamp((t - 1.45) / 0.6) if 1.45 < t < 2.05 else 0)
    jiggle(P, "hat", t, 2.05, 10, 6, "y")
    # getting up, dusting off, a dizzy head shake, then a sheepish scratch
    dust = pulse(t, 3.0, 0.6)
    P.r("arm_L", x=-30 * dust).r("fore_L", x=-70 * dust, z=25 * math.sin(2 * math.pi * 6 * t) * dust)
    shake = 16 * math.sin(2 * math.pi * 4 * t) * pulse(t, 2.85, 0.5)
    P.r("head", z=shake)
    scratch = K(t, (3.35, 0), (3.6, 1, "back"), (4.3, 1), (4.6, 0))
    P.r("arm_R", x=-130 * scratch, y=55 * scratch).r("fore_R", x=-95 * scratch, y=10 * math.sin(2 * math.pi * 5 * t) * scratch)
    P.r("head", y=-10 * scratch, x=6 * scratch)
    surprise = pulse(t, 0.9, 0.9)
    eyes(P, 1 + 0.35 * surprise)
    mouth_o(P, clamp(surprise * 1.4) + 0.6 * pulse(t, 2.6, 0.5))
    happy_eyes(P, 0.8 * scratch)
    blink(P, t, 2.7, 0.25)
    look(P, 0, -12 * K(t, (2.2, 0), (2.6, 1), (3.0, 0)))
    jiggle(P, "cone", t, 1.46, 9, 6, "y")
    jiggle(P, "sign", t, 1.46, 3, 6, "x")
    return P


def carry(t):
    P = Pose()
    base(P)
    pop = K(t, (0, 0), (0.15, 0), (0.4, 1, "back"), (4.75, 1), (4.85, 1.15), (5.05, 0, "i"), (5.4, 0))
    show(P, "plank", pop)
    hold = K(t, (0, 0), (0.15, 0), (0.35, 1, "o"), (4.75, 1), (5.0, 0, "io"))
    P.r("arm_R", y=160 * hold, x=-10 * hold).r("fore_R", y=-100 * hold, x=-25 * hold)
    # the weight lands: knees give, the body sags, then a determined straighten
    crouch(P, K(t, (0.3, 0), (0.45, 0.12, "o"), (0.7, 0.02, "back"), (4.7, 0.02), (5.0, 0)))
    squash(P, K(t, (0.3, 0), (0.45, -0.12, "o"), (0.7, 0, "back")))
    P.r("body", y=-6 * hold)
    face = K(t, (0, 0), (0.6, 0), (0.9, -90, "io"), (2.25, -90), (2.75, 90, "io"), (4.25, 90), (4.6, 0, "io"), (5.4, 0))
    P.r("root", z=face)
    x = K(t, (0, 0), (0.85, 0), (2.25, -0.62, "lin"), (2.8, -0.62), (4.25, 0, "lin"), (5.4, 0))
    P.l("root", x=x)
    for t0, t1 in ((0.85, 2.25), (2.8, 4.25)):
        if t0 < t < t1:
            u = (t - t0) / (t1 - t0)
            walk(P, 2 * math.pi * 2 * u, 0.85 * min(1, 5 * min(u, 1 - u)) + 0.15)
    # the plank sways with each step and bonks the cone at the far end
    P.r("plank", x=4 * math.sin(2 * math.pi * 1.4 * t) * hold + wobble(t, 2.2, 10, 5, 5), z=wobble(t, 2.2, 6, 4, 4))
    jiggle(P, "cone", t, 2.2, 14, 5, "x")
    surprise = pulse(t, 2.15, 0.6)
    eyes(P, 1 + 0.4 * surprise)
    mouth_o(P, surprise)
    P.r("head", y=-8 * surprise)
    # free hand wipes the brow on the way back to centre, then a satisfied nod
    wipe = pulse(t, 4.3, 0.75)
    P.r("arm_L", x=-150 * wipe, y=30 * wipe).r("fore_L", x=-60 * wipe, z=-30 * math.sin(2 * math.pi * 3 * t) * wipe)
    happy_eyes(P, pulse(t, 4.4, 0.9))
    P.r("head", x=-9 * pulse(t, 5.0, 0.4))
    blink(P, t, 1.6)
    return P


def typing(t):
    P = Pose()
    base(P)
    show(P, "crate", K(t, (0, 0), (0.1, 0), (0.42, 1, "back"), (4.45, 1), (4.55, 1.12), (4.8, 0, "i"), (5.2, 0)))
    P.r("laptop", x=wobble(t, 3.9, 6, 7, 7))
    on = K(t, (0, 0), (0.35, 0), (0.6, 1, "o"), (4.3, 1), (4.7, 0))
    shrug = pulse(t, 2.35, 0.75)
    work = on * (1 - min(1, shrug * 2))
    crouch(P, 0.06 * on, lean=10 * on)
    P.r("arm_L", x=-62 * work, y=10 * work).r("arm_R", x=-62 * work, y=-10 * work)
    P.r("fore_L", x=-25 * work, z=-20 * work).r("fore_R", x=-25 * work, z=20 * work)
    rate = 9 if t < 2.2 else 14
    tap = math.sin(2 * math.pi * rate * t)
    typing_on = (0.6 < t < 2.2) or (2.95 < t < 3.6)
    if typing_on:
        P.r("fore_L", x=-9 * tap * work).r("fore_R", x=9 * tap * work)
        P.r("hand_L", x=-12 * max(tap, 0)).r("hand_R", x=-12 * max(-tap, 0))
        P.r("head", x=3 * math.sin(2 * math.pi * 4 * t))
    look(P, 0, 14 * work * (1 - pulse(t, 2.2, 0.9)))
    P.l("eye_L", z=-0.012 * work).l("eye_R", z=-0.012 * work)
    # stops, looks up at you, shrugs
    P.r("arm_L", y=-40 * shrug, x=-20 * shrug).r("fore_L", x=-80 * shrug, y=-30 * shrug)
    P.r("arm_R", y=40 * shrug, x=-20 * shrug).r("fore_R", x=-80 * shrug, y=30 * shrug)
    P.r("head", y=12 * shrug)
    P.l("body", z=0.03 * shrug)
    mouth_o(P, 0.6 * shrug)
    blink(P, t, 2.3)
    # big enter key
    enter = K(t, (3.55, 0), (3.8, 1, "o"), (3.9, -0.2, "i"), (4.1, 0))
    P.r("arm_R", x=-90 * max(enter, 0), y=20 * max(enter, 0)).r("fore_R", x=-60 * max(enter, 0))
    squash(P, -0.08 * math.exp(-12 * max(t - 3.9, 0)) if t > 3.9 else 0.04 * pulse(t, 3.55, 0.35))
    happy_eyes(P, pulse(t, 3.95, 0.9))
    P.r("head", x=-10 * pulse(t, 4.0, 0.5))
    return P


CLIPS = [  # name, fn, seconds, loops
    ("Idle", idle, 4.0, True),
    ("Wave", wave, 3.2, False),
    ("Hammer", hammer, 5.2, False),
    ("Dance", dance, 4.8, False),
    ("Jump", jump, 2.6, False),
    ("Trip", trip, 4.8, False),
    ("Carry", carry, 5.4, False),
    ("Typing", typing, 5.2, False),
]

# ---------------------------------------------------------------- sampling, with a spring on the antenna


def sample(fn, dur, loop):
    n = round(dur * FPS)
    frames = [fn(f / FPS) for f in range(n + 1)]
    # the antenna lags whatever the head does; for a loop, settle the spring over a first pass
    w, z, dt = 2 * math.pi * 2.2, 0.18, 1 / FPS
    pos = [0.0, 0.0]
    vel = [0.0, 0.0]

    def drive(P, prev):
        a = [0.0, 0.0]
        for b in ("root", "hips", "body", "head", "hat"):
            p = P.get(b)
            if p:
                a[0] += p[3]
                a[1] += p[4]
        z_now = P.get("root", [0] * 9)[2] + P.get("hips", [0] * 9)[2]
        return a, z_now

    passes = 2 if loop else 1
    out = []
    zprev = vprev = 0.0
    for ps in range(passes):
        for i, P in enumerate(frames):
            (ax, ay), zz = drive(P, None)
            vz = (zz - zprev) / dt
            acc = (vz - vprev) / dt if i or ps else 0.0
            zprev, vprev = zz, vz
            target = [ax + clamp(acc * 0.25, -40, 40), ay]
            for k in range(2):
                for _ in range(4):
                    h = dt / 4
                    f = -w * w * (pos[k] - target[k]) - 2 * z * w * vel[k]
                    vel[k] += f * h
                    pos[k] += vel[k] * h
            if ps == passes - 1:
                lag = [clamp(pos[0] - target[0], -45, 45), clamp(pos[1] - target[1], -45, 45)]
                P.r("antenna", x=lag[0], y=lag[1])
                out.append(P)
        if loop:
            zprev = vprev = 0.0
    return out


def bake(name, frames):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    slot = act.slots.new(id_type="OBJECT", name=arm.name)
    strip = act.layers.new("main").strips.new(type="KEYFRAME")
    bag = strip.channelbag(slot, ensure=True)
    for bn, _, _ in BONES:
        for prop, off in (("location", 0), ("rotation_euler", 3), ("scale", 6)):
            for i in range(3):
                vals = []
                for f, P in enumerate(frames):
                    v = P.get(bn, [0, 0, 0, 0, 0, 0, 1, 1, 1])[off + i]
                    vals += [f, math.radians(v) if off == 3 else v]
                fc = bag.fcurves.new(f'pose.bones["{bn}"].{prop}', index=i)
                fc.keyframe_points.add(len(frames))
                fc.keyframe_points.foreach_set("co", vals)
                for kp in fc.keyframe_points:
                    kp.interpolation = "LINEAR"
                fc.update()
    return act, slot


scene.render.fps = FPS
arm.animation_data_create()
baked = []
for name, fn, dur, loop in CLIPS:
    act, slot = bake(name, sample(fn, dur, loop))
    baked.append((name, act, slot, dur))
    print(f"wip: {name} {dur:.1f}s")


def use(act, slot):
    arm.animation_data.action = act
    arm.animation_data.action_slot = slot


# ---------------------------------------------------------------- previews

if PREVIEW:
    import numpy as np

    os.makedirs(PREVIEW, exist_ok=True)
    try:
        scene.render.engine = "BLENDER_WORKBENCH"
    except TypeError as e:
        print(e)
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "VERTEX"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = False
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("w")
    scene.world.color = (0.85, 0.84, 0.8)
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x = scene.render.resolution_y = 360
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.lens = 40
    floor = bpy.data.meshes.new("floor")
    fb = bmesh.new()
    bmesh.ops.create_grid(fb, x_segments=1, y_segments=1, size=4)
    fb.to_mesh(floor)
    fl = bpy.data.objects.new("floor", floor)
    scene.collection.objects.link(fl)

    def aim(loc, target=(0, 0, 1.0)):
        cam.location = loc
        cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()

    def shot(path):
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)

    def strip_of(paths, out):
        imgs = []
        for p in paths:
            im = bpy.data.images.load(p)
            a = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)
            imgs.append(a)
            bpy.data.images.remove(im)
        row = np.concatenate(imgs, axis=1)
        h, w = row.shape[:2]
        im = bpy.data.images.new("strip", w, h, alpha=True)
        im.pixels[:] = row.ravel()
        im.filepath_raw = out
        im.file_format = "PNG"
        im.save()
        bpy.data.images.remove(im)
        for p in paths:
            os.remove(p)

    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.location, pb.rotation_euler, pb.scale = (0, 0, 0), (0, 0, 0), (1, 1, 1)
    views = [((0, -7.5, 1.6), (0, 0, 1.0)), ((4.5, -5.5, 2.4), (0, 0, 1.0)), ((6.5, 0, 1.4), (0, 0, 1.0)), ((0, -3.2, 1.7), (0, 0, 1.55))]
    paths = []
    for i, (loc, tg) in enumerate(views):
        aim(loc, tg)
        paths.append(os.path.join(PREVIEW, f"_rest{i}.png"))
        shot(paths[-1])
    strip_of(paths, os.path.join(PREVIEW, "rest.png"))
    aim((0.9, -5.6, 1.8), (0.1, 0, 0.95))
    only = ARGS[ARGS.index("--clip") + 1].split(",") if "--clip" in ARGS else None
    n = int(ARGS[ARGS.index("--n") + 1]) if "--n" in ARGS else 6
    for name, act, slot, dur in baked:
        if only and name not in only:
            continue
        use(act, slot)
        paths = []
        for j in range(n):
            f = round(j * dur * FPS / (n - 1))
            scene.frame_set(f)
            paths.append(os.path.join(PREVIEW, f"_{name}{j}.png"))
            shot(paths[-1])
        strip_of(paths, os.path.join(PREVIEW, f"{name}.png"))
        print(f"wip: preview {name}")

# ---------------------------------------------------------------- export

arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.location, pb.rotation_euler, pb.scale = (0, 0, 0), (0, 0, 0), (1, 1, 1)
for o in list(bpy.data.objects):
    if o not in (arm, bot):
        bpy.data.objects.remove(o)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_materials="NONE",
    export_vertex_color="ACTIVE",
    export_all_vertex_colors=False,
    export_texcoords=False,
    export_skins=True,
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_force_sampling=True,
    export_frame_step=1,
    export_optimize_animation_size=True,
    export_optimize_animation_keep_anim_armature=True,
    export_anim_slide_to_zero=True,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=7,
    export_draco_position_quantization=14,
    export_draco_normal_quantization=10,
    export_draco_color_quantization=8,
)
print(f"wip: {OUT} {os.path.getsize(OUT) // 1024} KB")
