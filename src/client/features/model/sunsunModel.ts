import * as THREE from "three";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";

/**
 * パペット「スンスン」の 3D モデルをプリミティブから手続き的に組み立てる。
 *
 * 水色の体は InstancedMesh で数万本の毛束を植えてファーの「もこもこ感」を
 * 再現する（地肌には sheen の起毛光沢）。腕・脚・手足・目・鼻・口は
 * 実物どおりフェルト／プラスチック調のツルッとした表面のまま。
 *
 * 全身のプロポーション（全身写真から）:
 * - 水色の体は「細長い筒」状で、幅は全身の高さの約 1/4。頭と胴の区別は無い。
 * - 顔（小さな白目×2・黒い丸鼻・横に広い口）は筒の最上部に小さくまとまる。
 * - 黒い腕は非常に長く（全身の約半分）、指の分かれた大きな手が付く。
 * - 筒の下から太めの黒い脚が 2 本出て、大きく丸い黒い足で立つ。
 */

// ---- パレット（実物の配色を参考に） ----------------------------------------
const SKY = "#9ccbf5"; // 体のベースになる水色（公式写真のパステル寄りペリウィンクル）
const SKY_LIGHT = "#d2e4fa"; // ハイライト用の明るい水色
const FUR_ROOT = "#5590e0"; // 毛束の根元〜中間（青紫に寄らないシアン寄りブルー）
// ファーの外殻はほぼ毛先で構成されるため「見た目の体色 ≒ 毛先色」。
// 実物は毛先が白っぽく光るパステル調。青みは保ちつつ明るいチップにする。
const FUR_TIP = "#b0d4f7"; // 毛束の毛先（白寄りの明るい空色チップ）
const SKIN_BASE = "#699fe6"; // 毛の隙間から見える地肌（中間のスカイブルー）
const EYE_WHITE = "#fdfdf7"; // ほぼ白の白目
const PUPIL = "#141210"; // 黒目・鼻・口の黒
const LIMB_DARK = "#121216"; // 黒に近い腕・脚・手足

export interface SunsunModelParts {
  root: THREE.Group;
  /** 顔（目・鼻・口）グループ。軽く揺らす */
  head: THREE.Group;
  /** 左右の白目（グーグリーアイ）。アイドル時に微妙に揺れる */
  eyes: THREE.Group[];
  /**
   * 口の開き具合を 0(閉)〜1(全開) で設定する。
   * GLBボディではシェイプキー、フォールバックのデカール口では scale.y を駆動。
   */
  setMouthOpen: (open: number) => void;
  /** 腕(左右)。軽く揺らす */
  arms: THREE.Group[];
  /** 体のファー（毛束の InstancedMesh 群）。visible でもこもこON/OFF */
  fur: THREE.Object3D;
  /**
   * 実写リファレンス（公式ステッカー写真から生成した展開テクスチャ）を
   * 毛束ごとのティントに適用する。画像のロード完了後に呼ぶ。
   */
  applyFurReference: (image: HTMLImageElement, meta: FurRefMeta) => void;
}

/** fur-ref.json のマッピング情報（scripts で生成）。 */
export interface FurRefMeta {
  width: number;
  height: number;
  /** 展開テクスチャ上で鼻の高さに当たる行。 */
  noseRow: number;
  meanColor: [number, number, number];
}

function skinMaterial(color: string) {
  // 腕・脚・手はフリース/フェルトの完全マット。Standard は roughness 1 でも
  // 広いスペキュラが残ってプラスチックに見えるため、純拡散の Lambert。
  return new THREE.MeshLambertMaterial({
    color: new THREE.Color(color),
  });
}

