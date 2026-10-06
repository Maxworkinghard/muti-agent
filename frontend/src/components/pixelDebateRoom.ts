import {
  BoxGeometry, CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  NearestFilter, PlaneGeometry, PointLight, RepeatWrapping, RingGeometry, SRGBColorSpace,
} from 'three';
import type { Seat } from '../types';
import { DEBATE_ROOM, inwardFrom, tableFor, tableLocal, yawAligningLocalX, type PlannedSeat } from './pixelDebatePlan';

const WALL = '#f3d6a8';
const CREAM = '#f8e2bc';
const STONE = '#3c3648';
const INK = '#3d3a42';
const BLUE = '#4e79a1';
const BANNER_BLUE = '#3e6d9a';
const RED = '#c45f53';
const BANNER_RED = '#b14b42';
const BENCH = '#8d3d4a';
const WOOD = '#ab7646';
const WOOD_DARK = '#8a5b34';
const BOARD = '#fbf3df';
const FLOOR_A = '#6aa58f';
const FLOOR_B = '#5d977f';
const FLOOR_LINE = '#c5d08a';
const LEAF = '#2f8a55';
const LEAF_DARK = '#1f6b40';
const POT = '#f4efe4';
const GLOW = '#ffd27a';
const BOOKS = ['#b15546', '#3e6d9a', '#3f8f62', '#e7c96a', '#6b4a37', '#7a5b8a', '#c47a3a'];

/** 房间本身的尺寸。墙是竖直的，不再沿用俯视图里被压扁的那一圈。 */
const ROOM = DEBATE_ROOM;

const SEAT_LAYOUT: Record<NonNullable<Seat['group']>, { x: number; z: number }[]> = {
  pro: [
    { x: -3.25, z: -1.7 },
    { x: -3.7, z: -0.3 },
    { x: -4.15, z: 1.1 },
  ],
  con: [
    { x: 3.25, z: -1.7 },
    { x: 3.7, z: -0.3 },
    { x: 4.15, z: 1.1 },
  ],
  host: [{ x: 0, z: -3.15 }],
};

function lambert(color: string, map?: CanvasTexture | null) {
  return new MeshLambertMaterial({ color: map ? '#ffffff' : color, map: map ?? null });
}

function glow(color: string) {
  return new MeshBasicMaterial({ color });
}

function addBox(parent: Group, width: number, height: number, depth: number, color: string, x: number, footY: number, z: number, yaw = 0) {
  const mesh = new Mesh(new BoxGeometry(width, height, depth), lambert(color));
  mesh.position.set(x, footY + height / 2, z);
  mesh.rotation.y = yaw;
  parent.add(mesh);
  return mesh;
}

function paint(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  draw(context);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

function floorTexture() {
  const texture = paint(128, 128, (context) => {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        context.fillStyle = (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B;
        context.fillRect(x * 16, y * 16, 16, 16);
        context.fillStyle = '#4f7d6c';
        context.fillRect(x * 16, y * 16, 16, 1);
        context.fillRect(x * 16, y * 16, 1, 16);
        context.fillStyle = '#8fb56e';
        context.fillRect(x * 16 + 6, y * 16 + 6, 4, 4);
      }
    }
  });
  if (!texture) return null;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(6, 4.6);
  return texture;
}

function fillFrame(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, inner: string) {
  context.fillStyle = WOOD;
  context.fillRect(x, y, w, h);
  context.fillStyle = inner;
  context.fillRect(x + 10, y + 10, w - 20, h - 20);
}

