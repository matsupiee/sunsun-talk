import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createSunsunModel } from "./sunsunModel";
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
  className?: string;
  style?: React.CSSProperties;
}

export function SunsunModel3D({
  talking = false,
  period,
  autoRotate = false,
  interactive = true,
  className,
  style,
}: SunsunModel3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  // アニメーションループから最新の props を読むための参照。
  const talkingRef = useRef(talking);
  const autoRotateRef = useRef(autoRotate);
  talkingRef.current = talking;
  autoRotateRef.current = autoRotate;

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
    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xbfd6e6, 0.7);
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
    const sunsun = createSunsunModel();
    scene.add(sunsun.root);

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
    // 口の閉じた状態の基準スケール。
    const mouthBaseY = sunsun.mouth.scale.y;

    function tick() {
      raf = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();

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

      // 口パク。しゃべっている間は速く大きく、そうでなければ基準に戻す。
      if (talkingRef.current) {
        const open = (Math.sin(t * 16) * 0.5 + 0.5) ** 1.5;
        sunsun.mouth.scale.y = mouthBaseY * (0.85 + open * 1.4);
        sunsun.mouth.scale.z = 0.7 + open * 0.35;
      } else {
        sunsun.mouth.scale.y += (mouthBaseY - sunsun.mouth.scale.y) * 0.15;
        sunsun.mouth.scale.z += (0.7 - sunsun.mouth.scale.z) * 0.15;
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
