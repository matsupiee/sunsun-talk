import * as THREE from "three";

/**
 * パペット「スンスン」の 3D モデルをプリミティブから手続き的に組み立てる。
 *
 * 実物は水色のふわふわパペットだが、体毛のふわふわ感は 3D では再現が難しいため
 * 表面はツルッとしたビニール／プラスチック調のマット寄りマテリアルで表現する。
 *
 * 全身のプロポーション（全身写真から）:
 * - 水色の体は「細長い筒」状で、幅は全身の高さの約 1/4。頭と胴の区別は無い。
 * - 顔（小さな白目×2・黒い丸鼻・横に広い口）は筒の最上部に小さくまとまる。
 * - 黒い腕は非常に長く（全身の約半分）、指の分かれた大きな手が付く。
 * - 筒の下から黒く細い脚が 2 本出て、大きく丸い黒い足で立つ。
 */

// ---- パレット（実物の配色を参考に） ----------------------------------------
const SKY = "#a5c6f7"; // 体のベースになる水色（明るいペリウィンクル水色）
const SKY_LIGHT = "#c9def8"; // ハイライト用の明るい水色
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
    [0.24, -0.3],
    [0.38, -0.22],
    [0.45, -0.02],
    [0.47, 0.3],
    [0.48, 0.7], // ほぼ一定の太さ
    [0.48, 1.1],
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

  const mesh = new THREE.Mesh(geometry, skinMaterial(SKY));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** 頭のてっぺんに乗る小さなグーグリーアイ（白目＋小さめの黒目）。 */
function buildEye(side: 1 | -1): THREE.Group {
  const group = new THREE.Group();

  const whiteMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(EYE_WHITE),
    roughness: 0.35,
    metalness: 0.0,
    // つやのある目が影に沈んで灰色に見えないよう、わずかに自発光。
    emissive: new THREE.Color("#e9eef2"),
    emissiveIntensity: 0.35,
  });
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.16, 48, 48), whiteMat);
  white.scale.set(1, 1.05, 1);
  white.castShadow = true;
  group.add(white);

  // 黒目は白目に対して小さめの黒点。
  const pupilMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PUPIL),
    roughness: 0.32,
    metalness: 0.0,
  });
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 40, 40), pupilMat);
  // 白目の中央（わずかに内側寄り）に置く。
  pupil.position.set(-side * 0.014, -0.008, 0.14);
  group.add(pupil);

  // 黒目のハイライト。ごく小さな点ひとつ。
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 16), glintMat);
  glint.position.set(-side * 0.012 + 0.024, 0.045, 0.19);
  group.add(glint);

  return group;
}

/** 小さな黒い丸鼻。目のすぐ下・中央。 */
function buildNose(): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PUPIL),
    roughness: 0.3,
  });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.085, 32, 32), mat);
  nose.scale.set(1.1, 1.0, 0.7);
  return nose;
}

/** 横に広い浅い口。軽く開いた黒い開口（しゃべる時は縦に開く）。 */
function buildMouth(): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PUPIL),
    // つや消しにして「面に開いた穴」らしく。
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const geo = new THREE.SphereGeometry(0.24, 40, 40);
  const mouth = new THREE.Mesh(geo, mat);
  // 横に広く、少し縦にも開いた開口。奥行きはつぶして面に貼り付ける。
  mouth.scale.set(1.2, 0.56, 0.35);
  // 上辺をわずかに後ろへ倒し、軽く開いた口に見せる。
  mouth.rotation.x = 0.25;
  return mouth;
}

