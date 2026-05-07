<template>
  <div class="board-root">
    <div class="board-toolbar">
      <div class="board-title-block">
        <span class="board-title">{{ meta?.title || '黑板报' }}</span>
        <span class="board-period" v-if="meta">{{ meta.startWeek }} 起，每4周归档</span>
        <span v-if="shouldArchive" class="board-warn-tag">本期将归档</span>
        <span v-if="saving" class="board-saving-tag">保存中…</span>
      </div>
      <div class="board-actions">
        <button class="io-btn" @click="addTextNote" :disabled="busy">＋ 便签</button>
        <button class="io-btn" @click="addImageNote" :disabled="busy">🖼 图片</button>
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
          @like="(id) => store.toggleLike(id, currentUser)"
          @comment="(id, text) => store.addComment(id, currentUser, text)"
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
        <div
          v-for="arc in archives"
          :key="arc.id"
          class="archive-item"
          :class="{ active: viewingArchiveId === arc.id }"
          @click="openArchive(arc)"
        >
          <div class="archive-title">{{ arc.title }}</div>
          <div class="archive-meta">{{ arc.startWeek }} ｜ {{ arc.archivedAt ? fmtDate(arc.archivedAt) : '' }}</div>
        </div>
      </div>
    </div>

    <!-- 归档查看模态：只读画布 -->
    <div v-if="viewingArchive" class="archive-viewer-overlay" @click.self="closeArchive">
      <div class="archive-viewer">
        <div class="archive-viewer-bar">
          <div class="archive-viewer-title">
            {{ viewingArchive.meta.title }}
            <span class="archive-viewer-sub">（{{ viewingArchive.notes.length }} 条便签 · 只读）</span>
          </div>
          <button class="io-btn" @click="closeArchive">关闭</button>
        </div>
        <div class="archive-viewer-canvas">
          <div
            v-for="n in viewingArchive.notes"
            :key="n.id"
            class="ar-note"
            :style="{
              left: n.position.x + 'px',
              top: n.position.y + 'px',
              width: n.width + 'px',
              minHeight: n.height + 'px',
              background: n.color || '#fff9c4',
              transform: `rotate(${n.rotation}deg)`,
              zIndex: n.position.zIndex
            }"
          >
            <div class="ar-head">
              <span class="ar-author">{{ n.author }}</span>
              <span class="ar-time">{{ fmtTime(n.createdAt) }}</span>
            </div>
            <div class="ar-body">
              <template v-if="n.type === 'image'">
                <img v-if="n.content" :src="n.content" class="ar-img" />
                <div v-if="n.caption" class="ar-caption">{{ n.caption }}</div>
              </template>
              <div v-else class="ar-text">{{ n.content }}</div>
            </div>
            <div v-if="n.comments.length" class="ar-comments">
              <div v-for="c in n.comments" :key="c.id" class="ar-comment">
                <span>{{ c.text }}</span><span class="ar-comment-author">–{{ c.author }}</span>
              </div>
            </div>
            <div class="ar-foot">
              <span>❤ {{ n.likes?.length || 0 }}</span>
              <span>💬 {{ n.comments.length }}</span>
            </div>
          </div>
          <div v-if="viewingArchive.notes.length === 0" class="board-empty">该期归档为空</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, onMounted, onBeforeUnmount, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useBoardStore, type BoardMeta, type StickyNote as TBoardNote } from '@/stores/board';
import { useAuthStore } from '@/stores/auth';
import StickyNote from '@/components/StickyNote.vue';

const store = useBoardStore();
const authStore = useAuthStore();

// 关键修：用 storeToRefs 保留响应（C疾根治）
const { notes, meta, archives, loading, saving, shouldArchive } = storeToRefs(store);

const boardEl = ref<HTMLElement | null>(null);
const showArchives = ref(false);
const exporting = ref(false);
const busy = ref(false);  // 防同时多次新建

const currentUser = computed(() => authStore.currentUser || '匿名');
const isDirector = computed(() => authStore.isDirector);

// 归档查看状态
const viewingArchiveId = ref<string | null>(null);
const viewingArchive = ref<{ notes: TBoardNote[]; meta: BoardMeta } | null>(null);

onMounted(async () => {
  await store.load();
  await nextTick();
  updateCanvasHeight();
});

// 离页前，若仍在保存则等之；否则纵被打断亦无患（已写应急快照）
onBeforeUnmount(async () => {
  if (store.saving) {
    // 给一短时机会让正在写的请求完成
    await new Promise(r => setTimeout(r, 200));
  }
});

watch(notes, async () => {
  await nextTick();
  updateCanvasHeight();
}, { deep: true });

function updateCanvasHeight() {
  if (!boardEl.value) return;
  const noteEls = boardEl.value.querySelectorAll<HTMLElement>('.sticky-note');
  if (!noteEls.length) {
    boardEl.value.style.minHeight = 'max(100vh, 1200px)';
    return;
  }
  let maxBottom = 1200;
  for (const el of noteEls) {
    const rect = el.getBoundingClientRect();
    const canvasRect = boardEl.value!.getBoundingClientRect();
    const bottomInCanvas = rect.bottom - canvasRect.top;
    if (bottomInCanvas > maxBottom) maxBottom = bottomInCanvas;
  }
  boardEl.value.style.minHeight = `max(100vh, ${maxBottom + 50}px)`;
}

async function onCanvasDblClick(e: MouseEvent) {
  if (!authStore.currentUser) { alert('请先登录'); return; }
  const el = e.currentTarget as HTMLElement;
  const x = e.clientX - el.getBoundingClientRect().left + el.scrollLeft - 100;
  const y = e.clientY - el.getBoundingClientRect().top + el.scrollTop - 90;
  await safeAdd(Math.max(0, x), Math.max(0, y), 'text');
}

