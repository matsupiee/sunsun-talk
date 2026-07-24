"""bpy(ヘッドレスBlender)でスンスンの手袋型の手をメタボールから生成し GLB を出力する。

実物の手は「一枚の平たい黒フェルトの手袋」。メタボール要素（掌・指・親指）が
有機的に融合した形状を voxel メッシュ化し、Z方向に押し潰して平たいフェルトに
する。プリミティブの寄せ集めでは不可能だった、指の股が自然に繋がる
ひとつながりのシルエットが得られる。

座標系: 手首を原点、指先は -Y（three.js の buildHand と同じローカル座標。
Blender は z-up なので、ここでは指先 -Z で組み、エクスポートの +Y up 変換で
three.js の -Y に一致する）。

実行: python3 scripts/make-hands-glb.py
出力: public/assets/model/sunsun-hands.glb（HandL / HandR の2オブジェクト）
"""
import bpy
import math
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "model", "sunsun-hands.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def hex2rgb(h):
    h = h.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


mat_felt = bpy.data.materials.new("felt")
mat_felt.use_nodes = True
bsdf = mat_felt.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (*hex2rgb("#121216"), 1.0)
bsdf.inputs["Roughness"].default_value = 0.95


def build_hand(side: int) -> bpy.types.Object:
    """side=+1 で左手（three.jsの buildHand(1) 相当）。"""
    mb = bpy.data.metaballs.new(f"HandMB{side}")
    mb.resolution = 0.022
    mb.render_resolution = 0.022
    obj = bpy.data.objects.new(f"HandMB{side}", mb)
    scene.collection.objects.link(obj)

    # 掌（手首から広がるくさび）: 縦に重ねた楕円2つ。
    # 指の根元と強く重ねて、股が自然に繋がった手袋シルエットにする。
    e = mb.elements.new(type="ELLIPSOID")
    e.co = (0, 0, -0.14)
    e.size_x, e.size_y, e.size_z = 0.12, 0.09, 0.18
    e = mb.elements.new(type="ELLIPSOID")
    e.co = (0, 0, -0.40)
    e.size_x, e.size_y, e.size_z = 0.24, 0.1, 0.17

    # 4本指: 根元側の約半分が互いに融合し、先端側だけ切れ込みで分かれる。
    finger_lens = [0.52, 0.58, 0.60, 0.50]
    for i, ln in enumerate(finger_lens):
        x = (i - 1.5) * 0.14
        fan = (i - 1.5) * 0.09  # 先端の開き（ラジアン）
        half = ln / 2
        cz = -0.50 - half + 0.18  # 根元を掌に深く埋める
        cx = x + math.sin(fan) * half
        cap = mb.elements.new(type="CAPSULE")
        cap.co = (cx, 0, cz)
        cap.radius = 0.1
        cap.size_x = half
        # CAPSULE の軸は +X。Y軸まわり回転 θ で +X → (cosθ, 0, -sinθ)。
        # 指はほぼ +Z（対称形状なので符号は不問）、fan だけ傾ける。
        angle = -math.pi / 2 + fan
        cap.rotation = (math.cos(angle / 2), 0, math.sin(angle / 2), 0)

    # 親指: 短めに、掌の縁から斜め下へ分岐（長いと第5の指・触角に見える）。
    # Y軸回転 θ の軸方向は (cosθ, 0, -sinθ)。下向き斜め＝ z 成分負にする。
    th = mb.elements.new(type="CAPSULE")
    tang = math.pi / 2 - side * 0.7 if side > 0 else math.pi / 2 + 0.7
    tdir = (math.cos(tang), 0, -math.sin(tang))
    troot = (side * 0.17, 0, -0.46)
    tlen = 0.13
    th.co = (troot[0] + tdir[0] * tlen, 0, troot[2] + tdir[2] * tlen)
    th.radius = 0.085
    th.size_x = tlen
    th.rotation = (math.cos(tang / 2), 0, math.sin(tang / 2), 0)

    # メッシュ化
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    hand = bpy.context.view_layer.objects.active
    hand.name = "HandL" if side > 0 else "HandR"

    # フェルトらしく平たく（Y方向 = three.js の Z 厚み）
    hand.scale = (1.0, 0.52, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # スムーズシェード + マテリアル
    for poly in hand.data.polygons:
        poly.use_smooth = True
    hand.data.materials.append(mat_felt)
    return hand


hands = [build_hand(1), build_hand(-1)]

bpy.ops.object.select_all(action="DESELECT")
for h in hands:
    h.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.abspath(OUT),
    export_format="GLB",
    use_selection=True,
    export_yup=True,
)
print("exported", os.path.abspath(OUT))
for h in hands:
    print(h.name, "verts:", len(h.data.vertices))

# ---- 形状確認用プレビュー（PREVIEW_PATH 指定時のみ・Cycles CPU） ----
preview = os.environ.get("PREVIEW_PATH")
if preview:
    bsdf.inputs["Base Color"].default_value = (0.4, 0.4, 0.45, 1.0)  # 形が見える灰色
    hands[0].location.x = -0.55
    hands[1].location.x = 0.55
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 2.3
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (0, -3.0, -0.75)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    scene.camera = cam
    light_data = bpy.data.lights.new("Sun", "SUN")
    light_data.energy = 4
    light = bpy.data.objects.new("Sun", light_data)
    scene.collection.objects.link(light)
    light.rotation_euler = (math.radians(50), math.radians(15), 0)
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.9, 0.9, 1)
    scene.world = world
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 16
    scene.render.resolution_x = 440
    scene.render.resolution_y = 540
    scene.render.filepath = preview
    bpy.ops.render.render(write_still=True)
    print("preview", preview)
