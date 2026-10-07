import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AgentState, Participant, Seat } from '../types';
import type { Away } from '../data/stageRules';
import { playReady, playSeat, playVoice, useMuted } from '../sound';
import { createBgm, type Bgm } from './stageFx';
import { SEAT_GAP, type SessionPhase, type Status } from './discussionUtils';

/**
 * 工作模式走路动画：谁正走在路上、动画的暂停/继续/取消。
 * walkStarts 存“从哪走到哪、走多久”，由 move 事件写入，away 变化后在布局效果里开播。
 */
export function useWalkAnimations({ walkCast, session, away, participants, seatEls }: {
  walkCast: boolean;
  session: SessionPhase;
  away: Record<string, Away>;
  participants: Participant[];
  seatEls: { current: Map<number, HTMLElement> };
}) {
  const [walking, setWalking] = useState<Set<string>>(new Set());
  const walks = useRef(new Map<string, Animation>());
  const walkStarts = useRef(new Map<string, { left: string; top: string; ms: number }>());
  const walkEnabled = useRef(walkCast);
  walkEnabled.current = walkCast;
  useLayoutEffect(() => {
    if (!walkCast) {
      walkStarts.current.clear();
      if (walks.current.size) {
        for (const animation of walks.current.values()) { animation.onfinish = null; animation.cancel(); }
        walks.current.clear();
        setWalking(new Set());
      }
      return;
    }
    for (const [id, from] of walkStarts.current) {
      const participant = participants.find((p) => p.agentId === id);
      const el = participant && seatEls.current.get(participant.seatIndex);
      if (!el) continue;
      const previous = walks.current.get(id);
      if (previous) { previous.onfinish = null; previous.cancel(); }
      // 走多久按距离算（stageRules.walkMs），和后端等人走到再开口用的是同一个数
      const animation = el.animate([{ left: from.left, top: from.top }, { left: el.style.left, top: el.style.top }], {
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : from.ms, easing: 'linear',
      });
      walks.current.set(id, animation);
      if (session === 'paused') animation.pause();
      animation.onfinish = () => {
        walks.current.delete(id);
        setWalking((w) => { const next = new Set(w); next.delete(id); return next; });
      };
    }
    walkStarts.current.clear();
  }, [away, walkCast]);
  useEffect(() => {
    for (const animation of walks.current.values()) {
      if (session === 'paused') animation.pause();
      else if (session === 'stopped') animation.cancel();
      else animation.play();
    }
    if (session === 'stopped') setWalking(new Set());
  }, [session]);
  useEffect(() => () => { for (const animation of walks.current.values()) animation.cancel(); }, []);
  return { walking, setWalking, walkStarts, walkEnabled };
}

/**
 * 三维里镜头一直在动，人物位置每帧都变：直接写到座位元素上，不走 React 状态（否则整页每帧重渲染）。
 * React 状态只低频同步，给气泡翻到下方、传递动画这些用。
 */
export function useSeatPositions({ threeActive, seatEls }: {
  threeActive: boolean;
  seatEls: { current: Map<number, HTMLElement> };
}) {
  const [projectedSeats, setProjectedSeats] = useState<Seat[]>([]);
  const seatPos = useRef<Seat[]>([]);
  const syncTimer = useRef(0);
  const placeSeats = useCallback(() => {
    for (const [index, el] of seatEls.current) {
      const seat = seatPos.current[index];
      if (!seat) continue;
      el.style.left = seat.x + '%';
      el.style.top = seat.y + '%';
      el.style.setProperty('--s', String(seat.scale ?? 1));
    }
  }, []);
  const onSeatPositions = useCallback((positions: Seat[]) => {
    seatPos.current = positions;
    placeSeats();
    if (!syncTimer.current) {
      syncTimer.current = window.setTimeout(() => { syncTimer.current = 0; setProjectedSeats(seatPos.current); }, 150);
    }
  }, [placeSeats]);
  useEffect(() => () => clearTimeout(syncTimer.current), []);
  useLayoutEffect(() => { if (threeActive) placeSeats(); });
  return { projectedSeats, onSeatPositions };
}

