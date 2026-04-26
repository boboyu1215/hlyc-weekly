/**
 * 黑板报 Store
 * 数据通过 /api 持久化到服务器（action: board_*）
 * 每4周自动归档一次，归档后清空画布
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

export const useBoardStore = defineStore('board', () => {
  const notes = ref<StickyNote[]>([]);
  const meta = ref<BoardMeta | null>(null);
  const archives = ref<BoardMeta[]>([]);
  const loading = ref(false);
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
      if (!meta.value) await initBoard();
      if (shouldArchive.value) await archiveBoard();
    } finally {
      loading.value = false;
    }
  }

  async function save() {
    await apiCall('board_save', { notes: notes.value, meta: meta.value });
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

  function addNote(x: number, y: number, author: string, type: 'text' | 'image' = 'text') {
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
    save();
    return note.id;
  }

  function updateNote(id: string, patch: Partial<StickyNote>) {
    const idx = notes.value.findIndex(n => n.id === id);
    if (idx === -1) return;
    notes.value[idx] = { ...notes.value[idx], ...patch };
    save();
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

  function deleteNote(id: string) {
    notes.value = notes.value.filter(n => n.id !== id);
    save();
  }

  function toggleLike(id: string, author: string) {
    const note = notes.value.find(n => n.id === id);
    if (!note) return;
    const idx = note.likes.indexOf(author);
    if (idx === -1) note.likes.push(author);
    else note.likes.splice(idx, 1);
    save();
  }

  function addComment(id: string, author: string, text: string) {
    const note = notes.value.find(n => n.id === id);
    if (!note) return;
    note.comments.push({ id: uid(), author, text, createdAt: Date.now() });
    save();
  }

  function deleteComment(noteId: string, commentId: string) {
    const note = notes.value.find(n => n.id === noteId);
    if (!note) return;
    note.comments = note.comments.filter(c => c.id !== commentId);
    save();
  }

  return {
    notes, meta, archives, loading, currentWeek, shouldArchive,
    load, save, initBoard, archiveBoard,
    addNote, updateNote, moveNote, bringToFront, deleteNote,
    toggleLike, addComment, deleteComment
  };
});
