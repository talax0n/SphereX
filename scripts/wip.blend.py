"""Builds Nao, the young carpenter on the work-in-progress page, and writes public/models/wip.glb.

Run: npm run wip   (Blender headless, rerunnable, no inputs)
Previews: npm run wip -- --preview <dir> [--clip Wave,Jump] [--n 6]   also renders a strip of frames per clip.

How the character is made:
  Body, head, hair and the moss sprite are unions of overlapping soft primitives (ellipsoids, tapered
  capsules), voxel-remeshed and smoothed so they read as one sculpted surface. Every primitive belongs
  to a bone; skin weights start from the distance to the owner's bone and its neighbours and are then
  diffused over the surface, so joints bend softly. The figure is modelled in an A-pose (arms clear of
  the hips for the remesh) and the arms are lowered by the same weights before the rig is made.
  Face features are thin decals projected onto the head; the page draws them without an ink outline.

Rig convention: every bone points along +Y with no roll, so a pose bone's local axes are the world axes:
  rx > 0 tips the top of a bone forward (-Y, toward the camera); a hanging arm swings forward with rx < 0
  ry > 0 tips the top toward +X (Nao's left, screen right); a hanging arm swings toward -X
  rz > 0 turns to face +X
Clips are functions of time sampled every frame; hair, the ponytail and the sprite's leaf get a spring
pass on top. All clips start and end near rest so the page can crossfade any pair.
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

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


C = {k: hexc(v) for k, v in dict(
    skin="#f6d5b8",
    lip="#c9705f",
    blush="#f0a593",
    hair="#4a3024",
    hairtie="#c4553b",
    shirt="#f1e8d6",
    overall="#6f7f4f",
    stitch="#e2c27a",
    belt="#8b5a37",
    beltdark="#5f3b23",
    brass="#d9a441",
    boot="#7a5136",
    sole="#3d2b20",
    sclera="#fbf7ee",
    iris="#3b2519",
    glint="#ffffff",
    lash="#2a1a14",
    brow="#4a3024",
    mouth="#6e3229",
    wood="#c99561",
    wooddark="#94643c",
    board="#f4ead2",
    ink="#3a2a22",
    steel="#a3a7ab",
    steeldark="#6e7378",
    paper="#fbf6e9",
    cover="#4f6d8f",
    pencil="#e8b33f",
    lead="#3a3a3a",
    brick="#c26a4a",
    moss="#7ea24a",
    mossdark="#5f8236",
    leaf="#9cc95a",
    grass="#7fae55",
    grassdark="#5d8f3e",
    petal="#ffffff",
    petalcore="#f2c94c",
).items()}

# ---------------------------------------------------------------- skeleton: name, parent, head, tail (A-pose)
# tails only matter for weighting; the exported rig points every bone along +Y from its head.

SH = (0.2, 0, 1.575)
A45 = (math.cos(math.radians(45)), 0, -math.sin(math.radians(45)))


def along(p, d, k):
    return tuple(p[i] + d[i] * k for i in range(3))


def side(p, s):
    return (p[0] * s, p[1], p[2])


UPPER, FORE, HAND = 0.31, 0.27, 0.16
BONES = [
    ("rig", None, (0, 0, 0), None),
    ("root", "rig", (0, 0, 0), None),
    ("hips", "root", (0, 0, 1.03), (0, 0, 1.18)),
    ("spine", "hips", (0, 0, 1.18), (0, 0, 1.36)),
    ("chest", "spine", (0, 0, 1.36), (0, 0, 1.56)),
    ("neck", "chest", (0, 0.01, 1.6), (0, 0.0, 1.75)),
    ("head", "neck", (0, 0.0, 1.75), (0, 0, 2.02)),
]
for s, sd in ((1, "L"), (-1, "R")):
    sh = side(SH, s)
    d = (A45[0] * s, 0, A45[2])
    el = along(sh, d, UPPER)
    wr = along(el, d, FORE)
    BONES += [
        (f"shoulder_{sd}", "chest", side((0.03, 0, 1.56), s), sh),
        (f"arm_{sd}", f"shoulder_{sd}", sh, el),
        (f"fore_{sd}", f"arm_{sd}", el, wr),
        (f"hand_{sd}", f"fore_{sd}", wr, along(wr, d, HAND)),
        (f"thigh_{sd}", "hips", side((0.1, 0, 1.0), s), side((0.112, -0.012, 0.56), s)),
        (f"shin_{sd}", f"thigh_{sd}", side((0.112, -0.012, 0.56), s), side((0.122, 0.015, 0.1), s)),
        (f"foot_{sd}", f"shin_{sd}", side((0.122, 0.015, 0.1), s), side((0.122, -0.16, 0.03), s)),
    ]
HEAD_C = Vector((0, 0.0, 1.905))  # centre of the skull
BONES += [
    ("eye_L", "head", (0.056, -0.13, 1.872), None),
    ("eye_R", "head", (-0.056, -0.13, 1.872), None),
    ("brow_L", "head", (0.058, -0.13, 1.935), None),
    ("brow_R", "head", (-0.058, -0.13, 1.935), None),
    ("smile", "head", (0, -0.15, 1.79), None),
    ("mouth_o", "head", (0, -0.15, 1.788), None),
    ("hair_F", "head", (0, -0.08, 2.06), None),
    ("hair_B", "head", (0, 0.1, 1.98), None),
    ("hair_L", "head", (0.12, -0.02, 1.98), None),
    ("hair_R", "head", (-0.12, -0.02, 1.98), None),
    ("hair_T", "head", (0, 0.02, 2.07), None),
    ("tail_1", "head", (0, 0.165, 1.87), None),
    ("tail_2", "tail_1", (0, 0.215, 1.8), None),
    ("ear_pencil", "head", (-0.14, 0.0, 1.9), None),
    # props; hand-held pivots are moved onto the lowered hands below
    ("hammer", "hand_R", (0, 0, 0), None),
    ("pencil", "hand_R", (0, 0, 0), None),
    ("book", "hand_L", (0, 0, 0), None),
    ("plank", "chest", (-0.17, 0.0, 1.62), None),
    ("sign", "rig", (1.32, -0.3, 0), None),
    ("sawhorse", "rig", (-1.35, 0.55, 0), None),
    ("bricks", "rig", (-0.95, 0.95, 0), None),
    ("sprite", "rig", (-0.62, -0.25, 0), None),
    ("sprite_leaf", "sprite", (-0.62, -0.25, 0.2), None),
    ("ground", "rig", (0, 0, 0), None),
]
PROPS = ("hammer", "pencil", "book", "plank")  # hidden unless a clip shows them
NAMES = [b[0] for b in BONES]
BI = {n: i for i, n in enumerate(NAMES)}
PAR = {b[0]: b[1] for b in BONES}
HEADP = {b[0]: Vector(b[2]) for b in BONES}
TAILP = {b[0]: Vector(b[3]) if b[3] else None for b in BONES}
KIDS = {n: [m for m in NAMES if PAR[m] == n] for n in NAMES}

# ---------------------------------------------------------------- mesh accumulation

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
scene = bpy.context.scene


class Layer:
    """Plain arrays for one exported mesh: positions, faces, face colours, dense weights."""

    def __init__(self):
        self.V = np.zeros((0, 3))
        self.F = []
        self.FC = []
        self.W = np.zeros((0, len(NAMES)))
        self.smooth = []

    def add(self, V, F, FC, W, smooth=True, corner=None):
        """FC: one colour per face; corner (optional): one colour per vertex, blended across faces."""
        o = len(self.V)
        if corner is not None:
            FC = [np.array(corner)[f] for f in F]
        self.V = np.vstack([self.V, V])
        self.F += [[i + o for i in f] for f in F]
        self.FC += list(FC)
        self.W = np.vstack([self.W, W])
        self.smooth += [smooth] * len(F)
        return o


INK = Layer()  # drawn with an ink outline
FACE = Layer()  # decals drawn flat, no outline


def M(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    s = Matrix.Diagonal(Vector(scale)).to_4x4()
    return Matrix.Translation(Vector(loc)) @ Euler([math.radians(a) for a in rot]).to_matrix().to_4x4() @ s


def frame(d, up=(0, 1, 0)):
    """An orthonormal basis with z along d; x is kept close to `up` x d."""
    z = Vector(d).normalized()
    x = Vector(up).cross(z)
    if x.length < 1e-6:
        x = Vector((1, 0, 0)).cross(z)
    x.normalize()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()


class Blob:
    """Soft primitives that become one surface: each remembers its bone and a colour tag."""

    def __init__(self):
        self.bm = bmesh.new()
        self.prims = []

    def ell(self, c, r, bone, tag, rot=None, seg=(24, 14)):
        B = (rot or Matrix.Identity(3)) @ Matrix.Diagonal(Vector(r))
        m = Matrix.Translation(Vector(c)) @ B.to_4x4()
        bmesh.ops.create_uvsphere(self.bm, u_segments=seg[0], v_segments=seg[1], radius=1, matrix=m)
        self.prims.append(("e", np.array(c, float), np.array(B.inverted()), bone, tag))

    def cap(self, a, b, r1, r2, bone, tag, seg=20):
        """A tapered capsule from a (radius r1) to b (radius r2)."""
        a, b = Vector(a), Vector(b)
        d = b - a
        R = frame(d)
        m = Matrix.Translation((a + b) / 2) @ R.to_4x4()
        bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=d.length, matrix=m)
        for p, r in ((a, r1), (b, r2)):
            bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=seg // 2, radius=r, matrix=Matrix.Translation(p))
        self.prims.append(("c", np.array(a, float), np.array(b, float), r1, r2, bone, tag))

    def box(self, c, size, bone, tag, rot=(0, 0, 0)):
        bmesh.ops.create_cube(self.bm, size=1, matrix=M(c, rot, size))
        m = M(c, rot, [x / 2 for x in size]).to_3x3()
        self.prims.append(("b", np.array(c, float), np.array(m.inverted()), bone, tag))

    def strand(self, pts, w0, t0, bone, tag, up=(0, 0, 1)):
        """A hair clump: a chain of flattened ellipsoids along pts, tapering to a tip."""
        pts = [Vector(p) for p in pts]
        # resample the polyline evenly
        L = [0.0]
        for a, b in zip(pts, pts[1:]):
            L.append(L[-1] + (b - a).length)
        n = max(5, int(L[-1] / 0.012))
        for i in range(n):
            u = i / (n - 1)
            s = u * L[-1]
            j = min(next(k for k in range(1, len(L)) if L[k] >= s - 1e-9), len(pts) - 1)
            f = (s - L[j - 1]) / max(L[j] - L[j - 1], 1e-9)
            p = pts[j - 1].lerp(pts[j], f)
            d = pts[j] - pts[j - 1]
            k = (1 - u) ** 0.8
            w, t = w0 * (0.35 + 0.65 * k), t0 * (0.45 + 0.55 * k)
            R = frame(d, up)
            self.ell(p, (w, t, L[-1] / n * 1.4), bone, tag, rot=R, seg=(12, 8))

    def mesh(self, voxel, smooth=(0.5, 6), decimate=None):
        me = bpy.data.meshes.new("tmp")
        self.bm.to_mesh(me)
        ob = bpy.data.objects.new("tmp", me)
        scene.collection.objects.link(ob)
        m = ob.modifiers.new("r", "REMESH")
        m.mode = "VOXEL"
        m.voxel_size = voxel
        m.adaptivity = 0
        if smooth:
            s = ob.modifiers.new("s", "SMOOTH")
            s.factor, s.iterations = smooth
        if decimate:
            d = ob.modifiers.new("d", "DECIMATE")
            d.ratio = decimate
        dg = bpy.context.evaluated_depsgraph_get()
        out = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        V = np.array([v.co[:] for v in out.vertices])
        F = [list(p.vertices) for p in out.polygons]
        bpy.data.objects.remove(ob)
        bpy.data.meshes.remove(me)
        bpy.data.meshes.remove(out)
        return V, F

    def dist(self, P):
        """Normalised distance of points to every primitive: about 1 on its surface. Shape (n, prims)."""
        out = np.zeros((len(P), len(self.prims)))
        for i, pr in enumerate(self.prims):
            if pr[0] in "eb":
                q = (P - pr[1]) @ pr[2].T
                out[:, i] = np.linalg.norm(q, axis=1) if pr[0] == "e" else np.abs(q).max(axis=1)
            else:
                a, b, r1, r2 = pr[1], pr[2], pr[3], pr[4]
                d = b - a
                t = np.clip((P - a) @ d / (d @ d), 0, 1)
                foot = a + t[:, None] * d
                out[:, i] = np.linalg.norm(P - foot, axis=1) / (r1 + (r2 - r1) * t)
        return out

    def bones(self):
        return [p[-2] for p in self.prims]

    def tags(self):
        return [p[-1] for p in self.prims]


def seg_dist(P, a, b):
    d = b - a
    t = np.clip((P - a) @ d / max(d @ d, 1e-12), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * d), axis=1)


def neighbours(n, F):
    e = []
    for f in F:
        for i in range(len(f)):
            e.append((f[i], f[(i + 1) % len(f)]))
    e = np.array(e)
    return np.concatenate([e[:, 0], e[:, 1]]), np.concatenate([e[:, 1], e[:, 0]])


def diffuse(W, F, iters, keep=0.5):
    a, b = neighbours(len(W), F)
    deg = np.bincount(a, minlength=len(W)).astype(float)[:, None]
    for _ in range(iters):
        acc = np.zeros_like(W)
        np.add.at(acc, a, W[b])
        W = keep * W + (1 - keep) * acc / np.maximum(deg, 1)
    return W


def skin_weights(blob, V, F, iters=10):
    """Owner primitive -> its bone and that bone's neighbours, blended by distance to bone segments, then diffused."""
    D = blob.dist(V)
    owner = np.array(blob.bones())[D.argmin(axis=1)]
    W = np.zeros((len(V), len(NAMES)))
    for bone in set(owner):
        rows = np.where(owner == bone)[0]
        cand = [bone] + ([PAR[bone]] if PAR[bone] and TAILP.get(PAR[bone]) is not None else []) + [k for k in KIDS[bone] if TAILP[k] is not None]
        ds = np.stack([seg_dist(V[rows], np.array(HEADP[c]), np.array(TAILP[c])) for c in cand], axis=1)
        w = 1 / np.maximum(ds, 1e-3) ** 6
        w /= w.sum(axis=1, keepdims=True)
        for j, c in enumerate(cand):
            W[rows, BI[c]] = w[:, j]
    return normalise(diffuse(W, F, iters))


