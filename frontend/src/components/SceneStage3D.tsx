import { useEffect, useRef } from 'react';
import {
  Box3, DirectionalLight, Group, HemisphereLight,
  Mesh, MeshStandardMaterial, NoToneMapping, OrthographicCamera, Raycaster, Scene, SRGBColorSpace, Texture, Vector3, WebGLRenderer,
} from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { SceneDef, Seat } from '../types';
import type { StageView } from './stageFacing';

/**
 * Rendering constants chosen by sweeping light intensity, saturation and tone curve
 * against an unlit (MeshBasicMaterial) pass of the same model and scoring the mean
 * absolute difference per pixel. Each scene was scored independently; the values
 * below are the best shared setting (mean error 9.1 vs 18.9 for the previous
 * NeutralToneMapping setup). `sat` stays 1 for every scene: the texture needs no
 * correction once the tone curve is out of the way.
 */
const STAGE_TUNING = {
  hemi: 3.0,
  groundColor: 0xa89a90,
  key: 0.4,
  fill: 0.1,
  exposure: 1,
  sat: 1,
} as const;

function disposeModel(model: Group) {
  const textures = new Set<Texture>();
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
      material.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
}

/**
 * Optional saturation trim, around perceptual luma so hue and relative brightness
 * are preserved. Measured against the source art, the Meshy base colour texture is
 * already faithful, so the stage runs at 1.0 (no boost) and this is only a knob for
 * per-scene taste (SCENE_TUNING).
 */
function boostSaturation(material: MeshStandardMaterial, amount: number) {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.saturationAmount = { value: amount };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float saturationAmount;')
      .replace(
        '#include <map_fragment>',
        ['#include <map_fragment>',
         'vec3 stageLuma = vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));',
         'diffuseColor.rgb = clamp(mix(stageLuma, diffuseColor.rgb, saturationAmount), 0.0, 1.0);'].join('\n'),
      );
  };
  material.needsUpdate = true;
}

