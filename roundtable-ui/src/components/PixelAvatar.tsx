import type { Facing, PersonaVisual } from '../types';

/** 朝左的三个方向用朝右的镜像画 */
const MIRROR: Partial<Record<Facing, Facing>> = { W: 'E', SW: 'SE', NW: 'NE' };

/** 颜色压暗一点，画耳朵、侧面的手臂、后脑的发际线；不是 #rrggbb 的颜色原样返回 */
function shade(hex: string, k = 0.8) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  return '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
}

/**
 * 16x16 像素小人，standing=true 时画出身体（站立）。
 * facing 是朝向：S 面朝观众（默认），N 背对观众，E / W 侧身，其余是斜 45 度。
 */
export function PixelAvatar({ v, size = 48, standing = false, facing = 'S' }: {
  v: PersonaVisual;
  size?: number;
  standing?: boolean;
  facing?: Facing;
}) {
  const h = standing ? 24 : 16;
  const base = MIRROR[facing] ?? facing;
  const flip = base !== facing;
  const px: Array<[number, number, number, number, string]> = [];
  const r = (x: number, y: number, w: number, hh: number, c: string) => px.push([flip ? 16 - x - w : x, y, w, hh, c]);
  const O = '#2b2136';
  const MOUTH = '#b86a5a';
  const { hair, skin, shirt } = v;
  const long = v.hairStyle === 'long';

  if (base === 'S') {
    // 正面
    r(4, 1, 8, 3, hair);
    if (v.hairStyle === 'bun') r(6, 0, 4, 1, hair);
    if (v.hairStyle === 'cap') { r(3, 1, 10, 2, shirt); r(11, 3, 3, 1, shirt); }
    r(4, 4, 8, 6, skin);
    r(3, 3, 1, 4, hair); r(12, 3, 1, 4, hair);
    if (long) { r(3, 4, 1, 7, hair); r(12, 4, 1, 7, hair); }
    r(6, 6, 1, 2, O); r(9, 6, 1, 2, O);
    r(7, 9, 2, 1, MOUTH);
    r(3, 11, 10, 5, shirt);
    r(7, 11, 2, 2, v.accent);
  } else if (base === 'SE') {
    // 斜前方：脸往右转，左边露出更多头发和左耳
    r(4, 1, 8, 3, hair);
    if (v.hairStyle === 'bun') r(5, 0, 4, 1, hair);
    if (v.hairStyle === 'cap') { r(3, 1, 10, 2, shirt); r(12, 3, 3, 1, shirt); }
    r(5, 4, 7, 6, skin);
    r(3, 3, 2, 5, hair); r(12, 3, 1, 3, hair);
    r(4, 6, 1, 2, shade(skin));
    if (long) { r(3, 4, 2, 7, hair); r(12, 4, 1, 6, hair); }
    r(7, 6, 1, 2, O); r(10, 6, 1, 2, O);
    r(8, 9, 2, 1, MOUTH);
    r(3, 11, 10, 5, shirt);
    r(8, 11, 2, 2, v.accent);
  } else if (base === 'E') {
    // 侧面朝右：后脑勺在左，脸、鼻尖和一只眼睛在右
    r(4, 1, 8, 3, hair);
    if (v.hairStyle === 'bun') r(3, 1, 2, 2, hair);
    if (v.hairStyle === 'cap') { r(4, 1, 8, 2, shirt); r(11, 3, 3, 1, shirt); }
    r(7, 4, 5, 6, skin);
    r(4, 4, 3, 5, hair);
    if (long) { r(4, 4, 3, 7, hair); r(3, 5, 1, 6, hair); }
    r(7, 6, 1, 2, shade(skin));
    r(12, 7, 1, 1, skin);
    r(10, 6, 1, 2, O);
    r(10, 9, 2, 1, MOUTH);
    r(4, 11, 8, 5, shirt);
    r(10, 11, 2, 1, v.accent);
    r(7, 12, 2, 4, shade(shirt));
  } else if (base === 'NE') {
    // 斜后方：看到后脑勺，右边露出一点脸颊和右耳
    r(4, 1, 8, 3, hair);
    if (v.hairStyle === 'bun') { r(5, 0, 4, 1, hair); r(5, 2, 4, 2, shade(hair)); }
    if (v.hairStyle === 'cap') { r(3, 1, 10, 2, shirt); r(12, 3, 2, 1, shirt); }
    r(4, 4, 7, 6, hair);
    r(3, 3, 1, 5, hair);
    r(11, 5, 1, 4, skin);
    r(10, 6, 1, 2, shade(skin));
    // 短发才画发际线和脖子；长发一直披到背上
    if (!long) { r(5, 9, 5, 1, shade(hair)); r(6, 10, 4, 1, skin); }
    r(3, 11, 10, 5, shirt);
    if (long) { r(3, 4, 1, 7, hair); r(5, 10, 5, 3, shade(hair, 0.88)); }
  } else {
    // 背面
    r(4, 1, 8, 3, hair);
    if (v.hairStyle === 'bun') { r(6, 0, 4, 1, hair); r(6, 2, 4, 2, shade(hair)); }
    if (v.hairStyle === 'cap') r(3, 1, 10, 2, shirt);
    r(4, 4, 8, 6, hair);
    r(3, 3, 1, 4, hair); r(12, 3, 1, 4, hair);
    r(3, 6, 1, 2, shade(skin)); r(12, 6, 1, 2, shade(skin));
    if (!long) { r(5, 9, 6, 1, shade(hair)); r(6, 10, 4, 1, skin); }
    r(3, 11, 10, 5, shirt);
    // 披下来的头发比头顶暗一点、窄一点，露出两边肩膀
    if (long) { r(3, 4, 1, 7, hair); r(12, 4, 1, 7, hair); r(5, 10, 6, 3, shade(hair, 0.88)); }
  }

  if (standing) {
    const pants = '#3d3550';
    if (base === 'E') {
      // 侧身站：一条手臂在前，两条腿前后错开
      r(7, 12, 2, 5, shade(shirt)); r(7, 17, 2, 1, skin);
      r(5, 16, 6, 2, pants);
      r(5, 18, 3, 5, pants); r(8, 18, 3, 5, shade(pants));
      r(4, 23, 4, 1, O); r(8, 23, 5, 1, O);
    } else {
      r(2, 12, 1, 5, shirt); r(13, 12, 1, 5, shirt);
      r(2, 17, 1, 1, skin); r(13, 17, 1, 1, skin);
      r(4, 16, 8, 2, pants);
      r(4, 18, 3, 5, pants); r(9, 18, 3, 5, pants);
      r(3, 23, 4, 1, O); r(9, 23, 4, 1, O);
    }
  }
  return (
    <svg className="pixel-avatar" width={size} height={(size * h) / 16} viewBox={`0 0 16 ${h}`} shapeRendering="crispEdges">
      {px.map(([x, y, w, hh, c], i) => <rect key={i} x={x} y={y} width={w} height={hh} fill={c} />)}
    </svg>
  );
}
