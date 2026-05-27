import { writable } from "svelte/store";

function createOnlineStore() {
  const { subscribe, set } = writable(navigator.onLine);

  window.addEventListener("online", () => set(true));
  window.addEventListener("offline", () => set(false));

  return { subscribe };
}

export const isOnline = createOnlineStore();

interface PendingOp {
  type: "create" | "update" | "delete";
  store: string;
  id: string;
  data: Record<string, unknown>;
  timestamp: string;
}

function createSyncStore() {
  const key = "tpl_pending_queue";
  const stored = localStorage.getItem(key);
  const initial: PendingOp[] = stored ? JSON.parse(stored) : [];

  const { subscribe, set, update } = writable<PendingOp[]>(initial);

  return {
    subscribe,
    addOp(op: PendingOp) {
      update((queue) => {
        const next = [...queue, op];
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      });
    },
    clearOps() {
      set([]);
      localStorage.removeItem(key);
    },
    getPendingCount() {
      let count = 0;
      subscribe((v) => (count = v.length))();
      return count;
    },
  };
}

export const syncStore = createSyncStore();
