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
const SKY = "#a5c6f7"; // 体のベースになる水色（明るいペリウィンクル水色）
const SKY_LIGHT = "#c9def8"; // ハイライト用の明るい水色
const FUR_ROOT = "#3577de"; // 毛束の根元〜中間（鮮やかな深いブルー）
const FUR_TIP = "#c5e3fc"; // 毛束の毛先（白っぽい空色のチップ）
const SKIN_BASE = "#4c8be0"; // 毛の隙間から見える地肌（鮮やかなブルー）
const EYE_WHITE = "#fdfdf7"; // ほぼ白の白目
const PUPIL = "#141210"; // 黒目・鼻・口の黒
const LIMB_DARK = "#121216"; // 黒に近い腕・脚・手足

export interface SunsunModelParts {
  root: THREE.Group;
  /** 顔（目・鼻・口）グループ。軽く揺らす */
  head: THREE.Group;
  /** 左右の白目（グーグリーアイ）。アイドル時に微妙に揺れる */
  eyes: THREE.Group[];
  /** 口の開閉に使うメッシュ */
  mouth: THREE.Mesh;
  /** 腕(左右)。軽く揺らす */
  arms: THREE.Group[];
  /** 体のファー（毛束の InstancedMesh）。visible でもこもこON/OFF */
  fur: THREE.InstancedMesh;
}

function skinMaterial(color: string) {
  // つるっとしたビニール人形のような、少しだけ光沢のあるマット。
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.62,
    metalness: 0.02,
  });
}

