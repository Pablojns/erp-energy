/** Executa workers com um teto de chamadas simultâneas (Conta Azul não aceita vários id_venda). */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
  onItemDone?: (done: number, total: number) => void,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let done = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        results[index] = await worker(items[index]);
        done += 1;
        onItemDone?.(done, items.length);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
