import { createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, configFile: false, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false } });
const { PixelAvatar } = await server.ssrLoadModule('/src/components/PixelAvatar.tsx');

const base = { skin: '#f1c9a5', hair: '#2b2136', shirt: '#5f82b0', accent: '#fbf5e4' };
const svg = (v, props = {}) => renderToStaticMarkup(h(PixelAvatar, { v: { ...base, ...v }, size: 40, ...props }));

const FACINGS = ['S','SE','E','NE','N','NW','W','SW'];
const EXTRAS = ['brows','glasses','sleepy','happy','grin','blush','sweat','ears','scarf'];
const HAIR = ['short','long','bun','cap','spiky','curly','side','middle','hood','beanie'];
const BACKGROUNDS = [
  ['冲你笑', ['happy','grin']], ['生气', ['brows']], ['委屈', ['sweat','blush']],
  ['困了', ['sleepy']], ['戴眼镜', ['glasses']], ['围巾', ['scarf']],
];

const cell = (label, html, cls = '') =>
  '<figure class="cell ' + cls + '"><div class="art">' + html + '</div><figcaption>' + label + '</figcaption></figure>';

let out = '<!doctype html><meta charset=utf-8><style>' +
  'body{margin:0;padding:18px;background:#fdf6e8;font:12px/1.4 system-ui,"Segoe UI",sans-serif;color:#2b2136}' +
  'h2{font-size:13px;margin:16px 0 8px;padding-bottom:4px;border-bottom:2px solid #2b2136}' +
  '.row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}' +
  '.cell{margin:0;text-align:center;background:#fff9e9;border:2px solid #2b2136;padding:6px 8px;min-width:74px}' +
  '.art{height:70px;display:flex;align-items:flex-end;justify-content:center}' +
  'figcaption{margin-top:5px;font-size:11px;color:#5b4f6b}' +
  '.stand .art{height:78px}' +
  '</style><body>';

out += '<h2>八个朝向（facing）</h2><div class=row>' +
  FACINGS.map((f) => cell(f, svg({}, { facing: f }))).join('') + '</div>';

out += '<h2>表情与配饰（extras，可叠加）</h2><div class=row>' +
  cell('平静', svg({})) +
  BACKGROUNDS.map(([l, e]) => cell(l, svg({ extras: e }))).join('') +
  cell('全套叠加', svg({ extras: ['brows','glasses','blush','scarf'] })) + '</div>';

out += '<h2>发型（hairStyle）</h2><div class=row>' +
  HAIR.map((s) => cell(s, svg({ hairStyle: s }))).join('') + '</div>';

out += '<h2>坐 / 站（standing，发言时会站起来）</h2><div class=row>' +
  cell('坐着', svg({}), 'seated') + cell('站着', svg({}, { standing: true }), 'stand') +
  cell('站着说话', svg({ extras: ['happy','grin'] }, { standing: true }), 'stand') +
  cell('站着+朝向组合', svg({ extras: ['brows','grin'] }, { standing: true, facing: 'SE' }), 'stand') + '</div>';

out += '<h2>动作（CSS 动画，按状态自动播）</h2><div class=row>' +
  '<style>' +
  '.a-idle .art{animation:idle 2.4s steps(2) infinite}' +
  '@keyframes idle{50%{transform:translateY(-1px)}}' +
  '.a-think .art{animation:ponder 1.6s ease-in-out infinite}' +
  '@keyframes ponder{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg) translateY(-2px)}}' +
  '.a-sway .art{animation:sway .8s steps(2) infinite}' +
  '@keyframes sway{0%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}' +
  '.a-work .art{animation:type .3s steps(2) infinite}' +
  '@keyframes type{50%{transform:translateY(-2px)}}' +
  '.a-talk .art{animation:talk .5s steps(2) infinite}' +
  '@keyframes talk{0%{transform:translateY(-6px)}50%{transform:translateY(-9px)}}' +
  '.paused *,.paused *::before,.paused *::after{animation-play-state:paused!important}' +
  '</style>' +
  cell('待机 idle', svg({}), 'a-idle') +
  cell('思考（摇摆）', svg({ extras: ['sleepy'] }), 'a-sway') +
  cell('沉思（点头）', svg({ extras: ['sleepy'] }), 'a-think') +
  cell('工作（敲键盘）', svg({ extras: ['glasses'] }), 'a-work') +
  cell('发言（站立+起伏）', svg({ extras: ['happy'] }, { standing: true }), 'a-talk') +
  '</div>';

out += '</body>';
writeFileSync(path.join(root, 'public', 'expression-demo.html'), out);
await server.close();
console.log('written public/expression-demo.html');