def normalise(W, top=4):
    W = W.copy()
    if W.shape[1] > top:
        cut = np.sort(W, axis=1)[:, -top][:, None]
        W[W < cut] = 0
    W[W < 0.01] = 0
    return W / np.maximum(W.sum(axis=1, keepdims=True), 1e-9)


def rigid(n, bone):
    W = np.zeros((n, len(NAMES)))
    W[:, BI[bone]] = 1
    return W


def face_centres(V, F):
    return np.array([V[f].mean(axis=0) for f in F])


def colour_by_vertex(blob, V, F, rule=None):
    tags = np.array(blob.tags())[blob.dist(V).argmin(axis=1)]
    if rule:
        tags = rule(V, tags)
    return [C[t] for t in tags]


def colour_by_owner(blob, V, F, rule=None):
    Pc = face_centres(V, F)
    tags = np.array(blob.tags())[blob.dist(Pc).argmin(axis=1)]
    if rule:
        tags = rule(Pc, tags)
    return [C[t] for t in tags]


# ---------------------------------------------------------------- body (A-pose)

body = Blob()
# torso
body.ell((0, 0.005, 1.05), (0.165, 0.115, 0.13), "hips", "overall")
body.ell((0, 0.0, 1.2), (0.15, 0.104, 0.13), "spine", "shirt")
body.ell((0, -0.004, 1.41), (0.178, 0.112, 0.155), "chest", "shirt")
body.ell((0, 0.012, 1.55), (0.18, 0.088, 0.065), "chest", "shirt")
for s, sd in ((1, "L"), (-1, "R")):
    body.ell(side((0.178, 0.005, 1.555), s), (0.072, 0.07, 0.06), f"shoulder_{sd}", "shirt")
body.cap((0, 0.012, 1.56), (0, 0.004, 1.76), 0.054, 0.05, "neck", "skin")
for s, sd in ((1, "L"), (-1, "R")):
    sh, el, wr, tip = HEADP[f"arm_{sd}"], HEADP[f"fore_{sd}"], HEADP[f"hand_{sd}"], TAILP[f"hand_{sd}"]
    d = (el - sh).normalized()
    body.cap(sh, el, 0.056, 0.044, f"arm_{sd}", "shirt")
    body.ell(sh.lerp(el, 0.4), (0.058, 0.055, 0.12), f"arm_{sd}", "shirt", rot=frame(d))
    # rolled-up sleeve just above the elbow
    body.cap(sh.lerp(el, 0.72), sh.lerp(el, 0.86), 0.055, 0.055, f"arm_{sd}", "shirt")
    body.cap(el, wr, 0.04, 0.029, f"fore_{sd}", "skin")
    body.ell(el.lerp(wr, 0.25), (0.045, 0.04, 0.09), f"fore_{sd}", "skin", rot=frame(d))
    # mitten hand: palm, fingers together, thumb toward the front
    pr = frame(d, up=(0, 1, 0))  # x across the back of the hand, y front-back, z along the arm
    body.ell(wr + d * 0.05, (0.022, 0.042, 0.055), f"hand_{sd}", "skin", rot=pr)
    body.ell(wr + d * 0.11, (0.019, 0.038, 0.05), f"hand_{sd}", "skin", rot=pr)
    body.cap(wr + d * 0.035 + Vector((0, -0.03, 0)), wr + d * 0.085 + Vector((0, -0.055, 0)), 0.014, 0.011, f"hand_{sd}", "skin")
    # legs in roomy overall trousers, rolled at the ankle
    hp, kn, an = HEADP[f"thigh_{sd}"], HEADP[f"shin_{sd}"], HEADP[f"foot_{sd}"]
    body.cap(hp, kn, 0.088, 0.064, f"thigh_{sd}", "overall")
    body.cap(kn, an + Vector((0, 0, 0.06)), 0.062, 0.058, f"shin_{sd}", "overall")
    body.cap(an + Vector((0, 0, 0.07)), an + Vector((0, 0, 0.1)), 0.066, 0.066, f"shin_{sd}", "overall")
    # boot
    body.cap(an + Vector((0, 0, -0.04)), an + Vector((0, 0, 0.05)), 0.052, 0.05, f"foot_{sd}", "boot")
    body.ell(side((0.124, -0.075, 0.05), s), (0.058, 0.125, 0.05), f"foot_{sd}", "boot")
    body.box(side((0.124, -0.06, 0.012), s), (0.115, 0.27, 0.024), f"foot_{sd}", "sole")

BIB_TOP = 1.47


def body_rule(P, tags):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    t = tags.copy()
    torso = np.isin(tags, ["shirt", "overall"]) & (np.abs(x) < 0.2) & (z > 0.9)
    t[torso & (z < 1.16)] = "overall"
    t[torso & (z < 1.25) & (y > 0)] = "overall"
    bib = torso & (y < -0.02) & (np.abs(x) < 0.115 - (z - 1.2) * 0.1) & (z < BIB_TOP)
    t[bib] = "overall"
    strap = torso & (z >= 1.2) & (np.abs(np.abs(x) - (0.085 + (z - 1.47) * 0.15 * (y > 0))) < 0.019)
    t[strap & (z < 1.62)] = "overall"
    return t


BV, BF = body.mesh(0.012, smooth=(0.6, 5), decimate=0.6)
BW = skin_weights(body, BV, BF)
INK.add(BV, BF, colour_by_owner(body, BV, BF, body_rule), BW, corner=colour_by_vertex(body, BV, BF, body_rule))
print(f"wip: body {len(BV)} verts")

# ---------------------------------------------------------------- head