/** 指の分かれた大きな黒いフェルトの手。 */
function buildHand(side: 1 | -1): THREE.Group {
  const group = new THREE.Group();
  const mat = skinMaterial(LIMB_DARK);
  mat.roughness = 0.85;

  // 手のひら（大きく平たい楕円）。フェルトらしく薄めに。
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 32), mat);
  palm.scale.set(1.3, 1.05, 0.4);
  palm.castShadow = true;
  group.add(palm);

  // 長めの平たい 4 本指。根元を手のひらに食い込ませて一体の手袋に見せる。
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.36, 6, 12), mat);
    const fan = (i - 1.5) * 0.12; // 扇の開き
    finger.position.set((i - 1.5) * 0.128, -0.29, 0);
    finger.rotation.z = -fan;
    finger.scale.z = 0.75; // 指も平たく
    finger.castShadow = true;
    group.add(finger);
  }

  // 親指はやや斜め下へ（真横に張らない）。
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.17, 6, 12), mat);
  thumb.position.set(side * 0.27, -0.09, 0);
  thumb.rotation.z = side * 0.8;
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

  const hand = buildHand(side);
  hand.position.y = -1.82;
  // 手は腕の延長で自然に垂らす。手のひらは体側へ向け、正面からは
  // 手の甲〜側面が見えるようにする（前へ突き出さない）。
  hand.rotation.y = -side * 0.7;
  // フェルトの手袋らしい存在感が出るよう少し大きめに。
  hand.scale.setScalar(1.25);
  group.add(hand);

  return group;
}

/** 細い黒い脚＋大きく丸い黒い足。付け根を原点に下へ。 */
function buildLeg(side: 1 | -1): THREE.Group {
  const group = new THREE.Group();
  const mat = skinMaterial(LIMB_DARK);
  mat.roughness = 0.85;

  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.15, 20), mat);
  leg.position.y = -0.56;
  leg.castShadow = true;
  group.add(leg);

  // 大きく丸い靴のような足。前方主体に突き出し、軽い外股に。
  const foot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 32), mat);
  foot.scale.set(1.25, 0.95, 2.6);
  foot.position.set(side * 0.03, -1.1, 0.36);
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

  // ---- 顔（まとめて軽く動かせるようグループ化） ----
  const head = new THREE.Group();
  root.add(head);

  // 小さな白目 2 つを頭のてっぺんに、ほぼ接するように乗せる。
  // 頭頂のドームに半分沈めて密着させ、互いにほぼ接するまで寄せる。
  // 黒目が正面（カメラ側）を向くよう少し前へ傾ける。
  const eyeL = buildEye(1);
  eyeL.position.set(0.125, 2.15, 0.22);
  eyeL.rotation.y = THREE.MathUtils.degToRad(-2);
  eyeL.rotation.x = THREE.MathUtils.degToRad(20);

  const eyeR = buildEye(-1);
  eyeR.position.set(-0.125, 2.16, 0.22);
  eyeR.rotation.y = THREE.MathUtils.degToRad(2);
  eyeR.rotation.x = THREE.MathUtils.degToRad(20);

  head.add(eyeL, eyeR);

  // 鼻は目のすぐ下・中央。面から少し前へ出して見えるように。
  const nose = buildNose();
  nose.position.set(0, 1.9, 0.42);
  head.add(nose);

  // 口は鼻の下、横に広く浅い開口。面すれすれに沈めて庇状に突き出させない。
  const mouth = buildMouth();
  mouth.position.set(0, 1.68, 0.34);
  head.add(mouth);

  // ---- 長い腕（肩は筒の上から約 1/3 の側面。体側に沿ってまっすぐ垂らす） ----
  const armL = buildArm(1);
  armL.position.set(0.44, 1.38, 0.02);
  armL.rotation.z = THREE.MathUtils.degToRad(5);
  armL.rotation.x = THREE.MathUtils.degToRad(-3);

  const armR = buildArm(-1);
  armR.position.set(-0.44, 1.38, 0.02);
  armR.rotation.z = THREE.MathUtils.degToRad(-5);
  armR.rotation.x = THREE.MathUtils.degToRad(-3);

  root.add(armL, armR);

  // ---- 脚と大きな足（筒の下端から出る。足同士が触れない間隔） ----
  const legL = buildLeg(1);
  legL.position.set(0.21, -0.24, 0);

  const legR = buildLeg(-1);
  legR.position.set(-0.21, -0.24, 0);

  root.add(legL, legR);

  return { root, head, eyes: [eyeL, eyeR], mouth, arms: [armL, armR] };
}

export const SUNSUN_COLORS = { SKY, SKY_LIGHT, EYE_WHITE, PUPIL, LIMB_DARK };
