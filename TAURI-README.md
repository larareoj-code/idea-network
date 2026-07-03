# Tauri Desktop — Build Instructions

## Prerequisites

1. **Rust** — install from https://rustup.rs  
   `rustup target add x86_64-pc-windows-msvc`

2. **Tauri CLI** (v2)  
   `cargo install tauri-cli --version "^2"`

3. **WebView2** — already present on Windows 11

## Dev

```
npm run tauri:dev
```

Opens the Vite dev server and wraps it in a native window.

## Production build

```
npm run tauri:build
```

Outputs an installer to `src-tauri/target/release/bundle/`.

## What's included

| File | Purpose |
|---|---|
| `src-tauri/tauri.conf.json` | App metadata, window config, plugin scope |
| `src-tauri/Cargo.toml` | Rust dependencies (tauri v2, dialog, fs, shell plugins) |
| `src-tauri/src/lib.rs` | Tauri commands: `read_file_bytes`, `write_text_file`, `read_text_file`, `app_data_dir` |
| `src/lib/tauriFs.ts` | JS bridge — detects Tauri vs browser, falls back gracefully |
| `src/components/FilePicker.tsx` | Native file open/save bar (hidden in browser) |

## Architecture

- `isTauri()` in `tauriFs.ts` gates all native calls — the app works normally in a browser.
- `openFiles()` opens a native dialog and returns `File[]` objects, compatible with the existing `onFiles` handler.
- `saveProject()` / `openProject()` use the native save/open dialog in Tauri; fall back to download/upload in the browser.
- The `TauriFileBar` component renders only when `isTauri()` is true, inserting a row of native action buttons above the sidebar.
