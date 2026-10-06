import { useEffect, useRef } from 'react';
import {
  CanvasTexture, DirectionalLight, HemisphereLight, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  NearestFilter, NoToneMapping, PerspectiveCamera, PlaneGeometry, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import type { Facing, PersonaVisual, SceneDef, Seat } from '../types';
import type { StageView } from './stageFacing';
import { centroid, facingToward } from './stageFacing';
import { buildPixelAvatar } from './pixelAvatarDraw';
import { buildDebateRoom } from './pixelDebateRoom';
import { DEBATE_ROOM, frameCamera, type CameraFrame } from './pixelDebatePlan';
import {
  actorMotion, actorWorldSize, drawingForPose, FACING_STEP_MS, motionSalt, stepFacing,
  type ActorPose, type AvatarGesture, type FaceFrame,
} from './pixelActorMotion';

export interface PixelCastMember {
  id: string;
  seatIndex: number;
  host: boolean;
  visual: PersonaVisual;
  pose: ActorPose;
}

/** 抬头低头的上下限，别让人把头转反 */
const PITCH_LIMIT = 1.15;
/** 鼠标拖动的灵敏度（弧度/像素） */
const LOOK_SPEED = 0.004;

function flatAxis(v: Vector3) {
  const length = Math.hypot(v.x, v.z);
  return length < 1e-6 ? null : { x: v.x / length, z: v.z / length };
}

function visualKey(visual: PersonaVisual) {
  return JSON.stringify([visual.skin, visual.hair, visual.shirt, visual.accent, visual.hairStyle, visual.extras]);
}

function avatarTexture(visual: PersonaVisual, facing: Facing, drawing: 'sit' | 'stand', gesture: AvatarGesture, frame: FaceFrame) {
  const drawn = buildPixelAvatar(visual, { facing, pose: drawing, gesture, frame });
  const canvas = document.createElement('canvas');
  canvas.width = drawn.width;
  canvas.height = drawn.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  for (const [x, y, w, h, color] of drawn.rects) {
    context.fillStyle = color;
    context.fillRect(x, y, w, h);
  }
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * 进门时的机位：站在房间里朝座位那一片看，尽量把在场的人一次收进画面。
 * 只算位姿，不依赖 three，脚本可以单独跑它检查取景。
 */
export function pixelCameraFrame(points: { x: number; z: number }[], aspect: number): CameraFrame {
  return frameCamera(points, aspect, DEBATE_ROOM);
}

/**
 * 辩论室的像素舞台。人不用 3D 模型，是把像素小人贴在竖直面上，
 * 每张图都正对镜头，所以转到哪个角度看都是正面。
 * 镜头按在场的人自动取景：先给一个大家都能看见的机位，再让人自己转头环视。
 */
export function PixelStage3D({ scene, cast, onLoaded, onSeatPositions, onStageView }: {
  scene: SceneDef;
  cast: PixelCastMember[];
  onLoaded: (error?: string) => void;
  onSeatPositions: (positions: Seat[]) => void;
  onStageView: (view: StageView) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onLoaded, onSeatPositions, onStageView });
  callbacks.current = { onLoaded, onSeatPositions, onStageView };
  const castRef = useRef(cast);
  castRef.current = cast;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || scene.pixelStage !== 'debate') return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      callbacks.current.onLoaded('当前设备无法启动 WebGL，已切换回场景原图');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NoToneMapping;
    renderer.setClearColor('#24202c');
    renderer.domElement.setAttribute('aria-label', scene.name + '，拖动转头，滚轮前后');
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.setAttribute('role', 'img');
    host.appendChild(renderer.domElement);

    const world = new Scene();
    world.add(new HemisphereLight(0xfff6ea, 0x8c8478, 1.06));
    const sun = new DirectionalLight(0xfff1dc, 0.62);
    sun.position.set(-4, 7, 5);
    world.add(sun);
    const fill = new DirectionalLight(0xd7e6ff, 0.24);
    fill.position.set(5, 3, 2);
    world.add(fill);
    const built = buildDebateRoom(scene.seats);
    world.add(built.root);

    // YXZ：先转头（Y），再抬头低头（X）。实测正的 X 是抬头。
    const camera = new PerspectiveCamera(62, 1, 0.08, 80);
    camera.rotation.order = 'YXZ';
    // 用户自己的转头量，叠在自动取景的机位上；换尺寸导致重新取景时不会把人的视角抹掉
    let userYaw = 0;
    let userPitch = 0;
    let lastAspect = 0;
    let framed: CameraFrame | null = null;
    /** 按当前画面比例重新算一次取景；只在还没进门或换尺寸时调用 */
    const reframe = (aspect: number) => {
      const frame = pixelCameraFrame(built.points, aspect);
      framed = frame;
      camera.fov = frame.fov;
      camera.position.set(frame.position.x, frame.position.y, frame.position.z);
      applyLook();
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    };
    const applyLook = () => {
      if (!framed) return;
      camera.rotation.y = framed.yaw + userYaw;
      camera.rotation.x = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, framed.pitch + userPitch));
    };
    camera.updateMatrixWorld();

    const forward = new Vector3();
    const up = new Vector3(0, 1, 0);
    let looking = false;
    let lookX = 0;
    let lookY = 0;

    type Actor = {
      id: string;
      mesh: Mesh;
      shown: Facing | null;
      key: string;
    };
    const actors = new Map<string, Actor>();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let motionNow = 0;
    let disposed = false;
    let frame = 0;
    let lastPositions = '';
    let lastView = '';
    let turnDebt = 0;
    let lastTick = performance.now();

    const publish = () => {
      const advance = turnDebt >= FACING_STEP_MS;
      if (advance) turnDebt = 0;
      camera.updateMatrixWorld();
      const right = flatAxis(new Vector3().setFromMatrixColumn(camera.matrixWorld, 0));
      const toward = flatAxis(new Vector3().setFromMatrixColumn(camera.matrixWorld, 2));
      const members = castRef.current.filter((member) => built.points[member.seatIndex]);
      const lookPoints = members.map((member) => built.points[member.seatIndex]);
      const look = centroid(lookPoints) ?? { x: 0, z: 0 };
      if (right && toward) {
        const view: StageView = {
          right,
          toward,
          seats: built.points.map((point) => ({ x: +point.x.toFixed(4), z: +point.z.toFixed(4) })),
        };
        const viewKey = JSON.stringify(view);
        if (viewKey !== lastView) {
          lastView = viewKey;
          callbacks.current.onStageView(view);
        }
      }

      const seen = new Set<string>();
      for (const member of members) {
        seen.add(member.id);
        const point = built.points[member.seatIndex];
        const drawing = drawingForPose(member.pose, member.host);
        const motion = actorMotion(member.pose, motionNow, motionSalt(member.id), reducedMotion);
        const size = actorWorldSize(drawing);
        let actor = actors.get(member.id);
        if (!actor) {
          const material = new MeshBasicMaterial({ transparent: true, alphaTest: 0.45, toneMapped: false });
          const mesh = new Mesh(new PlaneGeometry(1, 1), material);
          world.add(mesh);
          actor = { id: member.id, mesh, shown: null, key: '' };
          actors.set(member.id, actor);
        }
        const target = right && toward ? facingToward(point, look, { right, toward }) : 'S';
        let shown = actor.shown;
        if (shown === null || reducedMotion) shown = target;
        else if (advance) shown = stepFacing(shown, target);
        actor.shown = shown;
        const key = shown + '|' + drawing + '|' + motion.gesture + '|' + motion.frame + '|' + visualKey(member.visual);
        if (key !== actor.key) {
          const texture = avatarTexture(member.visual, shown, drawing, motion.gesture, motion.frame);
          const material = actor.mesh.material as MeshBasicMaterial;
          material.map?.dispose();
          material.map = texture;
          material.needsUpdate = true;
          actor.key = key;
        }
        actor.mesh.scale.set(size.worldWidth, size.worldHeight, 1);
        actor.mesh.position.set(point.x, size.worldHeight / 2 + 0.02 + motion.bob, point.z);
        actor.mesh.lookAt(camera.position.x, actor.mesh.position.y, camera.position.z);
        if (!reducedMotion) actor.mesh.rotateZ(Math.sin((motionNow + motionSalt(member.id)) / 520) * (member.pose === 'speak' ? 0.07 : 0.04));
      }
      for (const [id, actor] of actors) {
        if (seen.has(id)) continue;
        world.remove(actor.mesh);
        const material = actor.mesh.material as MeshBasicMaterial;
        material.map?.dispose();
        material.dispose();
        actor.mesh.geometry.dispose();
        actors.delete(id);
      }

      const heads = built.points.map((point, index) => {
        const member = members.find((item) => item.seatIndex === index);
        const drawing = member ? drawingForPose(member.pose, member.host) : 'sit';
        const size = actorWorldSize(drawing);
        const head = new Vector3(point.x, size.worldHeight + 0.04, point.z);
        camera.getWorldDirection(forward);
        if (head.clone().sub(camera.position).dot(forward) < 0.25) return null;
        return head.project(camera);
      });
      const positions = heads.map((point) => point
        ? { x: +((point.x + 1) * 50).toFixed(2), y: +((1 - point.y) * 50).toFixed(2) }
        : { x: -100, y: -100 });
      const key = JSON.stringify(positions);
      if (key !== lastPositions) {
        lastPositions = key;
        callbacks.current.onSeatPositions(positions);
      }
    };

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      // 取景只跟画面比例有关；同一比例的连续 resize 不再重算，免得把视线拽回去
      if (!framed || Math.abs(aspect - lastAspect) > 0.01) {
        lastAspect = aspect;
        reframe(aspect);
      }
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      publish();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      looking = true;
      lookX = event.clientX;
      lookY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!looking) return;
      userYaw -= (event.clientX - lookX) * LOOK_SPEED;
      userPitch = Math.max(-PITCH_LIMIT * 2, Math.min(PITCH_LIMIT * 2, userPitch - (event.clientY - lookY) * LOOK_SPEED));
      lookX = event.clientX;
      lookY = event.clientY;
      applyLook();
    };
    const onPointerUp = () => { looking = false; };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // 滚轮推拉镜头：只改视场角，不动位置，避免钻进墙里
      camera.fov = Math.max(42, Math.min(78, camera.fov + event.deltaY * 0.03));
      camera.updateProjectionMatrix();
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    callbacks.current.onLoaded();

    const tick = (now: number) => {
      if (disposed) return;
      frame = requestAnimationFrame(tick);
      if (document.hidden) { lastTick = now; return; }
      turnDebt += now - lastTick;
      lastTick = now;
      motionNow = now;
      publish();
      renderer.render(world, camera);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      for (const actor of actors.values()) {
        const material = actor.mesh.material as MeshBasicMaterial;
        material.map?.dispose();
        material.dispose();
        actor.mesh.geometry.dispose();
      }
      built.root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (material instanceof MeshBasicMaterial || material instanceof MeshLambertMaterial) material.map?.dispose();
          material.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      host.removeChild(renderer.domElement);
    };
  }, [scene]);

  return <div className="stage-3d-canvas" ref={hostRef} />;
}
