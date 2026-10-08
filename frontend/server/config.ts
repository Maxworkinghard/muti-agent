/** 模型接口配置：/api/sessions 的角色发言和 /api/llm/chat 转发共用这一套 */
export interface LlmConfig {
  /** OpenAI 兼容接口地址 */
  baseUrl: string;
  apiKey: string;
  /** 上游模型 id，例如 cline-pass/deepseek-v4.1-flash */
  model: string;
}

/** 解释服务器传入的 LLM_* 配置（会话与模型代理共用）；兼容原来的 ROUNDTABLE_* 写法 */
export function readConfig(env: Record<string, string | undefined>): LlmConfig {
  return {
    baseUrl: (env.LLM_BASE_URL || env.ROUNDTABLE_API_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, ''),
    apiKey: env.LLM_API_KEY || env.ROUNDTABLE_API_KEY || '',
    model: env.LLM_MODEL || env.ROUNDTABLE_MODEL || 'deepseek-chat',
  };
}
