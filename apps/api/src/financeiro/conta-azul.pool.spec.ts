import { mapLimit } from './conta-azul.pool';

describe('mapLimit', () => {
  it('preserva a ordem e reporta progresso', async () => {
    const progress: Array<[number, number]> = [];
    const out = await mapLimit(
      [1, 2, 3, 4],
      2,
      async (n) => n * 10,
      (done, total) => progress.push([done, total]),
    );
    expect(out).toEqual([10, 20, 30, 40]);
    expect(progress).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ]);
  });

  it('não ultrapassa o teto de concorrência', async () => {
    let inflight = 0;
    let maxInflight = 0;
    await mapLimit(
      Array.from({ length: 40 }, (_, i) => i),
      8,
      async () => {
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise((resolve) => setTimeout(resolve, 15));
        inflight -= 1;
      },
    );
    expect(maxInflight).toBeLessThanOrEqual(8);
    expect(maxInflight).toBe(8);
  });
});
