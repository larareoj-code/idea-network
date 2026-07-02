import type { Message, Participant } from "./types";
import { hashMessage, isLowSignal, makeParticipant } from "./parseOutlookCsv";

/**
 * Minimal RFC-822/MIME parser for .eml files (Outlook "save as" / drag-out
 * from other clients). Handles folded headers, quoted-printable and base64
 * text bodies, and picks the first text/plain part of multipart messages.
 */

function unfoldHeaders(raw: string): Map<string, string> {
  const headers = new Map<string, string>();
  const lines = raw.split(/\r?\n/);
  let current = "";
  const commit = () => {
    const idx = current.indexOf(":");
    if (idx > 0) {
      const key = current.slice(0, idx).trim().toLowerCase();
      const value = current.slice(idx + 1).trim();
      // Keep the first occurrence (Received etc. repeat; we don't need them).
      if (!headers.has(key)) headers.set(key, value);
    }
  };
  for (const line of lines) {
    if (/^[ \t]/.test(line) && current) {
      current += " " + line.trim();
    } else {
      if (current) commit();
      current = line;
    }
  }
  if (current) commit();
  return headers;
}

/** Decode RFC 2047 encoded-words in header values: =?utf-8?B?...?= / =?utf-8?Q?...?= */
function decodeHeaderValue(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, _charset, enc: string, text: string) => {
    try {
      if (enc.toUpperCase() === "B") return decodeBase64(text);
      return decodeQuotedPrintable(text.replace(/_/g, " "));
    } catch {
      return text;
    }
  });
}

function decodeBase64(text: string): string {
  const bin = atob(text.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function decodeQuotedPrintable(text: string): string {
  const joined = text.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    if (joined[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(joined.charCodeAt(i));
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
}

/** "Display Name <addr@x>" | "addr@x" | '"Last, First" <addr@x>' → Participant */
function parseAddress(raw: string): Participant | null {
  const s = decodeHeaderValue(raw).trim();
  if (!s) return null;
  const angle = s.match(/^(.*?)<([^>]+)>/);
  if (angle) {
    const name = angle[1].trim().replace(/^"+|"+$/g, "");
    const addr = angle[2].trim();
    return makeParticipant(name || addr, addr);
  }
  return makeParticipant(s, s.includes("@") ? s : "");
}

/** Split an address header on commas that are outside quotes and angle brackets. */
function splitAddresses(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (const ch of value) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "<" && !quoted) depth++;
    else if (ch === ">" && !quoted) depth = Math.max(0, depth - 1);
    if (ch === "," && !quoted && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function extractTextBody(headers: Map<string, string>, rawBody: string): string {
  const contentType = headers.get("content-type") ?? "text/plain";
  const encoding = (headers.get("content-transfer-encoding") ?? "").toLowerCase();

  const boundaryMatch = contentType.match(/boundary\s*=\s*"?([^";]+)"?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = rawBody.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?`));
    let fallback = "";
    for (const part of parts) {
      const split = part.split(/\r?\n\r?\n/);
      if (split.length < 2) continue;
      const partHeaders = unfoldHeaders(split[0]);
      const partBody = split.slice(1).join("\n\n");
      const type = partHeaders.get("content-type") ?? "text/plain";
      if (/text\/plain/i.test(type)) return extractTextBody(partHeaders, partBody);
      if (/text\/html/i.test(type) && !fallback) {
        fallback = extractTextBody(partHeaders, partBody)
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/[ \t]+/g, " ");
      }
      if (/multipart\//i.test(type)) {
        const nested = extractTextBody(partHeaders, partBody);
        if (nested) return nested;
      }
    }
    return fallback.trim();
  }

  if (encoding === "base64") {
    try {
      return decodeBase64(rawBody);
    } catch {
      return rawBody;
    }
  }
  if (encoding === "quoted-printable") return decodeQuotedPrintable(rawBody);
  return rawBody;
}

export function parseEml(text: string, source: string): Message[] {
  const headerEnd = text.search(/\r?\n\r?\n/);
  if (headerEnd === -1) return [];
  const headers = unfoldHeaders(text.slice(0, headerEnd));
  if (!headers.has("from") && !headers.has("subject") && !headers.has("to")) return [];

  const subject = decodeHeaderValue(headers.get("subject") ?? "").trim();
  const body = extractTextBody(headers, text.slice(headerEnd).replace(/^\r?\n\r?\n/, "")).trim();
  const from = headers.has("from") ? parseAddress(headers.get("from")!) : null;
  const to = splitAddresses(headers.get("to") ?? "")
    .map(parseAddress)
    .filter((p): p is Participant => p !== null);
  const cc = splitAddresses(headers.get("cc") ?? "")
    .map(parseAddress)
    .filter((p): p is Participant => p !== null);

  let date: string | undefined;
  const rawDate = headers.get("date");
  if (rawDate) {
    const d = new Date(rawDate);
    if (!Number.isNaN(d.getTime())) date = d.toISOString();
  }

  return [
    {
      id: hashMessage(subject, body, from?.address ?? ""),
      subject,
      body,
      from,
      to,
      cc,
      importance: "",
      categories: "",
      source,
      lowSignal: isLowSignal(subject, body),
      date,
    },
  ];
}
