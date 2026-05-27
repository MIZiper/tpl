const DB_NAME = "tpl_offline";
const DB_VERSION = 1;

const STORES = [
  "risks",
  "solutions",
  "solution_steps",
  "solution_risks",
  "projects",
  "project_risks",
  "project_solutions",
  "plan_groups",
  "plan_steps",
  "step_executions",
] as const;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of STORES) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      }
    };
  });
}

export async function getDB(): Promise<IDBDatabase> {
  return openDB();
}

export function putItem(storeName: string, item: Record<string, unknown>): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const db = await getDB();
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function getItem<T>(storeName: string, id: string): Promise<T | undefined> {
  return new Promise(async (resolve, reject) => {
    const db = await getDB();
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function getAllItems<T>(storeName: string): Promise<T[]> {
  return new Promise(async (resolve, reject) => {
    const db = await getDB();
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function deleteItem(storeName: string, id: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const db = await getDB();
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearStore(storeName: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  store.clear();
}

export async function exportAllData(): Promise<Record<string, unknown[]>> {
  const data: Record<string, unknown[]> = {};
  for (const storeName of STORES) {
    data[storeName] = await getAllItems(storeName);
  }
  return data;
}

export async function importAllData(data: Record<string, unknown[]>): Promise<void> {
  for (const [storeName, items] of Object.entries(data)) {
    for (const item of items) {
      await putItem(storeName, item as Record<string, unknown>);
    }
  }
}
