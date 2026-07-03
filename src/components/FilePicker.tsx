import { isTauri, openFiles, openProject, saveProject } from "../lib/tauriFs";

interface Props {
  onFiles: (files: File[]) => void;
  onProjectJson: (json: string) => void;
  onExportJson: () => string;
}

/**
 * Shown only in Tauri context; gives native open/save buttons that bypass
 * the browser drag-drop zone.
 */
export function TauriFileBar({ onFiles, onProjectJson, onExportJson }: Props) {
  if (!isTauri()) return null;

  const handleOpen = async () => {
    const files = await openFiles({ multiple: true });
    if (files && files.length > 0) onFiles(files);
  };

  const handleOpenProject = async () => {
    const json = await openProject();
    if (json) onProjectJson(json);
  };

  const handleSaveProject = async () => {
    await saveProject(onExportJson());
  };

  return (
    <div className="tauri-file-bar">
      <button className="btn" onClick={handleOpen}>Open files…</button>
      <button className="btn" onClick={handleOpenProject}>Open project…</button>
      <button className="btn" onClick={handleSaveProject}>Save project…</button>
    </div>
  );
}