/** 水色のボディ。細長い筒状で、上端は丸いドーム。 */
function buildBody(): THREE.Mesh {
  // (半径, 高さ) の輪郭。下から上へ。幅は控えめ、縦に長く。
  // 水色の筒は全身の上 2/3 に収め、下 1/3 は黒い脚に譲る。
  // 太さはほぼ一定のまっすぐなチューブで、上端だけ丸いドーム。
  const profile: Array<[number, number]> = [
    [0.02, -0.32],
    [0.25, -0.3],
    [0.39, -0.22],
    [0.45, -0.02],
    [0.46, 0.3],
    [0.465, 0.7], // ほぼ一定の太さ
    [0.47, 1.1],
    [0.47, 1.5],
    [0.45, 1.8],
    [0.41, 2.0],
    [0.33, 2.14], // 上端は丸いドーム
    [0.2, 2.23],
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
const EYE_L_POS = new THREE.Vector3(0.155, 2.13, 0.24);
const EYE_R_POS = new THREE.Vector3(-0.155, 2.17, 0.24);
const NOSE_POS = new THREE.Vector3(0, 1.94, 0.46);

/**
 * 体表面に数万本の毛束（先細りの小さな錐）を InstancedMesh で植える。
 * - 根元→毛先で深い水色→白に近い水色のグラデーション（頂点カラー）
 * - 法線方向＋下向きの「毛流れ」で、実物のやや垂れた長毛ファーに寄せる
 * - 目・鼻・口のまわりは毛を避け、顔の正面は短毛にして表情を隠さない
 */
function buildFur(body: THREE.Mesh): THREE.InstancedMesh {
  const COUNT = 60000;

  // 毛束テンプレート。根元を原点、+Y へ長さ 1 の細い錐。
  const geo = new THREE.ConeGeometry(1, 1, 4, 1, true);
  geo.translate(0, 0.5, 0);
  const pos = geo.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const rootColor = new THREE.Color(FUR_ROOT);
  const tipColor = new THREE.Color(FUR_TIP);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i), 0, 1);
    // 白化は毛先寄りに限定しつつ、中間色は鮮やかな青を保つ。
    c.copy(rootColor).lerp(tipColor, Math.pow(t, 2.6));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
  });
  const fur = new THREE.InstancedMesh(geo, mat, COUNT);

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

    // 目の球・鼻・口の輪郭ぎわ数ミリだけは毛を植えない（それ以外は頭頂まで生やす）。
    const dEyeL = p.distanceTo(EYE_L_POS);
    const dEyeR = p.distanceTo(EYE_R_POS);
    if (dEyeL < 0.16 || dEyeR < 0.16) continue;
    if (p.distanceTo(NOSE_POS) < 0.12) continue;
    // 口デカール（半幅0.16・半高0.085）よりひと回り狭い範囲だけ毛を避ける。
    // デカールが無毛域を完全に覆い隠し、外周の毛が縁に被さる。
    if (Math.abs(p.y - 1.71) < 0.045 && Math.abs(p.x) < 0.1 && p.z > 0.25) continue;

    // 顔の正面上部は短毛にして、目・鼻・口が読めるようにする（無毛地帯は作らない）。
    const nearFace = p.y > 1.45 && p.z > 0.05;
    let lengthScale = nearFace ? 0.62 : 1.0;
    // 目のすぐ近くはさらに短毛にして、白目が毛の上に半分埋まって見えるようにする。
    if (dEyeL < 0.3 || dEyeR < 0.3) lengthScale *= 0.45;
    // 口の周囲リングもやや短毛にして、毛が開口に垂れて口を隠さないようにする
    // （短くしすぎると刈り込み跡に見えるので控えめに）。
    if (Math.abs(p.y - 1.72) < 0.2 && p.z > 0.1) lengthScale *= 0.7;
    // 口の直近リングはさらに短くして、毛が開口へ被らないようにする。
    if (Math.abs(p.y - 1.72) < 0.12 && p.z > 0.2) lengthScale *= 0.55;

    // 15% は長めの「差し毛」にして、輪郭を大ぶりに波打たせる。
    const guardHair = !nearFace && Math.random() < 0.12;
    // 細めの毛を密に重ねて柔らかい質感にする（太い毛は硬く見える）。
    const len = (0.11 + Math.random() * 0.13) * lengthScale * (guardHair ? 1.6 : 1.0);
    let thickness = (0.023 + Math.random() * 0.014) * (guardHair ? 1.25 : 1.0);
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
      .multiplyScalar(0.4);
    const crownDroop = Math.max(0, n.y) * 0.85; // 上向き法線ほど追加で寝かせる
    // 2割の毛は垂れを弱めて外へ広げ、ふわっとした輪郭を作る。
    const fluffOut = Math.random() < 0.2 ? 0.6 : 1.0;
    dir
      .copy(n)
      .addScaledVector(down, (1.35 + crownDroop + Math.random() * 0.4) * fluffOut)
      .add(jitter)
      .normalize();
    quat.setFromUnitVectors(up, dir);

    dummy.position.copy(p).addScaledVector(n, -0.02);
    dummy.quaternion.copy(quat);
    dummy.scale.set(thickness, len, thickness * 0.75);
    dummy.updateMatrix();
    fur.setMatrixAt(placed, dummy.matrix);

    // 毛束ごとの明るさのゆらぎ（ムラは控えめにして斑点ノイズを避ける）。
    // わずかに青へ寄せて、強い光でも水色の印象が飛ばないようにする。
    // 短毛（顔まわり）は根元の暗色が支配的になるため明るめに補正する。
    let v = 0.88 + Math.random() * 0.12;
    if (lengthScale < 0.75) v *= 1.28;
    fur.setColorAt(placed, tint.setRGB(v * 0.95, v * 0.98, v * 1.03));
    placed++;
  }
  fur.count = placed;
  fur.instanceMatrix.needsUpdate = true;
  if (fur.instanceColor) fur.instanceColor.needsUpdate = true;

  return fur;
}

/**
 * 頭のてっぺんに乗るピンポン玉状の目。
 * 実物は白い球に「平らな黒い円」が印刷のように付き、その内側に
 * 小さな白い点が1つ入る（球状の黒目ではない）。視線はやや内側・下寄り。
 */
