import { parseFile } from "../lib/ingest";
import type { ParseWorkerRequest, ParseWorkerMessage } from "../lib/ingest";

const post = (m: ParseWorkerMessage) => self.postMessage(m);

self.onmessage = async (e: MessageEvent<ParseWorkerRequest>) => {
  const { files } = e.data;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    post({ type: "progress", index: i, total: files.length, name: file.name });
    try {
      const { name, messages } = await parseFile(file);
      post({ type: "file", name, messages });
    } catch (err) {
      post({ type: "file", name: file.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  post({ type: "done" });
};
