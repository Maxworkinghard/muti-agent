import { useState } from 'react';
import type { Persona, PersonaVisual } from '../types';

const LOOKS: PersonaVisual[] = [
  { skin: '#f1c9a5', hair: '#3a2a22', shirt: '#5f82b0', accent: '#f4e2b0', hairStyle: 'side', extras: ['brows'] },
  { skin: '#f1c9a5', hair: '#2b2136', shirt: '#c47a9a', accent: '#e8d48a', hairStyle: 'bun', extras: ['glasses'] },
  { skin: '#e8b892', hair: '#6b3a2a', shirt: '#6f9e6b', accent: '#fbf5e4', hairStyle: 'curly', extras: ['happy'] },
];

/** 添加人物：名字、身份、知识、思想、价值。只在演示路径打开。 */
export function PersonaEditor({ index, onSave, onClose }: {
  index: number;
  onSave: (p: Persona) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [identity, setIdentity] = useState('');
  const [knowledge, setKnowledge] = useState('');
  const [thinking, setThinking] = useState('');
  const [values, setValues] = useState('');
  const ok = name.trim().length > 0 && identity.trim().length > 0;
  const save = () => {
    if (!ok) return;
    const visual = LOOKS[index % LOOKS.length];
    onSave({
      id: 'blog-' + Date.now().toString(36),
      name: name.trim(),
      modes: ['entertainment'],
      identity: identity.trim(),
      knowledge: knowledge.trim() ? [knowledge.trim()] : [],
      thinking: thinking.trim(),
      values: values.trim(),
      personalities: [{ id: 'plain', label: '认真', behavior: '把话说清楚再往下写', style: '短句、口语' }],
      defaultPersonalityId: 'plain',
      boundaries: [],
      visual,
    });
  };
  return (
    <div className="codex-overlay" onClick={onClose}>
      <article className="codex-detail persona-editor" data-demo="persona-editor" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <strong>添加人物</strong>
            <small>写上名字和身份，再补一句知识、思想和价值</small>
          </div>
          <button className="px-btn tiny" onClick={onClose}>✕</button>
        </header>
        <div className="pe-form">
          <label>名字<input className="px-input" data-demo="persona-name" value={name} maxLength={8} placeholder="比如：林舟" onChange={(e) => setName(e.target.value)} /></label>
          <label>身份<input className="px-input" data-demo="persona-identity" value={identity} maxLength={16} placeholder="比如：博客作者" onChange={(e) => setIdentity(e.target.value)} /></label>
          <label>知识<input className="px-input" data-demo="persona-knowledge" value={knowledge} maxLength={18} placeholder="熟悉什么" onChange={(e) => setKnowledge(e.target.value)} /></label>
          <label>思想<input className="px-input" data-demo="persona-thinking" value={thinking} maxLength={22} placeholder="怎么看问题" onChange={(e) => setThinking(e.target.value)} /></label>
          <label className="pe-wide">价值<input className="px-input" data-demo="persona-values" value={values} maxLength={16} placeholder="最看重什么" onChange={(e) => setValues(e.target.value)} /></label>
        </div>
        <div className="se-foot">
          <button className="px-btn primary" data-demo="persona-save" disabled={!ok} onClick={save}>保存人物</button>
        </div>
      </article>
    </div>
  );
}
