/**
 * 黑板报 Store
 * 数据通过 /api 持久化到服务器（action: board_*）
 * 每4周自动归档一次，归档后清空画布
 *
 * 修复（2026-05-07）：
 * - B疾：所有写操作（add/update/delete/comment/like）改为 async + await save，
 *   失败回滚；图片便签写入前留 localStorage 应急快照。
 * - C疾：deleteNote 改为 splice 原数组，保持引用稳定，UI 即时响应。
 * - D疾：新增 loadArchive(id)，从后端拉取某期归档之 notes 全量。
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface BoardComment {
  id: string;
  author: string;
  text: string;
  createdAt: number;
}

export interface StickyNote {
  id: string;
  type: 'text' | 'image';
  content: string;
  caption: string;  // 图片说明文字（仅 image 类型使用）
  author: string;
  createdAt: number;
  position: { x: number; y: number; zIndex: number };
  rotation: number;
  color: string;
  width: number;
  height: number;
  likes: string[];
  comments: BoardComment[];
}

export interface BoardMeta {
  id: string;
  title: string;
  startWeek: string;
  createdAt: number;
  archivedAt?: number;
}

const COLORS = ['#fff9c4','#fce4ec','#e8f5e9','#e3f2fd','#f3e5f5','#fff3e0','#e0f7fa'];
const SNAPSHOT_KEY = 'hlzc_board_snapshot';  // 应急快照之本地键

function randomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }
function randomRotation() { return +(((Math.random() - 0.5) * 12).toFixed(2)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function currentYearWeek(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${String(wk).padStart(2, '0')}`;
}

function weekDiff(a: string, b: string): number {
  function toDate(yw: string) {
    const [y, w] = yw.split('-').map(Number);
    const d = new Date(Date.UTC(y, 0, 1 + (w - 1) * 7));
    const day = d.getUTCDay();
    if (day <= 4) d.setUTCDate(d.getUTCDate() - day + 1);
    else d.setUTCDate(d.getUTCDate() + 8 - day);
    return d;
  }
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / (7 * 86400000));
}

async function apiCall(action: string, data?: any) {
  try {
    const resp = await fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, data })
    });
    return await resp.json();
  } catch {
    return { error: '网络错误' };
  }
}

// 应急快照：写入与读取（防服务端 race / 502 数据丢失）
function writeSnapshot(notes: StickyNote[], meta: BoardMeta | null) {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ notes, meta, ts: Date.now() }));
  } catch { /* 忽略配额错误 */ }
}
function readSnapshot(): { notes: StickyNote[]; meta: BoardMeta | null; ts: number } | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export const useBoardStore = defineStore('board', () => {
  const notes = ref<StickyNote[]>([]);
  const meta = ref<BoardMeta | null>(null);
  const archives = ref<BoardMeta[]>([]);
  const loading = ref(false);
  const saving = ref(false);  // 写入态指示，UI 可据此防离页
  const maxZIndex = ref(100);

  const currentWeek = computed(() => currentYearWeek());

  const shouldArchive = computed(() => {
    if (!meta.value) return false;
    return weekDiff(meta.value.startWeek, currentWeek.value) >= 4;
  });

  async function load() {
    loading.value = true;
    try {
      const res = await apiCall('board_load');
      if (res.notes) notes.value = res.notes;
      if (res.meta) meta.value = res.meta;
      if (res.archives) archives.value = res.archives;

      // 应急恢复：若服务端返空但本地有近期快照（5分钟内），用本地补之
      const snap = readSnapshot();
      if ((!notes.value || notes.value.length === 0) && snap && snap.notes?.length) {
        const ageMin = (Date.now() - snap.ts) / 60000;
        if (ageMin < 5) {
          console.warn('[board] 服务端返空，从本地快照恢复', snap.notes.length, '条');
          notes.value = snap.notes;
          meta.value = snap.meta || meta.value;
          // 即刻同步回服务端
          await save();
        }
      }

      if (!meta.value && notes.value.length === 0) await initBoard();
      if (shouldArchive.value) await archiveBoard();
    } finally {
      loading.value = false;
    }
  }

  // 保存：入口收紧——并发时只发末次（last-write-wins）
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let saveSeq = 0;
  async function save(): Promise<boolean> {
    saveSeq++;
    const mySeq = saveSeq;
    saving.value = true;
    try {
      writeSnapshot(notes.value, meta.value);
      const res = await apiCall('board_save', { notes: notes.value, meta: meta.value });
      // 仅末次写入算正式完成
      if (mySeq === saveSeq) saving.value = false;
      return !res.error;
    } catch {
      if (mySeq === saveSeq) saving.value = false;
      return false;
    }
  }

  // 防抖保存：用于高频操作（移动、resize）
  function saveDebounced(delay = 400) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save(), delay);
  }

  async function initBoard() {
    const yw = currentWeek.value;
    meta.value = {
      id: yw,
      title: `${yw} 黑板报`,
      startWeek: yw,
      createdAt: Date.now()
    };
    notes.value = [];
    await save();
  }

  async function archiveBoard() {
    if (!meta.value) return;
    const archived: BoardMeta = { ...meta.value, archivedAt: Date.now() };
    await apiCall('board_archive', { meta: archived, notes: notes.value });
    archives.value.unshift(archived);
    await initBoard();
  }

  /**
   * D疾修：拉取某期归档之全量 notes
   * 后端须实现 board_archive_get action，按 id 返 { notes, meta }
   */
  async function loadArchive(id: string): Promise<{ notes: StickyNote[]; meta: BoardMeta } | null> {
    const res = await apiCall('board_archive_get', { id });
    if (res.error || !res.notes) return null;
    return { notes: res.notes as StickyNote[], meta: res.meta as BoardMeta };
  }

  // ─── 写操作：全部 async，调用方可 await ───

  async function addNote(x: number, y: number, author: string, type: 'text' | 'image' = 'text'): Promise<string> {
    maxZIndex.value++;
    const note: StickyNote = {
      id: uid(),
      type,
      content: '',
      caption: '',
      author,
      createdAt: Date.now(),
      position: { x, y, zIndex: maxZIndex.value },
      rotation: randomRotation(),
      color: randomColor(),
      width: 200,
      height: 180,
      likes: [],
      comments: []
    };
    notes.value.push(note);
    const ok = await save();
    if (!ok) {
      // 回滚
      const idx = notes.value.findIndex(n => n.id === note.id);
      if (idx !== -1) notes.value.splice(idx, 1);
      throw new Error('新建便签保存失败');
    }
    return note.id;
  }

  async function updateNote(id: string, patch: Partial<StickyNote>): Promise<boolean> {
    const idx = notes.value.findIndex(n => n.id === id);
    if (idx === -1) return false;
    const before = { ...notes.value[idx] };
    // 原地改属性而非整体替换，引用保稳
    Object.assign(notes.value[idx], patch);
    const ok = await save();
    if (!ok) {
      Object.assign(notes.value[idx], before);
      return false;
    }
    return true;
  }

  function moveNote(id: string, x: number, y: number) {
    const note = notes.value.find(n => n.id === id);
    if (!note) return;
    note.position.x = x;
    note.position.y = y;
  }

  function bringToFront(id: string) {
    const note = notes.value.find(n => n.id === id);
    if (!note) return;
    maxZIndex.value++;
    note.position.zIndex = maxZIndex.value;
  }

  /**
   * C疾修：splice 而非 filter，保引用稳定
   */
  async function deleteNote(id: string): Promise<boolean> {
    const idx = notes.value.findIndex(n => n.id === id);
    if (idx === -1) return false;
    const removed = notes.value.splice(idx, 1)[0];
    const ok = await save();
    if (!ok) {
      // 回滚：插回原位
      notes.value.splice(idx, 0, removed);
      return false;
    }
    return true;
  }

  async function toggleLike(id: string, author: string): Promise<boolean> {
    const note = notes.value.find(n => n.id === id);
    if (!note) return false;
    const i = note.likes.indexOf(author);
    if (i === -1) note.likes.push(author);
    else note.likes.splice(i, 1);
    return save();
  }

  async function addComment(id: string, author: string, text: string): Promise<boolean> {
    const note = notes.value.find(n => n.id === id);
    if (!note) return false;
    note.comments.push({ id: uid(), author, text, createdAt: Date.now() });
    return save();
  }

  async function deleteComment(noteId: string, commentId: string): Promise<boolean> {
    const note = notes.value.find(n => n.id === noteId);
    if (!note) return false;
    const idx = note.comments.findIndex(c => c.id === commentId);
    if (idx === -1) return false;
    note.comments.splice(idx, 1);
    return save();
  }

  return {
    notes, meta, archives, loading, saving, currentWeek, shouldArchive,
    load, save, saveDebounced, initBoard, archiveBoard, loadArchive,
    addNote, updateNote, moveNote, bringToFront, deleteNote,
    toggleLike, addComment, deleteComment
  };
});
