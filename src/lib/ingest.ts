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
