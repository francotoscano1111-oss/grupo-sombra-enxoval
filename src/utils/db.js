/**
 * db.js — IndexedDB layer for GRUPO SOMBRA Finance Hub
 *
 * Design principles:
 *   ✓ ONE database per (empresa × module) pair
 *   ✓ ONE object store named 'data' in ALL databases
 *   ✓ Auto-migration: if a DB has legacy 'kv' store, it is migrated on first open
 *   ✓ Never call IndexedDB directly outside this file
 *   ✓ All public functions are async and throw on unrecoverable errors
 *
 * DB naming convention:
 *   sombra_global                  → global config (empresa list)
 *   sombra_{empresaId}_{module}    → per-empresa module data
 */

// ── Constants ────────────────────────────────────────────────────────────────

/** The single object store used in every database. */
const STORE = 'data';

const GLOBAL_DB = 'sombra_global';

/** Module identifiers — always use these constants, never raw strings. */
export const DB_MODULES = Object.freeze({
  RECEITAS:          'receitas',
  DESPESAS:          'despesas',
  EXTRATOS:          'extratos',
  CONTAS_BANCARIAS:  'contas_bancarias',
  DOCUMENTOS:        'documentos',
  NFS_EMITIDAS:      'nfs_emitidas',
  REGISTRO_RESERVAS: 'registro_reservas',
  CONTAS_PAGAR:      'contas_pagar',
  BOOKINGS:          'bookings',
  CONCILIACAO:       'conciliacao',
  ENTRADAS_CONSOLIDADO: 'entradas_consolidado',
  // HITS — Sistema front-end exclusivo ArcoIris
  HITS_RESUMO:       'hits_resumo',
  HITS_CONSUMOS:     'hits_consumos',
  // NFs Emitidas — Consumos (Tinus export, formato separato)
  NFS_CONSUMOS:      'nfs_consumos',
  // ── Storico (dati archiviati per alleggerire il DB attivo) ──────────────────
  // Ogni modulo archiviabile ha un corrispondente _storico.
  // I DB storici sono identici in struttura ai DB attivi.
  HITS_RESUMO_STORICO:        'hits_resumo_storico',
  HITS_CONSUMOS_STORICO:      'hits_consumos_storico',
  RECEITAS_STORICO:           'receitas_storico',
  EXTRATOS_STORICO:           'extratos_storico',
  NFS_EMITIDAS_STORICO:       'nfs_emitidas_storico',
  NFS_CONSUMOS_STORICO:       'nfs_consumos_storico',
  BOOKINGS_STORICO:           'bookings_storico',
  REGISTRO_RESERVAS_STORICO:  'registro_reservas_storico',
  CONTAS_PAGAR_STORICO:       'contas_pagar_storico',
});


const ALL_MODULES = Object.values(DB_MODULES);

// Cached DB connections (dbName → Promise<IDBDatabase>)
const _cache = {};

// ── Core: open / migrate ─────────────────────────────────────────────────────

/**
 * Opens (or creates) an IDB database.
 * Guarantees the 'data' store exists, migrating from legacy 'kv' if needed.
 */
function openDB(dbName) {
  if (_cache[dbName]) return _cache[dbName];

  _cache[dbName] = new Promise((resolve, reject) => {
    // Open without specifying a version → gets current version (or 1 for new)
    const probe = indexedDB.open(dbName);

    probe.onupgradeneeded = (e) => {
      // New database: create 'data' store
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };

    probe.onsuccess = (e) => {
      const db = e.target.result;

      if (db.objectStoreNames.contains(STORE)) {
        // Already correct — done
        resolve(db);
        return;
      }

      // Legacy DB has 'kv' store (old sombra_global) → migrate to 'data'
      const hasKv     = db.objectStoreNames.contains('kv');
      const nextVersion = db.version + 1;
      db.close();
      delete _cache[dbName];

      const upg = indexedDB.open(dbName, nextVersion);

      upg.onupgradeneeded = (e2) => {
        const db2 = e2.target.result;
        const tx2 = e2.target.transaction;

        // Create the new 'data' store
        const dataStore = db2.createObjectStore(STORE);

        // Copy all entries from 'kv' → 'data'
        if (hasKv) {
          tx2.objectStore('kv').openCursor().onsuccess = (ce) => {
            const cursor = ce.target.result;
            if (cursor) {
              dataStore.put(cursor.value, cursor.key);
              cursor.continue();
            }
          };
        }
      };

      upg.onsuccess = (e2) => {
        const migratedDb = e2.target.result;
        _cache[dbName] = Promise.resolve(migratedDb);
        resolve(migratedDb);
      };

      upg.onerror = (e2) => reject(e2.target.error);
    };

    probe.onerror = (e) => reject(e.target.error);
  });

  return _cache[dbName];
}

// ── Internal transaction helper ───────────────────────────────────────────────

async function _tx(dbName, mode, fn) {
  const db    = await openDB(dbName);
  const trans = db.transaction(STORE, mode);
  const store = trans.objectStore(STORE);
  const req   = fn(store);
  let reqResult;

  return new Promise((resolve, reject) => {
    req.onsuccess = (e) => { reqResult = e.target.result; };
    req.onerror   = (e) => reject(e.target.error);
    trans.oncomplete = () => resolve(reqResult);
    trans.onerror    = (e) => reject(e.target.error);
    trans.onabort    = (e) => reject(e.target.error ?? new Error('Transaction aborted'));
  });
}

// ── Public CRUD API ───────────────────────────────────────────────────────────

