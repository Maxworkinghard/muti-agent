import type { Point } from './builders';
import type { ActorAnchor, PropLayout, Room } from './debate';

export function anchor(x: number, z: number, yaw: number, i: number, standing = false): ActorAnchor {
  return { seat: [x, standing ? 1 : 1.5, z], stand: [x, 1, z], homeYaw: yaw, mic: 'seat-' + i, chair: standing ? undefined : 'chair-' + i };
}

export function seat(room: Room, a: ActorAnchor, i: number, style?: 'stool' | 'armchair') {
  room.anchors.push(a);
  if (a.chair) room.layout.chairs.push({ id: a.chair, side: 'judge', position: [a.seat[0], 1, a.seat[2]], yaw: a.homeYaw, slide: .18, actor: i, style });
}

export function table(room: Room, id: string, x: number, z: number, length: number, depth: number, height = .95, shape?: 'round') {
  room.layout.tables.push({ id, side: 'judge', center: [x, 1, z], length, depth, height, skirtYaw: 0, shape });
}

/** 剖面俯视的房间：自由飞行范围，以及把墙角和人头装进画面的点。 */
export function finishStyled(room: Room): Room {
  const [x0, , z0] = room.bounds.min, [x1, , z1] = room.bounds.max;
  room.flight = { min: [x0 - 8, 1, z0 - 8], max: [x1 + 8, Math.max(room.camera[1] + 4, 14), Math.max(z1 + 12, room.camera[2] + 2)] };
  room.fit = [...room.anchors.flatMap(a => [a.seat, a.stand].map(p => [p[0], p[1] + 1.8, p[2]] as Point)), [x0, 1, z0], [x1, 1, z0], [x0 - .5, 2.2, z1 + .6], [x1 + .5, 2.2, z1 + .6], [x0, 4.6, z0], [x1, 4.6, z0]];
  return room;
}

/** 正面机位：全景只装下人头和话题板上沿，房间边缘可以出画。 */
export function finishStage(room: Room, extra: Point[] = []): Room {
  finishStyled(room);
  const sc = room.layout.board;
  room.fit = [...room.anchors.flatMap(a => [a.seat, a.stand].map(p => [p[0], p[1] + 1.8, p[2]] as Point)), ...[-1, 1].map(x => [sc.position[0] + x * sc.width / 2, sc.position[1] + sc.height / 2 + .1, sc.position[2]] as Point), ...extra];
  return room;
}

export type ChairStyle = NonNullable<PropLayout['chairs'][number]['style']>;
