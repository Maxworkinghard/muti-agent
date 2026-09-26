import type { PersonaVisual } from '../types';

/** 16x16 像素小人，standing=true 时画出身体（站立） */
export function PixelAvatar({ v, size = 48, standing = false }: { v: PersonaVisual; size?: number; standing?: boolean }) {
  const h = standing ? 24 : 16;
  const px: Array<[number, number, number, number, string]> = [];
  const r = (x: number, y: number, w: number, hh: number, c: string) => px.push([x, y, w, hh, c]);
  const O = '#2b2136';
  // 头发 / 头
  r(4, 1, 8, 3, v.hair);
  if (v.hairStyle === 'bun') r(6, 0, 4, 1, v.hair);
  if (v.hairStyle === 'cap') { r(3, 1, 10, 2, v.shirt); r(11, 3, 3, 1, v.shirt); }
  r(4, 4, 8, 6, v.skin);
  r(3, 3, 1, 4, v.hair); r(12, 3, 1, 4, v.hair);
  if (v.hairStyle === 'long') { r(3, 4, 1, 7, v.hair); r(12, 4, 1, 7, v.hair); }
  r(6, 6, 1, 2, O); r(9, 6, 1, 2, O);
  r(7, 9, 2, 1, '#b86a5a');
  // 肩膀 / 上身
  r(3, 11, 10, 5, v.shirt);
  r(7, 11, 2, 2, v.accent);
  if (standing) {
    r(2, 12, 1, 5, v.shirt); r(13, 12, 1, 5, v.shirt);
    r(2, 17, 1, 1, v.skin); r(13, 17, 1, 1, v.skin);
    r(4, 16, 8, 2, '#3d3550');
    r(4, 18, 3, 5, '#3d3550'); r(9, 18, 3, 5, '#3d3550');
    r(3, 23, 4, 1, O); r(9, 23, 4, 1, O);
  }
  return (
    <svg className="pixel-avatar" width={size} height={(size * h) / 16} viewBox={`0 0 16 ${h}`} shapeRendering="crispEdges">
      {px.map(([x, y, w, hh, c], i) => <rect key={i} x={x} y={y} width={w} height={hh} fill={c} />)}
    </svg>
  );
}

