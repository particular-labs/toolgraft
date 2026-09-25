import { it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { BrowserBridge } from "../../packages/mcp/src/bridge";
import {
  parseConnectionInvitation,
  panelError,
  panelRecovery,
  setupInstructions,
} from "@toolgraft/agent-core";
const { WebSocket } = createRequire(resolve("packages/mcp/package.json"))("ws");
it("accepts only exact local invitation URLs and maps missing panel errors to actionable recovery", () => {
  const ticket = "a".repeat(64);
  expect(
    parseConnectionInvitation(
      `http://127.0.0.1:17834/connect#ticket=${ticket}`,
    ),
  ).toEqual({ port: 17834, ticket });
  for (const url of [
    `https://example.com/connect#ticket=${ticket}`,
    `http://127.0.0.1:17834/connect?token=${ticket}`,
    `http://user@127.0.0.1:17834/connect#ticket=${ticket}`,
    `http://localhost:17834/connect#ticket=${ticket}`,
    `http://127.0.0.1:80/connect#ticket=${ticket}`,
  ])
    expect(parseConnectionInvitation(url)).toBeNull();
  const agentId = "b".repeat(32);
  const scoped = `http://127.0.0.1:17834/connect#ticket=${ticket}&agent=${agentId}&label=Claude%20Code`;
  expect(parseConnectionInvitation(scoped)).toEqual({
    port: 17834,
    ticket,
    agentId,
    label: "Claude Code",
  });
  for (const suffix of ["&extra=true", "&agent=" + agentId, "&label=Other"])
    expect(parseConnectionInvitation(scoped + suffix)).toBeNull();
  expect(
    parseConnectionInvitation(scoped.replace("Claude%20Code", "%0Aunsafe")),
  ).toBeNull();
  expect(panelError(undefined)).toBe(panelRecovery);
  expect(panelError(new TypeError("Cannot read properties of undefined"))).toBe(
    panelRecovery,
  );
  expect(panelError(new Error("Site access was not granted."))).toBe(
    "Site access was not granted.",
  );
  const prompt = setupInstructions({
    packageSpec: "@particular-labs/toolgraft-mcp@9.9.9",
    guideLocation: "https://example.com/guide",
  });
  expect(prompt).toContain("obtain my permission");
  expect(prompt).toContain("toolgraft_request_package_install");
  expect(prompt).toContain("no cloud relay");
  expect(prompt).toContain("reuse it and skip installation");
  expect(prompt).toContain("do not stop another agent");
  expect(prompt).toContain("another profile");
  expect(prompt).toContain("-y and @particular-labs/toolgraft-mcp@9.9.9");
  expect(prompt).not.toContain("--package=");
});
it("requires a private invitation, refuses replay and expiry, and cannot be paired by a webpage", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tg-invite-"));
  const bridge = new BrowserBridge(dir, 17840, resolve("packages/mcp"));
  const sockets: any[] = [];
  const connect = async (
    ticket: string,
    origin = "chrome-extension://" + "a".repeat(32),
  ) => {
    const socket = new WebSocket("ws://127.0.0.1:17840", { origin });
    sockets.push(socket);
    return await new Promise<any>((resolve) => {
      socket.on("open", () =>
        socket.send(JSON.stringify({ type: "invite", ticket })),
      );
      socket.once("message", (bytes: any) =>
        resolve(JSON.parse(bytes.toString())),
      );
      socket.once("close", () => resolve({ denied: true }));
      socket.once("error", () => resolve({ denied: true }));
    });
  };
  try {
    await bridge.start();
    const old = bridge.connectionInvitation();
    const live = bridge.connectionInvitation();
    expect(
      (await connect(parseConnectionInvitation(old.url)!.ticket)).denied,
    ).toBe(true);
    const ticket = parseConnectionInvitation(live.url)!.ticket;
    expect((await connect(ticket, "https://example.com")).denied).toBe(true);
    const page = await fetch("http://127.0.0.1:17840/connect");
    expect(page.status).toBe(200);
    expect(await page.text()).not.toContain(ticket);
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    const cross = await fetch("http://127.0.0.1:17840/connect", {
      headers: { Origin: "https://example.com" },
    });
    expect(cross.status).toBe(403);
    expect(bridge.connected).toBe(false);
    expect((await connect(ticket)).type).toBe("connected");
    expect((await connect(ticket)).denied).toBe(true);
    const stale = bridge.connectionInvitation();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 300001);
    expect(
      (await connect(parseConnectionInvitation(stale.url)!.ticket)).denied,
    ).toBe(true);
    vi.restoreAllMocks();
  } finally {
    vi.restoreAllMocks();
    sockets.forEach((s) => s.terminate());
    await bridge.close();
    await rm(dir, { recursive: true, force: true });
  }
});
