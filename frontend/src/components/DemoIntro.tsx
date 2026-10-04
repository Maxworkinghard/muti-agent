import { useEffect, useRef, useState } from 'react';

const DEMO_THEME = '当智能开始加速：AI 是数学的放大器，还是终结者？';
/** 打完后稍顿再亮确认（ms）；录制在全文出现后 1–2s 内点确认，不自动点 */
const AFTER_MS = 400;

/** Same seeded rhythm as recordings/human-type.mjs: 70–140ms, 250–400ms hesitations, 40ms bursts. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const THEME_GAPS = (() => {
  const rand = mulberry32(0x5a17);
  const chars = [...DEMO_THEME];
  const gaps: number[] = [];
  let burstLeft = 0;
  for (let i = 0; i < chars.length - 1; i++) {
    let ms: number;
    if (burstLeft > 0) {
      ms = 40;
      burstLeft -= 1;
    } else if (rand() < 0.16) {
      ms = 250 + Math.floor(rand() * 151);
    } else if (rand() < 0.22) {
      burstLeft = 1 + Math.floor(rand() * 2);
      ms = 40;
    } else {
      ms = 70 + Math.floor(rand() * 71);
    }
    if (/[：:？?，,。.!！、；;「」]/.test(chars[i])) ms += 110 + Math.floor(rand() * 90);
    gaps.push(ms);
  }
  return gaps;
})();

function delayForChar(_ch: string, index: number): number {
  return THEME_GAPS[index - 1] ?? 100;
}

export function DemoIntro({ onConfirm }: { onConfirm: (theme: string) => void }) {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'wait' | 'run' | 'done'>('wait');
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const iRef = useRef(0);
  const timers = useRef<number[]>([]);
  const leavingRef = useRef(false);
  const readyRef = useRef(false);
  const textRef = useRef('');
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const confirmRef = useRef<() => void>(() => {});
  const startedRef = useRef(false);

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  const schedule = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  };

  const confirm = () => {
    if (!readyRef.current || leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    clearTimers();
    const theme = textRef.current.trim() || DEMO_THEME;
    schedule(() => onConfirmRef.current(theme), 420);
  };
  confirmRef.current = confirm;

  const begin = () => {
    if (startedRef.current || leavingRef.current) return;
    startedRef.current = true;
    setPhase('run');
    const tick = () => {
      iRef.current += 1;
      const next = DEMO_THEME.slice(0, iRef.current);
      textRef.current = next;
      setText(next);
      if (iRef.current < DEMO_THEME.length) {
        const justTyped = DEMO_THEME[iRef.current - 1] ?? '';
        schedule(tick, delayForChar(justTyped, iRef.current));
      } else {
        setPhase('done');
        schedule(() => {
          readyRef.current = true;
          setReady(true);
          // 录制用鼠标点确认；勿自动跳转，保证可见点击且 ready→click ≤2s
        }, AFTER_MS);
      }
    };
    // 第一字晚 260ms（v19 是 380ms）；必须等主题框被点过才开始
    schedule(tick, 260);
  };

  useEffect(() => {
    iRef.current = 0;
    leavingRef.current = false;
    readyRef.current = false;
    textRef.current = '';
    setText('');
    setPhase('wait');
    setReady(false);
    setLeaving(false);
    startedRef.current = false;
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; onConfirm via ref
  }, []);

  return (
    <main className={'setup demo-intro' + (leaving ? ' demo-leave' : '')} data-demo="intro">
      <section className="panel demo-intro-panel">
        <h2><b>01</b> 讨论主题</h2>
        <div className="demo-intro-inner">
          <label className="demo-intro-field">
            <input
              className={'px-input big' + (phase === 'run' ? ' typing' : '')}
              onClick={begin}
              value={text}
              readOnly
              aria-label="讨论主题"
              placeholder="…"
              data-demo="theme"
              data-demo-typing={phase === 'run' ? '1' : phase === 'done' ? '0' : 'wait'}
            />
            {phase === 'run' && <span className="demo-caret" aria-hidden />}
          </label>
          <button
            className={'px-btn primary demo-confirm' + (ready ? ' ready' : '')}
            disabled={!ready}
            onClick={confirm}
            data-demo="confirm"
            data-demo-ready={ready ? '1' : '0'}
          >
            确认
          </button>
        </div>
      </section>
    </main>
  );
}
