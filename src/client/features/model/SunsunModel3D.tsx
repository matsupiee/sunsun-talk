import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createSunsunModel, type FurRefMeta, type SunsunModelParts } from "./sunsunModel";
import type { PeriodKey } from "../talk/_utils/constants";

// 時間帯ごとのステージの色味（トークUIと揃える）。
const STAGE_TINT: Record<PeriodKey, { bg: string; ground: string }> = {
  morning: { bg: "#f8d27a", ground: "#e6b45a" },
  day: { bg: "#f3b01c", ground: "#d99a15" },
  evening: { bg: "#ef9270", ground: "#d97a5b" },
  night: { bg: "#6e8fcb", ground: "#4f6aa0" },
};

export interface SunsunModel3DProps {
  /** 口をパクパクさせる（しゃべっている演出）。 */
  talking?: boolean;
  /** 時間帯によるステージの色味。省略時は落ち着いたスタジオ色。 */
  period?: PeriodKey;
  /** ゆっくり自動回転する。 */
  autoRotate?: boolean;
  /** ドラッグで回せるようにする。 */
  interactive?: boolean;
  /** 体のファー（もこもこ）を表示する。 */
  fluffy?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function SunsunModel3D({
  talking = false,
  period,
  autoRotate = false,
  interactive = true,
  fluffy = true,
  className,
  style,
}: SunsunModel3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  // アニメーションループから最新の props を読むための参照。
  const talkingRef = useRef(talking);
  const autoRotateRef = useRef(autoRotate);
  const fluffyRef = useRef(fluffy);
  talkingRef.current = talking;
  autoRotateRef.current = autoRotate;
  fluffyRef.current = fluffy;

  // 時間帯の色はマウント後にも切り替えられるよう ref で保持。
  const tintRef = useRef(period ? STAGE_TINT[period] : { bg: "#e9f4fb", ground: "#cfe4f1" });
  tintRef.current = period ? STAGE_TINT[period] : { bg: "#e9f4fb", ground: "#cfe4f1" };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.9, 7.2);

    // ---- ライティング（つるっとした立体感が出るように） ----
    // 全体を持ち上げる環境光。水色と白目が影で沈まないよう強めに。
    // ファーの陰影を残しつつ、影が濁った紺に沈まない程度の環境光。
    // 環境光が強すぎると青が白飛びしてグレーがかって見えるため控えめに。
    const ambient = new THREE.AmbientLight(0xffffff, 0.42);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xbfd6e6, 0.55);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(3.5, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    key.shadow.bias = -0.0004;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xdbeeff, 0.4);
    fill.position.set(-4, 2, 3);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.5);
    rim.position.set(-2, 3, -5);
    scene.add(rim);

    // ---- 接地影を落とすための床（影だけ受ける） ----
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(6, 48),
      new THREE.ShadowMaterial({ opacity: 0.22 }),
    );
    ground.rotation.x = -Math.PI / 2;
    // 足の裏が接地する高さ。
    ground.position.y = -1.52;
    ground.receiveShadow = true;
    scene.add(ground);

    // ---- スンスン本体 ----
    // Blender製ボディ（凹んだ口＋口パクシェイプキー）を読み込んでから組み立てる。
    // GLBやリファレンスのロードに失敗しても手続き版で動くようにする。
    let disposed = false;
    let sunsun: SunsunModelParts | null = null;
    (async () => {
      const loader = new GLTFLoader();
      const [glbBody, glbHands] = await Promise.all([
        loader
          .loadAsync("/assets/model/sunsun-body.glb")
          .then((g) => g.scene as THREE.Object3D)
          .catch(() => undefined),
        loader
          .loadAsync("/assets/model/sunsun-hands.glb")
          .then((g) => g.scene as THREE.Object3D)
          .catch(() => undefined),
      ]);
      if (disposed) return;
      sunsun = createSunsunModel(glbBody, glbHands);
      scene.add(sunsun.root);

      // 実写リファレンス（公式ステッカー写真由来）でファーの色ムラを実物に寄せる。
      try {
        const res = await fetch("/assets/model/fur-ref.json");
        if (!res.ok) return;
        const meta = (await res.json()) as FurRefMeta;
        const image = new Image();
        image.src = "/assets/model/fur-ref.png";
        await image.decode();
        if (!disposed && sunsun) sunsun.applyFurReference(image, meta);
      } catch {
        // リファレンス無しでも動作に支障はない
      }
    })();

    // ---- コントロール ----
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.4, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 4.5;
    controls.maxDistance = 11;
    controls.minPolarAngle = Math.PI * 0.16;
    controls.maxPolarAngle = Math.PI * 0.72;
    controls.enabled = interactive;
    controls.update();

    // ---- リサイズ対応 ----
    function resize() {
      const w = mount!.clientWidth || 1;
      const h = mount!.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    // ---- アニメーション ----
    const clock = new THREE.Clock();
    let raf = 0;
    // 口の開き具合（0..1）。閉じるときは滑らかに戻す。
    let mouthOpen = 0;

    function tick() {
      raf = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();

      if (sunsun) {
        // 呼吸するような上下のゆれ（立ち姿なので控えめに、足が浮かない程度）。
        sunsun.root.position.y = Math.sin(t * 1.4) * 0.015;
        sunsun.root.rotation.z = Math.sin(t * 0.9) * 0.012;

        // 頭を少しかしげる。
        sunsun.head.rotation.z = Math.sin(t * 0.8 + 0.5) * 0.03;
        sunsun.head.rotation.x = Math.sin(t * 1.1) * 0.02;

        // グーグリーアイのぷるぷる。
        sunsun.eyes.forEach((eye, i) => {
          const p = t * 2.3 + i * 1.7;
          eye.rotation.x = Math.sin(p) * 0.06;
          eye.rotation.z = Math.cos(p * 0.8) * 0.05 + (i === 0 ? 0.1 : -0.13);
        });

        // 腕をゆらゆら。
        sunsun.arms.forEach((arm, i) => {
          const dir = i === 0 ? 1 : -1;
          arm.rotation.x = THREE.MathUtils.degToRad(-8) + Math.sin(t * 1.3 + i) * 0.08 * dir;
        });

        // 口パク（0..1）。GLBボディならシェイプキー、手続き版ならデカールの縦開き。
        if (talkingRef.current) {
          mouthOpen = (Math.sin(t * 16) * 0.5 + 0.5) ** 1.5;
        } else {
          mouthOpen += (0 - mouthOpen) * 0.15;
        }
        sunsun.setMouthOpen(mouthOpen);

        // もこもこON/OFF。
        sunsun.fur.visible = fluffyRef.current;
      }

      controls.autoRotate = autoRotateRef.current;
      controls.autoRotateSpeed = 1.1;
      controls.update();

      const tint = tintRef.current;
      renderer.setClearColor(new THREE.Color(tint.bg), 1);
      (ground.material as THREE.ShadowMaterial).color.set(tint.ground);

      renderer.render(scene, camera);
    }
    tick();

    // ---- クリーンアップ ----
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
    // interactive の切り替えは再マウントで対応（頻繁に変えない想定）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  return <div ref={mountRef} className={className} style={{ touchAction: "none", ...style }} />;
}
