// 我的世界房间的视觉验收：用无头 Chrome 打开 mc-lab（不显示界面的封面模式）和 stage-lab（带界面的产品画面），
// 每个房间按同样的画布尺寸、画质和等待时间拍一组固定镜头，可以分别用原版、高清、风格化三种方块贴图拍，
// 再生成一页 HTML 把两次拍摄并排对比。只拍照和统计，不打分。
//
// 先开开发服务：npm run dev（默认端口 5180）。然后：
//   node scripts/mc-shots.mjs shoot <标签> [房间 ...] [--material=original,hd,style] [--shots=overview,fixed,...]
//   node scripts/mc-shots.mjs compare <改前标签> <改后标签>
//   node scripts/mc-shots.mjs lab <标签> [镜头 ...]   拍 avatar-lab.html（Q 版人物 / 椅子 / 地面实验台），镜头名见 LAB_SHOTS
//   --v=2 拍 src/mc/v2 的重建场景（页面带 &v=2，机位用 cams.json 里的 <房间>@v2，文件名带 -v2）
//   node scripts/mc-shots.mjs collage <输出.jpg> <标题> <图片=说明> ...   把几张截图拼成一页（--cols=列数，--w=每格宽），无头 Chrome 存成 JPG
//   --quality=high|medium 画质档（默认 high）
// 照片在 frontend/.shots/<标签>/，对比页是 frontend/.shots/compare-<改前>-<改后>.html。
//
// 每个房间拍的镜头：
//   overview  默认全景（房间自己的默认机位）    fixed  固定机位（scripts/mc-shots.cams.json，改房间前后不变）
//   judge     观摩位 / 评委席                  personA、personB  两个人的人物视角
//   table、chair、board  mc-lab 的物品近景      detail-*  cams.json 里的细节机位
//   hud       stage-lab 的产品画面（带名字牌和按钮，只用房间自己的贴图）
// 默认全景和固定机位另外统计：每个人的脸朝不朝镜头、头在画面上多高、有没有被挡住；画面的饱和度、亮度、纹理密度。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = path.join(root, '.shots');
const ROOMS = ['debate', 'roundtable', 'office', 'classroom', 'meadow', 'podcast'];
const SHOTS = ['overview', 'fixed', 'judge', 'personA', 'personB', 'table', 'chair', 'board', 'detail', 'hud'];
const NAMES = { overview: '默认全景', fixed: '固定机位', judge: '观摩位', personA: '人物视角 A', personB: '人物视角 B', table: '桌子近景', chair: '椅子近景', board: '话题板近景', hud: '产品画面' };
const args = process.argv.slice(2), flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('='))), rest = args.filter(a => !a.startsWith('--'));
const port = Number(flags.port ?? process.env.PORT ?? 5180), SETTLE = Number(flags.settle ?? 5000);
const V2 = flags.v === '2', VQ = V2 ? '&v=2' : '', QUALITY = ['high', 'medium', 'low'].includes(flags.quality) ? flags.quality : 'high';
const cams = JSON.parse(fs.readFileSync(path.join(root, 'scripts/mc-shots.cams.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 画面统计：平均饱和度、高饱和面积和色相分布、亮度的 5%/50%/95% 分位、边缘密度。都是描述，不是好看不好看的分数。 */
function imageStats(file) {
  const png = PNG.sync.read(fs.readFileSync(file)), { width: W, height: H, data } = png;
  const hues = [['红', 0, 15], ['橙', 15, 40], ['黄', 40, 70], ['绿', 70, 160], ['青', 160, 200], ['蓝', 200, 255], ['紫', 255, 290], ['粉', 290, 345], ['红', 345, 361]];
  let n = 0, satSum = 0, strong = 0, edges = 0, edgeN = 0; const fam = {}, luma = [];
  const L = (x, y) => { const i = (y * W + x) * 4; return .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]; };
  for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) {
    const i = (y * W + x) * 4, r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx ? (mx - mn) / mx : 0;
    let h = 0; if (mx !== mn) { h = mx === r ? (g - b) / (mx - mn) : mx === g ? 2 + (b - r) / (mx - mn) : 4 + (r - g) / (mx - mn); h = (h * 60 + 360) % 360; }
    n++; satSum += s; luma.push(L(x, y));
    if (s > .35 && mx > .25) { strong++; const f = hues.find(([, a, c]) => h >= a && h < c)[0]; fam[f] = (fam[f] ?? 0) + 1; }
    if (x + 1 < W && y + 1 < H) { edgeN++; if (Math.abs(L(x, y) - L(x + 1, y)) + Math.abs(L(x, y) - L(x, y + 1)) > 40) edges++; }
  }
  luma.sort((a, b) => a - b); const q = p => Math.round(luma[Math.floor(p * (luma.length - 1))]);
  const families = Object.fromEntries(Object.entries(fam).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(100 * v / n).toFixed(1)]));
  return { 平均饱和度: +(satSum / n).toFixed(3), 高饱和面积: +(100 * strong / n).toFixed(1), 色相: families, 超过3个百分点的色相数: Object.values(families).filter(v => v >= 3).length, 亮度分位: [q(.05), q(.5), q(.95)], 边缘密度: +(100 * edges / edgeN).toFixed(1) };
}