/** 水色のボディ。細長い筒状で、上端は丸いドーム。 */
function buildBody(): THREE.Mesh {
  // (半径, 高さ) の輪郭。下から上へ。幅は控えめ、縦に長く。
  // 水色の筒は全身の上 2/3 に収め、下 1/3 は黒い脚に譲る。
  // 太さはほぼ一定のまっすぐなチューブで、上端だけ丸いドーム。
  const profile: Array<[number, number]> = [
    [0.02, -0.32],
    [0.34, -0.3],
    [0.465, -0.22],
    [0.49, -0.02],
    [0.5, 0.3],
    [0.5, 0.7], // ほぼ一定の太さ（実物はやや太めの筒）
    [0.505, 1.1],
    [0.505, 1.5],
    [0.485, 1.8],
    [0.44, 2.0],
    [0.355, 2.14], // 上端は丸いドーム
    [0.215, 2.23],
    [0.02, 2.27],
  ];

  const points = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geometry = new THREE.LatheGeometry(points, 64);
  geometry.computeVertexNormals();

  // 地肌は起毛（sheen）のある布マテリアル。毛束の隙間から見えても
  // ファーの陰のように馴染む、やや深めの水色にする。
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(SKIN_BASE),
    roughness: 0.95,
    metalness: 0,
    sheen: 1.0,
    sheenColor: new THREE.Color(SKY_LIGHT),
    sheenRoughness: 0.55,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---- ファー（毛束）--------------------------------------------------------

/** 顔パーツの位置（毛を避ける・短くする判定に使う）。 */
const EYE_L_POS = new THREE.Vector3(0.185, 2.26, 0.12);
const EYE_R_POS = new THREE.Vector3(-0.185, 2.28, 0.12);
const NOSE_POS = new THREE.Vector3(0, 2.07, 0.42);

/**
 * 体表面に数万本の毛束（先細りの小さな錐）を InstancedMesh で植える。
 * - 根元→毛先で深い水色→白に近い水色のグラデーション（頂点カラー）
 * - 法線方向＋下向きの「毛流れ」で、実物のやや垂れた長毛ファーに寄せる
 * - 目・鼻・口のまわりは毛を避け、顔の正面は短毛にして表情を隠さない
 */
/** 毛束1本ごとの配置情報。実写ティントの再計算に使う。 */
interface TuftData {
  /** 体表のサンプル位置 */
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  /** 法線の上向き成分 */
  ny: Float32Array;
  /** 顔の度合い（0=胴, 1=顔正面） */
  faceT: Float32Array;
}

/** ファーの構成メッシュ（胴体用・頭頂用・あご用）とその毛束データ。 */
interface FurPart {
  mesh: THREE.InstancedMesh;
  tufts: TuftData;
}

/** 開口時に口を覆う「あごヒゲ」毛束の判定（口パク時にフェードアウトする）。 */
function isChinTuft(p: THREE.Vector3): boolean {
  return p.y > 1.5 && p.y < 1.91 && Math.abs(p.x) < 0.34 && p.z > 0.18;
}

/**
 * 毛束テンプレート（根元を原点、+Y へ長さ1の細い錐）に
 * 根元→毛先の頂点カラーグラデーションを焼き込む。
 * rootMix > 0 で根元色を毛先色側へ寄せる（頭頂用: 寝た毛の軸が
 * 真上から見えても濃紺の斑にならないよう、根元から明るい色にする）。
 */
function makeTuftGeometry(rootMix: number): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(1, 1, 4, 1, true);
  geo.translate(0, 0.5, 0);
  const pos = geo.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const tipColor = new THREE.Color(FUR_TIP);
  const rootColor = new THREE.Color(FUR_ROOT).lerp(tipColor, rootMix);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i), 0, 1);
    // 白化は毛先寄りに限定し、中腹までは青を保つ
    // （指数が低いと全体が白く飛んでラベンダー/グレー寄りに見える）。
    c.copy(rootColor).lerp(tipColor, Math.pow(t, 1.75));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

