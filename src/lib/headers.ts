/**
 * Shared RFC-822 header utilities used by the .eml parser and by the raw
 * transport-header blocks that .msg (PidTagTransportMessageHeaders) and .pst
 * sources expose.
 */

export function unfoldHeaders(raw: string): Map<string, string> {
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

export interface ReplyHeaders {
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
}

/** Strip angle brackets and whitespace from an RFC 2822 msg-id token. */
export function cleanRfcId(raw: string | undefined | null): string | undefined {
  const id = (raw ?? "").replace(/[<>\s]/g, "");
  return id || undefined;
}

function splitRfcIds(value: string): string[] {
  const angled = value.match(/<[^>]*>/g);
  const tokens = angled ?? value.split(/\s+/);
  const out: string[] = [];
  for (const t of tokens) {
    const id = cleanRfcId(t);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export function extractReplyHeaders(headers: Map<string, string>): ReplyHeaders {
  const messageId = cleanRfcId(headers.get("message-id"));
  const inReplyTo = splitRfcIds(headers.get("in-reply-to") ?? "")[0];
  const references = splitRfcIds(headers.get("references") ?? "");
  return {
    messageId,
    inReplyTo,
    references: references.length > 0 ? references : undefined,
  };
}

/** Parse the three reply headers out of a raw header block (msg/pst sources). */
export function parseReplyHeaders(rawBlock: string | undefined | null): ReplyHeaders {
  if (!rawBlock) return {};
  return extractReplyHeaders(unfoldHeaders(rawBlock));
}
