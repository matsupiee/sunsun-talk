"""bpy(ヘッドレスBlender)でスンスンのボディメッシュを生成し glTF(GLB) を出力する。

要点:
- 現行 three.js 版と同一のプロファイル/座標系（three.js: y-up, 前面 +z）。
  Blender内では z-up で組み、model(x,y,z) -> Blender(x,-z,y) で配置。
  glTF エクスポート(+Y up)で three.js 座標に一致する。
- 口は「デカール」ではなく、前面に本当に凹んだ開口（マテリアルは非光沢の黒）。
- シェイプキー mouthOpen で下唇側が下がり口が縦に開く（glTFのmorph targetになる）。

実行: python3 scripts/make-body-glb.py  （リポジトリルートで）
出力: public/assets/model/sunsun-body.glb
"""
import bpy
import numpy as np
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "model", "sunsun-body.glb")

# ---- シーン初期化 -----------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---- ボディのラテ（回転体）メッシュ -----------------------------------------
# three.js 版 LatheGeometry と同じプロファイル (radius, y)。
PROFILE = [
    (0.02, -0.32),
    (0.25, -0.30),
    (0.39, -0.22),
    (0.45, -0.02),
    (0.46, 0.30),
    (0.465, 0.70),
    (0.47, 1.10),
    (0.47, 1.50),
    (0.45, 1.80),
    (0.41, 2.00),
    (0.33, 2.14),
    (0.20, 2.23),
    (0.02, 2.27),
]

RADIAL = 160  # 周方向分割（口の輪郭のジャギー防止に高め）
prof_r = np.array([p[0] for p in PROFILE])
prof_y = np.array([p[1] for p in PROFILE])

# プロファイルを弧長ベースで密にリサンプル。顔（口まわり）は特に密に。
dense_y = []
for y0, y1 in zip(prof_y[:-1], prof_y[1:]):
    seg = np.linspace(y0, y1, 8, endpoint=False)
    dense_y.extend(seg.tolist())
dense_y.append(prof_y[-1])
dense_y = np.array(dense_y)
# 口の高さ帯 (1.55..1.95) はさらに2倍の密度に
extra = np.linspace(1.55, 1.95, 64)
dense_y = np.sort(np.unique(np.concatenate([dense_y, extra])))
dense_r = np.interp(dense_y, prof_y, prof_r)

verts = []
faces = []
rows = len(dense_y)
for i in range(rows):
    r, y = dense_r[i], dense_y[i]
    for j in range(RADIAL):
        th = 2 * np.pi * j / RADIAL
        # model(x, y, z) -> Blender(x, -z, y)。model 前面は +z。
        mx = r * np.sin(th)
        mz = r * np.cos(th)
        verts.append((mx, -mz, y))
for i in range(rows - 1):
    for j in range(RADIAL):
        a = i * RADIAL + j
        b = i * RADIAL + (j + 1) % RADIAL
        c = (i + 1) * RADIAL + (j + 1) % RADIAL
        d = (i + 1) * RADIAL + j
        faces.append((a, b, c, d))
# 上下のキャップ（三角ファン）
top_center = len(verts)
verts.append((0, 0, dense_y[-1] + 0.005))
for j in range(RADIAL):
    a = (rows - 1) * RADIAL + j
    b = (rows - 1) * RADIAL + (j + 1) % RADIAL
    faces.append((a, b, top_center))
bot_center = len(verts)
verts.append((0, 0, dense_y[0] - 0.005))
for j in range(RADIAL):
    a = j
    b = (j + 1) % RADIAL
    faces.append((b, a, bot_center))

mesh = bpy.data.meshes.new("SunsunBody")
mesh.from_pydata(verts, [], faces)
mesh.update()
body = bpy.data.objects.new("SunsunBody", mesh)
scene.collection.objects.link(body)

# ---- 口の凹み（本物の開口） --------------------------------------------------
# model座標: 口の中心 y=1.755, 前面。楕円 (半幅 0.115, 半高 0.055) の範囲を
# 内側へ押し込む。デカール版と同じ見かけサイズ。
MOUTH_Y = 1.755
MOUTH_HALF_W = 0.15
MOUTH_HALF_H = 0.068
MOUTH_DEPTH = 0.11

co = np.array([v.co[:] for v in mesh.vertices])  # Blender (x, y, z=height)
mx, my, mz = co[:, 0], co[:, 1], co[:, 2]
front = my < -0.15  # model +z 側
# 楕円距離（x は弧長近似としてそのまま使う）
dx = mx / MOUTH_HALF_W
dzv = (mz - MOUTH_Y) / MOUTH_HALF_H
d2 = dx * dx + dzv * dzv
in_mouth = front & (d2 < 1.0)
fall = np.zeros(len(co))
fall[in_mouth] = (1.0 - d2[in_mouth]) ** 1.5
# 内側へ（前面は -y 方向なので +y へ押す）
closed_offset = fall * MOUTH_DEPTH
for idx in np.where(in_mouth)[0]:
    mesh.vertices[idx].co.y += closed_offset[idx]

# ---- マテリアル -------------------------------------------------------------
def make_mat(name, color, roughness=0.95):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    return m

def hex2rgb(h):
    h = h.lstrip("#")
    # sRGB -> linear
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

mat_skin = make_mat("skin", hex2rgb("#6f9cf0"), 0.95)
mat_mouth = make_mat("mouth", hex2rgb("#131110"), 1.0)
mesh.materials.append(mat_skin)   # index 0
mesh.materials.append(mat_mouth)  # index 1

# 口の凹み内側の面を黒に
for poly in mesh.polygons:
    cx = sum(mesh.vertices[v].co.x for v in poly.vertices) / len(poly.vertices)
    cy = sum(mesh.vertices[v].co.y for v in poly.vertices) / len(poly.vertices)
    cz = sum(mesh.vertices[v].co.z for v in poly.vertices) / len(poly.vertices)
    if cy < -0.15:
        pdx = cx / MOUTH_HALF_W
        pdz = (cz - MOUTH_Y) / MOUTH_HALF_H
        if pdx * pdx + pdz * pdz < 0.98:
            poly.material_index = 1
    poly.use_smooth = True

# ---- シェイプキー: mouthOpen -------------------------------------------------
body.shape_key_add(name="Basis", from_mix=False)
key_open = body.shape_key_add(name="mouthOpen", from_mix=False)
# 開口: 口楕円の下半分を下＋奥へ、上半分をわずかに上へ。周囲もわずかに追従。
OPEN_DROP = 0.11
wide = front & (d2 < 3.2)
for idx in np.where(wide)[0]:
    x0, y0, z0 = co[idx]
    y0 += closed_offset[idx]  # 閉口時の位置から
    pdx = x0 / MOUTH_HALF_W
    pdz = (z0 - MOUTH_Y) / MOUTH_HALF_H
    dd = pdx * pdx + pdz * pdz
    w = max(0.0, 1.0 - dd / 3.2)
    kv = key_open.data[idx]
    if pdz < 0:  # 下唇側
        kv.co.z = z0 - OPEN_DROP * (w ** 1.3)
        kv.co.y = y0 + 0.05 * (w ** 1.5)  # 開くほど奥へ
    else:  # 上唇側は控えめに上へ
        kv.co.z = z0 + 0.02 * (w ** 1.5)
        kv.co.y = y0 + 0.02 * (w ** 1.5)

# ---- エクスポート ------------------------------------------------------------
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.abspath(OUT),
    export_format="GLB",
    use_selection=True,
    export_morph=True,
    export_yup=True,
    export_apply=False,
)
print("exported", os.path.abspath(OUT))