def skull_shape(V):
    """Shapes a unit sphere into a soft head: full cranium, round cheeks, small chin."""
    x, y, z = V[:, 0].copy(), V[:, 1].copy(), V[:, 2].copy()
    low = np.clip(-z, 0, 1)
    sm = low * low * (3 - 2 * low)
    x *= 1 - 0.3 * sm
    y = np.where(y > 0, y * (1 - 0.32 * sm), y * (1 - 0.06 * sm))
    z = np.where(z < 0, z * 1.06, z)
    # flatter face, fuller back of the skull
    y = np.where(y < 0, y * 0.92, y * 1.04)
    cheek = np.exp(-(((z + 0.35) / 0.35) ** 2)) * np.clip(-y, 0, 1)
    x *= 1 + 0.07 * cheek
    return np.stack([x * 0.138, y * 0.152, z * 0.168], axis=1) + np.array(HEAD_C)


head = Blob()
sk = bmesh.new()
bmesh.ops.create_uvsphere(sk, u_segments=48, v_segments=32, radius=1)
SV = skull_shape(np.array([v.co[:] for v in sk.verts]))
for v, p in zip(sk.verts, SV):
    v.co = p
tmp = bpy.data.meshes.new("sk")
sk.to_mesh(tmp)
head.bm.from_mesh(tmp)
bpy.data.meshes.remove(tmp)
sk.free()
head.prims.append(("e", np.array(HEAD_C), np.linalg.inv(np.diag([0.138, 0.152, 0.17])), "head", "skin"))
# nose: a soft little button, ears tucked under the hair
head.ell((0, -0.146, 1.852), (0.012, 0.016, 0.017), "head", "skin", rot=Euler((math.radians(-20), 0, 0)).to_matrix())
for s in (1, -1):
    head.ell((0.132 * s, 0.012, 1.89), (0.022, 0.03, 0.042), "head", "skin", rot=Euler((0, math.radians(-15 * s), math.radians(10 * s))).to_matrix())
HV, HF = head.mesh(0.0065, smooth=(0.5, 4), decimate=0.5)
HW = rigid(len(HV), "head")
# the neck stub inside the head eases into the neck bone
low = np.clip((1.8 - HV[:, 2]) / 0.06, 0, 1) * (HV[:, 1] > -0.05)
HW[:, BI["head"]] = 1 - 0.5 * low
HW[:, BI["neck"]] = 0.5 * low
HEAD0 = len(INK.V)
INK.add(HV, HF, [C["skin"]] * len(HF), HW)
print(f"wip: head {len(HV)} verts")
HEAD_BVH = BVHTree.FromPolygons([Vector(v) for v in HV], HF)

# ---------------------------------------------------------------- hair: a cap and chunky clumps, one surface

hair = Blob()
hc = HEAD_C
hair.ell(hc + Vector((0, 0.03, 0.025)), (0.155, 0.165, 0.175), "head", "hair")
hair.ell(hc + Vector((0, 0.07, -0.04)), (0.14, 0.12, 0.12), "head", "hair")
H = lambda x, y, z: hc + Vector((x, y, z))  # noqa: E731
CLUMPS = [  # bone, width, thickness, points relative to the skull centre
    # bangs falling over the forehead, parted a little off centre
    ("hair_F", 0.065, 0.026, [H(-0.015, -0.06, 0.175), H(-0.035, -0.14, 0.14), H(-0.055, -0.168, 0.085), H(-0.062, -0.165, 0.05)]),
    ("hair_F", 0.062, 0.026, [H(0.02, -0.06, 0.178), H(0.035, -0.145, 0.135), H(0.048, -0.167, 0.08), H(0.068, -0.158, 0.045)]),
    ("hair_F", 0.053, 0.023, [H(0.0, -0.07, 0.175), H(0.006, -0.152, 0.13), H(0.0, -0.17, 0.09)]),
    ("hair_F", 0.062, 0.026, [H(-0.065, -0.05, 0.16), H(-0.1, -0.12, 0.11), H(-0.118, -0.125, 0.04)]),
    ("hair_F", 0.062, 0.026, [H(0.07, -0.05, 0.16), H(0.105, -0.115, 0.105), H(0.125, -0.115, 0.03)]),
    # sides over the temples and ear tops
    ("hair_L", 0.070, 0.029, [H(0.11, -0.01, 0.12), H(0.15, -0.03, 0.04), H(0.152, -0.05, -0.04), H(0.145, -0.06, -0.075)]),
    ("hair_R", 0.070, 0.029, [H(-0.11, -0.01, 0.12), H(-0.15, -0.03, 0.04), H(-0.152, -0.05, -0.04), H(-0.145, -0.06, -0.075)]),
    ("hair_L", 0.070, 0.029, [H(0.1, 0.06, 0.12), H(0.155, 0.05, 0.03), H(0.16, 0.06, -0.05)]),
    ("hair_R", 0.070, 0.029, [H(-0.1, 0.06, 0.12), H(-0.155, 0.05, 0.03), H(-0.16, 0.06, -0.05)]),
    # the back, flicking out at the nape
    ("hair_B", 0.078, 0.029, [H(0.0, 0.12, 0.1), H(0.0, 0.175, 0.0), H(0.0, 0.17, -0.09), H(0.0, 0.18, -0.13)]),
    ("hair_B", 0.078, 0.029, [H(0.07, 0.11, 0.1), H(0.1, 0.16, 0.0), H(0.11, 0.15, -0.08), H(0.125, 0.16, -0.115)]),
    ("hair_B", 0.078, 0.029, [H(-0.07, 0.11, 0.1), H(-0.1, 0.16, 0.0), H(-0.11, 0.15, -0.08), H(-0.125, 0.16, -0.115)]),
    # a messy crown
    ("hair_T", 0.062, 0.029, [H(0.01, 0.0, 0.18), H(0.04, 0.05, 0.215), H(0.065, 0.1, 0.225)]),
    ("hair_T", 0.056, 0.026, [H(-0.03, 0.03, 0.18), H(-0.07, 0.08, 0.2), H(-0.1, 0.12, 0.19)]),
    ("hair_T", 0.050, 0.023, [H(0.02, -0.03, 0.18), H(0.02, -0.06, 0.215), H(0.0, -0.09, 0.22)]),
    # a short tied tail at the back of the head
    ("tail_1", 0.070, 0.052, [H(0.0, 0.15, -0.035), H(0.0, 0.21, -0.07), H(0.0, 0.245, -0.12), H(0.0, 0.25, -0.175)]),
    ("tail_2", 0.050, 0.039, [H(0.02, 0.22, -0.08), H(0.04, 0.26, -0.13), H(0.05, 0.27, -0.18)]),
    ("tail_2", 0.046, 0.036, [H(-0.02, 0.22, -0.08), H(-0.035, 0.255, -0.13), H(-0.045, 0.265, -0.17)]),
]
for bone, w, t, pts in CLUMPS:
    hair.strand(pts, w, t, bone, "hair")
hair.cap(H(0, 0.16, -0.03), H(0, 0.178, -0.05), 0.03, 0.03, "tail_1", "hairtie")
AV, AF = hair.mesh(0.0065, smooth=(0.5, 3), decimate=0.45)
# weights: the cap is the head; a clump fades from the head at its root to its own bone at the tip
D = hair.dist(AV)
own = D.argmin(axis=1)
bones = hair.bones()
AW = np.zeros((len(AV), len(NAMES)))
# position along its clump of every primitive: the cap first, then each strand's chain, then the tie
prim_u = [0.0]
for _, _, _, pts in CLUMPS:
    n = max(5, int(sum((b - a).length for a, b in zip(pts, pts[1:])) / 0.012))
    prim_u += [i / (n - 1) for i in range(n)]
prim_u = np.array(prim_u + [0.3])
u = prim_u[own]
for vi in range(len(AV)):
    b = bones[own[vi]]
    k = float(np.clip((u[vi] - 0.15) / 0.7, 0, 1))
    k = k * k * (3 - 2 * k)
    if b == "head":
        AW[vi, BI["head"]] = 1
    elif b == "tail_2":
        AW[vi, BI["tail_1"]] = 1 - k
        AW[vi, BI["tail_2"]] = k
    else:
        AW[vi, BI["head"]] = 1 - k
        AW[vi, BI[b]] = k
AW = normalise(diffuse(AW, AF, 4))
INK.add(AV, AF, colour_by_owner(hair, AV, AF), AW)
print(f"wip: hair {len(AV)} verts")

# ---------------------------------------------------------------- decals on the face


def project(pts2d, depth, through=None):
    """Projects (x, z) points onto the head from the front, lifted `depth` off the skin."""
    out = []
    for x, z in pts2d:
        hit = HEAD_BVH.ray_cast(Vector((x, -1, z)), Vector((0, 1, 0)))
        p, n = hit[0], hit[1]
        if p is None:
            p, n = Vector((x, -0.1, z)), Vector((0, -1, 0))
        out.append(p + n * depth)
    return out


def ellipse2d(cx, cz, rx, rz, n=20, tilt=0.0):
    c, s = math.cos(tilt), math.sin(tilt)
    pts = [(cx, cz)]
    for i in range(n):
        a = 2 * math.pi * i / n
        x, z = rx * math.cos(a), rz * math.sin(a)
        pts.append((cx + x * c - z * s, cz + x * s + z * c))
    return pts, [[0, 1 + i, 1 + (i + 1) % n] for i in range(n)]


def ribbon2d(pts, widths):
    """A stroke along pts with the given half-widths (taper to 0 for a brush tip)."""
    P = [Vector((x, 0, z)) for x, z in pts]
    out = []
    for i, p in enumerate(P):
        d = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        n = Vector((-d.z, 0, d.x))
        out += [(p + n * widths[i])[:: 2], (p - n * widths[i])[:: 2]]
    out = [(a[0], a[1]) for a in out]
    faces = [[2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2] for i in range(len(P) - 1)]
    return out, faces


def arc(cx, cz, rx, rz, a0, a1, n=12):
    return [(cx + rx * math.cos(a), cz + rz * math.sin(a)) for a in np.linspace(a0, a1, n)]


