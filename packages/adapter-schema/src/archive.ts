import { gzipSync, Gunzip } from "fflate";
import {
  ARCHIVE_LIMIT,
  canonical,
  utf8,
  sha256,
  verifyPackage,
  type Package,
} from "./index.ts";
const text = new TextDecoder("utf-8", { fatal: true });
function octal(n: number, size: number) {
  return n.toString(8).padStart(size - 1, "0") + "\0";
}
export function tar(files: Record<string, string>): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (const name of Object.keys(files).sort()) {
    const body = utf8.encode(files[name]!);
    const h = new Uint8Array(512);
    const put = (s: string, offset: number) => h.set(utf8.encode(s), offset);
    put(name, 0);
    put(octal(420, 8), 100);
    put(octal(0, 8), 108);
    put(octal(0, 8), 116);
    put(octal(body.length, 12), 124);
    put(octal(0, 12), 136);
    put("        ", 148);
    put("0", 156);
    put("ustar\0", 257);
    put("00", 263);
    put(
      octal(
        h.reduce((a, b) => a + b, 0),
        7,
      ) + " ",
      148,
    );
    const data = new Uint8Array(Math.ceil(body.length / 512) * 512);
    data.set(body);
    blocks.push(h, data);
  }
  blocks.push(new Uint8Array(1024));
  const output = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const block of blocks) {
    output.set(block, at);
    at += block.length;
  }
  return gzipSync(output, { mtime: 0, level: 9 });
}
export function untar(bytes: Uint8Array) {
  if (bytes.length > ARCHIVE_LIMIT) throw new Error("Archive exceeds 1 MiB");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const g = new Gunzip((chunk) => {
    size += chunk.length;
    if (size > ARCHIVE_LIMIT) throw new Error("Expanded archive exceeds 1 MiB");
    chunks.push(chunk);
  });
  for (let n = 0; n < bytes.length; n += 512)
    g.push(bytes.subarray(n, n + 512), n + 512 >= bytes.length);
  const out = new Uint8Array(size);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  const result: Record<string, string> = Object.create(null);
  const allowed = [
    "manifest.json",
    "bundle.js",
    "webmcp-package.json",
    "checksums.json",
    "LICENSE",
    "NOTICE",
  ];
  const str = (b: Uint8Array) => text.decode(b).replace(/\0.*$/s, "");
  for (let at = 0; at + 512 <= out.length;) {
    const h = out.subarray(at, at + 512);
    if (h.every((b) => b === 0)) break;
    const name = str(h.subarray(0, 100));
    if (
      !allowed.includes(name) ||
      Object.hasOwn(result, name) ||
      str(h.subarray(345, 500))
    )
      throw new Error("Unexpected or duplicate archive path");
    if (h[156] !== 48 && h[156] !== 0)
      throw new Error("Only ordinary files are allowed");
    const expected = parseInt(str(h.subarray(148, 156)).trim(), 8);
    const sum = h.reduce((n, b, i) => n + (i >= 148 && i < 156 ? 32 : b), 0);
    if (expected !== sum) throw new Error("Invalid tar checksum");
    const len = parseInt(str(h.subarray(124, 136)), 8);
    if (!Number.isSafeInteger(len) || len < 0 || at + 512 + len > out.length)
      throw new Error("Invalid tar size");
    result[name] = text.decode(out.subarray(at + 512, at + 512 + len));
    at += 512 + Math.ceil(len / 512) * 512;
  }
  return result;
}
export async function pack(p: Package) {
  await verifyPackage(p);
  if (gzipSync(utf8.encode(p.payload)).length > 250 * 1024)
    throw new Error("Payload exceeds 250 KiB compressed");
  const files: Record<string, string> = {
    "manifest.json": canonical(p.manifest),
    [p.manifest.runtime.kind === "script"
      ? "bundle.js"
      : "webmcp-package.json"]: p.payload,
    LICENSE: p.license,
    NOTICE: p.notice,
  };
  const hashes = Object.fromEntries(
    await Promise.all(
      Object.entries(files).map(async ([k, v]) => [k, await sha256(v)]),
    ),
  );
  files["checksums.json"] = canonical(hashes);
  return tar(files);
}
export async function unpack(bytes: Uint8Array): Promise<Package> {
  const files = untar(bytes);
  const hashes = JSON.parse(files["checksums.json"] ?? "null");
  if (!hashes || typeof hashes !== "object")
    throw new Error("Missing checksums");
  for (const [k, v] of Object.entries(files)) {
    if (k !== "checksums.json" && hashes[k] !== (await sha256(v)))
      throw new Error(`Checksum mismatch: ${k}`);
  }
  const manifest = JSON.parse(files["manifest.json"] ?? "null");
  const key =
    manifest?.runtime?.kind === "script" ? "bundle.js" : "webmcp-package.json";
  if (Object.keys(files).length !== 5 || files[key] === undefined)
    throw new Error("Invalid package contents");
  return verifyPackage({
    manifest,
    payload: files[key],
    license: files.LICENSE ?? "",
    notice: files.NOTICE ?? "",
  });
}
