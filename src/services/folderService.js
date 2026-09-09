/**
 * folderService.js — File System Access API wrapper
 *
 * Allows the app to read PDF files from a user-selected local folder
 * (e.g., a Google Drive Desktop synced folder).
 *
 * The dirHandle is kept in module scope for the session duration.
 * Users must re-select after page reload (browser security requirement).
 */

let dirHandle = null;

/** Whether the File System Access API is available in this browser */
export function isFolderAPISupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** Whether a folder has been selected in the current session */
export function hasFolder() {
  return dirHandle !== null;
}

/** Name of the currently selected folder (or null) */
export function getFolderName() {
  return dirHandle?.name ?? null;
}

/**
 * Show the directory picker and store the handle.
 * Must be called from a user gesture (click event).
 * @returns {string} folder name on success
 * @throws if the user cancels or permission is denied
 */
export async function selectFolder() {
  dirHandle = await window.showDirectoryPicker({ mode: 'read' });
  return dirHandle.name;
}

/**
 * List all PDF files in the selected folder (non-recursive, top level only).
 * @returns {Array<{ name, size, lastModified }>}
 */
export async function listPDFs() {
  if (!dirHandle) throw new Error('No folder selected');
  const files = [];
  for await (const [name, handle] of dirHandle.entries()) {
    const lowerName = name.toLowerCase();
    const isPdf = lowerName.endsWith('.pdf');
    const isImage = lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || 
                    lowerName.endsWith('.png') || lowerName.endsWith('.webp');
    
    if (handle.kind === 'file' && (isPdf || isImage)) {
      const file = await handle.getFile();
      files.push({
        name:         file.name,
        size:         file.size,
        lastModified: new Date(file.lastModified).toISOString(),
        handle,       // keep handle for later read
      });
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Read a PDF file handle as a Blob.
 * @param {FileSystemFileHandle} handle
 * @returns {File} the file object
 */
export async function readFile(handle) {
  return handle.getFile();
}

/** Format bytes to human-readable string */
export function fmtFileSize(bytes) {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Clear the stored folder handle */
export function clearFolder() {
  dirHandle = null;
}