def decal(shape, colour, bone, depth, layer=FACE):
    pts, faces = shape
    V = np.array([p[:] for p in project(pts, depth)])
    layer.add(V, faces, [C[colour]] * len(faces), rigid(len(V), bone), smooth=False)


for s, sd in ((1, "L"), (-1, "R")):
    ex, ez = 0.056 * s, 1.872
    decal(ellipse2d(ex, ez, 0.02, 0.023), "sclera", f"eye_{sd}", 0.0012)
    decal(ellipse2d(ex - 0.002 * s, ez - 0.002, 0.0145, 0.0185), "iris", f"eye_{sd}", 0.0022)
    decal(ellipse2d(ex + 0.004 * s, ez + 0.007, 0.0045, 0.005, 10), "glint", f"eye_{sd}", 0.0032)
    decal(ellipse2d(ex - 0.005 * s, ez - 0.009, 0.0022, 0.0022, 8), "glint", f"eye_{sd}", 0.0032)
    # upper lash line, heavier at the outer corner
    lash = [(ex + (x * s), ez + z) for x, z in arc(0, -0.004, 0.022, 0.027, math.radians(160), math.radians(15), 12)]
    lash.append((ex + 0.027 * s, ez + 0.0085))
    decal(ribbon2d(lash, [0.0015, 0.0025, 0.003, 0.0032, 0.0034, 0.0036, 0.0038, 0.004, 0.004, 0.0038, 0.0032, 0.0022, 0.0008]), "lash", f"eye_{sd}", 0.004)
    # soft brow
    brow = [(ex + x * s, 1.935 + z) for x, z in arc(0.004, -0.02, 0.03, 0.026, math.radians(150), math.radians(35), 10)]
    decal(ribbon2d(brow, [0.004, 0.0048, 0.005, 0.005, 0.0048, 0.0044, 0.004, 0.0034, 0.0026, 0.0012]), "brow", f"brow_{sd}", 0.004)
    decal(ellipse2d(0.088 * s, 1.835, 0.02, 0.011, 16), "blush", "head", 0.0009)
decal(ribbon2d(arc(0, 1.807, 0.02, 0.011, math.radians(200), math.radians(340), 9), [0.0008, 0.0016, 0.002, 0.0022, 0.0022, 0.0022, 0.002, 0.0016, 0.0008]), "mouth", "smile", 0.0025)
decal(ellipse2d(0, 1.79, 0.012, 0.014, 16), "mouth", "mouth_o", 0.002)

# the head, hair and face sit a little lower than they were drawn, for a shorter neck
DROP = 0.035
INK.V[HEAD0:, 2] -= DROP
FACE.V[:, 2] -= DROP
for n in NAMES:
    if n == "head" or PAR[n] in ("head", "tail_1"):
        HEADP[n] = HEADP[n] - Vector((0, 0, DROP))
TAILP["neck"] = TAILP["neck"] - Vector((0, 0, DROP))
TAILP["head"] = TAILP["head"] - Vector((0, 0, DROP))

# ---------------------------------------------------------------- lower the arms from the A-pose to a relaxed hang

LOWER = 34
for s, sd in ((1, "L"), (-1, "R")):
    R = np.array(Matrix.Rotation(math.radians(LOWER * s), 3, "Y"))
    sh = np.array(HEADP[f"arm_{sd}"])
    chain = [BI[f"{n}_{sd}"] for n in ("arm", "fore", "hand")]
    for L in (INK, FACE):
        k = L.W[:, chain].sum(axis=1)[:, None]
        L.V = L.V + k * (((L.V - sh) @ R.T + sh) - L.V)
    for n in ("arm", "fore", "hand"):
        b = f"{n}_{sd}"
        for P in (HEADP, TAILP):
            P[b] = Vector(R @ (np.array(P[b]) - sh) + sh)

# ---------------------------------------------------------------- props, the sprite and the set

HAND_D = {sd: (TAILP[f"hand_{sd}"] - HEADP[f"hand_{sd}"]).normalized() for sd in "LR"}
WRIST = {sd: HEADP[f"hand_{sd}"].copy() for sd in "LR"}
for n, sd in (("hammer", "R"), ("pencil", "R"), ("book", "L")):
    HEADP[n] = WRIST[sd] + HAND_D[sd] * 0.08


def piece(build, colour, bone, layer=INK, smooth=True):
    b = bmesh.new()
    build(b)
    b.verts.index_update()
    V = np.array([v.co[:] for v in b.verts])
    F = [[v.index for v in f.verts] for f in b.faces]
    b.free()
    layer.add(V, F, [C[colour]] * len(F), rigid(len(V), bone), smooth)


def pbox(loc, size, rot=(0, 0, 0), bevel=0.01, seg=2, R=None):
    def go(b):
        m = (Matrix.Translation(Vector(loc)) @ R.to_4x4() @ Matrix.Diagonal(Vector(size)).to_4x4()) if R else M(loc, rot, size)
        v = bmesh.ops.create_cube(b, size=1, matrix=m)["verts"]
        if bevel:
            bmesh.ops.bevel(b, geom=list(b.edges) + v, offset=bevel, segments=seg, profile=0.5, affect="EDGES", clamp_overlap=True)

    return go


def pcyl(a, b_, r1, r2, seg=12):
    def go(b):
        a0, b0 = Vector(a), Vector(b_)
        d = b0 - a0
        bmesh.ops.create_cone(b, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=d.length, matrix=Matrix.Translation((a0 + b0) / 2) @ frame(d).to_4x4())

    return go


def pball(loc, r, scale=(1, 1, 1), rot=(0, 0, 0), seg=(16, 10)):
    def go(b):
        bmesh.ops.create_uvsphere(b, u_segments=seg[0], v_segments=seg[1], radius=r, matrix=M(loc, rot, scale))

    return go


def text(body_, colour, bone, loc, size, rot=(90, 0, 0), layer=FACE):
    cu = bpy.data.curves.new("t", "FONT")
    cu.body = body_
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.extrude = 0.004
    cu.resolution_u = 3
    ob = bpy.data.objects.new("t", cu)
    scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    m = M(loc, rot, (size, size, size))
    V = np.array([(m @ v.co)[:] for v in me.vertices])
    F = [list(p.vertices) for p in me.polygons]
    layer.add(V, F, [C[colour]] * len(F), rigid(len(V), bone), smooth=False)
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me)


# hammer: the grip sits in the right fist, the head hangs below; the striking face points back so a forward
# swing brings it down face-first
w, d = WRIST["R"], HAND_D["R"]
piece(pcyl(w + d * 0.02, w + d * 0.33, 0.0125, 0.0145, 10), "wood", "hammer")
hd = w + d * 0.33
piece(pbox(hd, (0.04, 0.14, 0.045), R=frame(d, up=(1, 0, 0)), bevel=0.008), "steel", "hammer")
piece(pcyl(hd + Vector((0, 0.07, 0)), hd + Vector((0, 0.09, 0)), 0.026, 0.026, 12), "steeldark", "hammer")
# pencil in the right fist, point forward
piece(pcyl(w + d * 0.08 + Vector((0, 0.04, 0)), w + d * 0.08 + Vector((0, -0.06, 0)), 0.007, 0.007, 6), "pencil", "pencil")
piece(pcyl(w + d * 0.08 + Vector((0, -0.06, 0)), w + d * 0.08 + Vector((0, -0.085, 0)), 0.007, 0.0015, 6), "lead", "pencil")
# the same pencil tucked behind the right ear when it is not in use
ep = HEADP["ear_pencil"]
piece(pcyl(ep + Vector((0.0, -0.055, 0.03)), ep + Vector((-0.012, 0.06, -0.01)), 0.0065, 0.0065, 6), "pencil", "ear_pencil")
piece(pcyl(ep + Vector((0.0, -0.055, 0.03)), ep + Vector((0.002, -0.075, 0.037)), 0.0065, 0.0015, 6), "lead", "ear_pencil")
# sketchbook held in the left hand, cover outward
w, d = WRIST["L"], HAND_D["L"]
bc = w + d * 0.06 + Vector((-0.03, -0.06, 0))
piece(pbox(bc, (0.012, 0.2, 0.15), rot=(0, 0, 0), bevel=0.003), "cover", "book")
piece(pbox(bc + Vector((-0.008, 0, 0)), (0.006, 0.19, 0.14), bevel=0.002), "paper", "book")
# plank on the right shoulder, running front to back
pl = HEADP["plank"]
piece(pbox(pl, (0.1, 1.3, 0.035), bevel=0.006), "wood", "plank")
for y in (-0.5, 0.5):
    piece(pbox(pl + Vector((0, y, 0)), (0.102, 0.012, 0.037), bevel=0.002), "wooddark", "plank")

# the WIP sign: two posts, a board with a hand-painted word, and a little roof
sx, sy = HEADP["sign"].x, HEADP["sign"].y
for x in (-0.33, 0.33):
    piece(pbox((sx + x, sy + 0.03, 0.55), (0.07, 0.07, 1.1), bevel=0.012), "wooddark", "sign")
piece(pbox((sx, sy, 0.86), (0.84, 0.05, 0.42), bevel=0.02), "board", "sign")
piece(pbox((sx, sy - 0.005, 0.66), (0.88, 0.06, 0.035), bevel=0.008), "wood", "sign")
piece(pbox((sx, sy - 0.005, 1.06), (0.88, 0.06, 0.035), bevel=0.008), "wood", "sign")
for r in (24, -24):
    piece(pbox((sx + (0.2 if r < 0 else -0.2), sy + 0.02, 1.2), (0.5, 0.2, 0.025), rot=(0, r, 0), bevel=0.008), "wood", "sign")
text("WIP", "ink", "sign", (sx, sy - 0.03, 0.87), 0.27)
# sawhorse
hx, hy = HEADP["sawhorse"].x, HEADP["sawhorse"].y
piece(pbox((hx, hy, 0.5), (0.8, 0.09, 0.07), bevel=0.01), "wood", "sawhorse")
for x in (-0.32, 0.32):
    for yy in (-1, 1):
        piece(pbox((hx + x, hy + 0.1 * yy, 0.25), (0.06, 0.05, 0.54), rot=(-12 * yy, 0, 0), bevel=0.01), "wooddark", "sawhorse")