/** 竖直墙的内侧面，配色从原辩论室图里取。画的是立面，不是俯视图里那条扁墙。 */
function wallFace(kind: 'back' | 'side' | 'front') {
  return paint(640, 360, (context) => {
    context.fillStyle = WALL;
    context.fillRect(0, 0, 640, 360);
    context.fillStyle = STONE;
    context.fillRect(0, 0, 640, 22);
    context.fillStyle = '#e7c48a';
    context.fillRect(0, 22, 640, 10);
    context.fillStyle = '#e4c79a';
    context.fillRect(0, 250, 640, 70);
    context.fillStyle = WOOD_DARK;
    context.fillRect(0, 318, 640, 42);
    context.fillStyle = '#d7b48a';
    context.fillRect(0, 300, 640, 12);
    if (kind === 'side') {
      for (const x of [70, 400]) {
        context.fillStyle = WOOD_DARK;
        context.fillRect(x, 48, 150, 150);
        context.fillStyle = '#9ec4d6';
        context.fillRect(x + 12, 60, 126, 126);
        context.fillStyle = '#d7e7ef';
        context.fillRect(x + 24, 78, 40, 70);
      }
      fillFrame(context, 250, 70, 100, 78, '#7fbf8a');
      context.fillStyle = '#6ea4c9';
      context.fillRect(262, 82, 76, 28);
      return;
    }
    if (kind === 'front') {
      context.fillStyle = WOOD_DARK;
      context.fillRect(246, 48, 148, 250);
      context.fillStyle = WOOD;
      context.fillRect(258, 60, 56, 226);
      context.fillRect(326, 60, 56, 226);
      context.fillStyle = GLOW;
      context.fillRect(304, 168, 10, 10);
      context.fillRect(334, 168, 10, 10);
      context.fillStyle = BENCH;
      context.fillRect(40, 250, 150, 48);
      context.fillRect(450, 250, 150, 48);
      return;
    }
    fillFrame(context, 168, 40, 304, 168, BOARD);
    context.fillStyle = '#efe2c8';
    context.fillRect(196, 68, 248, 112);
    fillFrame(context, 16, 48, 52, 44, '#7fbf8a');
    fillFrame(context, 572, 48, 52, 44, '#7fbf8a');
    context.fillStyle = '#6ea4c9';
    context.fillRect(26, 56, 32, 14);
    context.fillRect(582, 56, 32, 14);
    context.fillStyle = GLOW;
    context.fillRect(150, 78, 14, 18);
    context.fillRect(476, 78, 14, 18);
  });
}

function addVerticalWall(
  parent: Group, width: number, height: number, x: number, z: number, yaw: number,
  face: 'back' | 'side' | 'front', inward: { x: number; z: number },
) {
  addBox(parent, width, height, 0.22, WALL, x, 0, z, yaw);
  const map = wallFace(face);
  if (!map) return;
  const poster = new Mesh(new PlaneGeometry(width - 0.08, height - 0.08), lambert('#ffffff', map));
  poster.position.set(x + inward.x * 0.14, height / 2, z + inward.z * 0.14);
  // PlaneGeometry 的正面是本地 +Z。把它转到朝向房间内侧。
  poster.rotation.y = Math.atan2(inward.x, inward.z);
  parent.add(poster);
}

function addTable(parent: Group, seats: PlannedSeat[], top: string) {
  const table = tableFor(seats);
  if (!table) return;
  const yaw = table.yaw;
  // 纸笔放在座位那一侧：人坐哪边，文具摆哪边，桌心一侧留给对面看
  const seatSide = seats.reduce((sum, seat) => sum + tableLocal(seat, table).side, 0) >= 0 ? 1 : -1;
  const length = Math.min(table.length, 4.2);
  const endW = 0.5;
  const mid = Math.max(0.8, length - endW * 2);
  const alongX = Math.cos(yaw);
  const alongZ = -Math.sin(yaw);
  const sideX = Math.sin(yaw);
  const sideZ = Math.cos(yaw);
  addBox(parent, mid, 0.08, 0.92, top, table.x, 0.7, table.z, yaw);
  addBox(parent, mid - 0.08, 0.16, 0.74, WOOD, table.x, 0.54, table.z, yaw);
  for (const end of [-1, 1]) {
    const ex = table.x + alongX * end * (length / 2 - endW / 2);
    const ez = table.z + alongZ * end * (length / 2 - endW / 2);
    addBox(parent, endW, 0.78, 1.02, WOOD, ex, 0, ez, yaw);
    addBox(parent, endW - 0.08, 0.05, 0.88, WOOD_DARK, ex, 0.78, ez, yaw);
    for (const side of [-1, 1]) {
      addBox(parent, 0.08, 0.7, 0.08, WOOD_DARK, ex + sideX * side * 0.38, 0, ez + sideZ * side * 0.38);
    }
  }
  const itemSide = seatSide * 0.3;
  for (const along of [-0.55, 0.05, 0.6]) {
    const px = table.x + alongX * along + sideX * itemSide;
    const pz = table.z + alongZ * along + sideZ * itemSide;
    addBox(parent, 0.26, 0.02, 0.18, BOARD, px, 0.78, pz, yaw);
    addBox(parent, 0.04, 0.16, 0.04, INK, px, 0.8, pz);
    addBox(parent, 0.09, 0.05, 0.09, INK, px, 0.96, pz);
  }
}

function addPlant(parent: Group, x: number, z: number) {
  addBox(parent, 0.28, 0.22, 0.28, POT, x, 0, z);
  addBox(parent, 0.34, 0.28, 0.34, LEAF, x, 0.22, z);
  addBox(parent, 0.22, 0.22, 0.22, LEAF_DARK, x, 0.42, z);
  addBox(parent, 0.14, 0.16, 0.14, '#3fa86a', x + 0.06, 0.56, z);
}

