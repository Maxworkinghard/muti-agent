/** 模型接口配置：/api/sessions 的角色发言和 /api/llm/chat 转发共用这一套 */
export interface LlmConfig {
  /** OpenAI 兼容接口地址 */
  baseUrl: string;
  apiKey: string;
  /** 上游模型 id，例如 cline-pass/deepseek-v4.1-flash */
  model: string;
}

/** 读 frontend/.env.local 里的 ROUNDTABLE_* 配置 */
export function readConfig(env: Record<string, string | undefined>): LlmConfig {
  return {
    baseUrl: (env.ROUNDTABLE_API_BASE_URL || 'https://api.cline.bot/api/v1').replace(/\/+$/, ''),
    apiKey: env.ROUNDTABLE_API_KEY ?? '',
    model: env.ROUNDTABLE_MODEL || 'cline-pass/deepseek-v4.1-flash',
  };
}
