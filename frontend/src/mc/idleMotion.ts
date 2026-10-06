/** 空闲小动作错开 0.34 秒开始；同一个人的动作轮换一圈需要 39 秒。 */
export const IDLE_MOTIONS=['write','page','tapPen','chin','foldArms','stretch','shift','scratchHead','nod','shakeHead','leanBack','pointNote','glanceMate'] as const;
export function idleMotion(now:number,seat:number){
  const t=now/1000-seat*.34,slot=Math.floor(t/3),local=t-slot*3;
  const amount=t<0||local>2.2?0:Math.sin(Math.PI*local/2.2)**2;
  return {kind:IDLE_MOTIONS[((slot*7+seat)%IDLE_MOTIONS.length+IDLE_MOTIONS.length)%IDLE_MOTIONS.length],amount};
}