# a short stack of bricks
bx, by = HEADP["bricks"].x, HEADP["bricks"].y
for x, z, r in [(-0.14, 0.06, 3), (0.14, 0.06, -4), (0.0, 0.18, 8)]:
    piece(pbox((bx + x, by, z), (0.26, 0.13, 0.12), rot=(0, 0, r), bevel=0.02), "brick", "bricks")

# the moss sprite: a puff of moss with a sprout, made like the body
pip = Blob()
pc = HEADP["sprite"] + Vector((0, 0, 0.11))
pip.ell(pc, (0.1, 0.09, 0.095), "sprite", "moss")
rng = np.random.default_rng(7)
for i in range(46):
    th, ph = rng.uniform(0, 2 * math.pi), math.acos(rng.uniform(-0.6, 1))
    n = Vector((math.sin(ph) * math.cos(th), math.sin(ph) * math.sin(th) * 0.9, math.cos(ph)))
    pip.ell(pc + Vector((n.x * 0.09, n.y * 0.08, n.z * 0.085)), (0.03,) * 3, "sprite", "moss" if i % 3 else "mossdark", seg=(10, 6))
for x in (-0.04, 0.04):
    pip.ell(HEADP["sprite"] + Vector((x, -0.01, 0.022)), (0.025, 0.03, 0.02), "sprite", "mossdark")
PV, PF = pip.mesh(0.006, smooth=(0.5, 2))
INK.add(PV, PF, colour_by_owner(pip, PV, PF), rigid(len(PV), "sprite"))
PIP_BVH = BVHTree.FromPolygons([Vector(v) for v in PV], PF)
for x in (-0.032, 0.032):
    pts, faces = ellipse2d(pc.x + x, pc.z + 0.005, 0.009, 0.013, 12)
    V = []
    for px, pz in pts:
        p, n, _, _ = PIP_BVH.ray_cast(Vector((px, -2, pz)), Vector((0, 1, 0)))
        V.append((p + n * 0.003)[:])
    FACE.add(np.array(V), faces, [C["lash"]] * len(faces), rigid(len(V), "sprite"), smooth=False)
lf = HEADP["sprite_leaf"]
piece(pcyl(lf + Vector((0, 0, -0.02)), lf + Vector((0, 0, 0.05)), 0.006, 0.004, 6), "mossdark", "sprite_leaf")
for s in (1, -1):
    piece(pball(lf + Vector((0.032 * s, 0, 0.065)), 0.035, scale=(1, 0.25, 0.5), rot=(0, -28 * s, 0)), "leaf", "sprite_leaf")

# grass tufts and a few daisies, scattered clear of where Nao walks
for gx, gy, n in [(0.95, -0.55, 7), (1.75, -0.1, 6), (-0.95, -0.6, 6), (-1.7, 0.2, 7), (0.35, 0.7, 5), (-0.25, -0.75, 4), (1.1, 0.6, 6), (-0.45, 0.5, 5)]:
    for i in range(n):
        a = 2 * math.pi * i / n + gx
        h = 0.1 + 0.08 * ((i * 37) % 5) / 4
        base = Vector((gx + 0.03 * math.cos(a), gy + 0.03 * math.sin(a), 0))
        tip = base + Vector((0.06 * math.cos(a), 0.06 * math.sin(a), h))
        piece(pcyl(base, tip, 0.014, 0.0, 4), "grass" if i % 2 else "grassdark", "ground", layer=FACE)
for fx, fy in [(1.0, -0.62), (-1.0, -0.55), (1.15, 0.55), (-1.75, 0.25)]:
    st = Vector((fx + 0.05, fy - 0.02, 0.15))
    piece(pcyl(Vector((fx + 0.03, fy - 0.02, 0)), st, 0.004, 0.004, 4), "grassdark", "ground", layer=FACE)
    for i in range(7):
        a = 2 * math.pi * i / 7
        piece(pball(st + Vector((0.022 * math.cos(a), -0.004, 0.022 * math.sin(a))), 0.014, scale=(1, 0.3, 0.55), rot=(0, -math.degrees(a), 0), seg=(8, 4)), "petal", "ground", layer=FACE)
    piece(pball(st + Vector((0, -0.008, 0)), 0.01, scale=(1, 0.6, 1), seg=(8, 6)), "petalcore", "ground", layer=FACE)

# ---------------------------------------------------------------- objects and the rig


def build(layer, name):
    me = bpy.data.meshes.new(name)
    me.from_pydata(layer.V.tolist(), [], layer.F)
    me.polygons.foreach_set("use_smooth", layer.smooth)
    col = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    cols = np.concatenate([np.reshape(c, (-1, 4)) if np.ndim(c) == 2 else np.tile(c, (len(f), 1)) for c, f in zip(layer.FC, layer.F)])
    col.data.foreach_set("color", cols.ravel())
    me.color_attributes.active_color_name = "Col"
    me.color_attributes.render_color_index = me.color_attributes.active_color_index
    me.update()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    W = normalise(layer.W)
    for j, n in enumerate(NAMES):
        vg = ob.vertex_groups.new(name=n)
        for i in np.nonzero(W[:, j])[0]:
            vg.add([int(i)], float(W[i, j]), "REPLACE")
    ob.parent = arm
    ob.modifiers.new("rig", "ARMATURE").object = arm
    print(f"wip: {name} {len(layer.V)} verts {len(layer.F)} faces")
    return ob


arm = bpy.data.objects.new("rig", bpy.data.armatures.new("rig"))
scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
for n in NAMES:
    eb = arm.data.edit_bones.new(n)
    eb.head = HEADP[n]
    eb.tail = HEADP[n] + Vector((0, 0.05, 0))
    eb.roll = 0
    if PAR[n]:
        eb.parent = arm.data.edit_bones[PAR[n]]
        eb.use_connect = False
bpy.ops.object.mode_set(mode="OBJECT")
for pb in arm.pose.bones:
    pb.rotation_mode = "XYZ"
nao = build(INK, "nao")
face = build(FACE, "face")

# ---------------------------------------------------------------- animation helpers


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


EASE = {
    "lin": lambda u: u,
    "io": lambda u: 4 * u**3 if u < 0.5 else 1 - (-2 * u + 2) ** 3 / 2,
    "s": lambda u: u * u * (3 - 2 * u),
    "i": lambda u: u**3,
    "o": lambda u: 1 - (1 - u) ** 3,
    "back": lambda u: 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2,
    "snap": lambda u: 1 - (1 - u) ** 5,
}


def K(t, *keys):
    """Piecewise eased curve: keys are (time, value) or (time, value, ease into this key)."""
    if t <= keys[0][0]:
        return keys[0][1]
    for a, b in zip(keys, keys[1:]):
        if t <= b[0]:
            u = EASE[b[2] if len(b) > 2 else "io"](clamp((t - a[0]) / max(b[0] - a[0], 1e-6)))
            return a[1] + (b[1] - a[1]) * u
    return keys[-1][1]


def pulse(t, t0, dur):
    """0 -> 1 -> 0 over dur starting at t0, smooth."""
    u = (t - t0) / dur
    return math.sin(math.pi * u) ** 2 if 0 < u < 1 else 0.0


def wobble(t, t0, amp, freq=4.0, decay=4.0):
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


THIGH, SHIN = 0.44, 0.46


def base(P, t):
    """The relaxed stance every clip builds on: soft elbows, breathing, props away, the sprite bobbing."""
    br = math.sin(2 * math.pi * t / 3.2)
    P.r("fore_L", x=-8).r("fore_R", x=-8).r("arm_L", y=-2).r("arm_R", y=2)
    P.r("hand_L", z=-6).r("hand_R", z=6)
    P.r("chest", x=-1.2 * br).r("spine", x=-0.6 * br).l("chest", z=0.003 * br)
    P.r("shoulder_L", y=-0.8 * br).r("shoulder_R", y=0.8 * br)
    for n in PROPS:
        P.s(n, HIDE, HIDE, HIDE)
    P.s("mouth_o", HIDE, HIDE, HIDE)
    P.l("sprite", z=0.012 * (0.5 + 0.5 * math.sin(2 * math.pi * t / 1.6)))
    P.s("sprite", 1 + 0.03 * math.sin(2 * math.pi * t / 1.6 + 2), 1, 1 - 0.03 * math.sin(2 * math.pi * t / 1.6 + 2))


def show(P, n, k):
    v = max(k, HIDE) / HIDE
    P.s(n, v, v, v)


def hide(P, n, k):
    """k = 1 hides a part that is normally shown."""
    v = max(1 - k, HIDE)
    P.s(n, v, v, v)


def torso(P, x=0, y=0, z=0):
    P.r("spine", x=x * 0.45, y=y * 0.45, z=z * 0.4).r("chest", x=x * 0.55, y=y * 0.55, z=z * 0.6)


def crouch(P, d, lean=0.0):
    """Drops the hips by d with both feet planted: thigh forward, shin back, foot level."""
    d = clamp(d, -0.05, 0.5)
    a = math.degrees(math.acos(clamp(1 - max(d, 0) / (THIGH + SHIN), -1, 1)))
    for sd in "LR":
        P.r(f"thigh_{sd}", x=-a).r(f"shin_{sd}", x=2 * a).r(f"foot_{sd}", x=-a)
    P.l("hips", z=-d)
    torso(P, x=a * 0.35 + lean)


def walk(P, phase, amp=1.0, arms=True):
    s, c = math.sin(phase), math.cos(phase)
    P.r("thigh_L", x=-24 * amp * s).r("thigh_R", x=24 * amp * s)
    P.r("shin_L", x=38 * amp * max(0, c) ** 1.5).r("shin_R", x=38 * amp * max(0, -c) ** 1.5)
    P.r("foot_L", x=-8 * amp * s).r("foot_R", x=8 * amp * s)
    P.l("hips", z=0.022 * amp * abs(c) - 0.015 * amp)
    P.r("hips", z=5 * amp * s, y=2.5 * amp * c)
    torso(P, z=-8 * amp * s, x=3 * amp)
    P.r("neck", z=3 * amp * s)
    if arms:
        P.r("arm_L", x=20 * amp * s).r("arm_R", x=-20 * amp * s)
        P.r("fore_L", x=-10 * amp * max(0, -s)).r("fore_R", x=-10 * amp * max(0, s))


