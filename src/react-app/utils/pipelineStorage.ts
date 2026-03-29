/**
 * Persistência de pipeline OCR via IndexedDB
 * v1.7.6: Salva debug images + metadados para consulta no histórico
 */

const DB_NAME = 'portacerta_db';
const DB_VERSION = 1;
const STORE_NAME = 'pipeline_cache';
const MAX_ENTRIES = 20;

interface StoredPipeline {
  placa: string;
  data: any; // PipelineData
  savedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'placa' });
        store.createIndex('savedAt', 'savedAt', { unique: false });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePipeline(placa: string, data: any): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const entry: StoredPipeline = { placa, data, savedAt: Date.now() };
    store.put(entry);
    
    // FIFO cleanup: count and remove oldest if over limit
    const countReq = store.count();
    countReq.onsuccess = () => {
      if (countReq.result > MAX_ENTRIES) {
        const idx = store.index('savedAt');
        const cursor = idx.openCursor();
        let toDelete = countReq.result - MAX_ENTRIES;
        cursor.onsuccess = () => {
          if (cursor.result && toDelete > 0) {
            store.delete(cursor.result.primaryKey);
            toDelete--;
            cursor.result.continue();
          }
        };
      }
    };
    
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    
    db.close();
  } catch (e) {
    console.warn('⚠️ Erro ao salvar pipeline no IndexedDB:', e);
  }
}

export async function loadPipeline(placa: string): Promise<any | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const req = store.get(placa);
      req.onsuccess = () => {
        db.close();
        resolve(req.result ? req.result.data : null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch (e) {
    console.warn('⚠️ Erro ao carregar pipeline do IndexedDB:', e);
    return null;
  }
}

export async function loadAllPipelines(): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        db.close();
        const entries = req.result as StoredPipeline[];
        for (const entry of entries) {
          map.set(entry.placa, entry.data);
        }
        resolve(map);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch (e) {
    console.warn('⚠️ Erro ao carregar pipelines do IndexedDB:', e);
    return map;
  }
}
