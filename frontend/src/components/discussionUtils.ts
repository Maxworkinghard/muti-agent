import type { AgentState, MindView, PersonaVisual } from '../types';

export interface Status { state: AgentState; action: string }
export interface Flight { id: string; fromSeat: number; toSeat: number; from: { x: number; y: number }; to: { x: number; y: number }; via?: { x: number; y: number }; color: string; title: string }
export interface ErrorItem { id: string; agentId?: string; message: string; retry?: () => void }
export type SessionPhase = 'waiting' | 'running' | 'paused' | 'finished' | 'stopped';

export const STATE_LABEL: Record<AgentState, string> = { idle: '待机', thinking: '思考', speaking: '发言', working: '工作', done: '完成' };
/** 入场时每个人落座的间隔 */
export const SEAT_GAP = 750;
/** 心情会换掉的表情；人物自己的配饰（眼镜、围巾……）保留，心情平静时保留他自己原本的表情 */
const FACE_EXTRAS = new Set(['brows', 'sleepy', 'happy', 'grin', 'blush', 'sweat']);
export const withFace = (v: PersonaVisual, mind?: MindView): PersonaVisual =>
  mind?.face.length ? { ...v, extras: [...(v.extras ?? []).filter((e) => !FACE_EXTRAS.has(e)), ...mind.face] } : v;