function buildEye(side: 1 | -1): THREE.Group {
  const group = new THREE.Group();

  const whiteMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(EYE_WHITE),
    roughness: 0.25,
    metalness: 0.0,
    // つやのある目が影に沈んで灰色に見えないよう、わずかに自発光。
    emissive: new THREE.Color("#e9eef2"),
    emissiveIntensity: 0.35,
  });
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.19, 48, 48), whiteMat);
  white.castShadow = true;
  group.add(white);

  // 黒目＝平らな黒い円盤（強くつぶした球）。やや内側・下寄りに貼る。
  const irisMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PUPIL),
    roughness: 0.6,
    metalness: 0.0,
  });
  const irisDir = new THREE.Vector3(-side * 0.2, -0.26, 1).normalize();
  const iris = new THREE.Mesh(new THREE.SphereGeometry(0.095, 40, 40), irisMat);
  iris.scale.set(1, 1, 0.16);
  iris.position.copy(irisDir).multiplyScalar(0.185);
  iris.lookAt(irisDir.clone().multiplyScalar(2));
  group.add(iris);

  // 黒円の内側に入る小さな白い点（フラット）。
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.028, 20, 20), dotMat);
  dot.scale.set(1, 1, 0.2);
  dot.position.copy(irisDir).multiplyScalar(0.2);
  dot.lookAt(irisDir.clone().multiplyScalar(2));
  group.add(dot);

  return group;
}

/** 黒い布張りボタン状の丸鼻。目のすぐ下・目と目の間に接する。 */
function buildNose(): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PUPIL),
    // 布張りなのでプラスチックほどつやを出さない。
    roughness: 0.55,
  });
  mat.roughness = 0.9; // マットな布の質感（強いハイライトを出さない）
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.115, 32, 32), mat);
  nose.scale.set(1.05, 1.0, 0.75);
  return nose;
}

/**
 * 横に広い浅い口。楕円のデカールを体表（この高さの半径 ≒0.44）に沿って
 * 湾曲させたもので、長方形やくちばし状に見えないようにする。
 * メッシュの原点は体の軸上（口の高さ）に置くこと。しゃべる時は scale.y で縦に開く。
 */
function buildMouth(): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PUPIL),
    // つや消しにして「面に開いた穴」らしく。
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  // 実物の口は小さく控えめ（幅は筒幅の約1/4以下）。
  // 単位円 → 半幅0.16・半高0.085 の小さな楕円にし、x を弧長として筒面に巻き付ける。
  // 地肌(≒0.458)より上・毛の垂れ(≒0.5)より中央は上。縁の沈み込みは
  // 毛の垂れ境界までに留め、視点が回っても口が欠けないようにする。
  const R_CENTER = 0.515;
  const R_EDGE = 0.495;
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
  mat.roughness = 0.85;

  // 実物の手は「一枚の平たい黒フェルトの手袋」。手のひらは角の無い
  // 丸みのある平板にし、指は根元同士が触れ合う間隔で深く食い込ませて
  // 全体がひとつながりのシルエットに見えるようにする。
  // 手首から幅が広がる平たいくさび（フェルトの手袋の土台）。
  const wedge = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.22, 0.38, 24), mat);
  wedge.scale.z = 0.3;
  wedge.position.y = -0.19;
  wedge.castShadow = true;
  group.add(wedge);
  // ナックル部分の幅広の平板。指の根元をここへ連続させる。
  const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 32), mat);
  knuckle.scale.set(1.12, 0.55, 0.14);
  knuckle.position.y = -0.4;
  knuckle.castShadow = true;
  group.add(knuckle);

  // 太く平たい 4 本指。隙間は狭く、根元はナックル板に食い込ませて連続させる。
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.6, 6, 12), mat);
    const fan = (i - 1.5) * 0.08; // 控えめな開き
    finger.position.set((i - 1.5) * 0.122, -0.72, 0);
    finger.rotation.z = -fan;
    finger.scale.z = 0.58; // 断面を扁平に（先端は丸く残す）
    finger.castShadow = true;
    group.add(finger);
  }

  // 親指だけははっきり分離して大きく横へ。
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.064, 0.34, 6, 12), mat);
  thumb.position.set(side * 0.27, -0.36, 0);
  thumb.rotation.z = side * 0.8;
  thumb.scale.z = 0.5;
  thumb.castShadow = true;
  group.add(thumb);

  return group;
}

