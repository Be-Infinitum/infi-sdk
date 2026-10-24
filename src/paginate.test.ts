import { expect, test } from "bun:test";
import { paginate } from "./paginate.js";

test("segue nextCursor até null e repassa filtros", async () => {
  const seen: unknown[] = [];
  const pages: Record<string, { data: number[]; nextCursor: string | null }> = {
    start: { data: [1, 2], nextCursor: "a" },
    a: { data: [3], nextCursor: "b" },
    b: { data: [4], nextCursor: null },
  };
  const fn = async (p: { query?: Record<string, any> }) => {
    seen.push(p.query);
    return pages[p.query?.cursor ?? "start"]!;
  };
  const out: number[] = [];
  for await (const n of paginate(fn, { query: { limit: 2 } })) out.push(n);
  expect(out).toEqual([1, 2, 3, 4]);
  expect(seen).toEqual([{ limit: 2, cursor: undefined }, { limit: 2, cursor: "a" }, { limit: 2, cursor: "b" }]);
});
