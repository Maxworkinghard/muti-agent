import type { Facing, PersonaVisual } from '../types';
import type { AvatarGesture, FaceFrame } from './pixelActorMotion';

type Extra = NonNullable<PersonaVisual['extras']>[number];
export type PixelRect = [number, number, number, number, string];

/** 朝左的三个方向用朝右的镜像画 */
const MIRROR: Partial<Record<Facing, Facing>> = { W: 'E', SW: 'SE', NW: 'NE' };

/** 看得到脸的朝向上五官的位置：眼睛 x（侧面只有一只）、笑眼的中心、嘴 x、腮红 x；背面没有五官 */
const FACE: Partial<Record<Facing, { eyes: number[]; happy: number[]; mouth: number; cheeks: number[] }>> = {
  S: { eyes: [6, 9], happy: [5, 10], mouth: 7, cheeks: [4, 10] },
  SE: { eyes: [7, 10], happy: [6, 10], mouth: 8, cheeks: [5, 10] },
  E: { eyes: [10], happy: [10], mouth: 10, cheeks: [8] },
};

/** 颜色压暗一点，画耳朵、侧面的手臂、后脑的发际线；不是 #rrggbb 的颜色原样返回 */
function shade(hex: string, k = 0.8) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  return '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
}

export type AvatarPose = 'bust' | 'stand' | 'sit';

/**
 * 16 宽像素小人。bust 是头和上身（二维默认），stand 是站立，sit 是坐姿（三维座位、二维正面坐姿的场景）。
 * facing：S 面朝观众，N 背对观众，E / W 侧身，其余是斜 45 度。
 * chair=false 时坐姿不画自带的木椅，坐在底图画好的椅子上。
 */
