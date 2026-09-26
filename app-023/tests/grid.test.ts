// 时值换算用例 —— 覆盖验收标准「附点、切分、四分之一拍等 20 组用例换算正确」
import { describe, expect, it } from 'vitest';
import { TICKS_PER_BEAT, type Bar, type Hit, type Step } from '../src/types';
import {
  DURATIONS,
  absoluteOffsets,
  barTicks,
  barsPerRow,
  durationLine,
  isBarFull,
  remapBarHits,
  scoreWidthPx,
  setStepAt,
  stepAtOffset,
  stepOffsets,
  tieLine,
  validateScore,
} from '../src/lib/grid';
import { emptyBar, newEmptyScore, scoreFromPattern, PATTERNS } from '../src/lib/factory';

const st = (beats: number, extra: Partial<Step> = {}): Step => ({ beats, hits: [], ...extra });
const bar = (beatsPerBar: number, steps: Step[], index = 0): Bar => ({ index, beatsPerBar, steps });

describe('T1-T5 基础时值 → 格', () => {
  it('T1 每拍 = 4 格', () => expect(TICKS_PER_BEAT).toBe(4));
  it('T2 整拍 = 4 格', () => expect(DURATIONS.find((d) => d.name === '整拍')!.ticks).toBe(4));
  it('T3 半拍 = 2 格', () => expect(DURATIONS.find((d) => d.name === '半拍')!.ticks).toBe(2));
  it('T4 四分之一拍 = 1 格', () => expect(DURATIONS.find((d) => d.name === '1/4拍')!.ticks).toBe(1));
  it('T5 附点(1.5拍) = 6 格', () => expect(DURATIONS.find((d) => d.name === '附点(1.5拍)')!.ticks).toBe(6));
});

describe('T6-T11 小节容量与铺满', () => {
  it('T6 4/4 小节 = 16 格', () => expect(barTicks(4)).toBe(16));
  it('T7 2/4 小节 = 8 格', () => expect(barTicks(2)).toBe(8));
  it('T8 3/4 小节 = 12 格', () => expect(barTicks(3)).toBe(12));
  it('T9 4/4 用四个整拍铺满', () => expect(isBarFull(bar(4, [st(4), st(4), st(4), st(4)]))).toBe(true));
  it('T10 2/4 = 附点(6)+半拍(2) 切分铺满', () => expect(isBarFull(bar(2, [st(6), st(2)]))).toBe(true));
  it('T11 不满的小节校验失败', () => {
    const errs = validateScore({ ...newEmptyScore('x'), bars: [bar(4, [st(4), st(4)])] });
    expect(errs.length).toBe(1);
  });
});

describe('T12-T16 切分与偏移', () => {
  it('T12 一拍内切分 1+2+1=4（四分-半-四分）', () =>
    expect(1 + 2 + 1).toBe(barTicks(1)));
  it('T13 跨拍切分 2+1+2+... 偏移正确', () => {
    const b = bar(4, [st(2), st(1), st(2), st(1), st(2), st(4), st(4)]);
    expect(isBarFull(b)).toBe(true);
    expect(stepOffsets(b)).toEqual([0, 2, 3, 5, 6, 8, 12]);
  });
  it('T14 stepAtOffset 命中所在格', () => {
    const b = bar(4, [st(4), st(2), st(1), st(1), st(4), st(4)]);
    expect(stepAtOffset(b, 0)).toBe(0);
    expect(stepAtOffset(b, 4)).toBe(1);
    expect(stepAtOffset(b, 5)).toBe(1); // 半拍覆盖 4..5
    expect(stepAtOffset(b, 6)).toBe(2);
    expect(stepAtOffset(b, 7)).toBe(3);
    expect(stepAtOffset(b, 15)).toBe(5);
  });
  it('T15 setStepAt 等长替换不改结构', () => {
    const b = bar(2, [st(4), st(4)]);
    const next = setStepAt(b, 4, { beats: 4, hits: [{ instrumentId: 'gu', velocity: 2 }] });
    expect(next).not.toBeNull();
    expect(next!.reduce((s, x) => s + x.beats, 0)).toBe(8);
    expect(next![1].hits[0].instrumentId).toBe('gu');
  });
  it('T16 setStepAt 拆格：4 格中放 1 格，前后补空', () => {
    const b = bar(2, [st(4), st(4)]);
    const next = setStepAt(b, 5, { beats: 1, hits: [{ instrumentId: 'gu', velocity: 2 }] });
    expect(next!.map((s) => s.beats)).toEqual([4, 1, 1, 2]);
    expect(next!.reduce((s, x) => s + x.beats, 0)).toBe(8);
  });
});

describe('T17-T20 连线/休止/散板', () => {
  it('T17 tie 不改变时值总和，tieLine 跨步延伸', () => {
    const b = bar(2, [st(4, { tie: true }), st(4)]);
    expect(isBarFull(b)).toBe(true);
    const line = tieLine(b, 0, 10);
    expect(line.w).toBe(Math.max(8 * 10 - 2, 2));
  });
  it('T18 休止占时值（rest 参与铺满）', () => {
    const b = bar(2, [st(4, { rest: true }), st(4)]);
    expect(isBarFull(b)).toBe(true);
  });
  it('T19 散板相对宽度：等格等宽', () => {
    const b = bar(2, [st(4), st(4)]);
    const a = durationLine(b.steps[0], 0, 10);
    const c = durationLine(b.steps[1], 4, 10);
    expect(a.w).toBe(c.w);
    expect(c.x - a.x).toBe(40);
  });
  it('T20 全曲绝对偏移展开正确', () => {
    const bars = [bar(2, [st(4), st(4)], 0), bar(2, [st(2), st(2), st(4)], 1)];
    const all = absoluteOffsets(bars);
    expect(all.map((x) => x.absOffset)).toEqual([0, 4, 8, 10, 12]);
  });
});

