"""スンスン公式ステッカー写真から、ファー着色用のリファレンス画像を生成する。

出力（public/assets/model/）:
  fur-ref.png  … 行ごとにシルエット幅を [0..1] に正規化した「展開」テクスチャ。
                 目・鼻・口・影の穴はインペイント済み、左右ミラー平均で対称化。
  fur-ref.json … 鼻アンカー行・平均色などのマッピング情報。

クライアント側は毛束の (y, sin θ) を (row, u) に対応付けて画素をサンプルし、
毛束ごとのティント色として実写の色ムラ・毛流れの明暗を反映する。
"""
from PIL import Image, ImageFilter
import numpy as np
import json
import os

SRC = "public/assets/stickerpack@2x/593654941@2x.png"
OUT_DIR = "public/assets/model"
OUT_W = 96  # 正規化後の横幅（u: 左端0 → 右端1）
MIRROR_BLEND = 0.5  # 左右対称化の強さ（0.5 = 完全対称）
os.makedirs(OUT_DIR, exist_ok=True)

im = Image.open(SRC).convert("RGBA")
a = np.array(im).astype(np.int32)
H, W = a.shape[:2]
alpha = a[..., 3] > 128
r, g, b = a[..., 0], a[..., 1], a[..., 2]

# --- 青いファー画素の判定 ---
blue = alpha & (b > r + 15) & (b > g + 8) & (b > 90)


def largest_component(mask):
    lab = np.zeros(mask.shape, dtype=np.int32)
    cur = 0
    stack = []
    for sy, sx in zip(*np.where(mask)):
        if lab[sy, sx]:
            continue
        cur += 1
        stack.append((sy, sx))
        lab[sy, sx] = cur
        while stack:
            y, x = stack.pop()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and mask[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = cur
                    stack.append((ny, nx))
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    return lab == sizes.argmax()


blue = largest_component(blue)
ys, xs = np.where(blue)
y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
print(f"blue bbox: x[{x0}..{x1}] y[{y0}..{y1}]")

# --- 行ごとのシルエット範囲 ---
spans = []
for y in range(y0, y1 + 1):
    row = np.where(blue[y])[0]
    spans.append((int(row.min()), int(row.max())) if len(row) else None)
for i, s in enumerate(spans):
    if s is None:
        prev = next((spans[j] for j in range(i - 1, -1, -1) if spans[j]), None)
        nxt = next((spans[j] for j in range(i + 1, len(spans)) if spans[j]), None)
        spans[i] = prev or nxt

body = np.zeros_like(blue)
for i, (xl, xr) in enumerate(spans):
    body[y0 + i, xl : xr + 1] = True

# --- 鼻アンカー: シルエット上半分の黒い塊の重心 ---
dark = alpha & (r < 70) & (g < 70) & (b < 80)
upper = body.copy()
upper[int(y0 + (y1 - y0) * 0.55) :, :] = False
nose_mask = largest_component(dark & upper)
dys, dxs = np.where(nose_mask)
nose_row, nose_col = int(dys.mean()), int(dxs.mean())
nose_rad = max(4, int(np.sqrt(nose_mask.sum() / np.pi) * 1.9))
print(f"nose anchor: row {nose_row} col {nose_col} rad {nose_rad}")

# --- インペイント対象: シルエット内の 非・青 / 暗すぎ / 鼻の周囲 ---
lum = (r + g + b) / 3
too_dark = lum < 78  # 鼻・口・深い影の穴
yy, xx = np.mgrid[0:H, 0:W]
# 顔領域（鼻の少し下まで）は中間暗度の影も塗り潰す。顔の暗パッチは
# ファーのティントに乗ると目立つため、体幹より基準を厳しくする。
face_rows = yy < nose_row + (y1 - y0) * 0.16
too_dark = too_dark | (face_rows & (lum < 112))
near_nose = (yy - nose_row) ** 2 + (xx - nose_col) ** 2 < nose_rad**2
unknown = body & (~blue | too_dark | near_nose)
known = body & ~unknown
img = a[..., :3].astype(np.float64)
print(f"inpaint pixels: {unknown.sum()} / body {body.sum()}")
for _ in range(800):
    if not unknown.any():
        break
    acc = np.zeros((H, W, 3))
    cnt = np.zeros((H, W))
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        k = np.roll(known, (dy, dx), axis=(0, 1))
        v = np.roll(img, (dy, dx), axis=(0, 1))
        acc += v * k[..., None]
        cnt += k
    fill = unknown & (cnt > 0)
    img[fill] = acc[fill] / cnt[fill][:, None]
    known |= fill
    unknown &= ~fill

# --- 行ごとに [xl..xr] を OUT_W 画素へ正規化リサンプル ---
rows = y1 - y0 + 1
norm = np.zeros((rows, OUT_W, 3))
for i, (xl, xr) in enumerate(spans):
    y = y0 + i
    src_x = np.linspace(xl, xr, OUT_W)
    xi = np.clip(src_x.astype(int), 0, W - 2)
    frac = src_x - xi
    norm[i] = img[y, xi] * (1 - frac)[:, None] + img[y, xi + 1] * frac[:, None]

# --- 左右対称化（頭の傾きによる偏りを打ち消す） ---
norm = norm * (1 - MIRROR_BLEND) + norm[:, ::-1] * MIRROR_BLEND

# --- 頭頂行の暗部持ち上げ ---
# 写真の頭頂まわりは目・顔の影が落ちて濃紺に写るが、この行はモデルでは
# 頭全周（後頭部含む）にマップされるため、暗いままだと頭に濃紺のパッチが出る。
# 実物の頭頂は光を受けて明るいので、輝度の床を高めに設けて持ち上げる（色相は保持）。
nose_row_norm = nose_row - y0
crown_limit = nose_row_norm + 10
# 明るい毛色の代表値（輝度上位の画素平均）。頭頂の目標色にする。
flat = norm.reshape(-1, 3)
lum_all = flat.mean(axis=1)
bright_mean = flat[lum_all > np.percentile(lum_all, 65)].mean(axis=0)
for i in range(min(crown_limit, rows)):
    fade = 1.0 - i / crown_limit  # 頭頂ほど強く
    w = 0.85 * fade
    norm[i] = norm[i] * (1 - w) + bright_mean[None, :] * w

# --- 彩度・明度ブースト ---
# レンダリングでは 3D ライティングと毛先グラデーションを介すため、写真の
# 実測より彩度・明度が半段沈む。実物の「明るいペリウィンクル」の第一印象に
# 合わせ、リファレンス側で先に持ち上げておく。
gray = norm.mean(axis=2, keepdims=True)
norm = gray + (norm - gray) * 1.28  # 彩度 +28%
norm = norm * 1.07  # 明度 +7%

out = Image.fromarray(np.clip(norm, 0, 255).astype(np.uint8))
out = out.filter(ImageFilter.GaussianBlur(0.6))
out.save(f"{OUT_DIR}/fur-ref.png")

mean = np.array(out).reshape(-1, 3).mean(axis=0)
print("mean fur color:", mean.round(1))

meta = {
    "source": "stickerpack 593654941 (official photo, in-repo asset)",
    "width": OUT_W,
    "height": int(rows),
    # モデル頭頂 y=2.27 → row 0 / モデル鼻 y=1.94 → noseRow の線形対応
    "noseRow": int(nose_row - y0),
    "meanColor": [round(float(c), 1) for c in mean],
}
with open(f"{OUT_DIR}/fur-ref.json", "w") as f:
    json.dump(meta, f)
print(f"saved fur-ref.png ({OUT_W}x{rows}), noseRow={meta['noseRow']}")
