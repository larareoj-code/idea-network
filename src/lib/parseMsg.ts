import MsgReader from "@kenjiuno/msgreader";
import type { Message, Participant } from "./types";
import { hashMessage, isLowSignal, makeParticipant } from "./parseOutlookCsv";
import { cleanRfcId, parseReplyHeaders } from "./headers";

/** Parse a single Outlook .msg file (CFB format, drag-out from Outlook). */
export function parseMsg(buffer: ArrayBuffer, source: string): Message[] {
  const data = new MsgReader(buffer).getFileData();
  if (data.error) throw new Error(`${source}: not a valid Outlook .msg file (${data.error})`);

  const subject = (data.subject ?? "").trim();
  const body = (data.body ?? "").trim();
  const senderName = data.senderName ?? "";
  const senderAddr = data.senderSmtpAddress ?? data.senderEmail ?? "";
  const from: Participant | null =
    senderName || senderAddr ? makeParticipant(senderName, senderAddr) : null;

  const to: Participant[] = [];
  const cc: Participant[] = [];
  for (const r of data.recipients ?? []) {
    const p = makeParticipant(r.name ?? "", r.smtpAddress ?? r.email ?? "");
    if (!p.key) continue;
    // recipType: "to" | "cc" | "bcc" (msgreader normalizes MAPI recipient types)
    if (r.recipType === "cc") cc.push(p);
    else if (r.recipType !== "bcc") to.push(p);
  }

  let date: string | undefined;
  if (data.messageDeliveryTime) {
    const d = new Date(data.messageDeliveryTime);
    if (!Number.isNaN(d.getTime())) date = d.toISOString();
  } else if (data.clientSubmitTime) {
    const d = new Date(data.clientSubmitTime);
    if (!Number.isNaN(d.getTime())) date = d.toISOString();
  }

  // PidTagTransportMessageHeaders carries the raw RFC-822 header block for
  // received mail; sent items often lack it, so PidTagInternetMessageId fills in.
  const reply = parseReplyHeaders(data.headers);
  const messageId = reply.messageId ?? cleanRfcId(data.messageId);

  return [
    {
      id: hashMessage(subject, body, from?.address ?? "", [...to, ...cc].map((p) => p.key), date ?? ""),
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
      messageId,
      inReplyTo: reply.inReplyTo,
      references: reply.references,
    },
  ];
}
