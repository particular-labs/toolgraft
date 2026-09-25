import { it, expect, vi, afterEach } from "vitest";
import { apiAdapter } from "@toolgraft/api-engine";
import { unpack } from "@toolgraft/adapter-schema/archive";
import { readFile } from "node:fs/promises";
const pkg = await unpack(
  new Uint8Array(await readFile("adapters/hacker-news-api/dist/adapter.tgz")),
);
afterEach(() => vi.unstubAllGlobals());
it("executes the packed upstream API with credentials omitted and redirects refused", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          id: 123,
          title: "Fixture story",
          kids: [4, 5],
          privateField: "must not leak",
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const result = await apiAdapter(pkg.manifest, pkg.payload).tools[0]!.execute({
    itemId: "123",
  });
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    "https://hacker-news.firebaseio.com/v0/item/123.json",
  );
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    credentials: "omit",
    redirect: "error",
  });
  expect(result.content[0]?.text).toContain("Fixture story");
  expect(result.content[0]?.text).not.toContain("must not leak");
});
it("rejects invalid inputs before a request and escapes bound path parameters", async () => {
  const fetcher = vi.fn(
    async () => new Response(JSON.stringify({ id: 1 }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetcher);
  const tool = apiAdapter(pkg.manifest, pkg.payload).tools[0]!;
  const invalid = await tool.execute({ itemId: 23 });
  expect(invalid.isError).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
  expect((await tool.execute({ itemId: ".." })).isError).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
  await tool.execute({ itemId: "1/?x=evil" });
  expect(fetcher.mock.calls[0]?.[0]).toContain("1%2F%3Fx%3Devil.json");
});
it("reports response-shape drift and HTTP failures", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("null", { status: 200 })),
  );
  expect(
    (
      await apiAdapter(pkg.manifest, pkg.payload).tools[0]!.execute({
        itemId: "123",
      })
    ).isError,
  ).toBe(true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("rate limited", { status: 429 })),
  );
  expect(
    (
      await apiAdapter(pkg.manifest, pkg.payload).tools[0]!.execute({
        itemId: "123",
      })
    ).isError,
  ).toBe(true);
});