/** 細く長い黒い腕＋指付きの手。肩を原点に下へ垂れる。 */
function buildArm(side: 1 | -1): THREE.Group {
  const group = new THREE.Group();
  const mat = skinMaterial(LIMB_DARK);
  mat.roughness = 0.85;

  // 細長い腕（全身の約半分の長さ・筒幅の約 1/6 の太さ）。
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.7, 20), mat);
  upper.position.y = -0.84;
  upper.castShadow = true;
  group.add(upper);

  // 手の原点は手首（腕の末端）。そこから手袋が下に伸びる。
  const hand = buildHand(side);
  hand.position.y = -1.68;
  // 手のひらはやや体側へ。正面からも開いた指が見える程度に留める。
  hand.rotation.y = -side * 0.1;
  hand.scale.setScalar(1.05);
  group.add(hand);

  return group;
}

/** 細い黒い脚＋大きく丸い黒い足。付け根を原点に下へ。 */
function buildLeg(side: 1 | -1): THREE.Group {
  const group = new THREE.Group();
  const mat = skinMaterial(LIMB_DARK);
  mat.roughness = 0.85;

  // 脚は棒ではなく、ぬいぐるみらしい太さ（筒幅の約 1/4〜1/3）。
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.15, 1.15, 24), mat);
  leg.position.y = -0.56;
  leg.castShadow = true;
  group.add(leg);

  // 大きく丸い靴のような足。前方主体に突き出し、軽い外股に。
  const foot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 32), mat);
  foot.scale.set(1.25, 0.95, 3.0);
  foot.position.set(side * 0.03, -1.1, 0.4);
  foot.rotation.y = side * 0.2;
  foot.castShadow = true;
  group.add(foot);

  return group;
}

/**
 * スンスン一体を組み立てて返す。root をシーンに add すれば良い。
 * head / eyes / mouth / arms はアニメーション用の参照。
 */
export function createSunsunModel(): SunsunModelParts {
  const root = new THREE.Group();

  const body = buildBody();
  root.add(body);

  // 体のファー（もこもこ）。visible の切り替えでツルッと版と比較できる。
  const fur = buildFur(body);
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
  const eyeL = buildEye(1);
  eyeL.position.set(0.155, 2.145, 0.24);
  eyeL.rotation.x = THREE.MathUtils.degToRad(20);

  const eyeR = buildEye(-1);
  eyeR.position.set(-0.155, 2.155, 0.24);
  eyeR.rotation.x = THREE.MathUtils.degToRad(20);

  head.add(eyeL, eyeR);

  // 鼻は目のすぐ下・中央。ファーに埋もれないよう毛先より前へ出す。
  // 鼻は両目の接合部の直下に接するように。
  const nose = buildNose();
  nose.position.set(0, 1.94, 0.46);
  head.add(nose);

  // 口は鼻の下、横に広く浅い開口。毛に埋もれず、突き出しすぎない位置に。
  // 口パッチの球中心を体の軸上（口の高さ）に置くと、体表に沿って湾曲する。
  // 実物どおり鼻のすぐ下に。
  const mouth = buildMouth();
  mouth.position.set(0, 1.72, 0);
  head.add(mouth);

  // ---- 長い腕（肩は筒の上から約 1/3 の側面。体側に沿ってまっすぐ垂らす） ----
  // ファーの外側に腕のラインが見えるよう、肩をやや外に出す。
  // 腕はファーから離して外側へ垂らし、「腕」として読めるようにする
  // （体に沿わせすぎると3/4視点で黒い裂け目に見える）。
  const armL = buildArm(1);
  armL.position.set(0.53, 1.38, 0.1);
  armL.rotation.z = THREE.MathUtils.degToRad(13);
  armL.rotation.x = THREE.MathUtils.degToRad(-3);

  const armR = buildArm(-1);
  armR.position.set(-0.53, 1.38, 0.1);
  armR.rotation.z = THREE.MathUtils.degToRad(-13);
  armR.rotation.x = THREE.MathUtils.degToRad(-3);

  root.add(armL, armR);

  // ---- 脚と大きな足（筒の下端から出る。足同士が触れない間隔） ----
  const legL = buildLeg(1);
  legL.position.set(0.21, -0.24, 0);

  const legR = buildLeg(-1);
  legR.position.set(-0.21, -0.24, 0);

  root.add(legL, legR);

  return { root, head, eyes: [eyeL, eyeR], mouth, arms: [armL, armR], fur };
}

export const SUNSUN_COLORS = { SKY, SKY_LIGHT, EYE_WHITE, PUPIL, LIMB_DARK };
