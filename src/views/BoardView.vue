<template>
  <div class="board-root">
    <div class="board-toolbar">
      <div class="board-title-block">
        <span class="board-title">{{ meta?.title || '黑板报' }}</span>
        <span class="board-period" v-if="meta">{{ meta.startWeek }} 起，每4周归档</span>
        <span v-if="shouldArchive" class="board-warn-tag">本期将归档</span>
      </div>
      <div class="board-actions">
        <button class="io-btn" @click="addTextNote">＋ 便签</button>
        <button class="io-btn" @click="addImageNote">🖼 图片</button>
        <button class="io-btn" @click="exportPdf" :disabled="exporting">{{ exporting ? '导出中…' : '导出 PDF' }}</button>
        <button class="io-btn" @click="showArchives = !showArchives">归档记录</button>
        <button v-if="isDirector" class="bd" @click="confirmArchive">立即归档</button>
      </div>
    </div>

    <div class="board-main">
      <div
        ref="boardEl"
        class="board-canvas"
        @dblclick.self="onCanvasDblClick"
      >
        <StickyNote
          v-for="note in notes"
          :key="note.id"
          :note="note"
          :currentUser="currentUser"
          :isDirector="isDirector"
          :boardEl="boardEl"
          @move="onMove"
          @resize="onResize"
          @front="store.bringToFront"
          @delete="onDelete"
          @like="store.toggleLike($event, currentUser)"
          @comment="store.addComment"
          @deleteComment="store.deleteComment"
          @contentChange="onContentChange"
          @captionChange="onCaptionChange"
        />
        <div v-if="!loading && notes.length === 0" class="board-empty">
          双击空白处或点击「＋ 便签」新建便签
        </div>
      </div>

      <!-- 归档侧栏 -->
      <div v-if="showArchives" class="board-sidebar">
        <div class="sidebar-header">
          <span>归档记录</span>
          <button class="sidebar-close" @click="showArchives = false">✕</button>
        </div>
        <div v-if="archives.length === 0" class="sidebar-empty">暂无归档</div>
        <div v-for="arc in archives" :key="arc.id" class="archive-item">
          <div class="archive-title">{{ arc.title }}</div>
          <div class="archive-meta">{{ arc.startWeek }} ｜ {{ fmtDate(arc.archivedAt!) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useBoardStore } from '@/stores/board';
import { useAuthStore } from '@/stores/auth';
import StickyNote from '@/components/StickyNote.vue';

const store = useBoardStore();
const authStore = useAuthStore();

const boardEl = ref<HTMLElement | null>(null);
const showArchives = ref(false);
const exporting = ref(false);

const notes = computed(() => store.notes);
const meta = computed(() => store.meta);
const archives = computed(() => store.archives);
const loading = computed(() => store.loading);
const shouldArchive = computed(() => store.shouldArchive);
const currentUser = computed(() => authStore.currentUser || '匿名');
const isDirector = computed(() => authStore.isDirector);

onMounted(() => store.load());
onBeforeUnmount(() => store.save());

function onCanvasDblClick(e: MouseEvent) {
  if (!currentUser.value) { alert('请先登录'); return; }
  const el = e.currentTarget as HTMLElement;
  const x = e.clientX - el.getBoundingClientRect().left + el.scrollLeft - 100;
  const y = e.clientY - el.getBoundingClientRect().top + el.scrollTop - 90;
  store.addNote(Math.max(0, x), Math.max(0, y), currentUser.value, 'text');
}

function addTextNote() {
  if (!currentUser.value) { alert('请先登录'); return; }
  store.addNote(40 + Math.random() * 400, 40 + Math.random() * 300, currentUser.value, 'text');
}

function addImageNote() {
  if (!currentUser.value) { alert('请先登录'); return; }
  store.addNote(40 + Math.random() * 400, 40 + Math.random() * 300, currentUser.value, 'image');
}

let saveTid: ReturnType<typeof setTimeout> | null = null;
function onMove(id: string, x: number, y: number) {
  store.moveNote(id, x, y);
  if (saveTid) clearTimeout(saveTid);
  saveTid = setTimeout(() => store.save(), 300);
}

function onResize(id: string, w: number, h: number) {
  store.updateNote(id, { width: w, height: h });
}

function onDelete(id: string) {
  if (!confirm('删除这张便签？')) return;
  store.deleteNote(id);
}

function onContentChange(id: string, content: string) {
  store.updateNote(id, { content });
}

function onCaptionChange(id: string, caption: string) {
  store.updateNote(id, { caption });
}

async function confirmArchive() {
  if (!confirm('立即归档当前画布并重置？此操作不可撤销。')) return;
  await store.archiveBoard();
  alert('已归档');
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('zh-CN');
}

async function exportPdf() {
  if (!boardEl.value) return;
  exporting.value = true;
  try {
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf')
    ]);
    const canvas = await html2canvas(boardEl.value, { scale: 1.5, useCORS: true, backgroundColor: '#f5f0e8' });
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] });
    pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
    pdf.save(`黑板报_${meta.value?.startWeek || 'export'}.pdf`);
  } catch (err) {
    alert('导出失败');
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped>
.board-root {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 56px);
  overflow: hidden;
  background: #f5f0e8;
}

.board-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--card, #fff);
  border-bottom: 1px solid #e0d8cc;
  flex-shrink: 0;
  gap: 12px;
  flex-wrap: wrap;
}

.board-title-block { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.board-title { font-size: 15px; font-weight: 700; color: var(--tx, #333); }
.board-period { font-size: 12px; color: var(--t3, #999); }
.board-warn-tag {
  font-size: 11px; font-weight: 600;
  padding: 2px 8px; border-radius: 10px;
  background: #fff3cd; color: #856404;
  border: 0.5px solid #ffc107;
}
.board-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.board-main {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.board-canvas {
  flex: 1;
  overflow: auto;
  position: relative;
  background-color: #f5f0e8;
  background-image: radial-gradient(circle, #c8bea8 1px, transparent 1px);
  background-size: 24px 24px;
  min-width: 2400px;
  min-height: 1800px;
}

.board-empty {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  color: #bbb; font-size: 15px; pointer-events: none; text-align: center;
}

/* 归档侧栏 */
.board-sidebar {
  width: 300px;
  flex-shrink: 0;
  background: var(--card, #fff);
  border-left: 1px solid #e0d8cc;
  overflow-y: auto;
}
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 700;
  border-bottom: 1px solid #e0d8cc;
}
.sidebar-close {
  background: none; border: none; cursor: pointer;
  font-size: 14px; color: #999; padding: 2px 6px;
}
.sidebar-close:hover { color: #333; }
.sidebar-empty { color: #999; text-align: center; padding: 24px; font-size: 13px; }

.archive-item { padding: 12px 16px; border-bottom: 1px solid #f0ede6; }
.archive-title { font-size: 13px; font-weight: 600; color: var(--tx, #333); }
.archive-meta { font-size: 11px; color: var(--t3, #999); margin-top: 3px; }
</style>