function buildFur(body: THREE.Mesh): {
  fur: THREE.Group;
  parts: FurPart[];
  chinMaterial: THREE.MeshStandardMaterial;
} {
  const COUNT = 72000;
  // 頭頂（上向き法線）の毛束はこの閾値で専用メッシュへ振り分ける。
  const CROWN_NY = 0.35;

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
  });
  // あご（口の前）の毛束は口パク時にフェードアウトさせるため透過可能に。
  const chinMaterial = mat.clone();
  chinMaterial.transparent = true;

  interface TuftRec {
    matrix: THREE.Matrix4;
    r: number;
    g: number;
    b: number;
    px: number;
    py: number;
    pz: number;
    ny: number;
    faceT: number;
  }
  const mainRecs: TuftRec[] = [];
  const crownRecs: TuftRec[] = [];
  const chinRecs: TuftRec[] = [];

  const sampler = new MeshSurfaceSampler(body).build();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const jitter = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  let placed = 0;
  let guard = 0;
  while (placed < COUNT && guard++ < COUNT * 40) {
    sampler.sample(p, n);

    // 頭頂ドームは真上から見ると毛の間の地肌が最も目立つため、
    // 頭頂以外のサンプルを一部棄却して相対的に頭頂の植毛密度を上げる。
    if (n.y < 0.35 && Math.random() < 0.22) continue;

    // 目の球・鼻・口の輪郭ぎわは毛を植えない（毛先が黒目や鼻に刺さって
    // 斑点に見えるのを防ぐ。目玉の半径0.225+毛長ぶんのマージン）。
    const dEyeL = p.distanceTo(EYE_L_POS);
    const dEyeR = p.distanceTo(EYE_R_POS);
    if (dEyeL < 0.27 || dEyeR < 0.27) continue;
    if (p.distanceTo(NOSE_POS) < 0.17) continue;
    // 口（GLBボディの凹み楕円: 半幅0.115・半高0.055）の内側と縁に毛先が
    // 入り込むと「歯のような斑点」に見える。毛は下向きに垂れるため、
    // 開口の上側は特に広めに無毛にする（垂れた毛先が開口を横切らない距離）。
    if (p.y > 1.81 && p.y < 1.93 && Math.abs(p.x) < 0.17 && p.z > 0.2) continue;

    // 顔の正面上部は短毛にして、目・鼻・口が読めるようにする（無毛地帯は作らない）。
    // 二値ではなく滑らかなグラデーションで移行し、胴との「継ぎ目」を作らない。
    const faceT =
      THREE.MathUtils.smoothstep(p.y, 1.5, 1.95) *
      THREE.MathUtils.smoothstep(p.z, -0.05, 0.25) *
      (0.8 + Math.random() * 0.4);
    const nearFace = faceT > 0.5;
    let lengthScale = 1.0 - 0.38 * Math.min(1, faceT);
    // 目のすぐ近く（前面側のみ）はやや短毛にして、白目が毛に半分埋まって
    // 見えるようにする。頭頂の後ろ側まで短くすると地肌が露出するので絞る。
    if ((dEyeL < 0.38 || dEyeR < 0.38) && p.z > 0.12) lengthScale *= 0.72;
    // 口の周囲リングもやや短毛にして、毛が開口に垂れて口を隠さないようにする
    // （短くしすぎると刈り込み跡に見えるので控えめに）。
    if (Math.abs(p.y - 1.86) < 0.2 && p.z > 0.1) lengthScale *= 0.8;
    // 口の直近リングはさらに短くして、毛が開口へ被らないようにする。
    if (Math.abs(p.y - 1.86) < 0.15 && p.z > 0.2) lengthScale *= 0.55;
    // 頭頂は毛をやや長めにして、目の根元がファーに埋まる実物のボリュームを出す。
    if (n.y > 0.4) lengthScale *= 1.3;
    // あご下〜胸元は長い房が垂れる（実物のクランプ感）。
    if (p.z > 0.1 && p.y > 1.15 && p.y < 1.65) lengthScale *= 1.22;
    // 裾は毛が外へ張り出してAラインに見えないよう、やや短めに。
    if (p.y < -0.05) lengthScale *= 0.82;

    // 長めの「差し毛」で輪郭を大ぶりに波打たせる（実物は毛長がかなり不揃い）。
    const guardHair = !nearFace && Math.random() < 0.14;
    // 細めの毛を密に重ねて柔らかい質感にする（太い毛は硬く見える）。
    const len = (0.1 + Math.random() * 0.2) * lengthScale * (guardHair ? 1.6 : 1.0);
    let thickness = (0.019 + Math.random() * 0.012) * (guardHair ? 1.25 : 1.0);
    if (nearFace) thickness *= 0.8; // 顔まわりはさらに細く柔らかく

    // 毛流れ: 法線方向を基本に下へ垂らし、位置に応じたうねりで数本単位の
    // 「房」のまとまりを作る（完全ランダムだと針山に見えるため）。
    // 頭頂ほど強く寝かせて、上向きのトゲにならないようにする。
    // 低めの周波数で大きめの房を作る（高周波だとウニ状に散らばる）。
    const clump = Math.sin(p.x * 4.5 + p.y * 3.5) * 0.5 + Math.sin(p.z * 5.2 - p.y * 2.8) * 0.5;
    jitter
      .set(
        Math.sin(p.y * 6 + p.z * 4.2) * 0.7 + (Math.random() - 0.5) * 0.22,
        clump * 0.35,
        Math.cos(p.x * 5.5 + p.y * 4.6) * 0.7 + (Math.random() - 0.5) * 0.22,
      )
      .multiplyScalar(0.3);
    // 実物のファーは「梳かした長毛」ではなく、外向きにツンツン逆立った
    // スパイク状。法線方向を主体に、重力バイアスはごく弱くして
    // シルエットがギザギザに波打つようにする。
    const crownDroop = Math.max(0, n.y) * 0.1;
    // 長い差し毛はわずかに垂れて、輪郭のスパイクに緩急を付ける。
    const guardDroop = guardHair ? 0.35 : 0;
    dir
      .copy(n)
      .addScaledVector(down, 0.72 + crownDroop + guardDroop + Math.random() * 0.28)
      .add(jitter)
      .normalize();
    quat.setFromUnitVectors(up, dir);

    dummy.position.copy(p).addScaledVector(n, -0.02);
    dummy.quaternion.copy(quat);
    dummy.scale.set(thickness, len, thickness * 0.75);
    dummy.updateMatrix();

    // 毛束ごとの明るさのゆらぎ（ムラは控えめにして斑点ノイズを避ける）。
    // わずかに青へ寄せて、強い光でも水色の印象が飛ばないようにする。
    // 短毛（顔まわり）は根元の暗色が支配的になるため明るめに補正する。
    let v = 0.9 + Math.random() * 0.1;
    // 短毛ほど根元の暗色が支配的になるため、顔の度合いに応じて滑らかに明るく。
    v *= 1 + 0.35 * Math.min(1, faceT);
    // 頭頂（上向き法線）は真上から根元が見えて暗く沈みやすいので少し持ち上げる。
    v *= 1 + 0.32 * Math.max(0, n.y);
    // 赤成分を下げて青の彩度を保つ（グレー寄りに washed out させない）。
    // ただし顔の短毛は根元の濃青が支配的で「顔だけ濃いパッチ」に見えるため、
    // 顔の度合いに応じて乗算色を白側へ寄せ、体側の毛先色と揃える。
    const fw = Math.min(1, faceT);
    const rec: TuftRec = {
      matrix: dummy.matrix.clone(),
      r: v * (0.92 + 0.14 * fw),
      g: v * (0.97 + 0.09 * fw),
      b: v * 1.05,
      px: p.x,
      py: p.y,
      pz: p.z,
      ny: n.y,
      faceT: fw,
    };
    (isChinTuft(p) ? chinRecs : n.y > CROWN_NY ? crownRecs : mainRecs).push(rec);
    placed++;
  }

  // 胴体用（根元は濃青）・頭頂用（根元から明るい）・あご用（口パクで
  // フェードアウト）の3メッシュに分けて生成。
  const fur = new THREE.Group();
  const parts: FurPart[] = [];
  const defs: Array<{ recs: TuftRec[]; rootMix: number; material: THREE.Material }> = [
    { recs: mainRecs, rootMix: 0, material: mat },
    { recs: crownRecs, rootMix: 0.55, material: mat },
    { recs: chinRecs, rootMix: 0, material: chinMaterial },
  ];
  for (const { recs, rootMix, material } of defs) {
    const mesh = new THREE.InstancedMesh(makeTuftGeometry(rootMix), material, recs.length);
    const tufts: TuftData = {
      px: new Float32Array(recs.length),
      py: new Float32Array(recs.length),
      pz: new Float32Array(recs.length),
      ny: new Float32Array(recs.length),
      faceT: new Float32Array(recs.length),
    };
    recs.forEach((rec, i) => {
      mesh.setMatrixAt(i, rec.matrix);
      mesh.setColorAt(i, tint.setRGB(rec.r, rec.g, rec.b));
      tufts.px[i] = rec.px;
      tufts.py[i] = rec.py;
      tufts.pz[i] = rec.pz;
      tufts.ny[i] = rec.ny;
      tufts.faceT[i] = rec.faceT;
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    fur.add(mesh);
    parts.push({ mesh, tufts });
  }

  return { fur, parts, chinMaterial };
}

// ---- 実写リファレンスによる毛束ティント -------------------------------------

/** モデル座標の縦アンカー（展開テクスチャの行との対応付け）。 */
const REF_Y_TOP = 2.27; // 頭頂 → row 0
const REF_Y_NOSE = 2.07; // 鼻 → meta.noseRow
const REF_Y_BOTTOM = -0.32; // 体の下端 → 最終行

/**
 * 公式ステッカー写真から生成した展開テクスチャ（行=高さ・列=シルエット
 * 横断方向）を毛束ごとにサンプルし、インスタンス色として適用する。
 * 実写の毛並みの色ムラ・陰影がそのままファーに乗る。
 */
function applyFurReferenceToInstances(
  parts: FurPart[],
  image: HTMLImageElement,
  meta: FurRefMeta,
): void {
  const canvas = document.createElement("canvas");
  canvas.width = meta.width;
  canvas.height = meta.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(image, 0, 0, meta.width, meta.height);
  const data = ctx.getImageData(0, 0, meta.width, meta.height).data;

  // 「見た目の体色 ≒ 毛先色」なので、写真画素 ÷ 毛先色 をティントにすると
  // ファー外殻の色が写真の色に一致する。
  // ただし写真の色をそのまま使うと（インペイント・左右対称化の平均化で）
  // 彩度が落ちて退色したラベンダーに見えるため、写真からは「明暗の
  // パターン」だけを借り、色相・彩度は公式のスカイブルーに固定する。
  const tipColor = new THREE.Color(FUR_TIP);
  const target = new THREE.Color(SKY);
  const meanLum = Math.max(
    1,
    (meta.meanColor[0] + meta.meanColor[1] + meta.meanColor[2]) / 3,
  );
  const tint = new THREE.Color();

  // 縦: 頭頂→鼻 / 鼻→体下端 の2区間ピースワイズ線形。
  // （実物は鼻が頭頂のすぐ下にあり、モデルと縦比率が異なるため。）
  const rowOf = (y: number): number => {
    if (y >= REF_Y_NOSE) {
      const t = (REF_Y_TOP - y) / (REF_Y_TOP - REF_Y_NOSE);
      return THREE.MathUtils.clamp(t, 0, 1) * meta.noseRow;
    }
    const t = (REF_Y_NOSE - y) / (REF_Y_NOSE - REF_Y_BOTTOM);
    return meta.noseRow + THREE.MathUtils.clamp(t, 0, 1) * (meta.height - 1 - meta.noseRow);
  };

  for (const { mesh, tufts } of parts) {
  for (let i = 0; i < mesh.count; i++) {
    // 横: 体軸まわりの角度 θ の sin を列に対応付ける（正射影と同じ写像）。
    // テクスチャは左右対称化済みなので、背面は前面のミラーになる。
    const theta = Math.atan2(tufts.px[i], tufts.pz[i]);
    const u = 0.5 + 0.5 * Math.sin(theta);
    // サンプル位置に小さなジッタを加え、列に沿った「縦筋」の帯を散らす。
    const col = THREE.MathUtils.clamp(
      u * (meta.width - 1) + (Math.random() - 0.5) * 3,
      0,
      meta.width - 1,
    );
    const row = THREE.MathUtils.clamp(
      rowOf(tufts.py[i]) + (Math.random() - 0.5) * 2.4,
      0,
      meta.height - 1,
    );

    // バイリニアサンプル
    const c0 = Math.floor(col);
    const r0 = Math.floor(row);
    const c1 = Math.min(meta.width - 1, c0 + 1);
    const r1 = Math.min(meta.height - 1, r0 + 1);
    const fc = col - c0;
    const fr = row - r0;
    let rr = 0;
    let gg = 0;
    let bb = 0;
    for (const [ci, ri, w] of [
      [c0, r0, (1 - fc) * (1 - fr)],
      [c1, r0, fc * (1 - fr)],
      [c0, r1, (1 - fc) * fr],
      [c1, r1, fc * fr],
    ] as const) {
      const o = (ri * meta.width + ci) * 4;
      rr += data[o] * w;
      gg += data[o + 1] * w;
      bb += data[o + 2] * w;
    }

    // 暗すぎる画素（毛の間の深い影）はそのまま使うと黒い斑点になるため、
    // 明度の床を設けて持ち上げる（色相は保つ）。
    const lum = (rr + gg + bb) / 3;
    const FLOOR = 96;
    if (lum < FLOOR && lum > 0) {
      const k = FLOOR / lum;
      rr *= k;
      gg *= k;
      bb *= k;
    }

    // 写真の明暗パターン（平均輝度に対する比）だけをシェードとして採用し、
    // 色は公式スカイブルー（target）に固定する。これで色相が退色しない。
    const shade = THREE.MathUtils.clamp(
      Math.pow((rr + gg + bb) / 3 / meanLum, 0.85),
      0.6,
      1.4,
    );
    let v = 0.96 + Math.random() * 0.07;
    v *= 1 + 0.15 * tufts.faceT[i];
    v *= 1 + 0.3 * Math.max(0, tufts.ny[i]);
    tint.setRGB(
      THREE.MathUtils.clamp((v * shade * target.r) / tipColor.r, 0.25, 1.5),
      THREE.MathUtils.clamp((v * shade * target.g) / tipColor.g, 0.25, 1.5),
      THREE.MathUtils.clamp((v * shade * target.b) / tipColor.b, 0.25, 1.5),
    );
    mesh.setColorAt(i, tint);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

/**
 * 頭のてっぺんに乗るピンポン玉状の目。
 * 実物は白い球に「平らな黒い円」が印刷のように付き、その内側に
 * 小さな白い点が1つ入る（球状の黒目ではない）。視線はやや内側・下寄り。
 */
function buildEye(side: 1 | -1): THREE.Group {
  const group = new THREE.Group();

  // ピンポン玉はほぼマット（強い鏡面ハイライトを出さない）。
  const whiteMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(EYE_WHITE),
    roughness: 0.45,
    metalness: 0.0,
    // つやのある目が影に沈んで灰色に見えないよう、わずかに自発光。
    emissive: new THREE.Color("#e9eef2"),
    emissiveIntensity: 0.28,
  });
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.225, 48, 48), whiteMat);
  white.castShadow = true;
  group.add(white);

  // 黒目＝平らな黒い円盤（強くつぶした球）。実物は眼球径の約6割と大きい。
  // 正面やや内側を向く。
  const irisMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PUPIL),
    roughness: 0.6,
    metalness: 0.0,
  });
  // 黒円盤が白目球の内側に沈むと縁だけ黒い「リング目」に見えるため、
  // 球面の外側にはっきり出す位置に置く。視線は両目とも内側下（鼻の付け根）へ。
  const irisDir = new THREE.Vector3(-side * 0.12, -0.13, 1).normalize();
  const iris = new THREE.Mesh(new THREE.SphereGeometry(0.115, 40, 40), irisMat);
  iris.scale.set(1, 1, 0.12);
  iris.position.copy(irisDir).multiplyScalar(0.214);
  iris.lookAt(irisDir.clone().multiplyScalar(2));
  group.add(iris);

  // 黒円の内側に入る小さな白い点（フラット）。中央やや下寄り。
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.032, 20, 20), dotMat);
  dot.scale.set(1, 1, 0.2);
  const dotDir = new THREE.Vector3(-side * 0.28, -0.38, 1).normalize();
  dot.position.copy(dotDir).multiplyScalar(0.235);
  dot.lookAt(dotDir.clone().multiplyScalar(2));
  group.add(dot);

  return group;
}

