import type { Message } from "./types";
import { parseOutlookCsv } from "./parseOutlookCsv";
import { parseEml } from "./parseEml";
import { parseMsg } from "./parseMsg";
import { parsePst } from "./parsePst";

/** Every file type the upload paths accept. */
export const ACCEPTED_EXTENSIONS = [".csv", ".pst", ".msg", ".eml"] as const;
export const FILE_ACCEPT = ACCEPTED_EXTENSIONS.join(",");

export interface IngestItem {
  name: string;
  messages: Message[];
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export interface ParseProgress {
  index: number;
  total: number;
  name: string;
}

export interface ParseBatchResult {
  items: IngestItem[];
  errors: string[];
}

export interface ParseWorkerRequest {
  files: File[];
}

export type ParseWorkerMessage =
  | { type: "progress"; index: number; total: number; name: string }
  | { type: "file"; name: string; messages?: Message[]; error?: string }
  | { type: "done" };

async function parseFilesSequential(
  files: File[],
  onProgress?: (p: ParseProgress) => void,
): Promise<ParseBatchResult> {
  const items: IngestItem[] = [];
  const errors: string[] = [];
  for (let i = 0; i < files.length; i++) {
    onProgress?.({ index: i, total: files.length, name: files[i].name });
    try {
      items.push(await parseFile(files[i]));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { items, errors };
}

/**
 * Parse a batch of uploaded files off the main thread. Files are posted to a
 * module worker (File objects are structured-cloneable); if the worker itself
 * fails to boot, the whole batch falls back to main-thread parsing.
 */
export function parseFiles(
  files: File[],
  onProgress?: (p: ParseProgress) => void,
): Promise<ParseBatchResult> {
  if (typeof Worker === "undefined") return parseFilesSequential(files, onProgress);
  return new Promise((resolve) => {
    const worker = new Worker(new URL("../workers/parseWorker.ts", import.meta.url), {
      type: "module",
    });
    const items: IngestItem[] = [];
    const errors: string[] = [];
    let settled = false;
    const finish = (result: ParseBatchResult | Promise<ParseBatchResult>) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve(result);
    };
    worker.onmessage = (e: MessageEvent<ParseWorkerMessage>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        onProgress?.({ index: msg.index, total: msg.total, name: msg.name });
      } else if (msg.type === "file") {
        if (msg.error !== undefined) errors.push(msg.error);
        else items.push({ name: msg.name, messages: msg.messages ?? [] });
      } else {
        finish({ items, errors });
      }
    };
    worker.onerror = () => finish(parseFilesSequential(files, onProgress));
    worker.postMessage({ files } satisfies ParseWorkerRequest);
  });
}

/** Parse one uploaded file into messages, dispatching on its extension. */
export async function parseFile(file: File): Promise<IngestItem> {
  const ext = extension(file.name);
  switch (ext) {
    case ".csv": {
      const messages = parseOutlookCsv(await file.text(), file.name);
      if (messages.length === 0) {
        throw new Error(`${file.name}: no messages found — is this an Outlook CSV export?`);
      }
      return { name: file.name, messages };
    }
    case ".eml": {
      const messages = parseEml(await file.text(), file.name);
      if (messages.length === 0) throw new Error(`${file.name}: could not read this .eml file.`);
      return { name: file.name, messages };
    }
    case ".msg":
      return { name: file.name, messages: parseMsg(await file.arrayBuffer(), file.name) };
    case ".pst": {
      const messages = await parsePst(await file.arrayBuffer(), file.name);
      if (messages.length === 0) throw new Error(`${file.name}: no mail messages found in this PST.`);
      return { name: file.name, messages };
    }
    default:
      throw new Error(
        `${file.name}: unsupported file type "${ext || "(none)"}" — expected ${ACCEPTED_EXTENSIONS.join(", ")}.`,
      );
  }
}
