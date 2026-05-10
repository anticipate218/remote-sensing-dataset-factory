/**
 * 限制并发数的异步处理（前端版 worker pool）。
 *
 * 核心场景：批量上传后批量调用某个 API 时，避免一次性发出 N 个请求把后端打爆，
 * 也避免顺序 await 一个一个等。
 *
 * Usage:
 *   const results = await asyncPool(4, files, async (file, idx) => {
 *     return await axios.post('/api/preprocess/enhance', { file_id: file.id });
 *   }, (done, total) => setProgress(done / total));
 *
 * @param concurrency 最大并发数 (>=1)
 * @param items       要处理的数据列表
 * @param worker      处理单条数据的异步函数；返回 Promise<R>。**worker 应自行 catch
 *                    可恢复错误**：如果 worker 抛出，asyncPool 会保留对应位置的 reject 信息（不会中断其它任务）。
 * @param onProgress  可选；每完成一项就回调 (done, total, lastIdx)
 * @returns 与 items 等长的结果数组；若某项 worker 抛错，对应位置存放 { __error: Error } 包装。
 */
export async function asyncPool<T, R>(
  concurrency: number,
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number, lastIdx: number) => void,
): Promise<Array<R | { __error: Error }>> {
  const total = items.length;
  const results: Array<R | { __error: Error }> = new Array(total);
  let nextIndex = 0;
  let completed = 0;

  const safeConcurrency = Math.max(1, Math.min(concurrency | 0 || 1, total || 1));

  const runOne = async (workerId: number): Promise<void> => {
    while (true) {
      const idx = nextIndex++;
      if (idx >= total) return;
      try {
        results[idx] = await worker(items[idx], idx);
      } catch (e) {
        results[idx] = { __error: e instanceof Error ? e : new Error(String(e)) };
      }
      completed += 1;
      onProgress?.(completed, total, idx);
    }
  };

  const workers: Array<Promise<void>> = [];
  for (let i = 0; i < safeConcurrency; i++) {
    workers.push(runOne(i));
  }
  await Promise.all(workers);
  return results;
}

/** asyncPool 返回项是否为错误包装 */
export function isAsyncPoolError(v: unknown): v is { __error: Error } {
  return typeof v === 'object' && v !== null && '__error' in (v as any);
}
