import {
  CanvasTexture, Group, Mesh, MeshStandardMaterial, NearestFilter,
  PlaneGeometry, SRGBColorSpace, Vector3, type Camera,
} from 'three';
import type { Facing, PersonaVisual } from '../types';
import { buildPixelAvatar } from './pixelAvatarDraw';
import { motionSalt, stepFacing, type ActorPose, type FaceFrame } from './pixelActorMotion';
import { centroid, facingToward, type StageView } from './stageFacing';

export interface SceneCastMember {
  id: string;
  name?: string;
  seatIndex: number;
  host: boolean;
  visual: PersonaVisual;
  pose: ActorPose;
}

/** Small, separate head/hand movements; the seated body never hops off its anchor. */
export function roomActorMotion(pose: ActorPose, now: number, salt: number, attentionAge: number, reduced: boolean) {
  const delay = 260 + salt % 640;
  if (reduced) return { frame: 0 as FaceFrame, head: 0, tilt: 0, hand: 0, breath: 0, attentive: true };
  const t = (now + salt * 7) / 1000;
  const blinkPeriod = 4200 + salt % 2400;
  const blink = (now + salt * 11) % blinkPeriod < 140;
  const talk: FaceFrame[] = [0, 1, 0, 2, 1, 0, 1, 0];
  const frame = blink && pose !== 'speak' ? 3
    : pose === 'speak' ? talk[Math.floor((now + salt) / 190) % talk.length]
    : pose === 'think' && Math.sin(t * 0.7) > 0.7 ? 1 : 0;
  const reaction = attentionAge - delay - 700;
  const nod = reaction > 0 && reaction < 750 ? Math.sin(reaction / 750 * Math.PI) : 0;
  return {
    frame: frame as FaceFrame,
    head: pose === 'speak' ? Math.sin(t * 2.2) * 0.006 : -nod * 0.012,
    tilt: pose === 'think' ? -0.03 : pose === 'speak' ? Math.sin(t * 1.5) * 0.012 : Math.sin(t * 0.4) * 0.004,
    hand: pose === 'speak' ? 0.08 + Math.max(0, Math.sin(t * 1.6)) * 0.1 : pose === 'think' ? 0.35 : pose === 'work' ? Math.sin(t * 4) * 0.03 : 0,
    breath: Math.sin(t * 1.15) * 0.003,
    attentive: attentionAge >= delay,
  };
}

function surface(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Pixel avatar canvas unavailable');
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.magFilter = map.minFilter = NearestFilter;
  map.generateMipmaps = false;
  const material = new MeshStandardMaterial({ map, transparent: false, alphaTest: 0.5, roughness: 1, metalness: 0 });
  return { canvas, context, map, material };
}

type Surface = ReturnType<typeof surface>;
interface RoomActor {
  root: Group;
  head: Group;
  torso: Mesh;
  arms: Group[];
  surfaces: Surface[];
  geometry: PlaneGeometry[];
  member: SceneCastMember;
  visualKey: string;
  textureKey: string;
  shown: Facing;
  bodyFacing: Facing;
  turnAt: number;
  image: HTMLImageElement | null;
  disposed: boolean;
}

/** The original pixel art, now depth tested with the room. Only 3D stages instantiate this. */
export class ScenePixelActors {
  readonly root = new Group();
  readonly actors = new Map<string, RoomActor>();
  private speaker: string | null = null;
  private attentionAt = 0;
  private readonly height: number;

  constructor(height: number) {
    this.height = height;
    this.root.name = 'ScenePixelCast';
  }

  private create(member: SceneCastMember): RoomActor {
    const h = this.height;
    const root = new Group();
    root.name = 'pixel-person-' + member.id;
    const head = new Group();
    head.position.y = h * 0.25;
    const surfaces = [surface(16, 11), surface(16, 9), surface(2, 6)];
    const geometry = [new PlaneGeometry(h, h * 11 / 16), new PlaneGeometry(h, h * 9 / 16), new PlaneGeometry(h * 2 / 16, h * 6 / 16)];
    const face = new Mesh(geometry[0], surfaces[0].material);
    face.position.y = h * 11 / 32;
    head.add(face);
    const torso = new Mesh(geometry[1], surfaces[1].material);
    torso.position.y = h * (0.25 - 9 / 32);
    const arms = [-1, 1].map((sign) => {
      const joint = new Group();
      joint.position.set(sign * h * 0.29, h * 0.18, h * 0.015);
      const arm = new Mesh(geometry[2], surfaces[2].material);
      arm.position.y = -h * 3 / 16;
      joint.add(arm);
      return joint;
    });
    root.add(torso, ...arms, head);
    this.root.add(root);
    return { root, head, torso, arms, surfaces, geometry, member, visualKey: '', textureKey: '', shown: 'S', bodyFacing: 'S', turnAt: 0, image: null, disposed: false };
  }