function addSconce(parent: Group, x: number, y: number, z: number, inward: { x: number; z: number }) {
  addBox(parent, 0.08, 0.16, 0.08, WOOD_DARK, x, y, z);
  const bulb = new Mesh(new BoxGeometry(0.12, 0.1, 0.1), glow(GLOW));
  bulb.position.set(x + inward.x * 0.1, y + 0.12, z + inward.z * 0.1);
  parent.add(bulb);
}

function addBanner(parent: Group, x: number, z: number, color: string, inward: { x: number; z: number }) {
  const yaw = Math.atan2(inward.x, inward.z);
  const cloth = new Mesh(new PlaneGeometry(0.9, 1.7), lambert(color));
  cloth.position.set(x + inward.x * 0.22, 2.35, z + inward.z * 0.22);
  cloth.rotation.y = yaw;
  parent.add(cloth);
  addBox(parent, 1.08, 0.1, 0.1, '#e7c96a', x + inward.x * 0.18, 3.22, z + inward.z * 0.18, yaw);
}

function addShelf(parent: Group, x: number, z: number, yaw: number) {
  addBox(parent, 1.35, 1.15, 0.32, WOOD, x, 0.15, z, yaw);
  addBox(parent, 1.2, 0.06, 0.28, WOOD_DARK, x, 1.3, z, yaw);
  const alongX = Math.cos(yaw);
  const alongZ = -Math.sin(yaw);
  BOOKS.forEach((color, index) => {
    const row = Math.floor(index / 4);
    const col = index % 4;
    addBox(
      parent, 0.16, 0.28, 0.2, color,
      x + alongX * (-0.42 + col * 0.28),
      0.42 + row * 0.4,
      z + alongZ * (-0.42 + col * 0.28),
      yaw,
    );
  });
}

function addChair(parent: Group, seat: PlannedSeat, color: string) {
  const inward = inwardFrom(seat.x, seat.z);
  const yaw = Math.atan2(inward.x, inward.z);
  const seatMesh = new Mesh(new BoxGeometry(0.48, 0.08, 0.46), lambert(color));
  seatMesh.position.set(seat.x, 0.46, seat.z);
  seatMesh.rotation.y = yaw;
  parent.add(seatMesh);
  const sideX = Math.sin(yaw);
  const sideZ = Math.cos(yaw);
  const backX = Math.cos(yaw);
  const backZ = -Math.sin(yaw);
  for (const along of [-1, 1]) {
    for (const side of [-1, 1]) {
      addBox(
        parent, 0.06, 0.46, 0.06, WOOD_DARK,
        seat.x + backX * along * 0.16 + sideX * side * 0.16,
        0,
        seat.z + backZ * along * 0.16 + sideZ * side * 0.16,
      );
    }
  }
  const back = new Mesh(new BoxGeometry(0.48, 0.55, 0.08), lambert(color));
  back.position.set(seat.x - inward.x * 0.22, 0.78, seat.z - inward.z * 0.22);
  back.rotation.y = yaw;
  parent.add(back);
}

function placeSeats(seats: Seat[]): PlannedSeat[] {
  const used: Record<string, number> = { pro: 0, con: 0, host: 0 };
  return seats.map((seat, index) => {
    const group = seat.group ?? 'pro';
    const spots = SEAT_LAYOUT[group];
    const spot = spots[Math.min(used[group] ?? 0, spots.length - 1)];
    used[group] = (used[group] ?? 0) + 1;
    return { index, x: spot.x, z: spot.z, group };
  });
}

