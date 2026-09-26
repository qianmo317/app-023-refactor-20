// 换拍号重排（relayoutBar）用例 —— 直接调用纯函数，不经过界面
// 覆盖：小节变长、变短、拍数不变、击点落在非整拍位置
import { describe, expect, it } from 'vitest';
import type { Bar, Hit, Step } from '../src/types';
import { relayoutBar } from '../src/lib/relayout';
import { isBarFull } from '../src/lib/grid';

const hit = (instrumentId: string): Hit => ({ instrumentId, velocity: 2 });
const st = (beats: number, hits: Hit[] = [], extra: Partial<Step> = {}): Step => ({ beats, hits, ...extra });

/** 取出新小节每个 step 起始偏移上的乐器 id 列表 */
function hitsByOffset(b: Bar): Map<number, string[]> {
  const out = new Map<number, string[]>();
  let acc = 0;
  for (const s of b.steps) {
    if (s.hits.length) out.set(acc, s.hits.map((h) => h.instrumentId));
    acc += s.beats;
  }
  return out;
}

describe('relayoutBar 小节变长', () => {
  it('2/4 → 4/4：原整拍位置的击点保留，新增的两拍为空', () => {
    // [咚@0(4), 才@4(4)]
    const b: Bar = {
      index: 3,
      beatsPerBar: 2,
      steps: [st(4, [hit('gu')]), st(4, [hit('xiaoluo')])],
    };
    const next = relayoutBar(b, 4);

    expect(next.index).toBe(3);
    expect(next.beatsPerBar).toBe(4);
    expect(isBarFull(next)).toBe(true);
    expect(next.steps.map((s) => s.beats)).toEqual([4, 4, 4, 4]); // 整拍铺满
    expect(hitsByOffset(next)).toEqual(
      new Map([
        [0, ['gu']],
        [4, ['xiaoluo']],
      ]),
    );
    // 原入参不被修改
    expect(b.steps.map((s) => s.beats)).toEqual([4, 4]);
  });

  it('变长后齐奏（同偏移多击点）整组保留，且沿用同一组命中对象', () => {
    const gu = hit('gu');
    const daluo = hit('daluo');
    const b: Bar = { index: 0, beatsPerBar: 2, steps: [st(4, [gu, daluo]), st(4)] };
    const next = relayoutBar(b, 3);
    expect(hitsByOffset(next).get(0)).toEqual(['gu', 'daluo']);
    expect(next.steps[0].hits[0]).toBe(gu);
    expect(next.steps[0].hits[1]).toBe(daluo);
  });
});

describe('relayoutBar 小节变短（超出部分丢弃）', () => {
  it('4/4 → 2/4：只保留偏移 0..7 内的击点，第 3、4 拍的击点丢掉', () => {
    // 咚@0, 才@4, 哐@8, 七@12
    const b: Bar = {
      index: 0,
      beatsPerBar: 4,
      steps: [
        st(4, [hit('gu')]),
        st(4, [hit('xiaoluo')]),
        st(4, [hit('daluo')]),
        st(4, [hit('bo')]),
      ],
    };
    const next = relayoutBar(b, 2);

    expect(next.beatsPerBar).toBe(2);
    expect(isBarFull(next)).toBe(true);
    expect(next.steps.map((s) => s.beats)).toEqual([4, 4]);
    expect(hitsByOffset(next)).toEqual(
      new Map([
        [0, ['gu']],
        [4, ['xiaoluo']],
      ]),
    );
    // 超出新小节长度（偏移 8、12）的击点已被丢弃
    expect([...hitsByOffset(next).keys()].every((o) => o < 8)).toBe(true);
  });

  it('变短后非整拍位置（偏移 6）的击点同样被丢弃', () => {
    // [空(4), 咚@4(2), 才@6(2), 空(8)]
    const b: Bar = {
      index: 1,
      beatsPerBar: 4,
      steps: [st(4), st(2, [hit('gu')]), st(2, [hit('xiaoluo')]), st(8)],
    };
    const next = relayoutBar(b, 2);
    expect(next.steps).toHaveLength(2);
    // 咚@4 是整拍且在新小节内 → 保留；才@6 非整拍 → 丢弃
    expect(hitsByOffset(next)).toEqual(new Map([[4, ['gu']]]));
  });
});

describe('relayoutBar 拍数不变', () => {
  it('4/4 → 4/4：整拍上的击点逐条保留，rest/tie 标记不搬运', () => {
    const gu = hit('gu');
    const b: Bar = {
      index: 2,
      beatsPerBar: 4,
      steps: [
        st(4, [gu], { tie: true }),
        st(4, [], { rest: true }),
        st(4),
        st(4, [hit('bo')]),
      ],
    };
    const next = relayoutBar(b, 4);

    expect(next.beatsPerBar).toBe(4);
    expect(next.index).toBe(2);
    expect(next.steps.map((s) => s.beats)).toEqual([4, 4, 4, 4]);
    expect(hitsByOffset(next)).toEqual(
      new Map([
        [0, ['gu']],
        [12, ['bo']],
      ]),
    );
    expect(next.steps[0].tie).toBeUndefined();
    expect(next.steps[1].rest).toBeUndefined();
    expect(next.steps[0].hits[0]).toBe(gu);
  });

  it('拍数不变但切分结构被整拍重建：非整拍击点丢失（现状保持）', () => {
    // [空(2), 咚@2(2), 空(4), 空(8)]
    const b: Bar = { index: 0, beatsPerBar: 4, steps: [st(2), st(2, [hit('gu')]), st(4), st(8)] };
    const next = relayoutBar(b, 4);
    expect(next.steps.map((s) => s.beats)).toEqual([4, 4, 4, 4]);
    expect(hitsByOffset(next)).toEqual(new Map()); // 偏移 2 不是整拍边界
  });
});

describe('relayoutBar 击点落在非整拍位置', () => {
  it('半拍/¼拍偏移上的击点不搬到新小节，整拍上的照常保留', () => {
    // 4/4 切分小节：咚@0(整拍)、才@6(半拍偏移)、七@12(整拍)
    // steps: [咚(4)], [空2, 才(1), 空1], [空4], [七(4)]
    const b: Bar = {
      index: 0,
      beatsPerBar: 4,
      steps: [
        st(4, [hit('gu')]), // @0
        st(2), // @4
        st(1, [hit('xiaoluo')]), // @6 半拍
        st(1), // @7
        st(4), // @8
        st(4, [hit('bo')]), // @12 整拍
      ],
    };
    const next = relayoutBar(b, 4);
    expect(hitsByOffset(next)).toEqual(
      new Map([
        [0, ['gu']],
        [12, ['bo']],
      ]),
    );
  });

  it('非整拍击点在变长时也不复活：3/4 → 4/4 偏移 2、6 的击点依旧丢失', () => {
    // 3/4 = 12 格：[咚@0(2), 空@2(2), 才@4(2), 空@6(2), 哐@8(2), 空@10(2)]
    const b: Bar = {
      index: 0,
      beatsPerBar: 3,
      steps: [
        st(2, [hit('gu')]), // @0 整拍
        st(2),              // @2
        st(2, [hit('xiaoluo')]), // @4 整拍
        st(2, [hit('daluo')]),   // @6 非整拍
        st(2, [hit('bo')]),      // @8 整拍
        st(2),                   // @10
      ],
    };
    const next = relayoutBar(b, 4);
    expect(hitsByOffset(next)).toEqual(
      new Map([
        [0, ['gu']],
        [4, ['xiaoluo']],
        [8, ['bo']],
      ]),
    );
  });
});
