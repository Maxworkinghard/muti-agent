/** 每次显示五条；先展示题库开头的推荐题，换批次时再看其余题目。 */
export const TOPIC_BATCH = 5;

function shuffle(pool: string[], seed: number): string[] {
  const topics = [...pool];
  let state = seed;
  for (let i = topics.length - 1; i > 0; i--) {
    state = (state * 9301 + 49297) % 233280;
    const j = state % (i + 1);
    [topics[i], topics[j]] = [topics[j], topics[i]];
  }
  return topics;
}

/** 一轮内不重复：先看完新增候选，再重新打乱整份题库。 */
export function pickTopics(pool: string[], refreshCount: number): string[] {
  if (refreshCount <= 0 || pool.length <= TOPIC_BATCH) return pool.slice(0, TOPIC_BATCH);

  const firstCycle = Math.ceil((pool.length - TOPIC_BATCH) / TOPIC_BATCH);
  if (refreshCount <= firstCycle) {
    const start = (refreshCount - 1) * TOPIC_BATCH;
    return shuffle(pool.slice(TOPIC_BATCH), 1).slice(start, start + TOPIC_BATCH);
  }

  const later = refreshCount - firstCycle - 1;
  const cycleSize = Math.ceil(pool.length / TOPIC_BATCH);
  const cycle = Math.floor(later / cycleSize);
  const start = (later % cycleSize) * TOPIC_BATCH;
  return shuffle(pool, cycle + 2).slice(start, start + TOPIC_BATCH);
}
