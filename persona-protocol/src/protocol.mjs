// 人格资料包协议 v1.0：加载、校验、归一化。无第三方依赖，Node 18+ 与浏览器均可用。
export const SCHEMA_VERSION = '1.0';

export const ENUMS = Object.freeze({
  modes: ['entertainment', 'rational'],
  originType: ['original', 'inspired', 'historical', 'composite'],
  builtinTraits: ['cautious', 'direct', 'skeptical', 'empathetic', 'critical', 'optimistic', 'pragmatic', 'humorous'],
  verbosity: ['short', 'medium', 'long'],
  register: ['casual', 'neutral', 'formal'],
  humor: ['none', 'light', 'frequent'],
  emotionalExpression: ['restrained', 'moderate', 'expressive'],
  uncertainty: ['admit_and_ask', 'admit_only'],
  outOfScope: ['decline', 'brief_then_defer'],
  factVsOpinion: ['always_label', 'label_when_relevant'],
  scene: ['roundtable', 'debate', 'office'],
  userParticipation: ['observer', 'participant'],
});

const ID_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const CUSTOM_TRAIT_RE = /^custom-[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const AVATAR_RE = /^(assets\/avatars\/[\w.-]+\.(png|webp|gif)|https:\/\/\S+)$/;

// 这些字段属于会话或运行状态，出现在人物文件里直接报错
const MISPLACED = {
  session: '会话配置放在单独的 session 文件',
  runtime: '运行状态由引擎生成，不写进人物文件',
  selectedTraits: '人物文件用 personality.defaultTraits；本次选择放 session.participants[].traitSelection',
  personalityOptions: '已改名为 personality.traitOptions',
  turnOrder: '发言顺序由讨论引擎决定',
  round: '轮次由讨论引擎决定',
};

class Report {
  constructor() { this.errors = []; this.warnings = []; }
  err(p, m) { this.errors.push(p + ': ' + m); }
  warn(p, m) { this.warnings.push(p + ': ' + m); }
  get ok() { return this.errors.length === 0; }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const len = (s) => [...s].length;

function keys(r, path, o, allowed) {
  for (const k of Object.keys(o)) {
    if (allowed.includes(k) || k.startsWith('x-')) continue;
    if (MISPLACED[k]) r.err(path + '.' + k, MISPLACED[k]);
    else r.err(path + '.' + k, '未知字段（自定义扩展请加 x- 前缀）');
  }
}
function str(r, path, o, key, { required = true, max } = {}) {
  const v = o[key];
  if (v === undefined) { if (required) r.err(path + '.' + key, '必填，非空字符串'); return; }
  if (!isStr(v)) { r.err(path + '.' + key, '必须是非空字符串'); return; }
  if (max && len(v) > max) r.err(path + '.' + key, '不能超过 ' + max + ' 个字');
}
function strArr(r, path, o, key, { required = true, min = 0, max = Infinity } = {}) {
  const v = o[key];
  const p = path + '.' + key;
  if (v === undefined) { if (required) r.err(p, '必填，字符串数组'); return; }
  if (!Array.isArray(v) || !v.every(isStr)) { r.err(p, '必须是由非空字符串组成的数组'); return; }
  if (v.length < min) r.err(p, '至少 ' + min + ' 项');
  if (v.length > max) r.err(p, '最多 ' + max + ' 项');
  if (new Set(v).size !== v.length) r.err(p, '有重复项');
}
function oneOf(r, path, o, key, list, { required = true } = {}) {
  const v = o[key];
  if (v === undefined) { if (required) r.err(path + '.' + key, '必填，可选值：' + list.join(' | ')); return; }
  if (!list.includes(v)) r.err(path + '.' + key, '取值 "' + v + '" 无效，可选值：' + list.join(' | '));
}
function sub(r, path, parent, key) {
  const v = parent[key];
  if (!isObj(v)) { r.err(path + '.' + key, '必填，对象'); return null; }
  return v;
}

function checkPersona(r, p) {
  const P = 'persona';
  keys(r, P, p, ['id', 'name', 'displayName', 'description', 'version', 'author', 'tags', 'modes',
    'identity', 'knowledge', 'worldview', 'personality', 'communicationStyle', 'boundaries', 'visual']);

  if (!isStr(p.id) || !ID_RE.test(p.id)) r.err(P + '.id', '必填，小写字母开头，只含小写字母、数字和单个连字符，例如 aleng');
  str(r, P, p, 'name', { max: 16 });
  str(r, P, p, 'displayName', { required: false, max: 32 });
  str(r, P, p, 'description', { max: 200 });
  if (!isStr(p.version) || !SEMVER_RE.test(p.version)) r.err(P + '.version', '必填，格式 x.y.z');
  str(r, P, p, 'author', { required: false });
  strArr(r, P, p, 'tags', { required: false, max: 10 });
  strArr(r, P, p, 'modes', { min: 1 });
  if (Array.isArray(p.modes)) for (const m of p.modes) if (!ENUMS.modes.includes(m)) r.err(P + '.modes', '取值 "' + m + '" 无效，可选值：' + ENUMS.modes.join(' | '));
  const rational = Array.isArray(p.modes) && p.modes.includes('rational');

  const id = sub(r, P, p, 'identity');
  if (id) {
    const Q = P + '.identity';
    keys(r, Q, id, ['role', 'profession', 'fields', 'responsibilities', 'originType']);
    str(r, Q, id, 'role', { max: 16 });
    str(r, Q, id, 'profession', { required: false });
    strArr(r, Q, id, 'fields', { min: 1 });
    strArr(r, Q, id, 'responsibilities', { min: 1, max: 5 });
    oneOf(r, Q, id, 'originType', ENUMS.originType);
  }

  const kn = sub(r, P, p, 'knowledge');
  if (kn) {
    const Q = P + '.knowledge';
    keys(r, Q, kn, ['domains', 'strong', 'weak', 'sourcePreference']);
    strArr(r, Q, kn, 'domains', { min: 1 });
    strArr(r, Q, kn, 'strong', { min: 1 });
    strArr(r, Q, kn, 'weak', { min: 1 });
    strArr(r, Q, kn, 'sourcePreference', { required: false });
  }

  const wv = sub(r, P, p, 'worldview');
  if (wv) {
    const Q = P + '.worldview';
    keys(r, Q, wv, ['tradition', 'coreValues', 'valuePriority', 'assumptions', 'judgmentFocus', 'blindSpots']);
    str(r, Q, wv, 'tradition', { required: false });
    strArr(r, Q, wv, 'coreValues', { min: 1, max: 7 });
    strArr(r, Q, wv, 'valuePriority', { min: 1 });
    // 理性模式要求完整思想体系；娱乐模式只要求价值和优先级
    for (const k of ['assumptions', 'judgmentFocus', 'blindSpots']) strArr(r, Q, wv, k, { required: rational, min: rational ? 1 : 0 });
  }

  const pe = sub(r, P, p, 'personality');
  if (pe) {
    const Q = P + '.personality';
    if ('communicationStyle' in pe) r.err(Q + '.communicationStyle', '请移到 persona.communicationStyle（与 personality 同级）');
    keys(r, Q, pe, ['traitOptions', 'defaultTraits', 'communicationStyle']);
    const ids = new Set();
    if (!Array.isArray(pe.traitOptions) || pe.traitOptions.length < 2 || pe.traitOptions.length > 8) {
      r.err(Q + '.traitOptions', '必填，2 到 8 个性格选项');
    } else {
      pe.traitOptions.forEach((t, i) => {
        const T = Q + '.traitOptions[' + i + ']';
        if (!isObj(t)) { r.err(T, '必须是对象'); return; }
        keys(r, T, t, ['id', 'label', 'behaviors']);
        if (!isStr(t.id) || !(ENUMS.builtinTraits.includes(t.id) || CUSTOM_TRAIT_RE.test(t.id))) {
          r.err(T + '.id', '必须是内置性格（' + ENUMS.builtinTraits.join(' | ') + '）或 custom- 开头的自定义 id');
        } else if (ids.has(t.id)) r.err(T + '.id', '重复的性格 id "' + t.id + '"');
        else ids.add(t.id);
        str(r, T, t, 'label', { max: 8 });
        strArr(r, T, t, 'behaviors', { min: 1, max: 5 });
      });
    }
    strArr(r, Q, pe, 'defaultTraits', { min: 2, max: 4 });
    if (Array.isArray(pe.defaultTraits)) for (const t of pe.defaultTraits) if (ids.size && !ids.has(t)) r.err(Q + '.defaultTraits', '"' + t + '" 不在 traitOptions 里');
  }

  const cs = sub(r, P, p, 'communicationStyle');
  if (cs) {
    const Q = P + '.communicationStyle';
    keys(r, Q, cs, ['tone', 'verbosity', 'register', 'sentenceStyle', 'humor', 'emotionalExpression', 'catchphrases', 'avoidPhrases']);
    str(r, Q, cs, 'tone', { max: 60 });
    oneOf(r, Q, cs, 'verbosity', ENUMS.verbosity);
    oneOf(r, Q, cs, 'register', ENUMS.register);
    str(r, Q, cs, 'sentenceStyle', { required: false, max: 60 });
    oneOf(r, Q, cs, 'humor', ENUMS.humor, { required: false });
    oneOf(r, Q, cs, 'emotionalExpression', ENUMS.emotionalExpression, { required: false });
    strArr(r, Q, cs, 'catchphrases', { required: false, max: 5 });
    strArr(r, Q, cs, 'avoidPhrases', { required: false, max: 10 });
  }

  const bd = sub(r, P, p, 'boundaries');
  if (bd) {
    const Q = P + '.boundaries';
    keys(r, Q, bd, ['uncertainty', 'outOfScope', 'factVsOpinion', 'forbiddenTopics', 'mustNot']);
    oneOf(r, Q, bd, 'uncertainty', ENUMS.uncertainty);
    oneOf(r, Q, bd, 'outOfScope', ENUMS.outOfScope);
    oneOf(r, Q, bd, 'factVsOpinion', ENUMS.factVsOpinion, { required: false });
    if (rational && bd.factVsOpinion !== 'always_label') r.err(Q + '.factVsOpinion', '包含 rational 模式时必须为 always_label');
    strArr(r, Q, bd, 'forbiddenTopics', { required: false });
    strArr(r, Q, bd, 'mustNot', { min: 1 });
  }

  const vi = sub(r, P, p, 'visual');
  if (vi) {
    const Q = P + '.visual';
    keys(r, Q, vi, ['avatar', 'color', 'icon', 'defaultLabel']);
    if (vi.avatar === '') r.warn(Q + '.avatar', '空字符串按无头像处理，建议写 null');
    else if (vi.avatar !== undefined && vi.avatar !== null && !(typeof vi.avatar === 'string' && AVATAR_RE.test(vi.avatar))) {
      r.err(Q + '.avatar', '只接受 null、assets/avatars/<文件名>.png|webp|gif 或 https 地址');
    }
    if (!isStr(vi.color) || !COLOR_RE.test(vi.color)) r.err(Q + '.color', '必填，#RRGGBB');
    str(r, Q, vi, 'icon', { required: false });
    str(r, Q, vi, 'defaultLabel', { max: 12 });
  }
}

function normalizePersona(p) {
  const n = structuredClone(p);
  n.displayName ??= n.name;
  n.tags ??= [];
  if (!n.visual.avatar) n.visual.avatar = null;
  return deepFreeze(n);
}
function deepFreeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
}

// 没有头像时前端使用占位：人物主色底 + 名字第一个字
export function avatarOf(persona) {
  const v = persona.visual;
  return v.avatar
    ? { kind: 'image', src: v.avatar, color: v.color }
    : { kind: 'placeholder', glyph: [...persona.name][0], color: v.color };
}

export function loadPersona(doc) {
  const r = new Report();
  if (!isObj(doc)) { r.err('$', '文件内容必须是 JSON 对象'); return { report: r, persona: null }; }
  if (!('persona' in doc)) {
    r.err('$', '顶层必须是 { "schemaVersion": "1.0", "persona": { ... } }');
    return { report: r, persona: null };
  }
  keys(r, '$', doc, ['$schema', 'schemaVersion', 'persona']);
  if (doc.schemaVersion !== SCHEMA_VERSION) r.err('$.schemaVersion', '必须是字符串 "' + SCHEMA_VERSION + '"');
  if (!isObj(doc.persona)) { r.err('$.persona', '必填，对象'); return { report: r, persona: null }; }
  checkPersona(r, doc.persona);
  return { report: r, persona: r.ok ? normalizePersona(doc.persona) : null };
}

// 性格两层：人物文件给默认值，session 覆盖本次选择；公共人物模板不被修改。
// 会话开始后冻结，首版不支持运行中切换。
export function loadSession(doc, personas) {
  const r = new Report();
  const S = 'session';
  if (!isObj(doc) || !isObj(doc.session)) { r.err('$', '顶层必须是 { "schemaVersion": "1.0", "session": { ... } }'); return { report: r, session: null }; }
  keys(r, '$', doc, ['$schema', 'schemaVersion', 'session']);
  if (doc.schemaVersion !== SCHEMA_VERSION) r.err('$.schemaVersion', '必须是字符串 "' + SCHEMA_VERSION + '"');
  const s = doc.session;
  keys(r, S, s, ['id', 'mode', 'scene', 'question', 'userParticipation', 'participants']);
  str(r, S, s, 'id');
  oneOf(r, S, s, 'mode', ENUMS.modes);
  oneOf(r, S, s, 'scene', ENUMS.scene);
  str(r, S, s, 'question', { max: 500 });
  oneOf(r, S, s, 'userParticipation', ENUMS.userParticipation);

  const resolved = [];
  if (!Array.isArray(s.participants) || s.participants.length < 1 || s.participants.length > 8) {
    r.err(S + '.participants', '必填，1 到 8 个参与人物');
  } else {
    const seats = new Set();
    s.participants.forEach((pt, i) => {
      const T = S + '.participants[' + i + ']';
      if (!isObj(pt)) { r.err(T, '必须是对象'); return; }
      keys(r, T, pt, ['personaId', 'seat', 'traitSelection']);
      const persona = personas.get(pt.personaId);
      if (!persona) { r.err(T + '.personaId', '找不到已通过校验的人物 "' + pt.personaId + '"'); return; }
      if (!persona.modes.includes(s.mode)) r.err(T + '.personaId', '人物 ' + persona.id + ' 不支持 ' + s.mode + ' 模式');
      if (!Number.isInteger(pt.seat) || pt.seat < 1 || pt.seat > 8) r.err(T + '.seat', '必填，1 到 8 的整数');
      else if (seats.has(pt.seat)) r.err(T + '.seat', '座位 ' + pt.seat + ' 已被占用');
      else seats.add(pt.seat);
      let traits = persona.personality.defaultTraits;
      let traitSource = 'persona-default';
      if (pt.traitSelection !== undefined) {
        strArr(r, T, pt, 'traitSelection', { min: 2, max: 4 });
        const allowed = new Set(persona.personality.traitOptions.map((t) => t.id));
        if (Array.isArray(pt.traitSelection)) {
          for (const t of pt.traitSelection) if (!allowed.has(t)) r.err(T + '.traitSelection', '"' + t + '" 不在人物 ' + persona.id + ' 的 traitOptions 里');
          traits = pt.traitSelection;
          traitSource = 'session';
        }
      }
      const byId = new Map(persona.personality.traitOptions.map((t) => [t.id, t]));
      resolved.push({
        personaId: persona.id,
        seat: pt.seat,
        traitSource,
        effectiveTraits: traits.map((tid) => byId.get(tid)).filter(Boolean),
        avatar: avatarOf(persona),
      });
    });
  }
  if (!r.ok) return { report: r, session: null };
  const session = { ...structuredClone(s), participants: resolved.sort((a, b) => a.seat - b.seat) };
  return { report: r, session: deepFreeze(session) };
}
