interface Point { x: number; y: number }
export interface BubbleBox extends Point { width: number; height: number }

/** 舞台像素坐标：优先靠近说话者，避开已放好的气泡，并收在舞台边界内。 */
export function layoutOfficeBubbles(anchors: Point[], width: number, height: number): BubbleBox[] {
  const gap = 8;
  const bw = Math.min(224, width - gap * 2);
  const bh = 100;
  const clampX = (x: number) => Math.max(gap, Math.min(width - bw - gap, x));
  const clampY = (y: number) => Math.max(gap, Math.min(height - bh - gap, y));
  const placed: BubbleBox[] = [];
  for (const anchor of anchors) {
    const x = clampX(anchor.x - bw / 2);
    const y = clampY(anchor.y - bh - 68);
    const choices: Point[] = [{ x, y }, { x, y: clampY(anchor.y + 20) }];
    for (let row = gap; row <= height - bh - gap; row += 18) {
      for (const col of [x, clampX(x - bw - gap), clampX(x + bw + gap)]) choices.push({ x: col, y: row });
    }
    const overlap = (a: Point, b: BubbleBox) =>
      Math.max(0, Math.min(a.x + bw + gap, b.x + bw + gap) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + bh + gap, b.y + bh + gap) - Math.max(a.y, b.y));
    const score = (p: Point) => placed.reduce((n, b) => n + overlap(p, b) * 10000, 0)
      + (p.x - x) ** 2 + (p.y - y) ** 2;
    choices.sort((a, b) => score(a) - score(b));
    placed.push({ ...choices[0], width: bw, height: bh });
  }
  return placed;
}