def look(P, yaw, pitch=0.0, tilt=0.0):
    P.r("neck", z=yaw * 0.35, x=pitch * 0.35).r("head", z=yaw * 0.65, x=pitch * 0.65, y=tilt - yaw * 0.08)
    ex, ez = clamp(yaw / 35, -1, 1) * 0.004, clamp(-pitch / 25, -1, 1) * 0.003
    P.l("eye_L", x=ex, z=ez).l("eye_R", x=ex, z=ez)


def blink(P, t, t0, dur=0.18):
    k = 1 - 0.93 * pulse(t, t0, dur)
    P.s("eye_L", 1, 1, k).s("eye_R", 1, 1, k)


def eyes(P, k):
    P.s("eye_L", k, 1, k).s("eye_R", k, 1, k)


def happy(P, k):
    """Smiling eyes: the lids close into soft arcs and the brows lift; k = 0..1."""
    P.s("eye_L", 1, 1, 1 - 0.6 * k).s("eye_R", 1, 1, 1 - 0.6 * k)
    P.s("smile", 1 + 0.3 * k, 1, 1 + 0.6 * k)
    brows(P, 0.3 * k)


def brows(P, k):
    P.l("brow_L", z=0.008 * k).l("brow_R", z=0.008 * k)


def mouth_o(P, k):
    show(P, "mouth_o", k)
    v = max(1 - k, HIDE)
    P.s("smile", v, v, v)


def hop_pip(P, t, t0, h=0.14, dur=0.45):
    u = (t - t0) / dur
    if 0 < u < 1:
        P.l("sprite", z=4 * h * u * (1 - u))
        P.s("sprite", 1 - 0.1 * math.sin(math.pi * u), 1, 1 + 0.15 * math.sin(math.pi * u))
    elif 0 < u - 1 < 0.4:
        k = math.exp(-12 * (u - 1) * dur) * 0.2
        P.s("sprite", 1 + k, 1, 1 - k)


# ---------------------------------------------------------------- clips


def idle(t):
    P = Pose()
    base(P, t)
    # weight shifts onto one hip and back
    shift = math.sin(2 * math.pi * t / 6)
    P.l("hips", x=0.012 * shift).r("hips", y=-2.5 * shift)
    torso(P, y=3.5 * shift)
    P.r("thigh_L", y=2.5 * shift).r("thigh_R", y=2.5 * shift)
    P.r("shin_L", x=4 * max(-shift, 0)).r("shin_R", x=4 * max(shift, 0))
    yaw = K(t, (0, 0), (1.0, 0), (1.5, 28, "s"), (2.6, 28), (3.2, -22, "s"), (4.3, -22), (4.9, 0, "s"), (6, 0))
    pitch = K(t, (0, 0), (1.0, 0), (1.5, -6, "s"), (2.6, -4), (3.2, 4, "s"), (4.3, 4), (4.9, 0, "s"))
    look(P, yaw, pitch, tilt=4 * math.sin(2 * math.pi * t / 6 + 1))
    for b in (0.7, 3.0, 5.2, 5.42):
        blink(P, t, b)
    P.r("arm_L", x=3 * math.sin(2 * math.pi * t / 6 + 0.5)).r("arm_R", x=-3 * math.sin(2 * math.pi * t / 6 + 0.5))
    # Nao notices the sprite, which hops
    hop_pip(P, t, 3.4, 0.08, 0.35)
    P.r("sprite_leaf", y=8 * math.sin(2 * math.pi * t / 2))
    return P


def wave(t):
    P = Pose()
    base(P, t)
    up = K(t, (0, 0), (0.35, -0.08), (0.75, 1, "back"), (2.55, 1), (3.05, 0, "s"), (3.4, 0))
    P.r("arm_R", y=105 * up, x=-15 * up).r("shoulder_R", y=-12 * up)
    w = math.sin(2 * math.pi * 2.2 * (t - 0.75)) if 0.75 < t < 2.55 else 0
    ramp = clamp((t - 0.75) / 0.2) * clamp((2.55 - t) / 0.2)
    P.r("fore_R", y=28 * w * ramp + 55 * up, x=-10 * up)
    P.r("hand_R", z=-80 * up, y=-10 * w * ramp)
    torso(P, y=-5 * up + 2 * w * ramp, z=-6 * up)
    P.r("hips", y=2 * up)
    P.r("arm_L", y=-4 * up)
    look(P, -4 * up, -5 * up, tilt=-8 * up + 3 * w * ramp)
    # a little bounce on the toes when the hand goes up
    P.l("root", z=0.025 * pulse(t, 0.55, 0.4))
    happy(P, clamp(up * 1.1))
    blink(P, t, 2.95)
    # the sprite waves its leaf back
    P.r("sprite_leaf", y=22 * math.sin(2 * math.pi * 2.6 * t) * pulse(t, 1.0, 1.4))
    hop_pip(P, t, 0.9, 0.06, 0.3)
    return P


def hammer(t):
    P = Pose()
    base(P, t)
    T0, T1 = 0.75, 5.0  # arrive, leave
    face = K(t, (0, 0), (0.25, 0), (0.7, 90, "s"), (T1 - 0.1, 90), (T1 + 0.4, 0, "s"), (5.8, 0))
    P.r("root", z=face)
    x = K(t, (0, 0), (0.15, 0), (T0, 0.56, "s"), (T1, 0.56), (T1 + 0.55, 0, "s"))
    P.l("root", x=x, y=K(t, (0, 0), (0.15, 0), (T0, -0.3, "s"), (T1, -0.3), (T1 + 0.55, 0, "s")))
    for a0, a1 in ((0.15, T0), (T1, T1 + 0.55)):
        if a0 < t < a1:
            u = (t - a0) / (a1 - a0)
            walk(P, u * 2 * math.pi, 0.8 * math.sin(math.pi * u), arms=False)
    show(P, "hammer", K(t, (0, 0), (0.3, 0), (0.55, 1, "back"), (T1 - 0.2, 1), (T1, 0, "i")))
    # the left hand steadies a nail against the post
    steady = K(t, (0.7, 0), (1.05, 1), (3.9, 1), (4.2, 0))
    P.r("arm_L", x=-55 * steady, y=8 * steady).r("fore_L", x=-55 * steady).r("hand_L", z=-40 * steady)
    strikes = [(1.45, 0.5, 0.8), (1.95, 0.3, 0.8), (2.45, 0.3, 0.85), (3.6, 0.6, 1.2)]
    arm, fore, lean, sq = -10.0, -10.0, 0.0, 0.0
    for i, (ti, wl, big) in enumerate(strikes):
        prev = strikes[i - 1][0] if i else 0.8
        if prev < t <= ti + 0.3:
            top = ti - wl * 0.15
            arm = K(t, (prev, -45 if i else -10), (top, -150 * min(big, 1.0) - 15 * (big - 0.8), "o"), (ti, -48, "i"), (ti + 0.3, -45, "o"))
            fore = K(t, (prev, -15 if i else -10), (top, -70 * big, "o"), (ti, -12, "i"), (ti + 0.3, -15))
            lean = K(t, (prev, 6 if i else 0), (top, -6 * big, "o"), (ti, 14 * big, "i"), (ti + 0.3, 6))
            sq = math.exp(-14 * max(t - ti, 0)) if t > ti else 0
    if t > strikes[-1][0] + 0.3:
        k = K(t, (3.9, 1), (4.4, 0))
        arm, fore, lean = -45 * k - 10 * (1 - k), -15 * k - 10 * (1 - k), 6 * k
    P.r("arm_R", x=arm, y=-4).r("fore_R", x=fore).r("shoulder_R", x=0.08 * arm)
    torso(P, x=lean, z=-0.08 * arm)
    crouch(P, 0.03 * steady + 0.03 * sq, 0)
    for ti, _, big in strikes:
        P.r("sign", y=wobble(t, ti, 2.5 * big, 6), x=wobble(t, ti, 1.5 * big, 5))
        if t > ti:
            k = math.exp(-10 * (t - ti))
            P.s("eye_L", 1, 1, 1 - 0.7 * k).s("eye_R", 1, 1, 1 - 0.7 * k)
    look(P, 0, 18 * K(t, (0.6, 0), (1.0, 1), (3.9, 1), (4.3, 0)))
    # steps back, looks at the work, proud nod
    P.r("head", x=-10 * pulse(t, 4.3, 0.5))
    happy(P, pulse(t, 3.9, 1.1))
    mouth_o(P, 0.8 * pulse(t, 3.5, 0.4))
    P.r("sprite_leaf", y=sum(wobble(t, ti, 10, 5, 6) for ti, _, _ in strikes))
    hop_pip(P, t, 3.62, 0.1, 0.35)
    return P


