import { createServer } from "node:http";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  writeFile,
  rename,
  unlink,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserBridge } from "./bridge";
import { SHARED_BRIDGE_PROTOCOL } from "@toolgraft/agent-core";

const directory = process.argv[2]!;
const requestedPort = Number(process.argv[3]);
await mkdir(directory, { recursive: true, mode: 0o700 });
const lockPath = join(directory, "host.lock");
let lock;
try {
  lock = await open(lockPath, "wx", 0o600);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === "EEXIST") process.exit(0);
  throw error;
}
await lock.writeFile(JSON.stringify({ pid: process.pid }));
await lock.close();
const secret = randomBytes(32).toString("hex");
const bridges = new Map<string, BrowserBridge>();
const initializing = new Map<string, Promise<BrowserBridge>>();
const sessions = new Map<string, { agentId: string; seen: number }>();
let port = requestedPort;
let lastUsed = Date.now();
const assets = join(dirname(fileURLToPath(import.meta.url)), "connect");
const matches = (value: unknown, expected: string) =>
  typeof value === "string" &&
  Buffer.byteLength(value) === Buffer.byteLength(expected) &&
  timingSafeEqual(Buffer.from(value), Buffer.from(expected));
let landing: BrowserBridge;
const http = createServer((req, res) => {
  if (req.url !== "/rpc") {
    landing?.serve(req, res);
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  if (
    req.method !== "POST" ||
    req.headers.origin ||
    req.headers.host !== `127.0.0.1:${port}` ||
    !matches(req.headers.authorization, `Bearer ${secret}`)
  ) {
    res.writeHead(403);
    res.end('{"error":"Local authentication required"}');
    return;
  }
  void (async () => {
    try {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) throw new Error("Request too large");
        chunks.push(chunk);
      }
      const input = JSON.parse(Buffer.concat(chunks).toString());
      lastUsed = Date.now();
      let value: unknown;
      if (input.operation === "health")
        value = { protocol: SHARED_BRIDGE_PROTOCOL, port };
      else if (input.operation === "register") {
        if (
          typeof input.identity !== "string" ||
          input.identity.length > 4096 ||
          typeof input.label !== "string"
        )
          throw new Error("Invalid agent identity");
        if (sessions.size >= 128)
          throw new Error("Too many active agent sessions");
        const agentId = createHash("sha256")
          .update(input.identity)
          .digest("hex")
          .slice(0, 32);
        const label =
          input.label
            .replace(/[\x00-\x1f\x7f]/g, "")
            .trim()
            .slice(0, 80) || "Local agent";
        if (!initializing.has(agentId)) {
          if (initializing.size >= 64)
            throw new Error(
              "Too many agent configurations; close unused agents and restart the local bridge",
            );
          const ready = (async () => {
            const data = join(directory, "agents", agentId);
            await mkdir(data, { recursive: true, mode: 0o700 });
            const bridge = new BrowserBridge(data, port, assets, {
              id: agentId,
              label,
            });
            await bridge.start(true);
            bridges.set(agentId, bridge);
            return bridge;
          })();
          initializing.set(agentId, ready);
        }
        await initializing.get(agentId);
        const sessionId = randomBytes(32).toString("hex");
        sessions.set(sessionId, { agentId, seen: Date.now() });
        value = { sessionId, agentId, port, label };
      } else {
        const session = sessions.get(input.sessionId);
        if (!session)
          throw new Error(
            "Agent session expired. Retry this request to reconnect; do not automatically repeat writes.",
          );
        session.seen = Date.now();
        const bridge = bridges.get(session.agentId)!;
        if (input.operation === "status")
          value = {
            connected: bridge.connected,
            port,
            agentId: session.agentId,
          };
        else if (input.operation === "connect")
          value = bridge.connectionInvitation();
        else if (input.operation === "pair") value = bridge.pairCode();
        else if (input.operation === "close") {
          bridge.endSession(input.sessionId);
          sessions.delete(input.sessionId);
          value = true;
        } else if (input.operation === "call") {
          if (typeof input.method !== "string")
            throw new Error("Invalid operation");
          const timeout = Number.isInteger(input.timeout)
            ? Math.max(1000, Math.min(150000, input.timeout))
            : 45000;
          value = await bridge.call(
            input.method,
            input.args,
            timeout,
            input.sessionId,
          );
        } else throw new Error("Unknown local bridge request");
      }
      res.end(JSON.stringify({ ok: true, value }));
    } catch (error) {
      res.end(
        JSON.stringify({
          ok: false,
          error:
            error instanceof Error ? error.message : "Bridge request failed",
        }),
      );
    }
  })();
});
http.requestTimeout = 10000;
http.on("upgrade", (req, socket, head) => {
  const id = /^\/agents\/([a-f0-9]{32})$/.exec(req.url ?? "")?.[1];
  const bridge = id ? bridges.get(id) : undefined;
  if (!bridge) {
    socket.destroy();
    return;
  }
  bridge.upgrade(req, socket, head);
});
async function listen(selected: number) {
  await new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => {
      http.off("listening", ready);
      reject(error);
    };
    const ready = () => {
      http.off("error", fail);
      resolve();
    };
    http.once("error", fail);
    http.once("listening", ready);
    http.listen(selected, "127.0.0.1");
  });
}
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await Promise.all([...bridges.values()].map((b) => b.close()));
  http.closeAllConnections();
  http.close();
  // Retain the private descriptor so the next host can reuse the approved port.
  await unlink(lockPath).catch(() => {});
  process.exit(0);
}
try {
  try {
    await listen(requestedPort);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    // Never kill an old preview or another program holding the preferred port.
    await listen(0);
  }
  port = (http.address() as { port: number }).port;
  landing = new BrowserBridge(directory, port, assets);
  const endpoint = {
    protocol: SHARED_BRIDGE_PROTOCOL,
    port,
    secret,
    pid: process.pid,
  };
  await writeFile(join(directory, "endpoint.tmp"), JSON.stringify(endpoint), {
    mode: 0o600,
  });
  await rename(
    join(directory, "endpoint.tmp"),
    join(directory, "endpoint.json"),
  );
  setInterval(() => {
    for (const [id, session] of sessions)
      if (Date.now() - session.seen > 45000) {
        bridges.get(session.agentId)?.endSession(id);
        sessions.delete(id);
      }
    if (!sessions.size && Date.now() - lastUsed > 60000) void close();
  }, 10000);
  process.on("SIGTERM", () => void close());
  process.on("SIGINT", () => void close());
} catch (error) {
  await writeFile(
    join(directory, "startup-error.txt"),
    error instanceof Error ? error.message : "Bridge startup failed",
    { mode: 0o600 },
  ).catch(() => {});
  await close();
}