async function shoot(label, rooms) {
  const materials = (flags.material ?? 'room').split(','), only = flags.shots ? new Set(flags.shots.split(',')) : null, want = s => !only || only.has(s) || (s.startsWith('detail-') && only.has('detail'));
  const out = path.join(shotsDir, label); fs.mkdirSync(out, { recursive: true });
  const cdp = 9400 + Math.floor(Math.random() * 400), profile = path.join(tmpdir(), 'mc-shots-' + process.pid);
  const chrome = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile, '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars', '--window-size=1520,1100', '--remote-debugging-port=' + cdp, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let ws;
  try {
    let target;
    for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(t => t.type === 'page'); } catch {} if (!target) await sleep(250); }
    if (!target) throw new Error('无头浏览器没有启动（可以用 CHROME_PATH 指定 chrome.exe）');
    ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map(), logs = [];
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' ')); if (m.method === 'Runtime.exceptionThrown') logs.push('exception: ' + m.params.exceptionDetails.exception?.description); const r = pending.get(m.id); if (!r) return; pending.delete(m.id); m.error ? r.reject(new Error(JSON.stringify(m.error))) : r.resolve(m.result); };
    const send = (method, params = {}) => new Promise((resolve, reject) => { const rid = ++id; pending.set(rid, { resolve, reject }); ws.send(JSON.stringify({ id: rid, method, params })); });
    const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? '页面脚本出错'); return r.result?.value; };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1480, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://localhost:${port}/mc-lab.html?cover` }); await sleep(1500);
    // 固定用高档画质，免得软件渲染帧率低时自动降档。
    await evaluate(`localStorage.setItem('mc-stage-quality-v2', ${JSON.stringify(QUALITY)}); true`);
    const waitLoaded = async selector => { let state = null; for (let i = 0; i < 400; i++) { await sleep(250); state = await evaluate(`(() => { const c = document.querySelector('.mc-canvas'); const err = document.querySelector(${JSON.stringify(selector)}); return { loaded: !!c && !document.querySelector('.mc-loading') && !!c.dataset.loadedMs && !!window.__mcStage, error: err?.textContent ?? null }; })()`).catch(() => null); if (state?.error || state?.loaded) break; } return state; };
    const capture = async (file, selector) => { const rect = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`); const png = await send('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 } }); fs.writeFileSync(file, Buffer.from(png.data, 'base64')); };
    const cameraInfo = `(() => { const c = window.__mcStage.camera; const d = c.getWorldDirection(c.position.clone()); const t = c.position.clone().addScaledVector(d, 10); return { pos: c.position.toArray().map(v => +v.toFixed(3)), target: t.toArray().map(v => +v.toFixed(3)), fov: +c.fov.toFixed(2) }; })()`;
    const people = `(() => { const s = window.__mcStage, cam = s.camera, V = cam.position.constructor, W = s.renderer.domElement.clientWidth, H = s.renderer.domElement.clientHeight, ray = new window.__mcRaycaster();
      const shown = o => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; }, meshes = []; s.scene.traverse(o => { if (o.isMesh && shown(o) && !o.name.startsWith('sky') && o.material?.colorWrite !== false) meshes.push(o); });
      return [...s.players].map(([id, p]) => { const head = new V(); p.head.getWorldPosition(head); const a = head.clone().project(cam), b = head.clone().add(new V(0, .5, 0)).project(cam), toCam = cam.position.clone().sub(head).setY(0).normalize(), face = p.forward.clone().setY(0).normalize(), own = new Set(); p.root.traverse(o => own.add(o));
        ray.set(cam.position, head.clone().add(new V(0, .25, 0)).sub(cam.position).normalize()); const dist = cam.position.distanceTo(head), hit = ray.intersectObjects(meshes, false).find(h => !own.has(h.object) && h.distance < dist - .3);
        return { id, 头高像素: +(Math.abs(a.y - b.y) / 2 * H).toFixed(1), 脸朝镜头: +face.dot(toCam).toFixed(2), 挡住: hit ? (hit.object.name || hit.object.parent?.name || hit.object.type) : null, 在画面里: Math.abs(a.x) <= 1 && Math.abs(a.y) <= 1 && a.z < 1 }; }); })()`;
    const useCamera = c => evaluate(`(() => { const s = window.__mcStage, r = s.room; window.__saved ??= { camera: r.camera, cameraTarget: r.cameraTarget, fov: r.fov, fit: r.fit, frontal: r.frontal, aimed: s.stageCamera.aimed };
      r.camera = ${JSON.stringify(c.pos)}; r.cameraTarget = ${JSON.stringify(c.target)}; r.fov = ${JSON.stringify(c.fov)}; r.fit = []; r.frontal = true; s.stageCamera.aimed = ${JSON.stringify(c.target)}; s.stageCamera.select('overview'); return true; })()`);
    const restoreCamera = () => evaluate(`(() => { const s = window.__mcStage, r = s.room, v = window.__saved; if (v) { Object.assign(r, { camera: v.camera, cameraTarget: v.cameraTarget, fov: v.fov, fit: v.fit, frontal: v.frontal }); s.stageCamera.aimed = v.aimed; s.stageCamera.select('overview'); } window.__saved = undefined; return true; })()`);
    const setView = v => evaluate(`(() => { const nav = document.querySelector('.mc-views'), b = nav.querySelectorAll('button'); if (${JSON.stringify(v)} === 'overview') b[0].click(); else if (${JSON.stringify(v)} === 'judge') b[1].click(); else { const sel = nav.querySelector('select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, ${JSON.stringify(v)}); sel.dispatchEvent(new Event('change', { bubbles: true })); } return true; })()`);
    const setInspect = v => evaluate(`(() => { const sel = [...document.querySelectorAll('.mc-lab-controls select')].find(s => [...s.options].some(o => o.value === 'board')); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, ${JSON.stringify(v)}); sel.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    const summary = [];
    for (const room of rooms) for (const material of materials) {
      logs.length = 0; const t0 = Date.now(), tag = (material === 'room' ? room : `${room}@${material}`) + (V2 ? '-v2' : '') + (QUALITY === 'high' ? '' : '-' + QUALITY), cam = cams[V2 ? room + '@v2' : room], metrics = { room, material, shots: {} };
      await send('Page.navigate', { url: `http://localhost:${port}/mc-lab.html?scene=${room}&cover${material === 'room' ? '' : '&material=' + material}${VQ}` });
      // 舞台放大到 1440×960 再拍。
      for (let i = 0; i < 40; i++) { const ok = await evaluate(`(() => { if (!document.head) return false; const st = document.createElement('style'); st.textContent = '.mc-lab-cover .mc-lab-stage{width:1440px!important;max-width:none!important}'; document.head.appendChild(st); return true; })()`).catch(() => false); if (ok) break; await sleep(100); }
      const state = await waitLoaded('.mc-lab-error');
      if (state?.error || !state?.loaded) { summary.push({ tag, error: state?.error ?? '没有加载完' }); console.log(JSON.stringify(summary.at(-1))); continue; }
      await evaluate(`(async () => { if (!window.__mcRaycaster) { const url = performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/.vite/deps/three.js')); window.__mcRaycaster = (await import(url)).Raycaster; } return true; })()`);
      const shot = async (name, prep) => { if (!want(name)) return; await prep?.(); await sleep(SETTLE); metrics.shots[name] = { camera: await evaluate(cameraInfo) }; const file = path.join(out, `${tag}-${name}.png`); await capture(file, '.mc-lab-stage'); if (name === 'overview' || name === 'fixed') { metrics.shots[name].people = await evaluate(people); metrics.shots[name].stats = imageStats(file); if (name === 'overview') metrics.shots[name].perf = await evaluate(`(() => { const s = window.__mcStage, info = s.renderer.info.render, c = document.querySelector('.mc-canvas'); return { calls: info.calls, triangles: info.triangles, loadedMs: +(c?.dataset.loadedMs) || null, fps: +(c?.dataset.fps) || null, quality: c?.dataset.quality || null }; })()`); } };
      await shot('overview');
      if (cam?.fixed) { await shot('fixed', () => useCamera(cam.fixed)); await restoreCamera(); }
      for (const c of cam?.details ?? []) { await shot('detail-' + c.name, () => useCamera(c)); await restoreCamera(); }
      await shot('judge', () => setView('judge'));
      const ids = await evaluate(`[...document.querySelector('.mc-views select').options].map(o => o.value).filter(v => v && v !== 'walk')`);
      await shot('personA', () => setView(ids[0])); if (ids.length > 1) await shot('personB', () => setView(ids[Math.floor(ids.length / 2)]));
      await setView('overview');
      for (const v of ['table', 'chair', 'board']) await shot(v, () => setInspect(v));
      await setInspect('');
      if (material === 'room' && want('hud')) {
        await send('Page.navigate', { url: `http://localhost:${port}/stage-lab.html?scene=${room}-mc${VQ}` });
        const s2 = await waitLoaded('.stage-lab-world [role=alert]');
        if (s2?.loaded) { await sleep(SETTLE); await capture(path.join(out, `${tag}-hud.png`), '.stage-lab-world'); metrics.shots.hud = {}; }
      }
      metrics.ms = Date.now() - t0; metrics.logs = logs.filter(l => !/KHR_parallel|\[personas\]/.test(l)).slice(0, 8);
      fs.writeFileSync(path.join(out, `${tag}-metrics.json`), JSON.stringify(metrics, null, 1));
      summary.push({ tag, ms: metrics.ms, shots: Object.keys(metrics.shots), logs: metrics.logs }); console.log(JSON.stringify(summary.at(-1)));
    }
    fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 1));
  } finally {
    try { ws?.close(); } catch {}
    chrome.kill(); await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

/** avatar-lab.html 的镜头：名字 → 页面参数。照片在 .shots/<标签>/lab-<名字>.png。 */
const LAB_SHOTS = {
  'rt-front': 'mode=row&group=roundtable&view=front', 'rt-side': 'mode=row&group=roundtable&view=side', 'rt-back': 'mode=row&group=roundtable&view=back', 'rt-34': 'mode=row&group=roundtable&view=34', 'rt-sit': 'mode=row&group=roundtable&pose=sit&view=34',
  'emotion-front': 'mode=row&group=emotion&view=front', 'ent-front': 'mode=row&group=ent&view=front', 'product-front': 'mode=row&group=product&view=front', 'all-front': 'mode=row&group=all&view=front', 'all-sit': 'mode=row&group=all&pose=sit&view=34',
  'expr-rt-a': 'mode=expr&ids=math-intuitionist-001,skeptic-001,socratic-questioner-001,pragmatic-philosopher-001', 'expr-rt-b': 'mode=expr&ids=logic-analyst-001,jie-mo,hao-hao,leng-cui', 'expr-emotion': 'mode=expr&ids=fu-du-ji,shu-dong,nuan-bao-bao,pao-zhang',
  'poses': 'mode=poses&id=jie-mo&view=34', 'chairs-34': 'mode=chairs&occ=0&view=34', 'chairs-side': 'mode=chairs&occ=0&view=side', 'chairs-sit-34': 'mode=chairs&occ=1&view=34', 'chairs-sit-side': 'mode=chairs&occ=1&view=side', 'chairs-sit-front': 'mode=chairs&occ=1&view=front', 'floors': 'mode=floors',
};
async function lab(label, names) {
  const out = path.join(shotsDir, label); fs.mkdirSync(out, { recursive: true });
  const cdp = 9400 + Math.floor(Math.random() * 400), profile = path.join(tmpdir(), 'mc-shots-lab-' + process.pid);
  const chrome = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile, '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars', '--window-size=1520,1100', '--remote-debugging-port=' + cdp, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let ws;
  try {
    let target;
    for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(t => t.type === 'page'); } catch {} if (!target) await sleep(250); }
    if (!target) throw new Error('无头浏览器没有启动（可以用 CHROME_PATH 指定 chrome.exe）');
    ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map(), logs = [];
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' ')); if (m.method === 'Runtime.exceptionThrown') logs.push('exception: ' + m.params.exceptionDetails.exception?.description); const r = pending.get(m.id); if (!r) return; pending.delete(m.id); m.error ? r.reject(new Error(JSON.stringify(m.error))) : r.resolve(m.result); };
    const send = (method, params = {}) => new Promise((resolve, reject) => { const rid = ++id; pending.set(rid, { resolve, reject }); ws.send(JSON.stringify({ id: rid, method, params })); });
    const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? '页面脚本出错'); return r.result?.value; };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
    for (const name of names) {
      const query = LAB_SHOTS[name] ?? name; logs.length = 0; const t0 = Date.now();
      await send('Page.navigate', { url: `http://localhost:${port}/avatar-lab.html?${query}&shot` });
      let ready = false; for (let i = 0; i < 160 && !ready; i++) { await sleep(250); ready = await evaluate('!!window.__labReady').catch(() => false); }
      await sleep(300);
      const png = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1440, height: 960, scale: 1 } });
      const file = path.join(out, `lab-${name.replace(/[^\w.-]+/g, '_')}.png`); fs.writeFileSync(file, Buffer.from(png.data, 'base64'));
      console.log(JSON.stringify({ name, ready, ms: Date.now() - t0, file: path.relative(root, file), logs: logs.filter(l => !/\[personas\]/.test(l)).slice(0, 6) }));
    }
  } finally {
    try { ws?.close(); } catch {}
    chrome.kill(); await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

/** 并排对比页：每个房间、每种贴图、每个镜头一行，左边改前、右边改后，下面列出统计。 */
function compare(a, b) {
  const tags = new Set(); for (const label of [a, b]) for (const f of fs.existsSync(path.join(shotsDir, label)) ? fs.readdirSync(path.join(shotsDir, label)) : []) { const m = f.match(/^(.+)-metrics\.json$/); if (m) tags.add(m[1]); }
  const read = (label, tag) => { try { return JSON.parse(fs.readFileSync(path.join(shotsDir, label, `${tag}-metrics.json`), 'utf8')); } catch { return null; } };
  const peopleLine = p => Array.isArray(p) ? `人数 ${p.length}；脸朝镜头 ${p.filter(x => x.脸朝镜头 > .3).length}、侧脸 ${p.filter(x => Math.abs(x.脸朝镜头) <= .3).length}、背影 ${p.filter(x => x.脸朝镜头 < -.3).length}；被挡 ${p.filter(x => x.挡住).length}；头高 ${Math.min(...p.map(x => x.头高像素))}–${Math.max(...p.map(x => x.头高像素))} 像素` : '';
  const statLine = s => s ? `平均饱和度 ${s.平均饱和度}；高饱和面积 ${s.高饱和面积}%；亮度分位 ${s.亮度分位.join('/')}；边缘密度 ${s.边缘密度}%；色相 ${Object.entries(s.色相).filter(([, v]) => v >= 1).map(([k, v]) => k + v + '%').join(' ')}` : '';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let rows = '';
  for (const tag of [...tags].sort()) {
    const ma = read(a, tag), mb = read(b, tag), names = [...new Set([...Object.keys(ma?.shots ?? {}), ...Object.keys(mb?.shots ?? {})])].sort((x, y) => SHOTS.indexOf(x.replace(/^detail-.*/, 'detail')) - SHOTS.indexOf(y.replace(/^detail-.*/, 'detail')));
    rows += `<h2 id="${esc(tag)}">${esc(tag)}</h2>`;
    for (const name of names) {
      const cell = (label, m) => { const f = path.join(shotsDir, label, `${tag}-${name}.png`); return `<figure>${fs.existsSync(f) ? `<img loading="lazy" src="${esc(label)}/${esc(tag)}-${esc(name)}.png">` : '<div class="none">没有这张</div>'}<figcaption>${esc(label)}${m?.shots?.[name]?.camera ? ' · 相机 ' + esc(JSON.stringify(m.shots[name].camera)) : ''}<br>${esc(peopleLine(m?.shots?.[name]?.people))}<br>${esc(statLine(m?.shots?.[name]?.stats))}</figcaption></figure>`; };
      rows += `<section><h3>${esc(NAMES[name] ?? name)}</h3><div class="pair">${cell(a, ma)}${cell(b, mb)}</div></section>`;
    }
  }
  const html = `<!doctype html><meta charset="utf-8"><title>房间视觉对比 ${esc(a)} → ${esc(b)}</title><style>body{font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif;margin:16px;background:#f4efe6;color:#2b2136}h2{margin:32px 0 8px;border-bottom:2px solid #2b2136}h3{margin:12px 0 4px;font-size:15px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}img{width:100%;display:block;border:1px solid #2b2136}figcaption{font-size:12px;color:#5a5060;word-break:break-all}.none{aspect-ratio:3/2;display:grid;place-items:center;border:1px dashed #999}</style><h1>房间视觉对比：${esc(a)}（左） → ${esc(b)}（右）</h1><p>同样的画布尺寸、画质和等待时间。统计只是描述画面，不代表好不好看。</p><nav>${[...tags].sort().map(t => `<a href="#${esc(t)}">${esc(t)}</a>`).join(' · ')}</nav>${rows}`;
  const file = path.join(shotsDir, `compare-${a}-${b}.html`); fs.writeFileSync(file, html); console.log(file);
}


/** 拼图：把几张截图（路径=说明）排成一页网格，用无头 Chrome 截成 JPG。图片原样缩放，不加滤镜。 */
async function collage(outFile, title, items) {
  const cols = Number(flags.cols ?? 2), cellW = Number(flags.w ?? 720), out = path.resolve(outFile), dir = fs.mkdtempSync(path.join(tmpdir(), 'mc-collage-'));
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const cells = items.map(it => { const i = it.indexOf('='); const file = path.resolve(i > 0 ? it.slice(0, i) : it), label = i > 0 ? it.slice(i + 1) : path.basename(file); if (!fs.existsSync(file)) throw new Error('没有这张图：' + file); return '<figure><img src="' + 'file:///' + file.split(path.sep).join('/') + '"><figcaption>' + esc(label) + '</figcaption></figure>'; });
  const html = '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#1e1e1e;color:#eee;font:15px/1.3 system-ui,"Microsoft YaHei",sans-serif;width:' + (cols * cellW + 8 * (cols + 1)) + 'px}h1{font-size:18px;margin:8px 10px}.g{display:grid;grid-template-columns:repeat(' + cols + ',' + cellW + 'px);gap:8px;padding:0 8px 8px}figure{margin:0}img{width:100%;display:block}figcaption{padding:3px 2px 0}</style><h1>' + esc(title) + '</h1><div class="g">' + cells.join('') + '</div>';
  const page = path.join(dir, 'collage.html'); fs.writeFileSync(page, html);
  const cdp = 9400 + Math.floor(Math.random() * 400), profile = path.join(tmpdir(), 'mc-shots-collage-' + process.pid);
  const chrome = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--disable-extensions', '--allow-file-access-from-files', '--user-data-dir=' + profile, '--hide-scrollbars', '--remote-debugging-port=' + cdp, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let ws;
  try {
    let target; for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch('http://127.0.0.1:' + cdp + '/json/list')).json()).find(t => t.type === 'page'); } catch {} if (!target) await sleep(250); }
    if (!target) throw new Error('无头浏览器没有启动');
    ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map(); ws.onmessage = e => { const m = JSON.parse(e.data); const r = pending.get(m.id); if (!r) return; pending.delete(m.id); m.error ? r.reject(new Error(JSON.stringify(m.error))) : r.resolve(m.result); };
    const send = (method, params = {}) => new Promise((resolve, reject) => { const rid = ++id; pending.set(rid, { resolve, reject }); ws.send(JSON.stringify({ id: rid, method, params })); });
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: cols * cellW + 8 * (cols + 1), height: 120, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'file:///' + page.split(path.sep).join('/') });
    for (let i = 0; i < 60; i++) { await sleep(250); const r = await send('Runtime.evaluate', { expression: '[...document.images].every(i => i.complete && i.naturalWidth > 0)', returnByValue: true }); if (r.result.value) break; }
    const size = (await send('Runtime.evaluate', { expression: 'JSON.stringify([document.documentElement.scrollWidth, document.documentElement.scrollHeight])', returnByValue: true })).result.value, [w, h] = JSON.parse(size);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(300);
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 86, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, Buffer.from(shot.data, 'base64')); console.log(JSON.stringify({ out, w, h, items: items.length }));
  } finally { try { ws?.close(); } catch {} chrome.kill(); await sleep(400); try { fs.rmSync(profile, { recursive: true, force: true }); fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
}

if (rest[0] === 'shoot' && rest[1]) await shoot(rest[1], rest.slice(2).length ? rest.slice(2) : ROOMS);
else if (rest[0] === 'compare' && rest[1] && rest[2]) compare(rest[1], rest[2]);
else if (rest[0] === 'lab' && rest[1]) await lab(rest[1], rest.slice(2).length ? rest.slice(2) : Object.keys(LAB_SHOTS));
else if (rest[0] === 'collage' && rest[1] && rest[3]) await collage(rest[1], rest[2], rest.slice(3));
else console.log('用法：node scripts/mc-shots.mjs shoot <标签> [房间 ...] [--material=room,original,hd,style] [--shots=overview,fixed,...]\n      node scripts/mc-shots.mjs compare <改前标签> <改后标签>\n      node scripts/mc-shots.mjs lab <标签> [' + Object.keys(LAB_SHOTS).join('|') + ' ...]');
