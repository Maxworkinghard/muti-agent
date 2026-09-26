import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { ompArgs, type Runtime } from './runtime.ts';

type Frame = Record<string, any>;
interface Waiter { resolve: (f: Frame) => void; reject: (e: Error) => void }

/** 模型这一轮没答成；鉴权失败、模型不存在这类错误重试也没用 */
export class OmpTurnError extends Error {
  get fatal() { return /\b(401|403|404)\b|unauthori[sz]ed|forbidden|invalid.{0,20}(api|key)|model.{0,40}not.{0,10}(found|exist)/i.test(this.message); }
}

const lastLine = (s: string) => s.trim().split(/\r?\n/).pop() ?? '';
const textOf = (m: Frame | undefined) =>
  Array.isArray(m?.content) ? m.content.filter((c: Frame) => c?.type === 'text').map((c: Frame) => c.text).join('').trim() : '';

/**
 * 一个 Agent 角色 = 一个 `omp --mode rpc` 子进程，协议是 stdin / stdout 上的 JSONL。
 * 进程在整场会话里常驻，所以每个角色都记得自己说过的话。
 * 一轮回答以 isTerminal 的 agent_end 为结束（omp 18.3 没有模型轮次的 prompt_result），
 * 最后一条 assistant 消息的 stopReason 为 error / aborted 时算失败。
 */
export class OmpAgent {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private seq = 0;
  private waiters = new Map<string, Waiter>();
  private turn: (Waiter & { id: string }) | null = null;
  private stderr = '';
  private dead: Error | null = null;

  constructor(readonly name: string, private rt: Runtime, private promptFile: string) {}

  /** 启动进程并等到 ready 帧；关掉 omp 自带的自动重试，失败由会话统一处理 */
  async start(timeoutMs = 90_000): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('omp 启动超时')), timeoutMs);
      const proc = spawn(this.rt.cfg.ompBin, ompArgs(this.rt, this.promptFile), {
        cwd: this.rt.workDir, env: this.rt.env, windowsHide: true,
      });
      this.proc = proc;
      proc.stdin.on('error', () => {}); // 进程退出后的写入错误交给 exit 统一处理
      proc.stderr.on('data', (d: Buffer) => { this.stderr = (this.stderr + d.toString()).slice(-4000); });
      const fail = (e: Error) => { clearTimeout(timer); this.onDead(e); reject(e); };
      proc.on('error', (e) => fail(new Error(`无法运行 omp（${this.rt.cfg.ompBin}）：${e.message}`)));
      proc.on('exit', (code) => fail(new Error(`omp 进程退出（code ${code}）${this.stderr ? '：' + lastLine(this.stderr) : ''}`)));
      createInterface({ input: proc.stdout }).on('line', (line) => {
        let f: Frame;
        try { f = JSON.parse(line); } catch { return; }
        if (f.type === 'ready') { clearTimeout(timer); resolve(); return; }
        this.onFrame(f);
      });
    });
    await this.command('set_auto_retry', { enabled: false }).catch(() => {});
  }

  /** 发一条消息，等这一轮回答完，返回回答文本 */
  async ask(message: string, timeoutMs = 180_000): Promise<string> {
    if (this.dead) throw this.dead;
    const id = 'p' + ++this.seq;
    const done = new Promise<Frame>((resolve, reject) => {
      // 只清理自己这一轮，避免超时的旧轮次误伤下一轮
      const finish = (fn: () => void) => { clearTimeout(timer); if (this.turn?.id === id) this.turn = null; fn(); };
      const timer = setTimeout(() => { finish(() => reject(new OmpTurnError('等待模型回答超时'))); this.abort(); }, timeoutMs);
      this.turn = { id, resolve: (f) => finish(() => resolve(f)), reject: (e) => finish(() => reject(e)) };
    });
    done.catch(() => {});
    const ack = this.wait('r:' + id, 30_000);
    this.write({ id, type: 'prompt', message });
    try {
      const a = await ack;
      if (!a.success) throw new OmpTurnError(a.error ?? 'omp 拒绝了这条消息');
      if (a.data?.agentInvoked === false) this.turn?.resolve({});
    } catch (e) {
      if (this.turn?.id === id) this.turn.reject(e as Error);
      throw e;
    }
    const end = await done;
    const reply = [...(end.messages ?? [])].reverse().find((m: Frame) => m?.role === 'assistant');
    if (reply?.stopReason === 'error' || reply?.stopReason === 'aborted') {
      throw new OmpTurnError(reply.errorMessage || (reply.stopReason === 'aborted' ? '已中止' : '模型调用失败'));
    }
    if (end.status && end.status !== 'completed') throw new OmpTurnError(end.error?.message ?? end.status);
    return textOf(reply) || String((await this.command('get_last_assistant_text'))?.text ?? '').trim();
  }

  abort() {
    this.write({ type: 'abort' });
  }

  /** 关闭 stdin 让 omp 自己退出，3 秒后仍在就强制结束 */
  dispose() {
    const p = this.proc;
    if (!p || p.exitCode !== null) return;
    if (this.turn) this.abort();
    p.stdin.end();
    setTimeout(() => { if (p.exitCode === null) p.kill(); }, 3000).unref();
  }

  /** 服务器退出时同步结束进程 */
  kill() {
    if (this.proc && this.proc.exitCode === null) this.proc.kill();
  }

  private async command(type: string, extra: Frame = {}): Promise<any> {
    const id = 'c' + ++this.seq;
    const res = this.wait('r:' + id, 30_000);
    this.write({ id, type, ...extra });
    const f = await res;
    if (!f.success) throw new Error(f.error ?? type + ' 失败');
    return f.data;
  }

  private wait(key: string, timeoutMs: number): Promise<Frame> {
    if (this.dead) return Promise.reject(this.dead);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiters.delete(key); reject(new Error('等待 omp 响应超时')); }, timeoutMs);
      this.waiters.set(key, {
        resolve: (f) => { clearTimeout(timer); resolve(f); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
    });
  }

  private onFrame(f: Frame) {
    const w = f.type === 'response' ? this.waiters.get('r:' + f.id) : undefined;
    if (w) { this.waiters.delete('r:' + f.id); w.resolve(f); return; }
    const t = this.turn;
    if (t) {
      // 本轮结束：terminal 的 agent_end（新版本还会再发一个同 id 的 prompt_result）
      if (f.type === 'agent_end' && f.isTerminal !== false && f.yielded !== false) return t.resolve(f);
      if (f.type === 'prompt_result' && f.id === t.id) return t.resolve(f);
      // 已确认的 prompt 后来调度失败时，omp 会再发一个同 id 的失败响应
      if (f.type === 'response' && f.id === t.id && f.success === false) return t.reject(new OmpTurnError(f.error ?? '调用失败'));
    }
    // 不带扩展运行不该出现界面请求，万一出现就直接取消，免得卡住
    if (f.type === 'extension_ui_request' && f.id) this.write({ type: 'extension_ui_response', id: f.id, cancelled: true });
  }

  private onDead(e: Error) {
    if (this.dead) return;
    this.dead = e;
    for (const w of this.waiters.values()) w.reject(e);
    this.waiters.clear();
    this.turn?.reject(e);
  }

  private write(f: Frame) {
    if (this.proc && !this.dead) this.proc.stdin.write(JSON.stringify(f) + '\n');
  }
}
