const STORAGE_PREFIX = 'vong-quay-kien-thuc:';
const listeners = new Map();

const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const keyFor = (path) => `${STORAGE_PREFIX}${path}`;
const read = (path) => JSON.parse(localStorage.getItem(keyFor(path)) || '{}');
const write = (path, value) => {
  localStorage.setItem(keyFor(path), JSON.stringify(value));
  queueMicrotask(() => notify(path));
};

const snapshot = (path) => {
  const records = read(path);
  return {
    docs: Object.entries(records).map(([recordId, value]) => ({
      id: recordId,
      data: () => structuredClone(value),
    })),
  };
};

const notify = (path) => {
  for (const callback of listeners.get(path) || []) callback(snapshot(path));
};

export const initializeApp = () => ({ mode: 'local' });
export const getAuth = () => ({ mode: 'local' });
export const getFirestore = () => ({ mode: 'local' });
export const signInAnonymously = async () => ({ user: { uid: 'local-player' } });
export const signInWithCustomToken = signInAnonymously;

export const collection = (_db, ...segments) => ({ type: 'collection', path: segments.join('/') });

export const doc = (base, ...segments) => {
  if (base?.type === 'collection') {
    return { type: 'document', collectionPath: base.path, id: segments[0] || id() };
  }
  const recordId = segments.at(-1);
  return {
    type: 'document',
    collectionPath: segments.slice(0, -1).join('/'),
    id: recordId,
  };
};

export const setDoc = async (ref, value) => {
  const records = read(ref.collectionPath);
  records[ref.id] = structuredClone(value);
  write(ref.collectionPath, records);
};

export const updateDoc = async (ref, changes) => {
  const records = read(ref.collectionPath);
  if (!records[ref.id]) throw new Error('Không tìm thấy dữ liệu cần cập nhật.');
  records[ref.id] = { ...records[ref.id], ...structuredClone(changes) };
  write(ref.collectionPath, records);
};

export const deleteDoc = async (ref) => {
  const records = read(ref.collectionPath);
  delete records[ref.id];
  write(ref.collectionPath, records);
};

export const onSnapshot = (ref, callback, onError) => {
  try {
    const callbacks = listeners.get(ref.path) || new Set();
    callbacks.add(callback);
    listeners.set(ref.path, callbacks);
    queueMicrotask(() => callback(snapshot(ref.path)));
    return () => callbacks.delete(callback);
  } catch (error) {
    onError?.(error);
    return () => {};
  }
};