  private paint(actor: RoomActor, facing: Facing, bodyFacing: Facing, frame: FaceFrame) {
    const { visual, pose } = actor.member;
    const visualKey = JSON.stringify(visual);
    if (actor.visualKey !== visualKey) {
      const expectedImage = visual.image;
      actor.visualKey = visualKey;
      if (visual.image && (!actor.image || actor.image.src !== new URL(visual.image, location.href).href)) {
        const picture = new Image();
        picture.crossOrigin = 'anonymous';
        picture.onload = () => { if (!actor.disposed && actor.member.visual.image === expectedImage) actor.textureKey = ''; };
        picture.src = visual.image;
        actor.image = picture;
      } else if (!visual.image) actor.image = null;
    }
    const key = `${visualKey}:${facing}:${bodyFacing}:${frame}:${pose}`;
    if (key === actor.textureKey) return;
    actor.textureKey = key;
    const headDrawing = buildPixelAvatar(visual, { facing, gesture: pose === 'speak' ? 'talk' : pose === 'think' ? 'think' : 'idle', frame });
    const bodyDrawing = buildPixelAvatar(visual, { facing: bodyFacing });
    const [head, body, arm] = actor.surfaces;
    for (const s of actor.surfaces) s.context.clearRect(0, 0, s.canvas.width, s.canvas.height);
    head.context.fillStyle = visual.skin;
    head.context.fillRect(7, 10, 2, 1);
    for (const [x, y, w, hh, color] of headDrawing.rects) {
      head.context.fillStyle = color;
      head.context.fillRect(x, y, w, hh);
    }
    if (actor.image?.complete && actor.image.naturalWidth) {
      head.context.clearRect(0, 0, 16, 11);
      head.context.imageSmoothingEnabled = false;
      head.context.drawImage(actor.image, 3, 0, 10, 10);
    }
    for (const [x, y, w, hh, color] of bodyDrawing.rects) {
      body.context.fillStyle = color;
      body.context.fillRect(x, y - 11, w, hh);
    }
    body.context.fillStyle = '#3d3550';
    body.context.fillRect(4, 5, 3, 4);
    body.context.fillRect(9, 5, 3, 4);
    arm.context.fillStyle = visual.shirt;
    arm.context.fillRect(0, 0, 2, 4);
    arm.context.fillStyle = visual.skin;
    arm.context.fillRect(0, 4, 2, 2);
    for (const s of actor.surfaces) s.map.needsUpdate = true;
  }

  update(members: SceneCastMember[], seats: Vector3[], camera: Camera, now: number, reduced: boolean) {
    const present = new Set(members.map((m) => m.id));
    for (const [id, actor] of this.actors) if (!present.has(id)) {
      this.remove(actor);
      this.actors.delete(id);
    }
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const toward = new Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
    right.y = toward.y = 0;
    right.normalize();
    toward.normalize();
    const view: StageView = {
      right: { x: right.x, z: right.z }, toward: { x: toward.x, z: toward.z }, seats,
    };
    const center = centroid(members.map((m) => seats[m.seatIndex]).filter(Boolean));
    const speaker = members.find((m) => m.pose === 'speak');
    if ((speaker?.id ?? null) !== this.speaker) {
      this.speaker = speaker?.id ?? null;
      this.attentionAt = now;
    }
    for (const member of members) {
      const seat = seats[member.seatIndex];
      if (!seat || !center) continue;
      let actor = this.actors.get(member.id);
      if (!actor) { actor = this.create(member); this.actors.set(member.id, actor); }
      actor.member = member;
      const motion = roomActorMotion(member.pose, now, motionSalt(member.id), speaker ? now - this.attentionAt : Infinity, reduced);
      const rest = facingToward(seat, center, view);
      const audience = centroid(members.filter((m) => m.id !== member.id).map((m) => seats[m.seatIndex]).filter(Boolean));
      const look = speaker && speaker.id !== member.id && motion.attentive ? seats[speaker.seatIndex]
        : speaker?.id === member.id ? audience ?? center : center;
      const wanted = facingToward(seat, look, view);
      if (reduced || actor.turnAt === 0) actor.shown = wanted;
      else if (now - actor.turnAt >= 120) actor.shown = stepFacing(actor.shown, wanted);
      if (now - actor.turnAt >= 120) actor.turnAt = now;
      actor.bodyFacing = rest;
      this.paint(actor, actor.shown, rest, motion.frame);
      actor.root.position.copy(seat);
      actor.root.quaternion.copy(camera.quaternion);
      actor.torso.position.y = this.height * (0.25 - 9 / 32 + motion.breath);
      actor.head.position.y = this.height * (0.25 + motion.head + motion.breath);
      actor.head.rotation.z = motion.tilt;
      actor.arms[0].rotation.z = -0.06;
      actor.arms[1].rotation.z = 0.06 + motion.hand;
    }
  }

  private remove(actor: RoomActor) {
    actor.disposed = true;
    if (actor.image) actor.image.onload = null;
    actor.root.removeFromParent();
    for (const s of actor.surfaces) { s.map.dispose(); s.material.dispose(); }
    for (const geometry of actor.geometry) geometry.dispose();
  }

  dispose() {
    for (const actor of this.actors.values()) this.remove(actor);
    this.actors.clear();
    this.root.removeFromParent();
  }
}