/** 黒い布張りボタン状の丸鼻。目のすぐ下・目と目の間に接する。 */
function buildNose(): THREE.Mesh {
  // 布張りボタンは鏡面反射がほぼ無い。Standard は roughness 1 でも広い
  // スペキュラが残って「光沢球」に見えるため、純拡散の Lambert を使う。
  const mat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(PUPIL),
  });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.135, 32, 32), mat);
  nose.scale.set(1.08, 1.0, 0.8);
  return nose;
}

/**
 * 横に広い浅い口。楕円のデカールを体表（この高さの半径 ≒0.44）に沿って
 * 湾曲させたもので、長方形やくちばし状に見えないようにする。
 * メッシュの原点は体の軸上（口の高さ）に置くこと。しゃべる時は scale.y で縦に開く。
 */
function buildMouth(): THREE.Mesh {
  // ライティングで灰色に浮かないよう、非ライトの黒（穴として読める）。
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#131110"),
    side: THREE.DoubleSide,
  });
  // 実物の口は小さく控えめ（幅は筒幅の約1/4以下）。
  // 単位円 → 半幅0.16・半高0.085 の小さな楕円にし、x を弧長として筒面に巻き付ける。
  // 地肌(≒0.458)より上・毛の垂れ(≒0.5)より中央は上。縁の沈み込みは
  // 毛の垂れ境界までに留め、視点が回っても口が欠けないようにする。
  const R_CENTER = 0.525;
  const R_EDGE = 0.5;
  const geo = new THREE.CircleGeometry(1, 48);
  const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < posAttr.count; i++) {
    const ux = posAttr.getX(i);
    const uy = posAttr.getY(i);
    const ex = ux * 0.115;
    // 上縁が中央でわずかに凹む「軽く開いた曲線状の開口」にする。
    let ey = uy * 0.055;
    if (uy > 0) ey = uy * 0.03 - (1 - ux * ux) * 0.014;
    const edge = Math.min(1, ux * ux + uy * uy); // 中心0→縁1
    const r = R_CENTER - (R_CENTER - R_EDGE) * edge;
    const theta = ex / r;
    posAttr.setXYZ(i, r * Math.sin(theta), ey, r * Math.cos(theta));
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

/** 指の分かれた大きな黒いフェルトの手。 */
function buildHand(side: 1 | -1): THREE.Group {
  const group = new THREE.Group();
  const mat = skinMaterial(LIMB_DARK);

  // 実物の手は「一枚の平たい黒フェルトの手袋」。手のひらは角の無い
  // 丸みのある平板にし、指は根元同士が触れ合う間隔で深く食い込ませて
  // 全体がひとつながりのシルエットに見えるようにする。
  // 手首から幅が広がる平たいくさび（フェルトの手袋の土台）。
  const wedge = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.26, 0.38, 24), mat);
  wedge.scale.z = 0.2;
  wedge.position.y = -0.19;
  wedge.castShadow = true;
  group.add(wedge);
  // ナックル部分の幅広の平板。指の根元をここへ連続させる。
  // 縦にも広げて、指の根元スリットの背景透けをこの板で塞ぐ。
  const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 32), mat);
  knuckle.scale.set(1.28, 0.8, 0.14);
  knuckle.position.y = -0.42;
  knuckle.castShadow = true;
  group.add(knuckle);

  // 長い 4 本指。1本ずつが別々の棒に見えると「傘の骨」になるため、
  // 幅広・扁平な指を同一平面に置き、根元をナックル板に深く埋めて
  // 手全体が「切れ込みの入った一枚のフェルト」として読めるようにする。
  const fingerLens = [0.84, 0.96, 0.98, 0.82]; // 人差し指〜小指相当（掌より指が長い）
  for (let i = 0; i < 4; i++) {
    // 根元は互いに接し、先端だけ切れ込みで分かれる「一枚フェルトの手袋」。
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, fingerLens[i], 6, 12), mat);
    // 切れ込みが根元まで見えると櫛状になるため、開きは先端側だけ僅かに。
    const fan = (i - 1.5) * 0.06;
    finger.position.set((i - 1.5) * 0.15, -0.52 - fingerLens[i] * 0.08, 0);
    finger.rotation.z = -fan;
    finger.scale.z = 0.28; // 断面を扁平に（丸棒でなく平リボンのフェルト感）
    finger.castShadow = true;
    group.add(finger);
  }

  // 親指は長めにして、手のひらからはっきり分岐させる。
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.58, 6, 12), mat);
  // 横へ棒状に突き出さず、手のひらに沿って分岐して見える角度に。
  thumb.position.set(side * 0.26, -0.36, 0);
  thumb.rotation.z = side * 0.55;
  thumb.scale.z = 0.42;
  thumb.castShadow = true;
  group.add(thumb);

  return group;
}