export function buildPixelAvatar(v: PersonaVisual, options?: { standing?: boolean; facing?: Facing; pose?: AvatarPose; chair?: boolean; gesture?: AvatarGesture; frame?: FaceFrame }): { width: number; height: number; rects: PixelRect[] } {
  const facing = options?.facing ?? 'S';
  const pose: AvatarPose = options?.pose ?? (options?.standing ? 'stand' : 'bust');
  const gesture = options?.gesture;
  const frame: FaceFrame = options?.frame ?? 0;
  const standing = pose === 'stand';
  const sitting = pose === 'sit';
  const height = sitting ? 22 : standing ? 24 : 16;
  const base = MIRROR[facing] ?? facing;
  const flip = base !== facing;
  const px: PixelRect[] = [];
  const r = (x: number, y: number, w: number, hh: number, c: string) => px.push([flip ? 16 - x - w : x, y, w, hh, c]);
  const has = (e: Extra) => !!v.extras?.includes(e);
  const O = '#2b2136';
  const MOUTH = '#b86a5a';
  const { hair, skin, shirt, accent } = v;
  const hs = v.hairStyle;
  const long = hs === 'long';
  const side = base === 'E';
  // 斜前方的脸比正面往右挪一格
  const dx = base === 'SE' ? 1 : 0;
  // 兜帽绳、围巾会挡住领口
  const collar = hs !== 'hood' && !has('scarf');

  // 蓬松卷发比头大一圈，垫在最底下；侧面只往后脑勺那边蓬
  if (hs === 'curly') {
    if (side) { r(5, 0, 6, 1, hair); r(3, 1, 9, 1, hair); r(2, 2, 9, 6, hair); r(1, 3, 1, 3, hair); }
    else { r(4, 0, 8, 1, hair); r(3, 1, 10, 1, hair); r(2, 2, 12, 6, hair); r(1, 3, 1, 3, hair); r(14, 3, 1, 3, hair); }
  }

  if (base === 'S') {
    r(4, 1, 8, 3, hair);
    if (hs === 'bun') r(6, 0, 4, 1, hair);
    if (hs === 'cap') { r(3, 1, 10, 2, shirt); r(11, 3, 3, 1, shirt); }
    r(4, 4, 8, 6, skin);
    r(3, 3, 1, 4, hair); r(12, 3, 1, 4, hair);
    if (long) { r(3, 4, 1, 7, hair); r(12, 4, 1, 7, hair); }
    r(3, 11, 10, 5, shirt);
    if (collar) r(7, 11, 2, 2, accent);
  } else if (base === 'SE') {
    r(4, 1, 8, 3, hair);
    if (hs === 'bun') r(5, 0, 4, 1, hair);
    if (hs === 'cap') { r(3, 1, 10, 2, shirt); r(12, 3, 3, 1, shirt); }
    r(5, 4, 7, 6, skin);
    r(3, 3, 2, 5, hair); r(12, 3, 1, 3, hair);
    r(4, 6, 1, 2, shade(skin));
    if (long) { r(3, 4, 2, 7, hair); r(12, 4, 1, 6, hair); }
    r(3, 11, 10, 5, shirt);
    if (collar) r(8, 11, 2, 2, accent);
  } else if (side) {
    r(4, 1, 8, 3, hair);
    if (hs === 'bun') r(3, 1, 2, 2, hair);
    if (hs === 'cap') { r(4, 1, 8, 2, shirt); r(11, 3, 3, 1, shirt); }
    r(7, 4, 5, 6, skin);
    r(4, 4, 3, 5, hair);
    if (long) { r(4, 4, 3, 7, hair); r(3, 5, 1, 6, hair); }
    r(7, 6, 1, 2, shade(skin));
    r(12, 7, 1, 1, skin);
    r(4, 11, 8, 5, shirt);
    if (collar) r(10, 11, 2, 1, accent);
    r(7, 12, 2, 4, shade(shirt));
  } else if (base === 'NE') {
    r(4, 1, 8, 3, hair);
    if (hs === 'bun') { r(5, 0, 4, 1, hair); r(5, 2, 4, 2, shade(hair)); }
    if (hs === 'cap') { r(3, 1, 10, 2, shirt); r(12, 3, 2, 1, shirt); }
    r(4, 4, 7, 6, hair);
    r(3, 3, 1, 5, hair);
    r(11, 5, 1, 4, skin);
    r(10, 6, 1, 2, shade(skin));
    if (!long) { r(5, 9, 5, 1, shade(hair)); r(6, 10, 4, 1, skin); }
    r(3, 11, 10, 5, shirt);
    if (long) { r(3, 4, 1, 7, hair); r(5, 10, 5, 3, shade(hair, 0.88)); }
  } else {
    r(4, 1, 8, 3, hair);
    if (hs === 'bun') { r(6, 0, 4, 1, hair); r(6, 2, 4, 2, shade(hair)); }
    if (hs === 'cap') r(3, 1, 10, 2, shirt);
    r(4, 4, 8, 6, hair);
    r(3, 3, 1, 4, hair); r(12, 3, 1, 4, hair);
    r(3, 6, 1, 2, shade(skin)); r(12, 6, 1, 2, shade(skin));
    if (!long) { r(5, 9, 6, 1, shade(hair)); r(6, 10, 4, 1, skin); }
    r(3, 11, 10, 5, shirt);
    if (long) { r(3, 4, 1, 7, hair); r(12, 4, 1, 7, hair); r(5, 10, 6, 3, shade(hair, 0.88)); }
  }

  if (hs === 'spiky') { r(4, 0, 1, 1, hair); r(6, 0, 1, 1, hair); r(9, 0, 1, 1, hair); r(11, 0, 1, 1, hair); r(3, 1, 1, 1, hair); r(12, 1, 1, 1, hair); }
  if (hs === 'beanie') { r(4, 1, 8, 1, accent); r(3, 2, 10, 2, accent); r(3, 3, 10, 1, shade(accent)); r(7, 0, 2, 1, '#fbf5e4'); }
  if (hs === 'hood') {
    if (base === 'S') { r(5, 0, 6, 1, shirt); r(3, 1, 10, 2, shirt); r(2, 2, 1, 9, shirt); r(13, 2, 1, 9, shirt); r(3, 7, 1, 4, shirt); r(12, 7, 1, 4, shirt); r(4, 10, 8, 1, shirt); }
    else if (base === 'SE') { r(5, 0, 6, 1, shirt); r(3, 1, 10, 2, shirt); r(2, 2, 2, 9, shirt); r(13, 2, 1, 9, shirt); r(4, 6, 1, 5, shirt); r(12, 6, 1, 5, shirt); r(5, 10, 7, 1, shirt); }
    else if (side) { r(4, 0, 6, 1, shirt); r(3, 1, 9, 2, shirt); r(2, 3, 5, 8, shirt); r(7, 4, 1, 7, shirt); r(8, 10, 4, 1, shirt); }
    else {
      r(5, 0, 6, 1, shirt); r(3, 1, 10, 1, shirt); r(2, 2, 12, 9, shirt);
      if (base === 'NE') { r(11, 4, 1, 1, hair); r(11, 5, 1, 4, skin); }
    }
    r(2, 10, side ? 10 : 12, 1, shade(shirt));
  }

  const f = FACE[base];
  if (f && hs === 'side') { if (side) r(9, 4, 3, 1, hair); else r(4 + dx, 4, 4, 1, hair); }
  if (f && hs === 'middle') {
    if (side) r(10, 4, 2, 1, hair);
    else { r(7 + dx, 3, 2, 1, skin); r(4 + dx, 4, 2, 1, hair); r(10, 4, 2, 1, hair); }
  }
  if (has('ears')) {
    if (base === 'S') { r(2, 5, 1, 2, skin); r(13, 5, 1, 2, skin); }
    else if (base === 'SE') r(2, 5, 2, 2, shade(skin));
    else if (side) r(6, 5, 2, 3, shade(skin));
    else if (base === 'NE') { r(2, 5, 1, 2, shade(skin)); r(12, 5, 1, 2, shade(skin)); }
    else { r(2, 5, 1, 2, shade(skin)); r(13, 5, 1, 2, shade(skin)); }
  }

  if (f) {
    const [xl, xr] = f.eyes;
    if (has('glasses')) {
      const lens = '#dcebf2';
      if (side) { r(10, 6, 2, 2, lens); r(10, 5, 2, 1, O); r(10, 8, 2, 1, O); r(9, 6, 1, 2, O); r(12, 6, 1, 1, O); r(8, 6, 1, 1, O); }
      else {
        r(xl - 1, 6, 2, 2, lens); r(xr, 6, 2, 2, lens);
        r(xl - 1, 5, 2, 1, O); r(xr, 5, 2, 1, O); r(xl - 2, 6, 1, 2, O); r(xr + 2, 6, 1, 2, O);
        r(xl + 1, 6, xr - xl - 1, 1, O); r(xl - 1, 8, 2, 1, O); r(xr, 8, 2, 1, O);
      }
    }
    if (has('sleepy')) f.eyes.forEach((x, i) => r(i === 0 && !side ? x - 1 : x, 7, 2, 1, O));
    else if (has('happy')) f.happy.forEach((x) => { r(x - 1, 7, 1, 1, O); r(x, 6, 1, 1, O); r(x + 1, 7, 1, 1, O); });
    else f.eyes.forEach((x) => r(x, 6, 1, 2, O));
    if (has('brows')) {
      if (side) { r(9, 4, 1, 1, O); r(10, 5, 1, 1, O); }
      else { r(xl - 2, 4, 1, 1, O); r(xl - 1, 5, 1, 1, O); r(xr + 2, 4, 1, 1, O); r(xr + 1, 5, 1, 1, O); }
    }
    if (has('blush')) {
      f.cheeks.forEach((x) => r(x, 8, 2, 1, '#ef9a8f'));
      if (gesture && frame === 2) f.cheeks.forEach((x) => r(x, 9, 1, 1, '#f3b0a6'));
    }
    const m = f.mouth;
    if (has('grin')) {
      if (side) { r(m - 1, 8, 1, 1, MOUTH); r(m, 9, 2, 1, MOUTH); }
      else { r(m - 2, 8, 1, 1, MOUTH); r(m - 1, 9, 4, 1, MOUTH); r(m + 3, 8, 1, 1, MOUTH); }
    } else if (!(gesture === 'talk' && frame > 0)) r(m, 9, 2, 1, MOUTH);
  }
  if (has('sweat')) {
    const drip = gesture ? frame : 0;
    r(13, 3, 1, 1, '#d6f0fb');
    r(12, 4 + drip, 2, 2, '#7cc3e8');
  }

  if (hs === 'hood' && f) {
    if (side) r(10, 11, 1, 2, accent);
    else { r(6 + dx, 11, 1, 2, accent); r(9 + dx, 11, 1, 2, accent); }
  }
  if (has('scarf')) {
    const x = side ? 5 : 4 + dx;
    r(x, 10, side ? 7 : 8, 2, accent); r(x + 1, 10, 1, 2, shade(accent)); r(x + 4, 10, 1, 2, shade(accent));
    if (f) r(side ? 10 : 9 + dx, 12, 2, 2, accent);
  }

  const talking = gesture === 'talk';
  const raise = talking || gesture === 'think';
  if (f && gesture && !talking) {
    const [xl, xr] = f.eyes;
    const shaped = has('glasses') || has('sleepy') || has('happy');
    const coverEyes = () => {
      if (has('glasses')) {
        const lens = '#dcebf2';
        if (side) r(10, 6, 2, 2, lens);
        else { r(xl - 1, 6, 2, 2, lens); if (xr !== undefined) r(xr, 6, 2, 2, lens); }
      } else if (side) r(10, 6, 1, 2, skin);
      else f.eyes.forEach((x) => r(x, 6, 1, 2, skin));
    };
    const pupils = (shift: number, y: number) => {
      if (shaped) return;
      if (side) r(10 + shift, y, 1, 2, O);
      else f.eyes.forEach((x) => r(x + shift, y, 1, 2, O));
    };
    const shut = () => {
      coverEyes();
      if (!has('glasses')) return;
      if (side) r(10, 7, 2, 1, O);
      else { r(xl - 1, 7, 2, 1, O); if (xr !== undefined) r(xr, 7, 2, 1, O); }
    };
    if (frame === 3) shut();
    else if (frame === 1 && gesture === 'idle') {
      if (has('happy') || has('sleepy')) {
        if (!has('grin') && !side) r(f.mouth - 1, 9, 3, 1, MOUTH);
      } else if (has('glasses')) {
        if (side) r(11, 6, 1, 2, O);
        else { r(xl, 6, 1, 2, O); if (xr !== undefined) r(xr + 1, 6, 1, 2, O); }
      } else {
        coverEyes();
        pupils(1, 6);
      }
    } else if (frame === 1 && gesture === 'think') {
      if (!shaped) { coverEyes(); pupils(0, 5); }
      if (!side && !has('brows')) { r(xl - 1, 4, 2, 1, O); if (xr !== undefined) r(xr, 4, 2, 1, O); }
    } else if (frame === 2 && gesture === 'think') {
      coverEyes();
      if (side) r(10, 7, 2, 1, O);
      else f.eyes.forEach((x) => r(x, 7, 2, 1, O));
    } else if (frame === 2) {
      if (!shaped) {
        coverEyes();
        f.happy.forEach((x) => { r(x - 1, 7, 1, 1, O); r(x, 6, 1, 1, O); r(x + 1, 7, 1, 1, O); });
      }
      if (!has('grin')) {
        if (side) r(f.mouth - 1, 9, 2, 1, MOUTH);
        else r(f.mouth - 1, 9, 3, 1, MOUTH);
      }
    }
  }
  if (f && talking && frame > 0) {
    const m = f.mouth;
    if (!side && frame === 2) r(m - 1, 8, 4, 2, MOUTH);
    else if (side) r(m, 8, 2, 2, MOUTH);
    else r(m, 8, 2, 2, MOUTH);
  }

  const pants = '#3d3550';
  const wood = '#ab7646';
  const woodDark = '#8a5b34';
  if (sitting && options?.chair !== false) {
    // 椅子画在裤子下面。转朝向时这张图跟着换，不另放会错位的三维椅。
    if (side) {
      r(2, 12, 2, 6, wood); r(2, 12, 2, 1, woodDark);
      r(2, 17, 8, 2, wood); r(2, 18, 8, 1, woodDark);
      r(2, 19, 2, 3, woodDark); r(8, 19, 2, 3, woodDark);
    } else if (base === 'N' || base === 'NE') {
      r(2, 11, 12, 7, wood); r(4, 13, 8, 4, woodDark);
      r(2, 19, 2, 3, woodDark); r(12, 19, 2, 3, woodDark);
    } else {
      r(1, 12, 2, 6, wood); r(13, 12, 2, 6, wood); r(1, 12, 14, 1, woodDark);
      r(2, 17, 12, 2, wood); r(2, 18, 12, 1, woodDark);
      r(1, 19, 2, 3, woodDark); r(13, 19, 2, 3, woodDark);
    }
  }
  if (standing) {
    if (side) {
      if (raise) { r(8, 5, 2, 1, skin); r(8, 6, 2, 5, shade(shirt)); }
      else { r(7, 12, 2, 5, shade(shirt)); r(7, 17, 2, 1, skin); }
      r(5, 16, 6, 2, pants);
      r(5, 18, 3, 5, pants); r(8, 18, 3, 5, shade(pants));
      r(4, 23, 4, 1, O); r(8, 23, 5, 1, O);
    } else {
      r(2, 12, 1, 5, shirt);
      r(2, 17, 1, 1, skin);
      if (raise) { r(12, 6, 2, 1, skin); r(13, 7, 1, 4, shirt); }
      else { r(13, 12, 1, 5, shirt); r(13, 17, 1, 1, skin); }
      r(4, 16, 8, 2, pants);
      r(4, 18, 3, 5, pants); r(9, 18, 3, 5, pants);
      r(3, 23, 4, 1, O); r(9, 23, 4, 1, O);
    }
  } else if (sitting) {
    // 脚在最底一行。侧面朝右时，大腿朝画面右侧伸出，镜像后朝左的人反过来。
    if (side) {
      if (raise) { r(8, 6, 2, 1, skin); r(8, 7, 2, 4, shade(shirt)); }
      r(6, 16, 6, 2, pants);
      r(10, 18, 2, 3, pants);
      r(9, 21, 4, 1, O);
    } else {
      r(2, 12, 1, 4, shirt);
      r(2, 16, 1, 1, skin);
      if (raise) { r(11, 6, 2, 1, skin); r(12, 7, 1, 4, shirt); }
      else { r(13, 12, 1, 4, shirt); r(13, 16, 1, 1, skin); }
      r(3, 16, 4, 2, pants); r(9, 16, 4, 2, pants);
      r(3, 18, 3, 3, shade(pants)); r(10, 18, 3, 3, shade(pants));
      r(2, 21, 4, 1, O); r(9, 21, 4, 1, O);
    }
  }

  return { width: 16, height, rects: px };
}
