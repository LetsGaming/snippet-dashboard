/* ============================================================
   Plan als Textcode

   Base64url über einen komprimierten Strom. Der Transport prüft nichts: was aus einem
   Code kommt, ist erst einmal Fremdtext und geht durch planguard.js, bevor es ein Plan
   wird. Vom Dokument braucht er nur den Vorgabewert für „den aktuellen Plan".
   ============================================================ */
import { planSnapshot } from "./snapshot.js";

const CODE_RE = /^\s*R34([01]):([A-Za-z0-9_-]+)\s*$/;


function toBase64Url(bytes) {
  let s = "";
  // In Blöcken, sonst sprengt ein langer Plan das Argumentlimit von String.fromCharCode
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}


function fromBase64Url(text) {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}


async function through(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}


/** Den Plan als Textcode. Fällt auf ungepackt zurück, wenn der Browser nicht packen kann. */
async function encodeSnapshot(snap = planSnapshot()) {
  const bytes = new TextEncoder().encode(JSON.stringify(snap));
  try {
    if (typeof CompressionStream !== "function") throw new Error("kein Packer");
    const packed = await through(bytes, new CompressionStream("gzip"));
    return "R341:" + toBase64Url(packed);
  } catch {
    return "R340:" + toBase64Url(bytes);
  }
}


/** Einen Textcode zurück in einen Schnappschuss. Wirft nicht, sondern gibt null. */
async function decodeSnapshot(text) {
  const m = CODE_RE.exec(String(text ?? ""));
  if (!m) return null;
  try {
    let bytes = fromBase64Url(m[2]);
    if (m[1] === "1")
      bytes = await through(bytes, new DecompressionStream("gzip"));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
export { CODE_RE, encodeSnapshot, decodeSnapshot };