/** 細く長い黒い腕＋指付きの手。肩を原点に下へ垂れる。 */
function buildArm(side: 1 | -1, handOverride?: THREE.Object3D): THREE.Group {
  const group = new THREE.Group();
  const mat = skinMaterial(LIMB_DARK);

  // 長い腕。実物はぬいぐるみ地でそれなりに太い（針金状にしない）。
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.105, 1.55, 20), mat);
  upper.position.y = -0.775;
  upper.castShadow = true;
  group.add(upper);

  // 手の原点は手首（腕の末端）。そこから手袋が下に伸びる。
  // Blender製の一体成形フェルト手袋（メタボール）があればそれを使う。
  const hand = handOverride ?? buildHand(side);
  if (handOverride) {
    handOverride.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.material = mat;
        obj.castShadow = true;
      }
    });
  }
  hand.position.y = -1.44;
  // 手のひらはやや体側へ。正面からも開いた指が見える程度に留める。
  // ひねりを付けると自動回転中のスクショで指同士が交差して見えるため正面向きに。
  hand.rotation.y = 0;
  // 実物の手は大きい（開いた手の幅が顔幅に迫る）。
  hand.scale.setScalar(1.0);
  group.add(hand);

  return group;
}

/** 細い黒い脚＋大きく丸い黒い足。付け根を原点に下へ。 */
function buildLeg(side: 1 | -1): THREE.Group {
  const group = new THREE.Group();
  const mat = skinMaterial(LIMB_DARK);

  // 脚は棒ではなく、ぬいぐるみらしい太さ（筒幅の約 1/4〜1/3）。
  // 実物の脚は短く、体のすそから足がすぐ出ているように見える。
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.15, 0.9, 24), mat);
  leg.position.y = -0.43;
  leg.castShadow = true;
  group.add(leg);

  // 大きく丸い靴のような足。前方主体に突き出し、軽い外股に。
  // 薄い座布団でなく、丸くふくらんだプラッシュ靴のボリュームを出す。
  const foot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 32), mat);
  foot.scale.set(1.0, 0.9, 1.45);
  // 内股に見えないよう左右間隔を空け、つま先はやや外向きに（開きすぎない）。
  foot.position.set(side * 0.1, -0.88, 0.26);
  foot.rotation.y = side * 0.3;
  foot.castShadow = true;
  group.add(foot);

  return group;
}