describe('T21-T24 宽度与打印一致', () => {
  it('T21 谱面宽度 = 小节宽×数量 + 间隙（编辑/打印共用同一函数）', () => {
    const bars = [bar(4, [st(4), st(4), st(4), st(4)])];
    const w1 = scoreWidthPx(bars, 10);
    const w2 = scoreWidthPx([bar(4, [st(2), st(2), st(2), st(2), st(2), st(2), st(2), st(2)])], 10);
    expect(w1).toBe(w2); // 时值划分不同，小节宽度相同
  });
  it('T22 A4 横排 2/4 至少 16 小节/行', () => {
    expect(barsPerRow(1047, 2, 6)).toBeGreaterThanOrEqual(16);
  });
  it('T23 宽度随时值线性（附点=6 格宽）', () => {
    const d6 = durationLine(st(6), 0, 10).w;
    const d4 = durationLine(st(4), 0, 10).w;
    expect(d6 - d4).toBe(20);
  });
  it('T24 空小节铺满（emptyBar 生成）', () => expect(isBarFull(emptyBar(0, 4))).toBe(true));
});

describe('T25-T26 曲牌骨架换算', () => {
  it('T25 六个内置曲牌全部结构有效', () => {
    for (const p of PATTERNS) {
      const score = scoreFromPattern(p);
      expect(validateScore(score), `${p.name} 应铺满`).toEqual([]);
    }
  });
  it('T26 急急风 = 2/4 快板，共 4 小节', () => {
    const s = scoreFromPattern(PATTERNS.find((p) => p.name === '急急风')!);
    expect(s.bars[0].beatsPerBar).toBe(2);
    expect(s.bars.length).toBe(4);
  });
});

describe('换拍号搬运 remapBarHits（纯函数直调）', () => {
  const hit = (instrumentId: string): Hit => ({ instrumentId, velocity: 2 });
  const hitIds = (b: Bar) => b.steps.map((s) => s.hits.map((h) => h.instrumentId));

  it('小节变长：2/4 → 4/4，原击点留在原格偏移，新增部分为空', () => {
    const old = bar(2, [st(4, { hits: [hit('gu')] }), st(4, { hits: [hit('daluo')] })], 3);
    const next = remapBarHits(old, 4);
    expect(next.index).toBe(3); // 小节序号随迁
    expect(next.beatsPerBar).toBe(4);
    expect(next.steps.map((s) => s.beats)).toEqual([4, 4, 4, 4]);
    expect(hitIds(next)).toEqual([['gu'], ['daluo'], [], []]);
    expect(isBarFull(next)).toBe(true);
    // 纯函数不改旧小节
    expect(old.beatsPerBar).toBe(2);
    expect(old.steps.map((s) => s.hits.length)).toEqual([1, 1]);
  });

  it('小节变短：4/4 → 2/4，超出新小节的击点被丢掉', () => {
    const old = bar(4, [
      st(4, { hits: [hit('gu')] }),
      st(4, { hits: [hit('daluo')] }),
      st(4, { hits: [hit('bo')] }), // 格 8，新小节装不下
      st(4, { hits: [hit('xiaoluo')] }), // 格 12，新小节装不下
    ]);
    const next = remapBarHits(old, 2);
    expect(next.beatsPerBar).toBe(2);
    expect(next.steps.map((s) => s.beats)).toEqual([4, 4]);
    expect(hitIds(next)).toEqual([['gu'], ['daluo']]);
    expect(isBarFull(next)).toBe(true);
  });

  it('拍数不变：4/4 → 4/4，整拍位置击点保留，rest/tie 不随迁（现状）', () => {
    const old = bar(4, [
      st(4, { hits: [hit('gu')], tie: true }),
      st(4, { rest: true }),
      st(4, { hits: [hit('bo')] }),
      st(4),
    ]);
    const next = remapBarHits(old, 4);
    expect(hitIds(next)).toEqual([['gu'], [], ['bo'], []]);
    expect(next.steps[0].tie).toBeUndefined();
    expect(next.steps[1].rest).toBeUndefined();
    expect(isBarFull(next)).toBe(true);
  });

  it('击点落在非整拍位置：新小节无相同格偏移，击点不搬', () => {
    // 旧小节切分 2+2+4+4+4：鼓在格 2（半拍偏移），钹在格 4（整拍）
    const old = bar(4, [st(2), st(2, { hits: [hit('gu')] }), st(4, { hits: [hit('bo')] }), st(4), st(4)]);
    expect(stepOffsets(old)).toEqual([0, 2, 4, 8, 12]);
    const next = remapBarHits(old, 4);
    expect(hitIds(next)).toEqual([[], ['bo'], [], []]); // 格 2 对不上 → 鼓丢；格 4 对上 → 钹留
    // 变长也救不回非整拍击点：2/4 切分 2+2+4，鼓在格 2
    const short = bar(2, [st(2), st(2, { hits: [hit('gu')] }), st(4)]);
    expect(hitIds(remapBarHits(short, 4))).toEqual([[], [], [], []]);
  });
});
