/**
 * Tauri file-system bridge.
 * When running in a browser the functions fall back gracefully:
 *   - openFiles → returns null (use drag-drop instead)
 *   - saveProject/openProject → download/upload blobs
 */

declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && !!window.__TAURI__;
}

type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
type DialogOpen = (opts: {
  title?: string;
  multiple?: boolean;
  filters?: { name: string; extensions: string[] }[];
}) => Promise<string | string[] | null>;

function getInvoke(): TauriInvoke {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).__TAURI__.core.invoke as TauriInvoke;
}

function getDialogOpen(): DialogOpen {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).__TAURI__.dialog.open as DialogOpen;
}

/** Open native file picker. Returns selected File objects (Tauri) or null (browser). */
export async function openFiles(opts: {
  multiple?: boolean;
  filters?: { name: string; extensions: string[] }[];
}): Promise<File[] | null> {
  if (!isTauri()) return null;

  const paths = await getDialogOpen()({
    title: "Open email export files",
    multiple: opts.multiple ?? true,
    filters: opts.filters ?? [
      { name: "Email exports", extensions: ["csv", "pst", "msg", "eml"] },
      { name: "Idea Network project", extensions: ["ideanet.json"] },
    ],
  });

  if (!paths) return null;
  const pathList = Array.isArray(paths) ? paths : [paths];

  const invoke = getInvoke();
  return Promise.all(
    pathList.map(async (path) => {
      const bytes = await invoke<number[]>("read_file_bytes", { path });
      const uint8 = new Uint8Array(bytes);
      const name = path.split(/[\\/]/).pop() ?? path;
      return new File([uint8], name);
    }),
  );
}

/** Save project to a file. In Tauri: native save dialog. In browser: download. */
export async function saveProject(json: string): Promise<void> {
  if (isTauri()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const savePath = await (window as any).__TAURI__.dialog.save({
      title: "Save project",
      defaultPath: "idea-network.ideanet.json",
      filters: [{ name: "Idea Network project", extensions: ["ideanet.json"] }],
    }) as string | null;
    if (!savePath) return;
    await getInvoke()("write_text_file", { path: savePath, content: json });
  } else {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "idea-network.ideanet.json";
    a.click();
    URL.revokeObjectURL(url);
  }
}

/** Open project from a file. In Tauri: native open dialog. In browser: file input. */
export async function openProject(): Promise<string | null> {
  if (isTauri()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const path = await (window as any).__TAURI__.dialog.open({
      title: "Open project",
      multiple: false,
      filters: [{ name: "Idea Network project", extensions: ["ideanet.json"] }],
    }) as string | null;
    if (!path) return null;
    return getInvoke()<string>("read_text_file", { path });
  }
  // Browser: show a hidden file input
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ideanet.json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      resolve(await file.text());
    };
    input.click();
  });
}