/**
 * Blender製 GLB ボディ（sunsun-body.glb）から、ファー植毛用の skin メッシュと
 * 口シェイプキーの参照を取り出し、マテリアルを設定する。
 * glTF はマテリアルごとにプリミティブ分割されるため、skin / mouth の
 * 2 メッシュ構成になっている。
 */
function prepareGlbBody(glb: THREE.Object3D): {
  group: THREE.Object3D;
  skinMesh: THREE.Mesh;
  setMouthOpen: (open: number) => void;
} | null {
  let skinMesh: THREE.Mesh | null = null;
  const morphMeshes: THREE.Mesh[] = [];
  glb.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const matName = (obj.material as THREE.Material).name;
    if (matName === "mouth") {
      // 口腔の内側。ライティングで灰色に浮かないよう非ライトの黒。
      obj.material = new THREE.MeshBasicMaterial({
        color: new THREE.Color("#131110"),
        side: THREE.DoubleSide,
      });
    } else {
      // 地肌: 手続き版と同じ起毛（sheen）マテリアル。
      obj.material = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(SKIN_BASE),
        roughness: 0.95,
        metalness: 0,
        sheen: 1.0,
        sheenColor: new THREE.Color(SKY_LIGHT),
        sheenRoughness: 0.55,
      });
      skinMesh = obj;
    }
    if (obj.morphTargetDictionary && "mouthOpen" in obj.morphTargetDictionary) {
      morphMeshes.push(obj);
    }
  });
  if (!skinMesh) return null;
  const setMouthOpen = (open: number) => {
    for (const m of morphMeshes) {
      const idx = m.morphTargetDictionary!["mouthOpen"];
      if (m.morphTargetInfluences) m.morphTargetInfluences[idx] = open;
    }
  };
  return { group: glb, skinMesh, setMouthOpen };
}

