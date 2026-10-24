// Camada manuscrita (ADR 0055, D3): paginação por cursor.

interface Page<T> {
  data: T[];
  nextCursor?: string | null;
}

/**
 * Itera todos os itens seguindo `nextCursor`.
 * `fn` é um método de listagem do cliente, ex.: `(p) => infi.payments.list(p)`.
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
