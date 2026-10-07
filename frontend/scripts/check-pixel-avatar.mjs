import assert from 'node:assert/strict';
import { buildPixelAvatar } from '../src/components/pixelAvatarDraw.ts';

const visual = { skin: '#f1c9a5', hair: '#2b2136', shirt: '#4F9DB8', accent: '#fbf5e4', hairStyle: 'short' };

const bust = buildPixelAvatar(visual, { facing: 'S', standing: false });
assert.equal(bust.height, 16);
assert.ok(bust.rects.every((rect) => rect[1] + rect[3] <= 16));
const stand = buildPixelAvatar(visual, { facing: 'S', standing: true });
assert.equal(stand.height, 24);
assert.ok(stand.rects.some((rect) => rect[4] === '#3d3550' && rect[1] >= 16));
const sit = buildPixelAvatar(visual, { pose: 'sit', facing: 'S' });
assert.equal(sit.height, 22);
assert.ok(sit.rects.some((rect) => rect[4] === '#3d3550'));
assert.ok(sit.rects.some((rect) => rect[4] === '#ab7646'), 'sit pose should include the chair');
assert.ok(buildPixelAvatar(visual, { pose: 'sit', facing: 'E' }).rects.some((rect) => rect[4] === '#ab7646'));
assert.ok(!bust.rects.some((rect) => rect[4] === '#ab7646'));
assert.ok(!stand.rects.some((rect) => rect[4] === '#ab7646'));
assert.equal(buildPixelAvatar(visual, { facing: 'W', standing: true }).height, 24);
const quiet = buildPixelAvatar(visual, { pose: 'stand', facing: 'S' });
assert.ok(!quiet.rects.some((rect) => rect[4] === '#b86a5a' && rect[3] === 2));
const sweaty = buildPixelAvatar({ ...visual, extras: ['sweat'] }, { facing: 'S' });
assert.ok(sweaty.rects.some((rect) => rect[4] === '#7cc3e8' && rect[1] === 4));
assert.ok(!sweaty.rects.some((rect) => rect[4] === '#7cc3e8' && rect[1] === 6));
assert.equal(buildPixelAvatar(visual, { facing: 'S' }).height, 16);
console.log('像素小人：半身、站立、坐姿和椅子、侧身、闭嘴、汗滴均通过。');
