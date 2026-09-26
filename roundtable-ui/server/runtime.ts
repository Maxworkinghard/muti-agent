import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

/**
 * 每个 Agent 角色都跑在一个 omp 进程里，这里准备它们共用的隔离运行环境：
 * - PI_CODING_AGENT_DIR 指向生成的目录，只读这里的 config.yml / models.yml，不读本机 ~/.omp/agent
 * - 子进程只继承系统必需的环境变量，本机的 OMP_* / PI_* / 各家 API Key 都不会带进去
 * - 关闭所有外部配置来源（其他工具的配置、祖先目录的 AGENTS.md / CLAUDE.md、MCP 等）
 */

export interface RuntimeConfig {
  baseUrl: string;
  apiKey: string;
  /** 上游模型 id，例如 cline-pass/deepseek-v4.1-flash */
  model: string;
  ompBin: string;
  dir: string;
}

export interface Runtime {
  cfg: RuntimeConfig;
  agentDir: string;
  workDir: string;
  env: NodeJS.ProcessEnv;
}

const PROVIDER = 'roundtable';
/** models.yml 里只写这个变量名，真正的 Key 只存在于子进程的环境变量里 */
const KEY_ENV = 'ROUNDTABLE_API_KEY';

/** 读 roundtable-ui/.env.local 里的 ROUNDTABLE_* 配置 */
export function readConfig(env: Record<string, string | undefined>): RuntimeConfig {
  return {
    baseUrl: env.ROUNDTABLE_API_BASE_URL || 'https://api.cline.bot/api/v1',
    apiKey: env.ROUNDTABLE_API_KEY ?? '',
    model: env.ROUNDTABLE_MODEL || 'cline-pass/deepseek-v4.1-flash',
    ompBin: env.ROUNDTABLE_OMP_BIN || findOmp(),
    dir: env.ROUNDTABLE_RUNTIME_DIR || join(tmpdir(), 'roundtable-omp'),
  };
}

function findOmp(): string {
  const names = process.platform === 'win32' ? ['omp.exe'] : ['omp'];
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const n of names) if (dir && existsSync(join(dir, n))) return join(dir, n);
  }
  const local = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'omp', 'omp.exe');
  return local && existsSync(local) ? local : 'omp';
}

// 外部配置来源全部关闭，只留 omp 自己的 native 来源（它读的就是上面的隔离目录）
const DISABLED_SOURCES = [
  'omp-plugins', 'claude', 'agent-plugins', 'agents', 'claude-plugins', 'codex', 'gemini', 'opencode',
  'cursor', 'windsurf', 'cline', 'github', 'vscode', 'agents-md', 'claude-md', 'mcp-json', 'ssh-json', 'builtin-defaults',
];

// 系统运行必需的变量和网络代理设置；其余一律不继承
const PASS_ENV = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR',
  'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'HOME', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
  'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432', 'COMMONPROGRAMFILES', 'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE', 'OS', 'LANG', 'LC_ALL', 'TZ',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE',
]);

/** 生成隔离目录和配置文件；YAML 里的字符串都用 JSON 写法转义 */
export function prepareRuntime(cfg: RuntimeConfig): Runtime {
  const agentDir = join(cfg.dir, 'agent');
  const workDir = join(cfg.dir, 'workspace');
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(workDir, { recursive: true });
  const q = JSON.stringify;
  const header = '# 多人格工作台自动生成，每次启动覆盖；omp 通过 PI_CODING_AGENT_DIR 只读这个目录\n';
  writeFileSync(join(agentDir, 'models.yml'), header + [
    'providers:',
    `  ${PROVIDER}:`,
    `    baseUrl: ${q(cfg.baseUrl)}`,
    `    apiKey: ${KEY_ENV}`,
    '    api: openai-completions',
    '    authHeader: true',
    '    models:',
    `      - id: ${q(cfg.model)}`,
    `        name: ${q(cfg.model + ' (roundtable)')}`,
    '        input: [text]',
    '        contextWindow: 128000',
    '        maxTokens: 8192',
    '',
  ].join('\n'));
  writeFileSync(join(agentDir, 'config.yml'), header + [
    'modelRoles:',
    `  default: ${q(modelRef(cfg))}`,
    `disabledProviders: ${q(DISABLED_SOURCES)}`,
    // 自动重试会在一轮失败后再跑一轮，打乱轮次对应关系；失败交给会话层重试一次
    'retry:',
    '  enabled: false',
    '  modelFallback: false',
    '',
  ].join('\n'));

  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && PASS_ENV.has(k.toUpperCase())) env[k] = v;
  Object.assign(env, { PI_CODING_AGENT_DIR: agentDir, OMP_PROFILE: '', PI_NO_TITLE: '1', NO_COLOR: '1', [KEY_ENV]: cfg.apiKey });
  return { cfg, agentDir, workDir, env };
}

export const modelRef = (cfg: RuntimeConfig) => `${PROVIDER}/${cfg.model}`;

/** 一个角色的 omp 启动参数：RPC 模式、指定人格提示词文件、不带任何工具和本机扩展（按 omp 18.3 的参数） */
export function ompArgs(rt: Runtime, promptFile: string): string[] {
  return [
    '--mode', 'rpc',
    '--model', modelRef(rt.cfg),
    '--system-prompt', promptFile,
    '--no-tools', '--no-lsp', '--no-extensions', '--no-skills', '--no-rules', '--no-session', '--no-title',
    '--cwd', rt.workDir,
  ];
}
