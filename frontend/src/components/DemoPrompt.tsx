import { useEffect, useRef, useState } from 'react';
import { PixelAvatar } from './PixelAvatar';
import type { PersonaVisual } from '../types';

/** 只在 ?demo=prompt。思考是本地定时，不调用模型。整列对话往下长。 */
const SCENE_SRC = '/scenes/scene-podcast.png';
const THINK_MS = 12000;

const SCENE_BEATS: Array<[number, string]> = [
  [0, '先对齐现有场景的画法…'],
  [2000, '侧面，暖色录音间…'],
  [4000, '两座沙发对坐…'],
  [6000, '主持在左，嘉宾在右…'],
  [8000, '各一支麦，墙上 ON AIR…'],
  [10000, '别的字就不放了。'],
];
const PEOPLE_BEATS: Array<[number, string]> = [
  [0, '只写主持人…'],
  [2000, '身份，夜谈主理人…'],
  [4000, '知识是访谈和夜生活…'],
  [6000, '思想，先问具体的一夜…'],
  [8000, '性格要沉稳…'],
  [10000, '一张卡就够了。'],
];

const CARDS: Array<{ name: string; identity: string; knowledge: string; thinking: string; values: string; personality: string; visual: PersonaVisual }> = [
  {
    name: '主持人',
    identity: '夜谈主理人',
    knowledge: '访谈提问 / 城市夜生活',
    thinking: '先问具体的一夜',
    values: '把话说完',
    personality: '沉稳，一次只问一个问题',
    visual: { skin: '#f1c9a5', hair: '#2c241c', shirt: '#3d4f7c', accent: '#e8d48a', hairStyle: 'side', extras: ['brows', 'glasses'] },
  },
];

type Phase = 'ask' | 'think-scene' | 'scene' | 'think-people' | 'people';
type Item =
  | { key: string; kind: 'user'; text: string; demo: string }
  | { key: string; kind: 'think'; lines: string[]; demo: string; live: boolean }
  | { key: string; kind: 'scene' }
  | { key: string; kind: 'cards' };

export function DemoPrompt() {
  const [draft, setDraft] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<Phase>('ask');
  const [fields, setFields] = useState(0);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [items, fields, phase]);

  useEffect(() => {
    if (phase !== 'think-scene' && phase !== 'think-people') return;
    const scene = phase === 'think-scene';
    const beats = scene ? SCENE_BEATS : PEOPLE_BEATS;
    const demo = scene ? 'prompt-think-scene' : 'prompt-think-people';
    const timers = beats.map(([ms, line]) => window.setTimeout(() => {
      setItems((prev) => prev.map((it) => {
        if (it.kind !== 'think' || it.demo !== demo) return it;
        if (it.lines.includes(line)) return it;
        return { ...it, lines: [...it.lines, line] };
      }));
    }, ms));
    timers.push(window.setTimeout(() => {
      setItems((prev) => {
        const settled = prev.map((it) => (it.kind === 'think' && it.demo === demo ? { ...it, live: false } : it));
        if (scene) return [...settled, { key: 'scene', kind: 'scene' }];
        return [...settled, { key: 'cards', kind: 'cards' }];
      });
      if (scene) setPhase('scene');
      else {
        setFields(0);
        setPhase('people');
      }
    }, THINK_MS));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [phase]);

  useEffect(() => {
    if (phase !== 'people') return;
    const timers = [1, 2, 3, 4, 5].map((n) => window.setTimeout(() => setFields(n), 280 + n * 520));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [phase]);

  const busy = phase === 'think-scene' || phase === 'think-people';

  const send = () => {
    const text = draft.trim();
    if (!text || phase === 'people' || busy) return;
    if (phase === 'ask') {
      setItems((prev) => [
        ...prev,
        { key: 'user-scene', kind: 'user', text, demo: 'prompt-scene-text' },
        { key: 'think-scene', kind: 'think', lines: [SCENE_BEATS[0][1]], demo: 'prompt-think-scene', live: true },
      ]);
      setDraft('');
      setPhase('think-scene');
      return;
    }
    if (phase === 'scene') {
      setItems((prev) => [
        ...prev,
        { key: 'user-people', kind: 'user', text, demo: 'prompt-people-text' },
        { key: 'think-people', kind: 'think', lines: [PEOPLE_BEATS[0][1]], demo: 'prompt-think-people', live: true },
      ]);
      setDraft('');
      setPhase('think-people');
    }
  };

  return (
    <main className="demo-prompt" data-demo="prompt" data-demo-step={phase} data-demo-fields={String(fields)}>
      <section className="prompt-panel">
        <header>
          <b>对话</b>
          <strong>写给场景</strong>
          <small>你写在下面。对面先想完，再把成品放在这条消息下面。</small>
        </header>
        <div className="prompt-thread" ref={threadRef} data-demo="prompt-thread">
          {items.map((item) => {
            if (item.kind === 'user') {
              return (
                <div key={item.key} className="prompt-turn user">
                  <p className="prompt-user" data-demo={item.demo}>{item.text}</p>
                </div>
              );
            }
            if (item.kind === 'think') {
              return (
                <div key={item.key} className="prompt-turn agent">
                  <div className="prompt-think" data-demo={item.demo}>
                    <small>思考</small>
                    {item.lines.map((line) => <p key={line}>{line}</p>)}
                    {item.live && <i />}
                  </div>
                </div>
              );
            }
            if (item.kind === 'scene') {
              return (
                <div key={item.key} className="prompt-turn agent">
                  <figure className="prompt-scene draw" data-demo="prompt-scene">
                    <img src={SCENE_SRC} alt="播客录音室" />
                    <figcaption>播客录音室 · 一对一 · 和场景图同尺寸</figcaption>
                  </figure>
                </div>
              );
            }
            return (
              <div key={item.key} className="prompt-turn agent">
                <div className="prompt-cards" data-demo="prompt-cards">
                  {CARDS.map((p) => {
                    const rows: Array<[string, string]> = [
                      ['身份', p.identity],
                      ['知识', p.knowledge],
                      ['思想', p.thinking],
                      ['价值', p.values],
                      ['性格', p.personality],
                    ];
                    return (
                      <article key={p.name} className="persona-card demo-persona-card on" data-demo="prompt-card" data-demo-persona={p.name} style={{ ['--ac' as string]: p.visual.shirt }}>
                        <div className="pc-top">
                          <div className="pc-avatar"><PixelAvatar v={p.visual} size={44} /></div>
                          <div>
                            <strong>{p.name}</strong>
                            <small>{p.identity}</small>
                          </div>
                        </div>
                        <dl>
                          {rows.map(([label, value], i) => (
                            i < fields ? (
                              <div key={label} className="prompt-field">
                                <dt>{label}</dt>
                                <dd>{value}</dd>
                              </div>
                            ) : null
                          ))}
                        </dl>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <form className="prompt-compose" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea
            className="px-input"
            data-demo="prompt-input"
            rows={2}
            maxLength={120}
            placeholder="写一句想要的场景或人物…"
            value={draft}
            disabled={busy || phase === 'people'}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="px-btn primary" data-demo="prompt-send" disabled={busy || phase === 'people' || !draft.trim()}>发送</button>
        </form>
      </section>
    </main>
  );
}