/** The imported room is an additional stage. Existing persona sprites keep their identity and actions. */
export function SceneStage3D({ scene, onLoaded, onSeatPositions, onStageView }: {
  scene: SceneDef;
  onLoaded: (error?: string) => void;
  onSeatPositions: (positions: Seat[]) => void;
  /** 相机朝向和每个座位的世界坐标：人物靠它算出自己该朝哪边站，而不是永远盯着观众 */
  onStageView: (view: StageView) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tuning = STAGE_TUNING;
  const callbacks = useRef({ onLoaded, onSeatPositions, onStageView });
  callbacks.current = { onLoaded, onSeatPositions, onStageView };

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !scene.model3d) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      callbacks.current.onLoaded('当前设备无法启动 WebGL，已切换回场景原图');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    // The imported maps are flat, hand-authored pixel art. Any filmic curve (ACES,
    // Neutral, AgX) compresses their saturated, mid-bright colours, which is what
    // made the rooms read washed out, so render them straight through.
    renderer.toneMapping = NoToneMapping;
    renderer.toneMappingExposure = tuning.exposure;
    renderer.setClearColor('#24202c');
    renderer.domElement.setAttribute('aria-label', scene.name + '，拖动旋转，滚轮缩放');
    renderer.domElement.setAttribute('role', 'img');
    host.appendChild(renderer.domElement);

    // Tuned by measuring the lit render against an unlit pass of the same texture
    // (see frontend/public/models/README.md). A hemisphere light near full sky
    // irradiance plus a light key reproduces the baked colours with only a little
    // directional falloff to keep the room readable as 3D.
    const world = new Scene();
    world.add(new HemisphereLight(0xffffff, tuning.groundColor, tuning.hemi));
    const sun = new DirectionalLight(0xfff3e2, tuning.key);
    sun.position.set(-2, 4, 3);
    world.add(sun);
    const bounce = new DirectionalLight(0xdfe7ff, tuning.fill);
    bounce.position.set(3, 2, -3);
    world.add(bounce);
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 30);
    camera.zoom = 1.08;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = 1.15;
    controls.minZoom = 0.7;
    controls.maxZoom = 2.6;

    const seats: Vector3[] = [];
    let model: Group | null = null;
    let ready = false;
    let disposed = false;
    let frame = 0;
    let lastPositions = '';
    let lastView = '';

    /** 相机在水平面上的轴：局部 X 是屏幕向右，局部 +Z 从场景指向观众 */
    const flatAxis = (v: Vector3) => {
      const length = Math.hypot(v.x, v.z);
      return length < 1e-6 ? null : { x: v.x / length, z: v.z / length };
    };

    const publishPositions = () => {
      if (!ready) return;
      camera.updateMatrixWorld();
      const positions = seats.map((seat) => {
        const point = seat.clone().project(camera);
        return { x: +((point.x + 1) * 50).toFixed(2), y: +((1 - point.y) * 50).toFixed(2) };
      });
      const key = JSON.stringify(positions);
      if (key !== lastPositions) {
        lastPositions = key;
        callbacks.current.onSeatPositions(positions);
      }

      const right = flatAxis(new Vector3().setFromMatrixColumn(camera.matrixWorld, 0));
      const toward = flatAxis(new Vector3().setFromMatrixColumn(camera.matrixWorld, 2));
      if (!right || !toward) return;
      const view: StageView = {
        right,
        toward,
        seats: seats.map((seat) => ({ x: +seat.x.toFixed(4), z: +seat.z.toFixed(4) })),
      };
      const viewKey = JSON.stringify(view);
      if (viewKey !== lastView) {
        lastView = viewKey;
        callbacks.current.onStageView(view);
      }
    };

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      camera.updateMatrixWorld();
      if (model) {
        const bounds = new Box3().setFromObject(model);
        const corners: Vector3[] = [];
        for (const x of [bounds.min.x, bounds.max.x])
          for (const y of [bounds.min.y, bounds.max.y])
            for (const z of [bounds.min.z, bounds.max.z])
              corners.push(new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
        const xRange = Math.max(...corners.map((p) => p.x)) - Math.min(...corners.map((p) => p.x));
        const yRange = Math.max(...corners.map((p) => p.y)) - Math.min(...corners.map((p) => p.y));
        const viewHeight = Math.max(xRange / aspect, yRange) * 1.2;
        camera.left = -viewHeight * aspect / 2;
        camera.right = viewHeight * aspect / 2;
        camera.top = viewHeight / 2;
        camera.bottom = -viewHeight / 2;
      } else {
        camera.left = -aspect;
        camera.right = aspect;
        camera.top = 1;
        camera.bottom = -1;
      }
      camera.updateProjectionMatrix();
      publishPositions();
    };
    controls.addEventListener('change', publishPositions);
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    void new GLTFLoader().loadAsync(scene.model3d).then((gltf) => {
      if (disposed) { disposeModel(gltf.scene); return; }
      model = gltf.scene;
      model.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          for (const value of Object.values(material)) {
            if (value instanceof Texture) value.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          }
          if (material instanceof MeshStandardMaterial && tuning.sat !== 1) boostSaturation(material, tuning.sat);
        }
      });
      world.add(model);
      const bounds = new Box3().setFromObject(model);
      const center = bounds.getCenter(new Vector3());
      const size = bounds.getSize(new Vector3());
      controls.target.copy(center);
      camera.position.copy(center).add(new Vector3(size.x * 0.12, size.length() * 1.1, size.length() * 0.9));
      camera.lookAt(center);
      camera.updateMatrixWorld();
      const ray = new Raycaster();
      for (const seat of scene.modelSeats ?? scene.seats) {
        const x = bounds.min.x + size.x * seat.x / 100;
        const z = bounds.min.z + size.z * seat.y / 100;
        ray.set(new Vector3(x, bounds.max.y + 1, z), new Vector3(0, -1, 0));
        const surface = ray.intersectObject(model, true)[0];
        seats.push(new Vector3(x, (surface?.point.y ?? bounds.min.y) + size.y * 0.04, z));
      }
      ready = true;
      resize();
      callbacks.current.onLoaded();
    }).catch(() => {
      if (!disposed) callbacks.current.onLoaded('3D 模型加载失败，已切换回场景原图');
    });

    const tick = () => {
      if (disposed) return;
      frame = requestAnimationFrame(tick);
      if (document.hidden) return;
      controls.update();
      renderer.render(world, camera);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      if (model) disposeModel(model);
      renderer.dispose();
      renderer.forceContextLoss();
      host.removeChild(renderer.domElement);
    };
  }, [scene]);

  return <div className="stage-3d-canvas" ref={hostRef} />;
}