export const dbGet  = (db, key)      => _tx(db, 'readonly',  (s) => s.get(key));
export const dbSet  = (db, key, val) => _tx(db, 'readwrite', (s) => s.put(val, key));
export const dbSetBulk = (db, pairs) => _tx(db, 'readwrite', (s) => {
  let req;
  for (const { key, val } of pairs) req = s.put(val, key);
  return req;
});
export const dbDel  = (db, key)      => _tx(db, 'readwrite', (s) => s.delete(key));
export const dbKeys = (db)           => _tx(db, 'readonly',  (s) => s.getAllKeys());

/** Returns all [key, value] pairs in a database. */
export async function dbEntries(dbName) {
  const db    = await openDB(dbName);
  const trans = db.transaction(STORE, 'readonly');
  const store = trans.objectStore(STORE);
  let keys = [], vals = [];

  return new Promise((resolve, reject) => {
    store.getAllKeys().onsuccess = (e) => { keys = e.target.result; };
    store.getAll().onsuccess    = (e) => { vals = e.target.result; };
    trans.oncomplete = () => resolve(keys.map((k, i) => [k, vals[i]]));
    trans.onerror    = (e) => reject(e.target.error);
  });
}

/** Deletes every entry in a database's store (keeps the DB itself). */
export async function dbClear(dbName) {
  const db    = await openDB(dbName);
  const trans = db.transaction(STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req   = trans.objectStore(STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Moves a set of records (by key) from sourceDbName → targetDbName.
 * Writes each record to the target store, then deletes it from the source.
 * Errors on individual records are logged but do NOT abort the whole operation.
 * Returns { moved, errors } counts.
 */
export async function archiveRecords(sourceDbName, targetDbName, keys) {
  let moved = 0;
  let errors = 0;

  for (const key of keys) {
    try {
      // Read from source
      const record = await dbGet(sourceDbName, key);
      if (record === undefined) { errors++; continue; }
      // Write to target
      await dbSet(targetDbName, key, record);
      // Delete from source
      await dbDel(sourceDbName, key);
      moved++;
    } catch (e) {
      console.warn(`[archiveRecords] key=${key}:`, e);
      errors++;
    }
  }

  return { moved, errors };
}

// ── Global DB shortcuts ───────────────────────────────────────────────────────

export const GlobalDB = {
  get:     (key)      => dbGet(GLOBAL_DB, key),
  set:     (key, val) => dbSet(GLOBAL_DB, key, val),
  del:     (key)      => dbDel(GLOBAL_DB, key),
  entries: ()         => dbEntries(GLOBAL_DB),
};

// ── DB name helper ────────────────────────────────────────────────────────────

/** Returns the canonical DB name for a given empresa and module. */
export const getDB = (empresaId, module) => `sombra_${empresaId}_${module}`;

// ── Backup / Restore ──────────────────────────────────────────────────────────

/**
 * Exports the full application state as a serialisable object.
 * Errors on individual stores are logged but do NOT abort the export.
 */
export async function exportFullBackup() {
  const backup = {
    version:    3,
    exportedAt: new Date().toISOString(),
    global:     {},
    empresas:   {},
  };

  try {
    const entries = await dbEntries(GLOBAL_DB);
    entries.forEach(([k, v]) => { backup.global[k] = v; });
  } catch (e) {
    console.warn('[backup] global read error:', e);
  }

  const empresas = (await GlobalDB.get('empresas')) || [];

  for (const emp of empresas) {
    backup.empresas[emp.id] = {};
    for (const mod of ALL_MODULES) {
      backup.empresas[emp.id][mod] = {};
      try {
        const entries = await dbEntries(getDB(emp.id, mod));
        entries.forEach(([k, v]) => { backup.empresas[emp.id][mod][k] = v; });
      } catch (e) {
        console.warn(`[backup] ${emp.id}/${mod}:`, e);
      }
    }
  }

  return backup;
}

/**
 * Restores application state from a backup object.
 * Wipes existing data before restoring.
 */
export async function importFullBackup(backup) {
  if (!backup?.version) throw new Error('Backup inválido ou corrompido.');

  await dbClear(GLOBAL_DB);
  for (const [k, v] of Object.entries(backup.global || {})) {
    await GlobalDB.set(k, v);
  }

  for (const [empId, modules] of Object.entries(backup.empresas || {})) {
    for (const mod of ALL_MODULES) {
      const db = getDB(empId, mod);
      try {
        await dbClear(db);
        for (const [k, v] of Object.entries(modules[mod] || {})) {
          await dbSet(db, k, v);
        }
      } catch (e) {
        console.warn(`[restore] ${empId}/${mod}:`, e);
      }
    }
  }
}

// ── Full Reset ────────────────────────────────────────────────────────────────

/**
 * Deletes ALL sombra_* IndexedDB databases and all sombra_* localStorage keys.
 * Call this to start fresh. The app must be reloaded afterwards.
 */
export async function resetAllData() {
  // Close cached connections before deleting
  for (const [name, promise] of Object.entries(_cache)) {
    try {
      const db = await promise;
      db.close();
    } catch { /* ignore */ }
    delete _cache[name];
  }

  // Delete all sombra_ databases
  const allDbs = await indexedDB.databases();
  await Promise.all(
    allDbs
      .filter((d) => d.name?.startsWith('sombra_'))
      .map((d) => new Promise((resolve) => {
        const req = indexedDB.deleteDatabase(d.name);
        req.onsuccess = () => resolve();
        req.onerror   = () => resolve(); // non-blocking
      }))
  );

  // Clear all sombra_ localStorage keys
  Object.keys(localStorage)
    .filter((k) => k.startsWith('sombra_'))
    .forEach((k) => localStorage.removeItem(k));
}
