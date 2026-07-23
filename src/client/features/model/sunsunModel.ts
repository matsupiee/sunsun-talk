import * as THREE from "three";

/**
 * パペット「スンスン」の 3D モデルをプリミティブから手続き的に組み立てる。
 *
 * 実物は水色のふわふわパペットだが、体毛のふわふわ感は 3D では再現が難しいため
 * 表面はツルッとしたビニール／プラスチック調のマット寄りマテリアルで表現する。
 * 顔まわり（飛び出した白目・黒目、黒い鼻、大きく開いた黒い口、黒い手）は
 * ステッカーの見た目にできるだけ寄せている。
 */

// ---- パレット（ステッカーの配色を参考に） ----------------------------------
const SKY = "#93cbf4"; // 体のベースになる水色（淡いパステルの水色）
const SKY_LIGHT = "#cdecfb"; // 顔まわりの明るい水色
const EYE_WHITE = "#fdfdf7"; // ほぼ白の白目
const PUPIL = "#141210"; // 黒目・鼻・口の黒
const ARM_DARK = "#1b1d24"; // 黒に近い手・腕

export interface SunsunModelParts {
  root: THREE.Group;
  /** 上下に軽く揺らす頭部＋顔グループ */
  head: THREE.Group;
  /** 左右の白目（グーグリーアイ）。アイドル時に微妙に揺れる */
  eyes: THREE.Group[];
  /** 口の開閉に使うメッシュ */
  mouth: THREE.Mesh;
  /** 腕（軽く揺らす） */
  arms: THREE.Group[];
}

function skinMaterial(color: string) {
  // つるっとしたビニール人形のような、少しだけ光沢のあるマット。
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.62,
    metalness: 0.02,
  });
}

/** 水色のボディ（大きな丸い頭が主役で、その下に短めの胴が続く一体形）。 */
function buildBody(): THREE.Mesh {
  // (半径, 高さ) の輪郭。下から上へ。実物はパペットなので「大きな丸い頭」が
  // 全体の大半を占め、胴は短い。頭がいちばん広く、下は短くすぼまる。
  const profile: Array<[number, number]> = [
    [0.02, -1.15],
    [0.44, -1.1],
    [0.74, -0.85],
    [0.94, -0.5],
    [1.04, -0.1],
    [1.12, 0.35],
    [1.17, 0.75],
    [1.19, 1.05], // 頭のいちばん広いところ
    [1.14, 1.35],
    [1.02, 1.62],
    [0.82, 1.85],
    [0.56, 2.03],
    [0.3, 2.13], // 頭頂は丸いドーム状に
    [0.02, 2.17],
  ];

  const points = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geometry = new THREE.LatheGeometry(points, 64);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, skinMaterial(SKY));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** 飛び出したグーグリーアイ（白目＋黒目＋ハイライト）。 */
function buildEye(side: 1 | -1): THREE.Group {
  const group = new THREE.Group();

  const whiteMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(EYE_WHITE),
    roughness: 0.35,
    metalness: 0.0,
    // つやのあるプラスチックの目が影に沈んで灰色に見えないよう、わずかに自発光。
    emissive: new THREE.Color("#e9eef2"),
    emissiveIntensity: 0.35,
  });
  // 白目はきれいな丸ボール。前面にしっかり飛び出させて「貼り付けた
  // プラスチックの目」に見せる。
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.3, 48, 48), whiteMat);
  // 実物の白目はわずかに縦長の卵形。
  white.scale.set(1, 1.08, 1);
  white.castShadow = true;
  group.add(white);

  // 黒目は白目の縁が少し残る程度まで大きく（実物は黒目が白目のほとんどを
  // 占める）。前面に張り付けて正面を向かせる。
  const pupilMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PUPIL),
    roughness: 0.32,
    metalness: 0.0,
  });
  // 実物は白目が広く、瞳は小さめの黒点で「きょとん」とした印象。
  // わずかに上・内寄りに向けて愛嬌のあるロンパリ気味の視線にする。
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.145, 40, 40), pupilMat);
  pupil.position.set(-side * 0.02, 0.03, 0.26);
  group.add(pupil);

  // 黒目のハイライト（プラスチックの目の反射）。小さな点ひとつ。
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.032, 20, 20), glintMat);
  glint.position.set(-side * 0.02 + 0.048, 0.09, 0.38);
  group.add(glint);

  return group;
}

