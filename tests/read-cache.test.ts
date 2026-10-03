import { afterEach, expect, it, vi } from "vitest";
import { createReadCache } from "@/lib/storage/read-cache";
afterEach(() => vi.useRealTimers());

it("does not let a read in flight repopulate a cache invalidated by a write", async () => {
  const cache = createReadCache<string>(30_000);
  let resolve!: (value: string) => void;
  const oldRead = cache.read(
    "store",
    () =>
      new Promise<string>((r) => {
        resolve = r;
      }),
  );
  cache.invalidate();
  await cache.read("store", async () => "new");
  resolve("old");
  expect((await oldRead).value).toBe("old");
  expect((await cache.read("store", async () => "unexpected")).value).toBe(
    "new",
  );
});
it("never shares a snapshot between stores or retains a failed read", async () => {
  const cache = createReadCache<string>(30_000);
  await cache.read("first", async () => "private-first");
  await expect(
    cache.read("second", async () => {
      throw new Error("outage");
    }),
  ).rejects.toThrow("outage");
  expect((await cache.read("second", async () => "private-second")).value).toBe(
    "private-second",
  );
});
