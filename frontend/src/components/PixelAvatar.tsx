import type { Facing, PersonaVisual } from '../types';
import { buildPixelAvatar, type AvatarPose } from './pixelAvatarDraw';

/**
 * 16x16 像素小人，standing=true 时画出身体（站立）；pose 直接指定姿势（sit 是坐姿，chair=false 时不画自带的椅子）。
 * facing 是朝向：S 面朝观众（默认），N 背对观众，E / W 侧身，其余是斜 45 度。
 */
export function PixelAvatar({ v, size = 48, standing = false, facing = 'S', pose, chair }: {
  v: PersonaVisual;
  size?: number;
  standing?: boolean;
  facing?: Facing;
  pose?: AvatarPose;
  chair?: boolean;
}) {
  // 人物文件给了头像图片就用图片（没有朝向和站立姿势）；没有时画像素小人
  if (v.image) {
    return <img className="pixel-avatar img" src={v.image} width={size} height={size} alt="" draggable={false} style={{ objectFit: 'cover' }} />;
  }
  const drawn = buildPixelAvatar(v, { standing, facing, pose, chair });
  return (
    <svg className="pixel-avatar" width={size} height={(size * drawn.height) / 16} viewBox={`0 0 16 ${drawn.height}`} shapeRendering="crispEdges">
      {drawn.rects.map(([x, y, w, hh, c], i) => <rect key={i} x={x} y={y} width={w} height={hh} fill={c} />)}
    </svg>
  );
}