export function buildDebateRoom(seats: Seat[]) {
  const root = new Group();
  const { width, depth, wall } = ROOM;
  const planned = placeSeats(seats);

  const floorMap = floorTexture();
  const floor = new Mesh(new PlaneGeometry(width, depth), lambert('#ffffff', floorMap));
  floor.rotation.x = -Math.PI / 2;
  floor.material.side = DoubleSide;
  root.add(floor);
  addBox(root, width + 0.4, 0.16, 0.18, WOOD_DARK, 0, 0, -depth / 2);
  addBox(root, width + 0.4, 0.16, 0.18, WOOD_DARK, 0, 0, depth / 2);
  addBox(root, 0.18, 0.16, depth, WOOD_DARK, -width / 2, 0, 0);
  addBox(root, 0.18, 0.16, depth, WOOD_DARK, width / 2, 0, 0);

  // 后墙和两侧墙都立在地板上。yaw 让墙的长边顺着房间，高度在 Y。
  addVerticalWall(root, width, wall, 0, -depth / 2, yawAligningLocalX(1, 0), 'back', { x: 0, z: 1 });
  addVerticalWall(root, depth, wall, -width / 2, 0, yawAligningLocalX(0, 1), 'side', { x: 1, z: 0 });
  addVerticalWall(root, depth, wall, width / 2, 0, yawAligningLocalX(0, -1), 'side', { x: -1, z: 0 });
  addVerticalWall(root, width, wall, 0, depth / 2, yawAligningLocalX(1, 0), 'front', { x: 0, z: -1 });

  const ceiling = new Mesh(new PlaneGeometry(width, depth), lambert('#d9c4a2'));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = wall + 0.02;
  root.add(ceiling);
  for (const x of [-2.2, 2.2]) {
    addBox(root, 0.12, 0.28, 0.12, WOOD_DARK, x, 3.7, -3.1);
    const lamp = new Mesh(new BoxGeometry(0.36, 0.14, 0.36), glow('#ffe1a8'));
    lamp.position.set(x, 3.62, -3.1);
    root.add(lamp);
  }
  for (const sideX of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      addBox(
        root, 0.38, wall + 0.08, 0.38, STONE,
        sideX * (width / 2 - 0.2), 0, sideZ * (depth / 2 - 0.2),
      );
    }
  }

  const insetX = width / 2 - 1.05;
  const insetZ = depth / 2 - 1.05;
  addBox(root, insetX * 2, 0.025, 0.08, FLOOR_LINE, 0, 0.012, -insetZ);
  addBox(root, insetX * 2, 0.025, 0.08, FLOOR_LINE, 0, 0.012, insetZ);
  addBox(root, 0.08, 0.025, insetZ * 2, FLOOR_LINE, -insetX, 0.012, 0);
  addBox(root, 0.08, 0.025, insetZ * 2, FLOOR_LINE, insetX, 0.012, 0);
  const ring = new Mesh(new RingGeometry(0.62, 0.8, 28), lambert('#d4c56a'));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.03, -2.45);
  root.add(ring);

  const byGroup = (group: PlannedSeat['group']) => planned.filter((seat) => seat.group === group);
  addTable(root, byGroup('pro'), BLUE);
  addTable(root, byGroup('con'), RED);
  for (const seat of planned) {
    if (seat.group === 'host') {
      const inward = inwardFrom(seat.x, seat.z);
      const px = seat.x + inward.x * 0.7;
      const pz = seat.z + inward.z * 0.7;
      const top = 0.72;
      addBox(root, 0.72, top, 0.5, WOOD, px, 0, pz);
      addBox(root, 0.6, 0.06, 0.4, WOOD_DARK, px, top, pz);
      addBox(root, 0.08, 0.18, 0.08, INK, px, top + 0.06, pz);
      addBox(root, 0.14, 0.08, 0.14, INK, px, top + 0.24, pz);
    } else {
      addChair(root, seat, seat.group === 'con' ? RED : BLUE);
    }
  }

  const backIn = { x: 0, z: 1 };
  addBanner(root, -3.85, -depth / 2, BANNER_BLUE, backIn);
  addBanner(root, 3.85, -depth / 2, BANNER_RED, backIn);
  addShelf(root, -4.55, -4.02, 0);
  addShelf(root, 4.55, -4.02, 0);
  for (const x of [-4.4, -1.7, 1.7, 4.4]) addSconce(root, x, 2.35, -4.42, backIn);
  for (const spot of [[-1.2, -2.7], [1.2, -2.7], [-4.15, -3.45], [4.15, -3.45]]) {
    addPlant(root, spot[0], spot[1]);
  }

  for (const side of [-1, 1] as const) {
    const inward = { x: -side, z: 0 };
    const x = side * (width / 2 - 0.55);
    for (const z of [-1.4, 0.5, 2.3]) addSconce(root, x, 2.2, z, inward);
    for (const z of [0.3, 2.5]) {
      addBox(root, 1.35, 0.36, 0.42, BENCH, x - side * 0.05, 0, z, yawAligningLocalX(0, 1));
      addBox(root, 1.2, 0.08, 0.32, '#a85a68', x - side * 0.02, 0.36, z, yawAligningLocalX(0, 1));
    }
    for (const z of [-2.2, 1.4, 3.35]) addPlant(root, side * 5.15, z);
  }
  for (const x of [-2.4, 2.4]) {
    addBox(root, 1.45, 0.36, 0.42, BENCH, x, 0, 3.85);
    addBox(root, 1.28, 0.08, 0.32, '#a85a68', x, 0.36, 3.85);
    addPlant(root, x > 0 ? 4.85 : -4.85, 3.55);
  }

  for (const [x, z] of [[-3.4, -2.8], [3.4, -2.8], [-4.2, 1.6], [4.2, 1.6]] as const) {
    const lamp = new PointLight(0xffc98a, 0.55, 8, 2);
    lamp.position.set(x, 3.05, z);
    root.add(lamp);
  }

  return { root, points: planned.map((seat) => ({ x: seat.x, z: seat.z })) };
}