def dance(t):
    P = Pose()
    base(P, t)
    B = 0.45
    beat = t / B
    on = clamp(t / 0.35) * clamp((5.0 - t) / 0.4)
    bounce = abs(math.sin(math.pi * beat))
    if t < 1.8:  # side steps with swinging arms
        crouch(P, 0.05 * (1 - bounce) * on)
        side = math.sin(math.pi * beat)
        P.l("root", x=0.12 * math.sin(math.pi * beat / 2) * on)
        P.r("hips", y=-6 * side * on)
        torso(P, y=8 * side * on, z=6 * side * on)
        look(P, 0, 0, tilt=-8 * side * on)
        swing = math.sin(math.pi * beat)
        P.r("arm_L", x=(-35 - 35 * swing) * on, y=-15 * on).r("fore_L", x=(-60 + 20 * swing) * on)
        P.r("arm_R", x=(-35 + 35 * swing) * on, y=15 * on).r("fore_R", x=(-60 - 20 * swing) * on)
        P.r("thigh_L", x=-25 * max(0, side) * on, y=-6 * max(0, side) * on).r("shin_L", x=40 * max(0, side) * on)
        P.r("thigh_R", x=-25 * max(0, -side) * on, y=6 * max(0, -side) * on).r("shin_R", x=40 * max(0, -side) * on)
    elif t < 2.7:  # a twirl with arms out
        u = clamp((t - 1.8) / 0.9)
        P.r("root", z=360 * EASE["io"](u))
        P.l("root", z=0.06 * math.sin(math.pi * u))
        out = math.sin(math.pi * u)
        P.r("arm_L", y=-75 * out, x=-10 * out).r("arm_R", y=75 * out, x=-10 * out).r("fore_L", y=-15 * out).r("fore_R", y=15 * out)
        P.r("thigh_R", x=-35 * out).r("shin_R", x=60 * out)
        look(P, 0, -10 * out)
        happy(P, out)
    elif t < 4.3:  # claps on the beat, hips swaying
        i = (t - 2.7) / B
        clap = abs(math.sin(math.pi * i))
        crouch(P, 0.06 * (1 - bounce))
        sway = math.sin(math.pi * i / 2)
        P.r("hips", y=-7 * sway).l("root", x=0.04 * sway)
        torso(P, y=9 * sway)
        P.r("arm_L", x=-70, y=8 + 22 * clap).r("fore_L", x=-55, y=-20 * (1 - clap))
        P.r("arm_R", x=-70, y=-8 - 22 * clap).r("fore_R", x=-55, y=20 * (1 - clap))
        P.r("hand_L", z=40).r("hand_R", z=-40)
        look(P, 10 * sway, -6, tilt=-6 * sway)
        happy(P, 0.8)
        hop_pip(P, t, 2.75, 0.07, 0.45)
        hop_pip(P, t, 3.65, 0.07, 0.45)
    else:  # ta-da
        k = K(t, (4.3, 0), (4.5, 1, "back"), (4.75, 1), (5.2, 0))
        P.r("arm_L", y=-120 * k, x=-20 * k).r("arm_R", y=120 * k, x=-20 * k).r("fore_L", y=-20 * k).r("fore_R", y=20 * k)
        P.r("hand_L", z=-60 * k).r("hand_R", z=60 * k)
        P.r("thigh_L", y=-8 * k).r("thigh_R", y=8 * k)
        look(P, 0, -10 * k, tilt=6 * k)
        happy(P, k)
        mouth_o(P, 0.7 * k)
    P.r("sprite_leaf", y=15 * math.sin(math.pi * beat))
    return P


def jump(t):
    P = Pose()
    base(P, t)
    d = K(t, (0, 0), (0.4, 0.22, "o"), (0.5, 0, "i"), (1.18, 0), (1.28, 0.2, "o"), (1.6, 0.0, "s"), (2.8, 0))
    crouch(P, max(d, 0), lean=10 * K(t, (0, 0), (0.4, 1), (0.5, -0.4), (1.1, 0), (1.28, 0.6), (1.6, 0)))
    air = clamp((t - 0.5) / 0.68)
    z = 4 * 0.6 * air * (1 - air) if 0.5 < t < 1.18 else 0
    P.l("root", z=z + 0.05 * (pulse(t, 1.85, 0.3) + pulse(t, 2.2, 0.3)))
    tuck = math.sin(math.pi * air) if 0.5 < t < 1.18 else 0
    for sd in "LR":
        P.r(f"thigh_{sd}", x=-45 * tuck).r(f"shin_{sd}", x=80 * tuck).r(f"foot_{sd}", x=-15 * tuck)
    arms = K(t, (0, 0), (0.4, 35, "o"), (0.55, -160, "o"), (1.1, -160), (1.25, -60, "o"), (1.6, -150, "back"), (2.35, -150), (2.8, 0, "s"))
    pump = 15 * (pulse(t, 1.85, 0.3) + pulse(t, 2.2, 0.3))
    wide = clamp(-arms / 160)
    P.r("arm_L", x=arms, y=-14 * wide - pump).r("arm_R", x=arms, y=14 * wide + pump)
    P.r("fore_L", x=-25 * (1 - tuck) - pump).r("fore_R", x=-25 * (1 - tuck) - pump)
    look(P, 0, K(t, (0, 0), (0.4, 12), (0.55, -18), (1.15, -10), (1.28, 8), (1.6, -12), (2.4, -12), (2.8, 0)))
    happy(P, K(t, (0, 0), (0.5, 0), (0.6, 1), (2.4, 1), (2.8, 0)))
    mouth_o(P, K(t, (0, 0), (0.5, 0), (0.6, 1), (1.18, 1), (1.35, 0.6), (2.4, 0.6), (2.8, 0)))
    hop_pip(P, t, 0.6, 0.22, 0.55)
    P.r("sprite_leaf", y=wobble(t, 1.15, 25, 4, 4))
    return P


def trip(t):
    P = Pose()
    base(P, t)
    # walks toward you, catches a toe, stumbles, windmills, catches balance, laughs it off
    walking = t < 1.1
    P.l("root", y=K(t, (0, 0), (1.1, -0.5, "lin"), (1.55, -0.78, "o"), (1.9, -0.86, "o"), (3.9, -0.86), (4.9, 0, "s"), (5.2, 0)))
    if walking:
        walk(P, 2 * math.pi * 1.1 * t, clamp(t / 0.25))
    if 3.9 < t < 4.9:
        walk(P, -2 * math.pi * 1.4 * (t - 3.9), math.sin(math.pi * (t - 3.9)) * 0.7)
    lurch = K(t, (1.0, 0), (1.15, 0.2, "o"), (1.45, 1, "o"), (1.85, 0.25, "s"), (2.4, 0, "s"))
    torso(P, x=38 * lurch)
    P.r("hips", x=10 * lurch)
    # the right foot snags and kicks back, the left takes a big save step
    P.r("thigh_R", x=K(t, (1.0, 0), (1.15, 22, "o"), (1.45, 30), (1.9, 0, "s")))
    P.r("shin_R", x=K(t, (1.0, 0), (1.15, 50, "o"), (1.6, 20), (1.9, 0, "s")))
    P.r("thigh_L", x=K(t, (1.1, 0), (1.4, -48, "o"), (1.7, -20), (2.1, 0, "s")))
    P.r("shin_L", x=K(t, (1.1, 0), (1.3, 40, "o"), (1.6, 15), (2.1, 0, "s")))
    P.l("hips", z=-0.08 * pulse(t, 1.35, 0.6))
    # arms windmill
    mill = pulse(t, 1.05, 1.0)
    P.r("arm_L", x=-110 * mill + 70 * math.sin(2 * math.pi * 3 * t) * mill, y=-35 * mill)
    P.r("arm_R", x=-110 * mill - 70 * math.sin(2 * math.pi * 3 * t) * mill, y=35 * mill)
    P.r("fore_L", x=-30 * mill).r("fore_R", x=-30 * mill)
    surprise = pulse(t, 1.0, 1.0)
    eyes(P, 1 + 0.3 * surprise)
    brows(P, surprise)
    mouth_o(P, clamp(surprise * 1.5))
    # a wobbly recovery, then a sheepish scratch of the head and a laugh
    wob = wobble(t, 1.9, 7, 2.5, 3)
    torso(P, y=wob)
    P.r("hips", y=-wob * 0.5)
    scratch = K(t, (2.3, 0), (2.6, 1, "back"), (3.6, 1), (3.95, 0))
    P.r("arm_R", x=-60 * scratch, y=110 * scratch).r("fore_R", y=-100 * scratch, x=-40 * scratch + 8 * math.sin(2 * math.pi * 5 * t) * scratch)
    P.r("hand_R", z=-40 * scratch)
    look(P, 8 * scratch, 10 * scratch, tilt=-10 * scratch)
    laugh = pulse(t, 2.5, 1.2)
    torso(P, x=6 * laugh * (0.5 + 0.5 * math.sin(2 * math.pi * 6 * t)))
    happy(P, 0.9 * scratch)
    blink(P, t, 2.3)
    # the sprite jumps in alarm
    hop_pip(P, t, 1.2, 0.18, 0.4)
    P.r("sprite_leaf", y=wobble(t, 1.6, 30, 5, 3))
    return P


def carry(t):
    P = Pose()
    base(P, t)
    pop = K(t, (0, 0), (0.15, 0), (0.45, 1, "back"), (4.75, 1), (4.85, 1.1), (5.05, 0, "i"))
    show(P, "plank", pop)
    hold = K(t, (0, 0), (0.12, 0), (0.4, 1, "o"), (4.8, 1), (5.1, 0, "s"))
    P.r("arm_R", x=-35 * hold, y=60 * hold).r("fore_R", x=-125 * hold, y=-20 * hold).r("hand_R", z=-50 * hold)
    P.r("shoulder_R", y=-8 * hold)
    crouch(P, K(t, (0.35, 0), (0.5, 0.08, "o"), (0.8, 0.02, "back"), (4.7, 0.02), (5.0, 0)))
    torso(P, y=-7 * hold)
    face = K(t, (0, 0), (0.6, 0), (0.95, -90, "s"), (2.3, -90), (2.8, 90, "s"), (4.3, 90), (4.7, 0, "s"))
    P.r("root", z=face)
    P.l("root", x=K(t, (0, 0), (0.9, 0), (2.3, -0.55, "lin"), (2.8, -0.55), (4.3, 0, "lin")))
    for t0, t1 in ((0.9, 2.3), (2.8, 4.3)):
        if t0 < t < t1:
            u = (t - t0) / (t1 - t0)
            walk(P, 2 * math.pi * 2 * u, 0.8 * min(1, 5 * min(u, 1 - u)) + 0.15)
            P.r("arm_R", x=-0 * u)
    P.r("plank", x=3 * math.sin(2 * math.pi * 1.4 * t) * hold + wobble(t, 2.25, 8, 5, 5), z=wobble(t, 2.25, 5, 4, 4))
    # the plank nearly clips the sprite, which ducks
    duck = pulse(t, 1.9, 0.8)
    P.s("sprite", 1 + 0.2 * duck, 1, 1 - 0.35 * duck)
    surprise = pulse(t, 2.15, 0.6)
    eyes(P, 1 + 0.3 * surprise)
    mouth_o(P, surprise)
    look(P, -20 * surprise, 8 * surprise)
    # the free hand wipes the brow, then a satisfied nod
    wipe = pulse(t, 4.25, 0.8)
    P.r("arm_L", x=-100 * wipe, y=-30 * wipe).r("fore_L", x=-110 * wipe, z=-25 * math.sin(2 * math.pi * 3 * t) * wipe)
    happy(P, pulse(t, 4.4, 0.9))
    P.r("head", x=9 * pulse(t, 5.0, 0.4))
    blink(P, t, 1.6)
    return P


