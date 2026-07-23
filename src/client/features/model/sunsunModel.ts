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
  // (半径, 高さ) の輪郭。下から上へ。実物は「丸い頭 + それより太いふっくら
  // した胴」なので、胴（お腹）をいちばん広く、頭はまるいボール状にする。
  const profile: Array<[number, number]> = [
    [0.02, -1.58],
    [0.52, -1.54],
    [0.9, -1.3],
    [1.14, -0.94],
    [1.24, -0.5], // お腹がいちばん広い
    [1.22, -0.05],
    [1.08, 0.38],
    [0.95, 0.68], // 頭と胴のあいだの軽いくびれ
    [1.0, 0.92],
    [1.13, 1.18],
    [1.18, 1.4], // 頭のいちばん広いところ（まるいボール）
    [1.1, 1.64],
    [0.88, 1.84],
    [0.5, 2.0],
    [0.02, 2.06],
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
  // 白目は小さめのボール。実物の目は頭に対してそれほど大きくない。
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.34, 48, 48), whiteMat);
  white.castShadow = true;
  group.add(white);

  // 黒目は白目の縁が少し残る程度まで大きく（実物は黒目が白目のほとんどを
  // 占める）。前面に張り付けて正面を向かせる。
  const pupilMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PUPIL),
    roughness: 0.32,
    metalness: 0.0,
  });
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.24, 40, 40), pupilMat);
  pupil.position.set(-side * 0.02, 0.02, 0.19);
  group.add(pupil);

  // 黒目のハイライト（プラスチックの目の反射）。
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 20), glintMat);
  glint.position.set(-side * 0.02 + 0.08, 0.1, 0.38);
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

/** 大きく開いた黒い口。横長・平たいマットな黒で「ぽっかり開いた穴」に見せる。 */
function buildMouth(): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PUPIL),
    // つや消しにして「プラスチックの黒いボール」に見えないようにする。
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const geo = new THREE.SphereGeometry(0.3, 40, 40);
  const mouth = new THREE.Mesh(geo, mat);
  // 縦横比を横長に、奥行きは浅くして「面に開いた穴」に近づける。
  mouth.scale.set(1.3, 0.92, 0.5);
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

  // 実物のように、頭の前面・中央寄りに 2 つの目をほぼくっつけて配置する。
  // 目・鼻・口を上寄りにまとめて「顔のかたまり」を作るのがポイント。
  const eyeL = buildEye(1);
  eyeL.position.set(0.28, 1.46, 0.78);
  eyeL.rotation.y = THREE.MathUtils.degToRad(-16);
  eyeL.rotation.x = THREE.MathUtils.degToRad(-6);

  const eyeR = buildEye(-1);
  eyeR.position.set(-0.28, 1.47, 0.78);
  eyeR.rotation.y = THREE.MathUtils.degToRad(16);
  eyeR.rotation.x = THREE.MathUtils.degToRad(-6);

  head.add(eyeL, eyeR);

  // 鼻は目のすぐ下、中央に。
  const nose = buildNose();
  nose.position.set(0, 1.18, 1.08);
  head.add(nose);

  // 口は鼻のすぐ下に。顔の中央〜やや下にまとめる。
  const mouth = buildMouth();
  mouth.position.set(0, 0.86, 0.92);
  head.add(mouth);

  // ---- 腕 ----
  const armL = buildArm(1);
  armL.position.set(1.16, -0.2, 0.12);
  armL.rotation.z = THREE.MathUtils.degToRad(20);
  armL.rotation.x = THREE.MathUtils.degToRad(-8);

  const armR = buildArm(-1);
  armR.position.set(-1.16, -0.2, 0.12);
  armR.rotation.z = THREE.MathUtils.degToRad(-20);
  armR.rotation.x = THREE.MathUtils.degToRad(-8);

  root.add(armL, armR);

  return { root, head, eyes: [eyeL, eyeR], mouth, arms: [armL, armR] };
}

export const SUNSUN_COLORS = { SKY, SKY_LIGHT, EYE_WHITE, PUPIL, ARM_DARK };