/** 小さく平たい黒い丸鼻（つや有り）。面に貼り付いたドット状で突出させない。 */
function buildNose(): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PUPIL),
    roughness: 0.3,
  });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 32), mat);
  // 奥行きは少しだけ抑えて、くちばしのように尖らない小さな丸ボタンに。
  nose.scale.set(1.1, 1.0, 0.65);
  return nose;
}

/** 大きく開いた黒い口。横長・平たいマットな黒で「ぽっかり開いた穴」に見せる。 */
function buildMouth(): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PUPIL),
    // つや消しにして「プラスチックの黒いボール」に見えないようにする。
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const geo = new THREE.SphereGeometry(0.35, 40, 40);
  const mouth = new THREE.Mesh(geo, mat);
  // 開いた、面に開いた横長楕円の黒穴に。
  mouth.scale.set(1.3, 0.82, 0.48);
  return mouth;
}

/** 黒い腕＋ミトン状の手。 */
function buildArm(side: 1 | -1): THREE.Group {
  const group = new THREE.Group();
  const mat = skinMaterial(ARM_DARK);
  mat.roughness = 0.8;

  // 肩から手首へ細くなる腕。
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 24), mat);
  upper.castShadow = true;
  upper.position.y = -0.55;
  group.add(upper);

  // ミトン状の手（少し平たい球）。
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.23, 32, 32), mat);
  hand.scale.set(1.0, 1.25, 0.55);
  hand.position.y = -1.16;
  hand.castShadow = true;
  group.add(hand);

  // 親指。
  const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 20), mat);
  thumb.scale.set(1, 1.5, 0.6);
  thumb.position.set(side * 0.18, -1.07, 0.02);
  thumb.rotation.z = side * 0.6;
  group.add(thumb);

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

  // ---- 頭＋顔（まとめて軽く動かせるようグループ化） ----
  const head = new THREE.Group();
  root.add(head);

  // 実物のように、頭の前面・中央寄りに 2 つの目をほぼくっつけて配置する。
  // 目・鼻・口を上寄りにまとめて「顔のかたまり」を作るのがポイント。
  // 目は頭の上寄りに、前面へ大きく突出した2つの球として、ほぼくっつくくらい
  // 間隔を詰めて配置する。
  // 左右を独立した2つの球として、中央で軽く触れる程度に配置する
  // （くっついて1枚のマスクに見えないように）。
  // 左右を独立した2つの球として、中央でほぼ接するくらいまで寄せる。
  // 左右を中央でほぼ接するくらいまで寄せる。
  const eyeL = buildEye(1);
  eyeL.position.set(0.23, 1.5, 1.13);
  eyeL.rotation.y = THREE.MathUtils.degToRad(-5);

  const eyeR = buildEye(-1);
  eyeR.position.set(-0.23, 1.51, 1.13);
  eyeR.rotation.y = THREE.MathUtils.degToRad(5);

  head.add(eyeL, eyeR);

  // 鼻は左右の黒目の谷間の直下に、面から前へ出して必ず見えるように。
  const nose = buildNose();
  nose.position.set(0, 1.26, 1.2);
  head.add(nose);

  // 口は鼻の下に、間を空けて開いた黒い楕円で。
  const mouth = buildMouth();
  mouth.position.set(0, 0.82, 1.06);
  head.add(mouth);

  // ---- 腕（細く長く、肩の高さから垂れ下がる） ----
  const armL = buildArm(1);
  armL.position.set(1.02, 0.35, 0.1);
  armL.rotation.z = THREE.MathUtils.degToRad(12);
  armL.rotation.x = THREE.MathUtils.degToRad(-6);

  const armR = buildArm(-1);
  armR.position.set(-1.02, 0.35, 0.1);
  armR.rotation.z = THREE.MathUtils.degToRad(-12);
  armR.rotation.x = THREE.MathUtils.degToRad(-6);

  root.add(armL, armR);

  return { root, head, eyes: [eyeL, eyeR], mouth, arms: [armL, armR] };
}

export const SUNSUN_COLORS = { SKY, SKY_LIGHT, EYE_WHITE, PUPIL, ARM_DARK };