async function addTextNote() {
  if (!authStore.currentUser) { alert('请先登录'); return; }
  await safeAdd(40 + Math.random() * 400, 40 + Math.random() * 300, 'text');
}

async function addImageNote() {
  if (!authStore.currentUser) { alert('请先登录'); return; }
  await safeAdd(40 + Math.random() * 400, 40 + Math.random() * 300, 'image');
}

async function safeAdd(x: number, y: number, type: 'text' | 'image') {
  if (busy.value) return;
  busy.value = true;
  try {
    await store.addNote(x, y, currentUser.value, type);
    setTimeout(updateCanvasHeight, 100);
  } catch (err) {
    alert('新建便签失败：' + (err instanceof Error ? err.message : '未知错误'));
  } finally {
    busy.value = false;
  }
}

function onMove(id: string, x: number, y: number) {
  store.moveNote(id, x, y);
  store.saveDebounced(400);
}

function onResize(id: string, w: number, h: number) {
  // updateNote 自带 await，无须手动 save
  store.updateNote(id, { width: w, height: h });
  setTimeout(updateCanvasHeight, 350);
}

async function onDelete(id: string) {
  if (!confirm('删除这张便签？')) return;
  const ok = await store.deleteNote(id);
  if (!ok) alert('删除失败，请稍后重试');
  setTimeout(updateCanvasHeight, 100);
}

async function onContentChange(id: string, content: string) {
  // 图片便签之 content 即 base64，体大；onBlur 触发时直接 await
  await store.updateNote(id, { content });
  setTimeout(updateCanvasHeight, 350);
}

async function onCaptionChange(id: string, caption: string) {
  await store.updateNote(id, { caption });
}

async function confirmArchive() {
  if (!confirm('立即归档当前画布并重置？此操作不可撤销。')) return;
  await store.archiveBoard();
  alert('已归档');
}

// ─── 归档查看 ───
async function openArchive(arc: BoardMeta) {
  viewingArchiveId.value = arc.id;
  const data = await store.loadArchive(arc.id);
  if (!data) {
    alert('该期归档无法读取');
    viewingArchiveId.value = null;
    return;
  }
  viewingArchive.value = data;
}

function closeArchive() {
  viewingArchive.value = null;
  viewingArchiveId.value = null;
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('zh-CN');
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
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
  } catch {
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
  min-height: 100vh;
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
  position: sticky;
  top: 0;
  z-index: 100;
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
.board-saving-tag {
  font-size: 11px; font-weight: 600;
  padding: 2px 8px; border-radius: 10px;
  background: #e0f7fa; color: #00838f;
  border: 0.5px solid #4dd0e1;
}
.board-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.board-main {
  flex: 1;
  display: flex;
  position: relative;
}

.board-canvas {
  flex: 1;
  position: relative;
  width: 2400px;
  min-height: max(100vh, 1200px);
  background-color: #f5f0e8;
  background-image: radial-gradient(circle, #c8bea8 1px, transparent 1px);
  background-size: 24px 24px;
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
  position: sticky;
  top: 56px;
  align-self: flex-start;
  max-height: calc(100vh - 56px);
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

.archive-item {
  padding: 12px 16px;
  border-bottom: 1px solid #f0ede6;
  cursor: pointer;
  transition: background .15s;
}
.archive-item:hover { background: #faf6ee; }
.archive-item.active { background: #f0e6d4; }
.archive-title { font-size: 13px; font-weight: 600; color: var(--tx, #333); }
.archive-meta { font-size: 11px; color: var(--t3, #999); margin-top: 3px; }

/* 归档查看模态 */
.archive-viewer-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.55);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.archive-viewer {
  width: min(90vw, 1400px);
  height: min(90vh, 900px);
  background: #f5f0e8;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,.3);
}
.archive-viewer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: #fff;
  border-bottom: 1px solid #e0d8cc;
  flex-shrink: 0;
}
.archive-viewer-title { font-size: 14px; font-weight: 700; color: #333; }
.archive-viewer-sub { font-size: 12px; color: #999; font-weight: 400; margin-left: 6px; }
.archive-viewer-canvas {
  flex: 1;
  position: relative;
  overflow: auto;
  background-color: #f5f0e8;
  background-image: radial-gradient(circle, #c8bea8 1px, transparent 1px);
  background-size: 24px 24px;
  min-height: 600px;
  width: 2400px;
}
.ar-note {
  position: absolute;
  border-radius: 8px;
  box-shadow: 3px 4px 12px rgba(0,0,0,.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform-origin: center top;
}
.ar-head {
  display: flex; gap: 6px; align-items: center;
  padding: 6px 9px;
  background: rgba(0,0,0,.09);
}
.ar-author { font-size: 12px; font-weight: 700; flex: 1; color: #222; }
.ar-time { font-size: 10px; color: #666; }
.ar-body { padding: 8px 10px; flex: 1; }
.ar-text { font-size: 13px; line-height: 1.6; color: #222; white-space: pre-wrap; word-break: break-word; }
.ar-img { max-width: 100%; display: block; border-radius: 4px; }
.ar-caption { font-size: 12px; line-height: 1.5; color: #444; margin-top: 6px; white-space: pre-wrap; word-break: break-word; }
.ar-comments {
  padding: 4px 10px;
  border-top: 1px solid rgba(0,0,0,.07);
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ar-comment { font-size: 12px; line-height: 1.5; color: #1a5c2a; }
.ar-comment-author { color: #999; font-size: 10px; margin-left: 4px; }
.ar-foot {
  display: flex; justify-content: space-between;
  padding: 5px 10px;
  border-top: 1px solid rgba(0,0,0,.07);
  font-size: 12px; color: #888;
}
</style>
