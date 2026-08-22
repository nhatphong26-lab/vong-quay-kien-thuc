import { createClient } from '@supabase/supabase-js';

const STORAGE_PREFIX = 'vong-quay-kien-thuc:';
const QUESTIONS_SUFFIX = '/questions';
const SUPABASE_URL = 'https://xelfbrdksmgsdwlnfegi.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlbGZicmRrc21nc2R3bG5mZWdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0MDQzNTksImV4cCI6MjEwMjk4MDM1OX0.qc2HdyYXF57d5ZPOTYy-hvlWgVWd2QtjhJexlvrQCkk';
const listeners = new Map();

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const keyFor = (path) => `${STORAGE_PREFIX}${path}`;
const isQuestionsPath = (path) => path.endsWith(QUESTIONS_SUFFIX);
const read = (path) => JSON.parse(localStorage.getItem(keyFor(path)) || '{}');
const write = (path, value) => {
  localStorage.setItem(keyFor(path), JSON.stringify(value));
  queueMicrotask(() => notify(path));
};

const localSnapshot = (path) => {
  const records = read(path);
  return {
    docs: Object.entries(records).map(([recordId, value]) => ({
      id: recordId,
      data: () => structuredClone(value),
    })),
  };
};

const remoteSnapshot = (rows = []) => ({
  docs: rows.map((row) => ({ id: row.id, data: () => structuredClone(row.data) })),
});

const notify = (path) => {
  for (const callback of listeners.get(path) || []) callback(localSnapshot(path));
};

const throwSupabaseError = (error) => {
  if (!error) return;
  if (error.code === '23505') throw new Error('Câu hỏi này đã tồn tại trong ngân hàng.');
  if (error.code === '42501') throw new Error('Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại.');
  throw new Error(error.message || 'Không thể kết nối Supabase.');
};

const loadRemoteQuestions = async () => {
  const { data, error } = await supabase.from('questions').select('id,data').order('created_at');
  throwSupabaseError(error);
  return remoteSnapshot(data);
};

export const initializeApp = () => ({ mode: 'supabase-questions-local-player' });
export const getAuth = () => ({ mode: 'hybrid' });
export const getFirestore = () => ({ mode: 'hybrid' });
export const signInAnonymously = async () => ({ user: { uid: 'local-player' } });
export const signInWithCustomToken = signInAnonymously;
export const signInAdmin = async (password) => {
  const { error } = await supabase.auth.signInWithPassword({ email: 'admin@vongquay.local', password });
  throwSupabaseError(error);
};
export const signOutAdmin = () => supabase.auth.signOut();

export const collection = (_db, ...segments) => ({ type: 'collection', path: segments.join('/') });

export const doc = (base, ...segments) => {
  if (base?.type === 'collection') {
    return { type: 'document', collectionPath: base.path, id: segments[0] || id() };
  }
  const recordId = segments.at(-1);
  return { type: 'document', collectionPath: segments.slice(0, -1).join('/'), id: recordId };
};

export const setDoc = async (ref, value) => {
  if (isQuestionsPath(ref.collectionPath)) {
    const { error } = await supabase.from('questions').insert({ id: ref.id, data: structuredClone(value) });
    throwSupabaseError(error);
    return;
  }
  const records = read(ref.collectionPath);
  records[ref.id] = structuredClone(value);
  write(ref.collectionPath, records);
};

export const updateDoc = async (ref, changes) => {
  if (isQuestionsPath(ref.collectionPath)) {
    const { data: row, error: readError } = await supabase.from('questions').select('data').eq('id', ref.id).single();
    throwSupabaseError(readError);
    const { error } = await supabase.from('questions').update({ data: { ...row.data, ...structuredClone(changes) } }).eq('id', ref.id);
    throwSupabaseError(error);
    return;
  }
  const records = read(ref.collectionPath);
  if (!records[ref.id]) throw new Error('Không tìm thấy dữ liệu cần cập nhật.');
  records[ref.id] = { ...records[ref.id], ...structuredClone(changes) };
  write(ref.collectionPath, records);
};

export const deleteDoc = async (ref) => {
  if (isQuestionsPath(ref.collectionPath)) {
    const { error } = await supabase.from('questions').delete().eq('id', ref.id);
    throwSupabaseError(error);
    return;
  }
  const records = read(ref.collectionPath);
  delete records[ref.id];
  write(ref.collectionPath, records);
};

export const onSnapshot = (ref, callback, onError) => {
  if (isQuestionsPath(ref.path)) {
    let active = true;
    const refresh = () => loadRemoteQuestions()
      .then((snap) => active && callback(snap))
      .catch((error) => active && onError?.(error));
    refresh();
    const channel = supabase
      .channel(`questions-${id()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, refresh)
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }

  try {
    const callbacks = listeners.get(ref.path) || new Set();
    callbacks.add(callback);
    listeners.set(ref.path, callbacks);
    queueMicrotask(() => callback(localSnapshot(ref.path)));
    return () => callbacks.delete(callback);
  } catch (error) {
    onError?.(error);
    return () => {};
  }
};
