import type { ModeId, SceneDef, Seat } from '../types';
import { isModeId } from './modes';

/** 从场景 JSON 读出一个自定义场景。图片用站内已有像素图路径。 */
export function parseSceneImport(raw: unknown): { scene?: SceneDef; error?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: '场景文件不是 JSON 对象' };
  const r = raw as Record<string, unknown>;
  const name = String(r.name ?? '').trim();
  if (!name) return { error: '场景文件缺少 name' };
  const image = String(r.image ?? '');
  if (!image.startsWith('/scenes/')) return { error: '场景图片需要是站内 /scenes/ 路径' };
  const mode: ModeId = isModeId(r.recommendedMode) ? r.recommendedMode : 'entertainment';
  if (!Array.isArray(r.seats) || r.seats.length < 2) return { error: '场景至少需要 2 个座位' };
  const seats: Seat[] = r.seats.slice(0, 10).map((s) => {
    const seat = s as { x?: unknown; y?: unknown; group?: Seat['group'] };
    return {
      x: Number(seat.x),
      y: Number(seat.y),
      ...(seat.group ? { group: seat.group } : {}),
    };
  });
  if (seats.some((s) => !Number.isFinite(s.x) || !Number.isFinite(s.y))) return { error: '座位坐标无效' };
  const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : 'custom-' + Date.now().toString(36);
  return {
    scene: {
      id,
      name: name.slice(0, 16),
      image,
      description: String(r.description ?? '导入的场景').slice(0, 40),
      recommendedMode: mode,
      maxSeats: seats.length,
      seats,
      custom: true,
    },
  };
}
