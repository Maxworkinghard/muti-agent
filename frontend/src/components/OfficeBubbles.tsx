import { useLayoutEffect, useRef, useState } from 'react';
import { layoutOfficeBubbles } from './officeBubbleLayout';

/** to：当面说话的对象；tag：没有对象时标在名字后面的环节（第一版、站会、拍板……） */
export interface OfficeSpeech { id: string; name: string; to?: string; tag?: string; text: string; color: string; x: number; y: number }

export function OfficeBubbles({ speeches, onFocus }: { speeches: OfficeSpeech[]; onFocus: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current!;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const anchors = speeches.map((s) => ({ x: s.x * size.width / 100, y: s.y * size.height / 100 }));
  const boxes = layoutOfficeBubbles(anchors, size.width, size.height);
  return <div className="office-bubbles" ref={ref}>
    {size.width > 0 && speeches.map((s, i) => <button key={s.id} className="office-bubble"
      style={{ left: boxes[i].x, top: boxes[i].y, width: boxes[i].width, height: boxes[i].height, ['--ac' as string]: s.color }}
      onClick={() => onFocus(s.id)} title={s.text} aria-label={`${s.name}${s.to ? ' → ' + s.to : s.tag ? ' · ' + s.tag : ''}：${s.text}`}>
      <b>{s.name}{s.to ? <> → {s.to}</> : s.tag && <> · {s.tag}</>}</b><span>{s.text}</span>
    </button>)}
  </div>;
}
