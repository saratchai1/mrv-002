import type { AppState, Baseline, ObservationInput } from './types';

const DB_NAME = 'mangrove-mrv-field-v1';
const STORE = 'records';
export type PendingObservation = { key: string; kind: 'observation'; createdAt: string; payload: ObservationInput; error?: string };
export type PendingPhoto = { key: string; kind: 'photo'; createdAt: string; roundId: string; recordId: string; file: Blob; fileName: string; error?: string };
export type Pending = PendingObservation | PendingPhoto;
export function createOperationId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function read<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly'); const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result?.value ?? null);
    request.onerror = () => reject(request.error); tx.oncomplete = () => db.close();
  });
}
async function write(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put({ key, value });
    tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
  });
}
export async function removePending(key: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
  });
}
export const readCachedBaseline = () => read<Baseline>('baseline');
export const writeCachedBaseline = (data: Baseline) => write('baseline', data);
export const readCachedState = () => read<AppState>('state');
export const writeCachedState = (data: AppState) => write('state', data);
export async function listPending(): Promise<Pending[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly'); const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result.filter((r: { key: string }) => r.key.startsWith('pending:')).map((r: { value: Pending }) => r.value).sort((a: Pending, b: Pending) => a.createdAt.localeCompare(b.createdAt)));
    request.onerror = () => reject(request.error); tx.oncomplete = () => db.close();
  });
}
export async function queueObservation(payload: ObservationInput) {
  const entry: PendingObservation = { key: `pending:${payload.operationId}`, kind: 'observation', createdAt: new Date().toISOString(), payload };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      for (const row of request.result as { key: string; value: Pending }[]) {
        const prior = row.value;
        if (row.key.startsWith('pending:') && prior.kind === 'observation' && prior.payload.roundId === payload.roundId && prior.payload.recordId === payload.recordId) store.delete(row.key);
      }
      store.put({ key: entry.key, value: entry });
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('บันทึกฉบับร่างในเครื่องไม่สำเร็จ')); };
    tx.onerror = () => { /* The transaction aborts and preserves the previous draft. */ };
  });
  return entry;
}
export async function queuePhoto(roundId: string, recordId: string, file: File) {
  const entry: PendingPhoto = { key: `pending:${createOperationId()}`, kind: 'photo', createdAt: new Date().toISOString(), roundId, recordId, file, fileName: file.name };
  await write(entry.key, entry); return entry;
}
export const markPendingError = (entry: Pending, error: string) => write(entry.key, { ...entry, error });