/**
 * 入场落座：大家依次入座（可跳过），娱乐模式同时起背景音乐，讨论开始后压低音量；静音跟顶部音效开关走。
 */
export function useEntrance({ count, showEntrance }: { count: number; showEntrance: boolean }) {
  // 已经落座的人数；进入讨论页时大家依次入座
  const [seated, setSeated] = useState(0);
  const allSeated = seated >= count;
  useEffect(() => {
    if (allSeated) { const t = window.setTimeout(playReady, 300); return () => clearTimeout(t); }
    const t = window.setTimeout(() => { playSeat(seated); setSeated(seated + 1); }, seated === 0 ? 400 : SEAT_GAP);
    return () => clearTimeout(t);
  }, [seated, allSeated]);
  const skipIntro = () => setSeated(count);
  const muted = useMuted();
  const bgmRef = useRef<Bgm | null>(null);
  useEffect(() => {
    if (!showEntrance) return;
    const bgm = createBgm();
    bgmRef.current = bgm;
    const t = window.setTimeout(() => bgm.start(), 200);
    return () => { clearTimeout(t); bgm.stop(); bgmRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { bgmRef.current?.setMuted(muted); }, [muted]);
  return { seated, allSeated, skipIntro, muted, bgmRef };
}

/**
 * 落座落地动画和发言结束的坐下动画：动画播完就去掉，之后状态切换不会再播一次。
 */
export function useLandingSitting({ seated, status, participants }: {
  seated: number;
  status: Record<string, Status>;
  participants: Participant[];
}) {
  // 只有刚落座的人带落地动画；动画播完就去掉，之后状态切换不会再从天上掉一次
  const [landing, setLanding] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (seated === 0) return;
    const ids = participants.slice(0, seated).map((p) => p.agentId);
    setLanding((s) => new Set([...s, ...ids.filter((id) => !s.has(id))]));
    const t = window.setTimeout(() => setLanding(new Set()), 1000);
    return () => clearTimeout(t);
  }, [seated]);
  // 发言结束的人播放一次坐下（缩回座位）动画
  const prevState = useRef<Record<string, AgentState>>({});
  const [sitting, setSitting] = useState<Set<string>>(new Set());
  useEffect(() => {
    const ended = Object.entries(status)
      .filter(([id, s]) => prevState.current[id] === 'speaking' && s.state !== 'speaking')
      .map(([id]) => id);
    prevState.current = Object.fromEntries(Object.entries(status).map(([id, s]) => [id, s.state]));
    if (!ended.length) return;
    setSitting((s) => new Set([...s, ...ended]));
    window.setTimeout(() => setSitting((s) => new Set([...s].filter((id) => !ended.includes(id)))), 400);
  }, [status]);
  return { landing, sitting };
}

/**
 * 说话音效：每条发言一出字就叽咕一声（包括每轮第一个人）；流式输出时每长出一段再叽咕一下，同一条至少隔 350ms。
 * speakerOf 记下每条消息是谁说的，流式更新（message_update）时才能找到人。
 */
export function useChatter({ mcStage, byId }: { mcStage: boolean; byId: Record<string, Participant> }) {
  const voiceAt = useRef<Record<string, number>>({});
  const voiceLen = useRef<Record<string, number>>({});
  const speakerOf = useRef<Record<string, string>>({});
  const chatter = (agentId: string, id: string, text: string) => {
    if (mcStage) return;
    if (!byId[agentId] || !text) return; // 空气泡先不响，等第一段文字出来再响
    const now = Date.now();
    const first = voiceLen.current[id] === undefined;
    const grown = text.length - (voiceLen.current[id] ?? 0);
    if (!first && grown < 12) return;
    if (!first && now - (voiceAt.current[id] ?? 0) < 350) return;
    voiceAt.current[id] = now;
    voiceLen.current[id] = text.length;
    playVoice(agentId, Math.max(3, Math.min(8, Math.ceil(Math.max(grown, 12) / 8))));
  };
  return { chatter, speakerOf };
}
