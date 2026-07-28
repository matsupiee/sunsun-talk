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

    # 実物の手（公式写真）:
    # - 掌は幅広で丸く、フェルトのミトンに近い
    # - 指は4本とも「短く太い丸いこぶ」状で、軽く扇状に開く
    #   （指の長さは手全体の4割弱。細長い指はNG）
    # - 親指は太く、掌から大きく開いて突き出す
    # 掌（手首→掌本体→指の付け根）: 縦に重ねた楕円で丸い土台を作る。
    e = mb.elements.new(type="ELLIPSOID")
    e.co = (0, 0, -0.12)
    e.size_x, e.size_y, e.size_z = 0.11, 0.08, 0.16
    e = mb.elements.new(type="ELLIPSOID")
    e.co = (0, 0, -0.36)
    e.size_x, e.size_y, e.size_z = 0.19, 0.1, 0.16
    e = mb.elements.new(type="ELLIPSOID")
    e.co = (0, 0, -0.5)
    e.size_x, e.size_y, e.size_z = 0.21, 0.09, 0.1

    # 4本指: 短く太い丸指。根元は掌と融合しつつ、先端はしっかり分かれる。
    finger_lens = [0.34, 0.40, 0.38, 0.30]
    for i, ln in enumerate(finger_lens):
        x = (i - 1.5) * 0.15
        fan = (i - 1.5) * 0.11  # 実物は指先が扇状に軽く開く
        half = ln / 2
        cz = -0.54 - half + 0.06  # 根元を掌に軽く埋める（埋めすぎると指が消える）
        cx = x + math.sin(fan) * half
        cap = mb.elements.new(type="CAPSULE")
        cap.co = (cx, 0, cz)
        cap.radius = 0.095
        cap.size_x = half
        # CAPSULE の軸は +X。Y軸まわり回転 θ で +X → (cosθ, 0, -sinθ)。
        angle = -math.pi / 2 + fan
        cap.rotation = (math.cos(angle / 2), 0, math.sin(angle / 2), 0)

    # 親指: 太く、掌の縁から大きく開く。実物は親指が体側（内向き）に付く。
    # Y軸回転 θ の軸方向は (cosθ, 0, -sinθ)。
    th = mb.elements.new(type="CAPSULE")
    tang = math.pi / 2 + 1.2 if side > 0 else math.pi / 2 - 1.2
    tdir = (math.cos(tang), 0, -math.sin(tang))
    troot = (-side * 0.16, 0, -0.3)
    tlen = 0.2
    th.co = (troot[0] + tdir[0] * tlen, 0, troot[2] + tdir[2] * tlen)
    th.radius = 0.1
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
