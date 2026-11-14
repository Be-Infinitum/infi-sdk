// Handwritten layer (ADR 0055, D3): cursor pagination.

interface Page<T> {
  data: T[];
  nextCursor?: string | null;
}

/**
 * Iterates over all items following `nextCursor`.
 * `fn` is a list method of the client, e.g.: `(p) => infi.payments.list(p)`.
 */
export async function* paginate<T, P extends { query?: Record<string, any> }>(
  fn: (params: P) => Promise<Page<T>>,
  params: P = {} as P,
): AsyncGenerator<T, void, undefined> {
  let cursor: string | null | undefined = params.query?.cursor;
  for (;;) {
    const page = await fn({ ...params, query: { ...params.query, cursor: cursor ?? undefined } });
    for (const item of page.data) yield item;
    if (!page.nextCursor) return;
    cursor = page.nextCursor;
  }
}
