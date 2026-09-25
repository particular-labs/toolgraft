import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { Duplex } from "node:stream";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { PROTOCOL_VERSION } from "@toolgraft/agent-core";
const same = (a: unknown, b: string) =>
  typeof a === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export class BrowserBridge {
  private http = createServer((req, res) => {
    void (async () => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      );
      if (
        req.method !== "GET" ||
        req.headers.host !== `127.0.0.1:${this.port}` ||
        (req.headers.origin &&
          req.headers.origin !== `http://127.0.0.1:${this.port}`)
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      const files: Record<string, [string, string]> = {
        "/connect": ["connection.html", "text/html; charset=utf-8"],
        "/connect-assets/connection.css": ["connection.css", "text/css"],
        "/connect-assets/brand.css": ["brand.css", "text/css"],
        "/connect-assets/fonts.css": ["fonts.css", "text/css"],
        "/connect-assets/fonts/manrope.ttf": ["fonts/manrope.ttf", "font/ttf"],
        "/connect-assets/fonts/dm-mono.ttf": ["fonts/dm-mono.ttf", "font/ttf"],
        "/connect-assets/fonts/dm-mono-medium.ttf": [
          "fonts/dm-mono-medium.ttf",
          "font/ttf",
        ],
        "/connect-assets/icon.svg": ["icon.svg", "image/svg+xml"],
      };
      const entry = files[req.url ?? ""];
      if (!entry || !this.assets) {
        res.writeHead(404);
        res.end();
        return;
      }
      try {
        const body = await readFile(join(this.assets, entry[0]));
        res.writeHead(200, { "Content-Type": entry[1] });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end();
      }
    })();
  });
  private wss = new WebSocketServer({
    noServer: true,
    maxPayload: 2 * 1024 * 1024,
  });
  private socket: WebSocket | undefined;
  private credentials: { token: string; extensionId: string } | undefined;
  private pending = new Map<
    string,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      owner?: string;
    }
  >();
  private invitation = "";
  private invitationExpires = 0;
  private code = "";
  private expires = 0;
  private attempts = 0;
  constructor(
    private directory: string,
    readonly port: number,
    private assets?: string,
    private agent?: { id: string; label: string },
  ) {}
  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }
  connectionInvitation() {
    this.invitation = randomBytes(32).toString("hex");
    this.invitationExpires = Date.now() + 300000;
    return {
      url: `http://127.0.0.1:${this.port}/connect#ticket=${this.invitation}${this.agent ? `&agent=${this.agent.id}&label=${encodeURIComponent(this.agent.label)}` : ""}`,
      expiresAt: new Date(this.invitationExpires).toISOString(),
      nextAction:
        "Open this private link in the browser with ToolGraft, then click the ToolGraft toolbar icon and Connect this agent. Opening the link does not approve the connection. Never share or log the link.",
    };
  }
  pairCode() {
    if (Date.now() > this.expires || this.attempts >= 5) {
      this.code = String(randomInt(10000000, 99999999));
      this.expires = Date.now() + 300000;
      this.attempts = 0;
    }
    return {
      code: this.code,
      port: this.port,
      ...(this.agent
        ? { agentId: this.agent.id, label: this.agent.label }
        : {}),
      expiresAt: new Date(this.expires).toISOString(),
      nextAction:
        "Enter this code in ToolGraft → Connect your agent. Do not paste it into a website.",
    };
  }
  serve(req: IncomingMessage, res: ServerResponse) {
    this.http.emit("request", req, res);
  }
  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const origin = req.headers.origin ?? "";
    if (
      !/^chrome-extension:\/\/[a-p]{32}$/.test(origin) ||
      req.headers.host !== `127.0.0.1:${this.port}` ||
      req.url !== (this.agent ? `/agents/${this.agent.id}` : "/")
    ) {
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) =>
      this.accept(ws, origin.slice("chrome-extension://".length)),
    );
  }
  async start(shared = false) {
    try {
      const v = JSON.parse(
        await readFile(join(this.directory, "connection.json"), "utf8"),
      );
      if (typeof v.token === "string" && typeof v.extensionId === "string")
        this.credentials = v;
    } catch {}
    if (shared) return;
    this.http.on("upgrade", (req, socket, head) =>
      this.upgrade(req, socket, head),
    );
    await new Promise<void>((resolve, reject) => {
      this.http.once("error", reject);
      this.http.listen(this.port, "127.0.0.1", () => resolve());
    });
  }
  private accept(ws: WebSocket, extensionId: string) {
    let authenticated = false;
    const authTimeout = setTimeout(() => ws.close(), 5000);
    ws.on("message", async (bytes) => {
      try {
        const m = JSON.parse(bytes.toString());
        if (!authenticated) {
          if (m.type === "invite" || m.type === "pair") {
            if (m.type === "invite") {
              if (
                !this.invitation ||
                Date.now() >= this.invitationExpires ||
                !same(m.ticket, this.invitation)
              )
                throw new Error("Invalid connection invitation");
              this.invitation = "";
              this.invitationExpires = 0;
            } else {
              this.attempts++;
              if (
                this.attempts > 5 ||
                Date.now() > this.expires ||
                !this.code ||
                !same(m.code, this.code)
              )
                throw new Error("Invalid pairing code");
            }
            this.invitation = "";
            this.invitationExpires = 0;
            this.code = "";
            this.expires = 0;
            this.credentials = {
              extensionId,
              token: randomBytes(32).toString("hex"),
            };
            await writeFile(
              join(this.directory, "connection.json"),
              JSON.stringify(this.credentials),
              { mode: 0o600 },
            );
          } else if (
            m.type !== "auth" ||
            !this.credentials ||
            this.credentials.extensionId !== extensionId ||
            !same(m.token, this.credentials.token)
          )
            throw new Error("Not paired");
          this.socket?.close();
          this.socket = ws;
          authenticated = true;
          clearTimeout(authTimeout);
          ws.send(
            JSON.stringify({
              type: "connected",
              protocol: PROTOCOL_VERSION,
              ...(this.agent ? { agent: this.agent } : {}),
              ...(["pair", "invite"].includes(m.type)
                ? { token: this.credentials!.token }
                : {}),
            }),
          );
          return;
        }
        if (m.type === "revoke" && this.socket === ws) {
          this.credentials = undefined;
          await unlink(join(this.directory, "connection.json")).catch(() => {});
          ws.close();
          return;
        }
        if (m.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }
        if (this.socket !== ws) throw new Error("Superseded connection");
        if (m.type === "response" && typeof m.id === "string") {
          const p = this.pending.get(m.id);
          if (!p) return;
          this.pending.delete(m.id);
          clearTimeout(p.timer);
          m.ok === true
            ? p.resolve(m.value)
            : p.reject(
                new Error(
                  typeof m.error === "string"
                    ? m.error
                    : "Browser operation failed",
                ),
              );
        }
      } catch {
        ws.close(1008, "Connection refused");
      }
    });
    ws.on("close", () => {
      clearTimeout(authTimeout);
      if (this.socket === ws) {
        this.socket = undefined;
        for (const p of this.pending.values()) {
          clearTimeout(p.timer);
          p.reject(
            new Error(
              "Browser disconnected. Outcome may be unknown; do not automatically repeat writes.",
            ),
          );
        }
        this.pending.clear();
      }
    });
    ws.on("error", () => {});
  }
  async call(
    method: string,
    args: unknown,
    timeout = 45000,
    owner?: string,
  ): Promise<unknown> {
    if (!this.connected)
      throw new Error(
        "Browser not connected. Call toolgraft_connect and approve the connection in ToolGraft.",
      );
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            "Browser operation timed out. Do not automatically repeat a write.",
          ),
        );
      }, timeout);
      this.pending.set(id, {
        resolve,
        reject,
        timer,
        ...(owner ? { owner } : {}),
      });
      this.socket!.send(
        JSON.stringify({ type: "request", id, method, args, owner }),
      );
    });
  }
  endSession(owner: string) {
    if (this.connected)
      this.socket!.send(JSON.stringify({ type: "session-ended", owner }));
    for (const [id, p] of this.pending)
      if (p.owner === owner) {
        clearTimeout(p.timer);
        this.pending.delete(id);
        p.reject(
          new Error(
            "Agent session ended. Outcome may be unknown; do not repeat writes.",
          ),
        );
      }
  }
  async close() {
    this.socket?.terminate();
    for (const client of this.wss.clients) client.terminate();
    this.wss.close();
    await new Promise<void>((resolve) => this.http.close(() => resolve()));
  }
}
