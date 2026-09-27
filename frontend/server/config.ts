/** 模型接口配置：/api/sessions 的角色发言和 /api/llm/chat 转发共用这一套 */
export interface LlmConfig {
  /** OpenAI 兼容接口地址 */
  baseUrl: string;
  apiKey: string;
  /** 上游模型 id，例如 cline-pass/deepseek-v4.1-flash */
  model: string;
}

/** 读 frontend/.env 里的 LLM_* 配置（和辩论后端共用一份）；也认 PR6 原来的 ROUNDTABLE_* 写法 */
export function readConfig(env: Record<string, string | undefined>): LlmConfig {
  return {
    baseUrl: (env.LLM_BASE_URL || env.ROUNDTABLE_API_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, ''),
    apiKey: env.LLM_API_KEY || env.ROUNDTABLE_API_KEY || '',
    model: env.LLM_MODEL || env.ROUNDTABLE_MODEL || 'deepseek-chat',
  };
}
