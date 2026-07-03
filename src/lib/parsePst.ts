import { Buffer } from "buffer";
import type { Message, Participant } from "./types";
import { hashMessage, isLowSignal, makeParticipant } from "./parseOutlookCsv";
import { cleanRfcId, parseReplyHeaders } from "./headers";

/**
 * Parse an Outlook .pst data file (File → Import/Export → "Outlook Data
 * File"). Walks every folder and extracts IPM.Note messages. PST files carry
 * real timestamps — unlike CSV exports — so messages get exact dates.
 *
 * pst-extractor is Node-oriented and heavy, so it is imported lazily (and the
 * vite node-polyfills plugin provides Buffer in the browser).
 */

const MAX_MESSAGES = 20_000;

interface PstRecipientLike {
  displayName?: string;
  smtpAddress?: string;
  emailAddress?: string;
  recipientType?: number;
}

interface PstMessageLike {
  messageClass?: string;
  subject?: string;
  body?: string;
  senderName?: string;
  senderEmailAddress?: string;
  messageDeliveryTime?: Date | null;
  clientSubmitTime?: Date | null;
  importance?: number;
  numberOfRecipients?: number;
  transportMessageHeaders?: string;
  internetMessageId?: string;
  inReplyToId?: string;
  getRecipient(i: number): PstRecipientLike;
}

interface PstFolderLike {
  displayName?: string;
  hasSubfolders: boolean;
  contentCount: number;
  getSubFolders(): PstFolderLike[];
  getNextChild(): PstMessageLike | null;
}

const MAPI_TO = 1;
const MAPI_CC = 2;

function toParticipant(r: PstRecipientLike): Participant | null {
  const name = (r.displayName ?? "").trim();
  const addr = (r.smtpAddress ?? r.emailAddress ?? "").trim();
  if (!name && !addr) return null;
  return makeParticipant(name, addr);
}

function convertMessage(pstMsg: PstMessageLike, source: string): Message | null {
  if (pstMsg.messageClass && !pstMsg.messageClass.startsWith("IPM.Note")) return null;
  const subject = (pstMsg.subject ?? "").trim();
  const body = (pstMsg.body ?? "").trim();
  const senderName = pstMsg.senderName ?? "";
  const senderAddr = pstMsg.senderEmailAddress ?? "";
  if (!subject && !body && !senderName) return null;

  const from = senderName || senderAddr ? makeParticipant(senderName, senderAddr) : null;
  const to: Participant[] = [];
  const cc: Participant[] = [];
  const count = pstMsg.numberOfRecipients ?? 0;
  for (let i = 0; i < count; i++) {
    let r: PstRecipientLike;
    try {
      r = pstMsg.getRecipient(i);
    } catch {
      continue;
    }
    const p = toParticipant(r);
    if (!p) continue;
    if (r.recipientType === MAPI_CC) cc.push(p);
    else if (r.recipientType === MAPI_TO || r.recipientType === undefined) to.push(p);
  }

  const when = pstMsg.messageDeliveryTime ?? pstMsg.clientSubmitTime;
  const date = when && !Number.isNaN(when.getTime()) ? when.toISOString() : undefined;

  const reply = parseReplyHeaders(pstMsg.transportMessageHeaders);
  const messageId = reply.messageId ?? cleanRfcId(pstMsg.internetMessageId);
  const inReplyTo = reply.inReplyTo ?? cleanRfcId(pstMsg.inReplyToId);

  return {
    id: hashMessage(subject, body, from?.address ?? "", [...to, ...cc].map((p) => p.key), date ?? ""),
    subject,
    body,
    from,
    to,
    cc,
    importance: pstMsg.importance === 2 ? "High" : pstMsg.importance === 0 ? "Low" : "Normal",
    categories: "",
    source,
    lowSignal: isLowSignal(subject, body),
    date,
    messageId,
    inReplyTo,
    references: reply.references,
  };
}

function walkFolder(folder: PstFolderLike, source: string, out: Message[]): void {
  if (out.length >= MAX_MESSAGES) return;
  if (folder.contentCount > 0) {
    let child = folder.getNextChild();
    while (child !== null && out.length < MAX_MESSAGES) {
      const msg = convertMessage(child, source);
      if (msg) out.push(msg);
      child = folder.getNextChild();
    }
  }
  if (folder.hasSubfolders) {
    for (const sub of folder.getSubFolders()) walkFolder(sub, source, out);
  }
}

export async function parsePst(buffer: ArrayBuffer, source: string): Promise<Message[]> {
  const { PSTFile } = await import("pst-extractor");
  let pst: InstanceType<typeof PSTFile>;
  try {
    pst = new PSTFile(Buffer.from(buffer));
  } catch (e) {
    throw new Error(
      `${source}: could not open as a PST file — ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const out: Message[] = [];
  // pst-extractor console.errors once per non-mail item (contacts, calendar);
  // silence just that noise for the duration of the walk.
  const originalError = console.error;
  let suppressed = 0;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("PSTUtil")) {
      suppressed += 1;
      return;
    }
    originalError(...args);
  };
  try {
    walkFolder(pst.getRootFolder() as unknown as PstFolderLike, source, out);
  } finally {
    console.error = originalError;
  }
  if (suppressed > 0) console.info(`${source}: skipped ${suppressed} non-mail items (contacts, calendar, …)`);
  return out;
}
