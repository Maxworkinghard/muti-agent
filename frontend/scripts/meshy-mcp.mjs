// Small local-only MCP client for optional character asset generation.
// Pass MESHY_API_KEY through the environment. Never store it in the project.
import { spawn } from 'node:child_process';

const [command, name, argumentJson] = process.argv.slice(2);
if (!['schema', 'call'].includes(command) || !name) {
  console.error('usage: node scripts/meshy-mcp.mjs <schema|call> <tool> [json-arguments]');
  process.exit(1);
}
if (!process.env.MESHY_API_KEY) {
  console.error('MESHY_API_KEY is required');
  process.exit(1);
}
const child = spawn('cmd', ['/c', 'npx -y @meshy-ai/meshy-mcp-server'], {
  env: process.env,
  stdio: ['pipe', 'pipe', 'ignore'],
});
let id = 0;
let buffer = '';
const pending = new Map();
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    }
  }
});
function rpc(method, params) {
  const requestId = ++id;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n');
  });
}
const timer = setTimeout(() => { child.kill(); process.exit(2); }, 180_000);
try {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'character-pipeline', version: '1' } });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  if (command === 'schema') {
    const tools = await rpc('tools/list');
    console.log(JSON.stringify(tools.tools.find((tool) => tool.name === name)?.inputSchema ?? null, null, 2));
  } else {
    const result = await rpc('tools/call', { name, arguments: JSON.parse(argumentJson || '{}') });
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  child.stdin.end();
  child.kill();
}