def sketch(t):
    P = Pose()
    base(P, t)
    on = K(t, (0, 0), (0.15, 0), (0.6, 1, "o"), (4.6, 1), (5.1, 0, "s"))
    show(P, "book", K(t, (0, 0), (0.25, 0), (0.5, 1, "back"), (4.7, 1), (4.95, 0, "i")))
    grab = K(t, (0, 0), (0.15, 0), (0.35, 1, "s"), (0.55, 0, "s"))
    # the pencil comes from behind the ear and goes back there at the end
    fetch = pulse(t, 0.05, 0.6) + pulse(t, 4.55, 0.6)
    pen = 1.0 if 0.35 < t < 4.85 else 0.0
    show(P, "pencil", pen)
    hide(P, "ear_pencil", pen)
    P.r("arm_R", x=-40 * fetch, y=100 * fetch).r("fore_R", y=-120 * fetch, x=-30 * fetch)
    P.r("arm_L", x=-38 * on, y=12 * on).r("fore_L", x=-85 * on, y=18 * on).r("hand_L", z=-70 * on, x=10 * on)
    draw = on * (1 - min(1, 2 * pulse(t, 2.6, 0.7)))
    sc = math.sin(2 * math.pi * 5 * t)
    P.r("arm_R", x=-34 * draw + 4 * sc * draw, y=-10 * draw).r("fore_R", x=-80 * draw, y=-12 * draw + 6 * math.sin(2 * math.pi * 2.3 * t) * draw)
    P.r("hand_R", z=50 * draw, x=-8 * sc * draw)
    look(P, -10 * on, 22 * on * (1 - pulse(t, 2.6, 0.7)) - 6 * pulse(t, 2.6, 0.7), tilt=-6 * on)
    torso(P, x=6 * on)
    # pauses to think, tapping the pencil on the chin, then a happy last stroke
    think = pulse(t, 2.6, 0.7)
    P.r("arm_R", x=-40 * think, y=20 * think).r("fore_R", x=-120 * think)
    brows(P, think)
    P.l("eye_L", x=0.004 * think, z=0.003 * think).l("eye_R", x=0.004 * think, z=0.003 * think)
    happy(P, pulse(t, 3.9, 0.9))
    blink(P, t, 1.5)
    # the sprite peeks over at the page
    peek = pulse(t, 1.2, 2.6)
    P.l("sprite", x=0.12 * peek, z=0.03 * peek).r("sprite", z=-25 * peek)
    P.r("sprite_leaf", y=10 * math.sin(2 * math.pi * 1.5 * t))
    return P


CLIPS = [  # name, fn, seconds, loops
    ("Idle", idle, 6.0, True),
    ("Wave", wave, 3.4, False),
    ("Hammer", hammer, 5.8, False),
    ("Dance", dance, 5.2, False),
    ("Jump", jump, 2.8, False),
    ("Trip", trip, 5.2, False),
    ("Carry", carry, 5.4, False),
    ("Sketch", sketch, 5.2, False),
]

# ---------------------------------------------------------------- sampling, with springs on hair, tail and leaf

SPRINGS = [  # bone, tip from its pivot, frequency, damping, how far it may swing (deg)
    ("hair_F", (0, -0.03, -0.1), 2.4, 0.25, 22),
    ("hair_L", (0.02, 0, -0.12), 2.2, 0.25, 22),
    ("hair_R", (-0.02, 0, -0.12), 2.2, 0.25, 22),
    ("hair_B", (0, 0.03, -0.13), 2.0, 0.22, 25),
    ("hair_T", (0, 0.05, 0.05), 2.6, 0.2, 25),
    ("tail_1", (0, 0.05, -0.07), 1.8, 0.2, 35),
    ("tail_2", (0, 0.02, -0.08), 2.4, 0.2, 40),
    ("sprite_leaf", (0, 0, 0.08), 2.2, 0.15, 35),
]


def basis(p):
    R = Euler([math.radians(a) for a in p[3:6]]).to_matrix().to_4x4()
    return Matrix.Translation(Vector(p[0:3])) @ R @ Matrix.Diagonal(Vector(p[6:9])).to_4x4()


REST = [0, 0, 0, 0, 0, 0, 1, 1, 1]


def world(P, n, cache):
    if n not in cache:
        par = PAR[n]
        m = Matrix.Translation(HEADP[n] - (HEADP[par] if par else Vector())) @ basis(P.get(n, REST))
        cache[n] = (world(P, par, cache) @ m) if par else m
    return cache[n]


def sample(fn, dur, loop):
    n = round(dur * FPS)
    frames = [fn(f / FPS) for f in range(n + 1)]
    state = {}
    out = []
    h = 1 / FPS / 4
    for ps in range(2 if loop else 1):
        for P in frames:
            cache = {}
            for b, tip, fq, z, lim in SPRINGS:
                o = Vector(tip)
                Mb = world(P, b, cache)
                target = Mb @ (HEADP[b] + o)
                x, v = state.get(b, (target.copy(), Vector()))
                w = 2 * math.pi * fq
                for _ in range(4):
                    v += (w * w * (target - x) - 2 * z * w * v) * h
                    x += v * h
                state[b] = (x, v)
                if ps == (1 if loop else 0):
                    local = Mb.inverted() @ x - HEADP[b]
                    q = o.rotation_difference(local)
                    ang = min(q.angle, math.radians(lim))
                    q = Quaternion(q.axis, ang) if q.angle > 1e-6 else Quaternion()
                    p = P.b(b)
                    e = (Euler([math.radians(a) for a in p[3:6]]).to_matrix() @ q.to_matrix()).to_euler("XYZ")
                    p[3:6] = [math.degrees(a) for a in e]
                    for k in [k for k in cache if k == b or PAR.get(k) == b]:
                        del cache[k]
            if ps == (1 if loop else 0):
                out.append(P)
    return out


def bake(name, frames):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    slot = act.slots.new(id_type="OBJECT", name=arm.name)
    strip = act.layers.new("main").strips.new(type="KEYFRAME")
    bag = strip.channelbag(slot, ensure=True)
    for bn in NAMES:
        for prop, off in (("location", 0), ("rotation_euler", 3), ("scale", 6)):
            for i in range(3):
                vals = []
                for f, P in enumerate(frames):
                    v = P.get(bn, REST)[off + i]
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
ONLY = ARGS[ARGS.index("--clip") + 1].split(",") if "--clip" in ARGS else None
baked = []
for name, fn, dur, loop in CLIPS:
    if ONLY and PREVIEW and name not in ONLY:
        continue
    act, slot = bake(name, sample(fn, dur, loop))
    baked.append((name, act, slot, dur))
    print(f"wip: {name} {dur:.1f}s")


def use(act, slot):
    arm.animation_data.action = act
    arm.animation_data.action_slot = slot


# ---------------------------------------------------------------- preview helpers

if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    try:
        scene.render.engine = "BLENDER_WORKBENCH"
    except TypeError as e:
        print(e)
    sh = scene.display.shading
    sh.light = "STUDIO"
    sh.color_type = "VERTEX"
    sh.show_shadows = False
    sh.show_cavity = False
    sh.show_object_outline = True
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("w")
    scene.world.color = (0.75, 0.82, 0.9)
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x = scene.render.resolution_y = 420
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.lens = 40

    def aim(loc, target=(0, 0, 1.0), lens=40):
        cam.location = loc
        cam.data.lens = lens
        cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()

    def shot(path):
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)

    def strip_of(paths, out):
        imgs = []
        for p in paths:
            im = bpy.data.images.load(p)
            imgs.append(np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4))
            bpy.data.images.remove(im)
        row = np.concatenate(imgs, axis=1)
        h, w_ = row.shape[:2]
        im = bpy.data.images.new("strip", w_, h, alpha=True)
        im.pixels[:] = row.ravel()
        im.filepath_raw = out
        im.file_format = "PNG"
        im.save()
        bpy.data.images.remove(im)
        for p in paths:
            os.remove(p)

    def rest_preview():
        views = [((0, -4.2, 1.2), (0, 0, 1.05), 50), ((2.6, -3.2, 1.6), (0, 0, 1.05), 50), ((4.2, 0, 1.2), (0, 0, 1.05), 50),
                 ((0, -1.6, 1.9), (0, 0, 1.88), 60), ((0.9, -1.2, 1.95), (0, 0, 1.9), 60), ((0, 1.8, 1.95), (0, 0, 1.9), 60)]
        paths = []
        for i, (loc, tg, lens) in enumerate(views):
            aim(loc, tg, lens)
            paths.append(os.path.join(PREVIEW, f"_rest{i}.png"))
            shot(paths[-1])
        strip_of(paths, os.path.join(PREVIEW, "rest.png"))

    if "--rest" in ARGS:
        rest_preview()

    aim((0.6, -4.4, 1.5), (0.2, 0, 1.05), 38)
    n = int(ARGS[ARGS.index("--n") + 1]) if "--n" in ARGS else 6
    for name, act, slot, dur in baked:
        use(act, slot)
        paths = []
        for j in range(n):
            scene.frame_set(round(j * dur * FPS / (n - 1)))
            paths.append(os.path.join(PREVIEW, f"_{name}{j}.png"))
            shot(paths[-1])
        strip_of(paths, os.path.join(PREVIEW, f"{name}.png"))
        print(f"wip: preview {name}")

# ---------------------------------------------------------------- export

if not (PREVIEW and ONLY):
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.location, pb.rotation_euler, pb.scale = (0, 0, 0), (0, 0, 0), (1, 1, 1)
    for o in list(bpy.data.objects):
        if o not in (arm, nao, face):
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
