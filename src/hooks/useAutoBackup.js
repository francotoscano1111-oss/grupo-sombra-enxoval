/**
 * useAutoBackup.js — Auto-save a JSON snapshot of all data to localStorage.
 * Runs every N minutes and on key data change events.
 * Acts as a safety net if the main IndexedDB data becomes inaccessible.
 */
import { useEffect, useCallback, useRef } from 'react';
import { exportFullBackup } from '../utils/db';

const LS_KEY_BACKUP  = 'sombra_auto_backup_v1';
const LS_KEY_META    = 'sombra_auto_backup_meta';
const INTERVAL_MS    = 8 * 60 * 60 * 1000; // every 8 hours (~3x/day)

export function useAutoBackup({ enabled = true } = {}) {
  const timerRef = useRef(null);

  const runBackup = useCallback(async () => {
    try {
      const backup = await exportFullBackup();
      const json   = JSON.stringify(backup);
      
      // Stop attempting to save if the backup is dangerously close to the 5MB limit
      if (json.length > 4 * 1024 * 1024) {
        console.warn('[AutoBackup] Ignorato: i dati superano i 4MB e bloccherebbero il browser.');
        return null;
      }
      
      localStorage.setItem(LS_KEY_BACKUP, json);
      const meta = { ts: new Date().toISOString(), size: json.length };
      localStorage.setItem(LS_KEY_META, JSON.stringify(meta));
      return meta;
    } catch (err) {
      console.warn('[AutoBackup] Falhou:', err);
      return null;
    }
  }, []);

  // Start auto-backup timer
  useEffect(() => {
    if (!enabled) return;
    // Delay first run by 6s to avoid IndexedDB contention at startup
    const firstRun = setTimeout(runBackup, 6000);
    timerRef.current = setInterval(runBackup, INTERVAL_MS);
    return () => {
      clearTimeout(firstRun);
      clearInterval(timerRef.current);
    };
  }, [enabled, runBackup]);

  return { runBackup };
}

/** Read the last auto-backup metadata */
export function getAutoBackupMeta() {
  try {
    const raw = localStorage.getItem(LS_KEY_META);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Download the last auto-backup as a JSON file */
export function downloadAutoBackup() {
  const raw = localStorage.getItem(LS_KEY_BACKUP);
  if (!raw) return false;
  const blob = new Blob([raw], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `sombra_autobackup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
