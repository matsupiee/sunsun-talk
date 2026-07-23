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
const SKY = "#8fd4f5"; // 体のベースになる水色（明るめの空色）
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

/** 水色のボディ（頭〜胴を 1 本の回転体でなめらかに繋いだヒョウタン形）。 */
function buildBody(): THREE.Mesh {
  // (半径, 高さ) の輪郭。下から上へ。頭を大きめの丸、胴は少し細めにして
  // ボウリングピンのようなパペットのシルエットを作る。
  const profile: Array<[number, number]> = [
    [0.02, -1.62],
    [0.42, -1.58],
    [0.72, -1.42],
    [0.94, -1.12],
    [1.08, -0.72],
    [1.09, -0.28],
    [1.02, 0.12],
    [0.92, 0.42], // 頭と胴のあいだの軽いくびれ
    [0.95, 0.66],
    [1.06, 0.96],
    [1.14, 1.2], // 頭のいちばん広いところ
    [1.09, 1.44],
    [0.9, 1.66],
    [0.58, 1.84],
    [0.28, 1.94],
    [0.02, 1.98],
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
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.46, 48, 48), whiteMat);
  white.castShadow = true;
  group.add(white);

  // 黒目は白目の前面に少し飛び出させて球状に。少し内寄り＆下向きの
  // 「ちょっと寄り目」で愛嬌のある表情にする。
  const pupilMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PUPIL),
    roughness: 0.35,
    metalness: 0.0,
  });
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.23, 40, 40), pupilMat);
  pupil.position.set(-side * 0.05, -0.06, 0.4);
  group.add(pupil);

  // 黒目のハイライト（プラスチックの目の反射）。
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 20), glintMat);
  glint.position.set(-side * 0.05 + 0.07, 0.04, 0.58);
  group.add(glint);

  return group;
}

/** 小さな黒い鼻。 */
function buildNose(): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PUPIL),
    roughness: 0.4,
  });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.14, 32, 32), mat);
  nose.scale.set(1.1, 0.85, 0.9);
  nose.castShadow = true;
  return nose;
}

/** 大きく開いた黒い口。縦につぶした黒いお椀で「ぽっかり開いた穴」に見せる。 */
function buildMouth(): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PUPIL),
    roughness: 0.55,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  // 半球を伏せて口内のくぼみを作る。
  const geo = new THREE.SphereGeometry(0.34, 40, 40);
  const mouth = new THREE.Mesh(geo, mat);
  mouth.scale.set(1.15, 0.92, 0.7);
  return mouth;
}

/** 黒い腕＋ミトン状の手。 */
function buildArm(side: 1 | -1): THREE.Group {
  const group = new THREE.Group();
  const mat = skinMaterial(ARM_DARK);
  mat.roughness = 0.8;

  // 肩から手首へ細くなる腕。
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 1.15, 24), mat);
  upper.castShadow = true;
  upper.position.y = -0.5;
  group.add(upper);

  // ミトン状の手（少し平たい球）。
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 32), mat);
  hand.scale.set(1.0, 1.2, 0.55);
  hand.position.y = -1.12;
  hand.castShadow = true;
  group.add(hand);

  // 親指。
  const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 20), mat);
  thumb.scale.set(1, 1.5, 0.6);
  thumb.position.set(side * 0.22, -1.0, 0.02);
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

  // 実物のように、頭のてっぺん寄りに 2 つの目をくっつけて乗せる。
  const eyeL = buildEye(1);
  eyeL.position.set(0.37, 1.74, 0.62);
  eyeL.rotation.y = THREE.MathUtils.degToRad(-12);
  eyeL.rotation.z = THREE.MathUtils.degToRad(6);

  const eyeR = buildEye(-1);
  eyeR.position.set(-0.37, 1.76, 0.62);
  eyeR.rotation.y = THREE.MathUtils.degToRad(12);
  eyeR.rotation.z = THREE.MathUtils.degToRad(-8);

  head.add(eyeL, eyeR);

  const nose = buildNose();
  nose.position.set(0, 1.16, 1.12);
  head.add(nose);

  const mouth = buildMouth();
  mouth.position.set(0, 0.74, 1.0);
  head.add(mouth);

  // ---- 腕 ----
  const armL = buildArm(1);
  armL.position.set(1.02, -0.1, 0.15);
  armL.rotation.z = THREE.MathUtils.degToRad(24);
  armL.rotation.x = THREE.MathUtils.degToRad(-8);

  const armR = buildArm(-1);
  armR.position.set(-1.02, -0.1, 0.15);
  armR.rotation.z = THREE.MathUtils.degToRad(-24);
  armR.rotation.x = THREE.MathUtils.degToRad(-8);

  root.add(armL, armR);

  return { root, head, eyes: [eyeL, eyeR], mouth, arms: [armL, armR] };
}

export const SUNSUN_COLORS = { SKY, SKY_LIGHT, EYE_WHITE, PUPIL, ARM_DARK };