/**
 * スンスン一体を組み立てて返す。root をシーンに add すれば良い。
 * head / eyes / arms はアニメーション用の参照。
 *
 * glbBody に Blender 製ボディ（sunsun-body.glb のシーン）を渡すと、
 * ラテ+デカール口の手続き版の代わりに、本当に凹んだ口とシェイプキーの
 * 口パクを持つメッシュを使う。省略時/失敗時は従来の手続き版。
 */
export function createSunsunModel(
  glbBody?: THREE.Object3D,
  glbHands?: THREE.Object3D,
): SunsunModelParts {
  const root = new THREE.Group();

  const prepared = glbBody ? prepareGlbBody(glbBody) : null;

  let body: THREE.Mesh;
  let setMouthOpen: (open: number) => void;
  if (prepared) {
    root.add(prepared.group);
    body = prepared.skinMesh;
  } else {
    body = buildBody();
    root.add(body);
  }

  // 体のファー（もこもこ）。visible の切り替えでツルッと版と比較できる。
  const { fur, parts, chinMaterial } = buildFur(body);
  root.add(fur);

  // ---- 顔（まとめて軽く動かせるようグループ化） ----
  const head = new THREE.Group();
  root.add(head);

  // 小さな白目 2 つを頭のてっぺんに、ほぼ接するように乗せる。
  // 頭頂のドームに半分沈めて密着させ、互いにほぼ接するまで寄せる。
  // 黒目が正面（カメラ側）を向くよう少し前へ傾ける。
  // 大きめのピンポン玉の目をほぼ接するように。高さは少し非対称にして
  // 実物の愛嬌を出す。
  // 左右の見た目が揃うよう y 回転は付けない（黒円盤の見かけサイズが変わるため）。
  // 実物は頭のてっぺんにピンポン玉が「乗って」いる。頭頂ドームの上に
  // ほぼ全球が見えるよう高めに置き、互いにほぼ接するまで寄せる。
  // 眼球の下1/3が頭頂のファーに沈み込むよう、やや低めに置く。
  const eyeL = buildEye(1);
  eyeL.position.set(0.185, 2.26, 0.12);
  eyeL.rotation.x = THREE.MathUtils.degToRad(14);

  const eyeR = buildEye(-1);
  eyeR.position.set(-0.185, 2.28, 0.12);
  eyeR.rotation.x = THREE.MathUtils.degToRad(14);

  head.add(eyeL, eyeR);

  // 鼻は両目の下端にめり込むように密着する黒ボタン。
  const nose = buildNose();
  nose.position.set(0, 2.07, 0.42);
  head.add(nose);

  // 口。GLBボディでは凹んだ開口＋シェイプキーが既にあるため何も足さない。
  // フォールバックの手続き版のみ、体表に沿う楕円デカールを鼻のすぐ下に貼る
  // （上げすぎると鼻ボタンが口の中央を正面から隠し「二重の口」に見える）。
  // 口を開くとき、口の前に垂れる「あごヒゲ」毛束をフェードアウトさせて
  // 開口がファーに隠れないようにする（実物も開口部に毛はかからない）。
  const fadeChinFur = (open: number) => {
    chinMaterial.opacity = 1 - THREE.MathUtils.clamp(open * 1.4, 0, 1);
  };
  if (prepared) {
    const baseSetMouthOpen = prepared.setMouthOpen;
    setMouthOpen = (open) => {
      baseSetMouthOpen(open);
      fadeChinFur(open);
    };
  } else {
    const mouth = buildMouth();
    mouth.position.set(0, 1.86, 0);
    head.add(mouth);
    const baseY = mouth.scale.y;
    setMouthOpen = (open) => {
      mouth.scale.y = baseY * (0.85 + open * 1.1);
      fadeChinFur(open);
    };
  }

  // ---- 長い腕（実物の肩は顔のすぐ横＝筒の最上部近くに付く） ----
  // ファーの外側に腕のラインが見えるよう、肩をやや外に出す。
  // 腕はファーから離して外側へ垂らし、「腕」として読めるようにする
  // （体に沿わせすぎると3/4視点で黒い裂け目に見える）。
  const handL = glbHands?.getObjectByName("HandL");
  const handR = glbHands?.getObjectByName("HandR");

  const armL = buildArm(1, handL);
  armL.position.set(0.6, 1.72, 0.1);
  armL.rotation.z = THREE.MathUtils.degToRad(10);
  armL.rotation.x = THREE.MathUtils.degToRad(-3);

  const armR = buildArm(-1, handR);
  armR.position.set(-0.6, 1.72, 0.1);
  armR.rotation.z = THREE.MathUtils.degToRad(-10);
  armR.rotation.x = THREE.MathUtils.degToRad(-3);

  root.add(armL, armR);

  // ---- 脚と大きな足（筒の下端から出る。足同士が触れない間隔） ----
  const legL = buildLeg(1);
  legL.position.set(0.21, -0.24, 0);

  const legR = buildLeg(-1);
  legR.position.set(-0.21, -0.24, 0);

  root.add(legL, legR);

  return {
    root,
    head,
    eyes: [eyeL, eyeR],
    setMouthOpen,
    arms: [armL, armR],
    fur,
    applyFurReference: (image, meta) => applyFurReferenceToInstances(parts, image, meta),
  };
}

export const SUNSUN_COLORS = { SKY, SKY_LIGHT, EYE_WHITE, PUPIL, LIMB_DARK };
