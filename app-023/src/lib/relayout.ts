// 换拍号时的击点搬运与小节重排 —— 纯函数：不碰界面、不读组件状态。
import type { Bar, Hit } from '../types';
import { emptyBar } from './factory';
import { stepOffsets } from './grid';

/**
 * 把旧小节的击点按「小节内格偏移」搬到拍数为 beatsPerBar 的新小节。
 *
 * 规则（与换拍号交互的原行为逐条一致）：
 * - 新小节先用整拍空 step 铺满（emptyBar），rest/tie 等标记一律不搬；
 * - 击点只搬到新小节中格偏移相同的位置（新小节格偏移均为整拍边界），
 *   因此旧小节里落在非整拍位置的击点不会出现在新小节；
 * - 新小节比旧小节短时，超出新小节长度的击点直接丢掉；
 * - 同一偏移上的多个击点（齐奏）整组保留。
 */
export function relayoutBar(bar: Bar, beatsPerBar: number): Bar {
  const hitsByTick = new Map<number, Hit[]>();
  const offsets = stepOffsets(bar);
  bar.steps.forEach((st, si) => {
    if (st.hits.length) hitsByTick.set(offsets[si], st.hits);
  });
  const next = emptyBar(bar.index, beatsPerBar);
  const newOffsets = stepOffsets(next);
  next.steps = next.steps.map((st, si) =>
    hitsByTick.has(newOffsets[si]) ? { ...st, hits: hitsByTick.get(newOffsets[si])! } : st,
  );
  return next;
}
