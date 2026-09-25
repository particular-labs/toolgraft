import { spawn } from "node:child_process";
import { mkdir, readFile, stat, unlink, open } from "node:fs/promises";
import { join } from "node:path";
import { SHARED_BRIDGE_PROTOCOL } from "@toolgraft/agent-core";

type Endpoint = { protocol: number; port: number; secret: string; pid: number };
type Registration = {
  sessionId: string;
  agentId: string;
  port: number;
  label: string;
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
export class SharedBridge {
  private endpoint: Endpoint | undefined;
  private registration: Registration | undefined;
  private starting: Promise<void> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  constructor(
    private directory: string,
    private preferredPort: number,
    private hostFile: string,
    private identity: () => { identity: string; label: string },
  ) {}
  private async rpc(
    endpoint: Endpoint,
    operation: string,
    data: Record<string, unknown> = {},
    timeout = 10000,
  ): Promise<any> {
    const res = await fetch(`http://127.0.0.1:${endpoint.port}/rpc`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${endpoint.secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operation, ...data }),
      signal: AbortSignal.timeout(timeout),
      redirect: "error",
    });
    if (!res.ok)
      throw new Error("Cannot authenticate the local ToolGraft bridge");
    const result = (await res.json()) as any;
    if (!result?.ok)
      throw new Error(result?.error ?? "Local bridge request failed");
    return result.value;
  }
  private async discover() {
    try {
      const e = JSON.parse(
        await readFile(join(this.directory, "endpoint.json"), "utf8"),
      ) as Endpoint;
      if (
        e.protocol !== SHARED_BRIDGE_PROTOCOL ||
        !Number.isInteger(e.port) ||
        e.port < 1024 ||
        e.port > 65535 ||
        !/^[a-f0-9]{64}$/.test(e.secret)
      )
        return;
      const health = await this.rpc(e, "health", {}, 1000);
      if (health.protocol === SHARED_BRIDGE_PROTOCOL) return e;
    } catch {}
  }
  private async start() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    let endpoint = await this.discover();
    if (!endpoint) {
      const lock = join(this.directory, "host.lock");
      // Serialize stale-lock recovery as well as host election. A second starter
      // must never unlink a new host's lock after observing the old dead PID.
      let recovery;
      try {
        recovery = await open(lock + ".recovery", "wx", 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      if (recovery) {
        try {
          const before = await readFile(lock, "utf8").catch(() => "");
          let dead = false;
          try {
            const meta = JSON.parse(before);
            if (Number.isInteger(meta.pid) && meta.pid > 0) {
              try {
                process.kill(meta.pid, 0);
              } catch (error) {
                dead = (error as NodeJS.ErrnoException).code === "ESRCH";
              }
            }
          } catch {
            dead = await stat(lock).then(
              (s) => Date.now() - s.mtimeMs > 15000,
              () => false,
            );
          }
          if (dead && (await readFile(lock, "utf8").catch(() => "")) === before)
            await unlink(lock).catch(() => {});
        } finally {
          await recovery.close();
          await unlink(lock + ".recovery").catch(() => {});
        }
      }
      const previous = await readFile(
        join(this.directory, "endpoint.json"),
        "utf8",
      )
        .then(
          (s) => JSON.parse(s),
          () => null,
        )
        .catch(() => null);
      const preferredPort =
        previous?.protocol === SHARED_BRIDGE_PROTOCOL &&
        Number.isInteger(previous.port) &&
        previous.port >= 1024 &&
        previous.port <= 65535
          ? previous.port
          : this.preferredPort;
      const child = spawn(
        process.execPath,
        [this.hostFile, this.directory, String(preferredPort)],
        { detached: true, stdio: "ignore", windowsHide: true },
      );
      let spawnError: Error | undefined;
      child.once("error", (error) => {
        spawnError = error;
      });
      child.unref();
      const deadline = Date.now() + 15000;
      while (!endpoint && Date.now() < deadline) {
        if (spawnError)
          throw new Error("Could not start the bundled local bridge");
        await pause(100);
        endpoint = await this.discover();
      }
      if (!endpoint)
        throw new Error(
          "The local ToolGraft bridge could not start. Restart this MCP connection; do not stop other agents.",
        );
    }
    this.endpoint = endpoint;
    this.registration = await this.rpc(endpoint, "register", this.identity());
    if (!this.heartbeat)
      this.heartbeat = setInterval(() => {
        if (this.endpoint && this.registration)
          void this.rpc(this.endpoint, "status", {
            sessionId: this.registration.sessionId,
          }).catch(() => {
            this.registration = undefined;
          });
      }, 10000);
  }
  private async ready() {
    if (this.registration && this.endpoint) {
      try {
        await this.rpc(
          this.endpoint,
          "status",
          { sessionId: this.registration.sessionId },
          1500,
        );
        return;
      } catch {
        this.registration = undefined;
      }
    }
    this.starting ??= this.start().finally(() => {
      this.starting = undefined;
    });
    await this.starting;
  }
  private async request(
    operation: string,
    data: Record<string, unknown> = {},
    timeout = 10000,
  ) {
    await this.ready();
    // Never replay a browser operation after a transport failure.
    return this.rpc(
      this.endpoint!,
      operation,
      { ...data, sessionId: this.registration!.sessionId },
      timeout,
    );
  }
  status() {
    return this.request("status");
  }
  connectionInvitation() {
    return this.request("connect");
  }
  pairCode() {
    return this.request("pair");
  }
  call(method: string, args: unknown, timeout = 45000): Promise<any> {
    return this.request("call", { method, args, timeout }, timeout + 5000);
  }
  async close() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.endpoint && this.registration)
      await this.rpc(this.endpoint, "close", {
        sessionId: this.registration.sessionId,
      }).catch(() => {});
    this.registration = undefined;
  }
}
