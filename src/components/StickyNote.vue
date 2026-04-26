<template>
  <div
    class="sticky-note"
    :style="noteStyle"
    @mousedown.stop="onMouseDown"
    @touchstart.stop.prevent="onTouchStart"
  >
    <div class="sticky-header" :style="{ filter: 'brightness(0.88)' }">
      <span class="sticky-author">{{ note.author }}</span>
      <span class="sticky-time">{{ fmtTime(note.createdAt) }}</span>
      <button class="sticky-del" @click.stop="emit('delete', note.id)">✕</button>
    </div>

    <div class="sticky-body">
      <textarea
        v-if="note.type === 'text'"
        v-model="localContent"
        class="sticky-textarea"
        placeholder="写点什么…"
        @blur="onContentBlur"
        @mousedown.stop
        @touchstart.stop
      />
      <div v-else class="sticky-image-wrap" @mousedown.stop @touchstart.stop>
        <img v-if="note.content" :src="note.content" class="sticky-img" />
        <label v-else class="sticky-upload">
          <input type="file" accept="image/*" @change="onImageUpload" style="display:none" />
          <span>＋ 点击上传图片</span>
        </label>
        <label v-if="note.content" class="sticky-reupload" title="更换图片">
          <input type="file" accept="image/*" @change="onImageUpload" style="display:none" />
          🔄
        </label>
        <!-- 图片下方的文字说明输入框 -->
        <textarea
          v-model="localCaption"
          class="sticky-textarea sticky-caption"
          placeholder="添加说明文字…"
          @blur="onCaptionBlur"
          @mousedown.stop
          @touchstart.stop
        />
      </div>
    </div>

    <div class="sticky-footer" @mousedown.stop @touchstart.stop>
      <button
        class="sticky-like"
        :class="{ liked: note.likes.includes(currentUser) }"
        @click.stop="emit('like', note.id)"
      >❤ {{ note.likes.length }}</button>
      <button class="sticky-comment-btn" @click.stop="showComments = !showComments">
        💬 {{ note.comments.length }}
      </button>
    </div>

    <div v-if="showComments" class="sticky-comments" @mousedown.stop @touchstart.stop>
      <div v-for="c in note.comments" :key="c.id" class="sticky-comment">
        <span class="comment-text">{{ c.text }}</span>
        <span class="comment-author"> — {{ c.author }}</span>
        <button
          v-if="c.author === currentUser || isDirector"
          class="comment-del"
          @click.stop="emit('deleteComment', note.id, c.id)"
        >✕</button>
      </div>
      <div class="sticky-comment-input">
        <input
          v-model="commentText"
          placeholder="写评论…"
          @keydown.enter.prevent="submitComment"
          class="comment-input"
        />
        <button @click.stop="submitComment" class="comment-submit">发</button>
      </div>
    </div>

    <div class="sticky-resize" @mousedown.stop="onResizeDown" @touchstart.stop.prevent="onResizeTouchStart" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { StickyNote } from '@/stores/board';

const props = defineProps<{
  note: StickyNote;
  currentUser: string;
  isDirector: boolean;
  boardEl: HTMLElement | null;
}>();

const emit = defineEmits<{
  (e: 'move', id: string, x: number, y: number): void;
  (e: 'resize', id: string, w: number, h: number): void;
  (e: 'front', id: string): void;
  (e: 'delete', id: string): void;
  (e: 'like', id: string): void;
  (e: 'comment', id: string, text: string): void;
  (e: 'deleteComment', noteId: string, commentId: string): void;
  (e: 'contentChange', id: string, content: string): void;
  (e: 'captionChange', id: string, caption: string): void;
}>();

const showComments = ref(false);
const commentText = ref('');
const localContent = ref(props.note.content);
const localCaption = ref(props.note.caption || '');

watch(() => props.note.content, v => { localContent.value = v; });
watch(() => props.note.caption, v => { localCaption.value = v || ''; });

const noteStyle = computed(() => ({
  position: 'absolute' as const,
  left: props.note.position.x + 'px',
  top: props.note.position.y + 'px',
  width: props.note.width + 'px',
  minHeight: props.note.height + 'px',
  zIndex: props.note.position.zIndex,
  background: props.note.color,
  transform: `rotate(${props.note.rotation}deg)`,
}));

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function onContentBlur() {
  emit('contentChange', props.note.id, localContent.value);
}

function onCaptionBlur() {
  emit('captionChange', props.note.id, localCaption.value);
}

function onImageUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => emit('contentChange', props.note.id, ev.target?.result as string);
  reader.readAsDataURL(file);
}

function submitComment() {
  const t = commentText.value.trim();
  if (!t) return;
  emit('comment', props.note.id, t);
  commentText.value = '';
}

// 拖拽
let dragOffX = 0, dragOffY = 0;

function startDrag(clientX: number, clientY: number) {
  emit('front', props.note.id);
  dragOffX = clientX - props.note.position.x;
  dragOffY = clientY - props.note.position.y;
}

function onDragMove(clientX: number, clientY: number) {
  const board = props.boardEl;
  let x = clientX - dragOffX;
  let y = clientY - dragOffY;
  if (board) {
    x = Math.max(0, Math.min(x, board.scrollWidth - props.note.width));
    y = Math.max(0, Math.min(y, board.scrollHeight - props.note.height));
  }
  emit('move', props.note.id, x, y);
}

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return;
  startDrag(e.clientX, e.clientY);
  const onMove = (ev: MouseEvent) => onDragMove(ev.clientX, ev.clientY);
  const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function onTouchStart(e: TouchEvent) {
  const t = e.touches[0];
  startDrag(t.clientX, t.clientY);
  const onMove = (ev: TouchEvent) => { const tt = ev.touches[0]; onDragMove(tt.clientX, tt.clientY); };
  const onEnd = () => { window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd); };
  window.addEventListener('touchmove', onMove, { passive: true });
  window.addEventListener('touchend', onEnd);
}

// Resize
let resizeStartX = 0, resizeStartY = 0, resizeStartW = 0, resizeStartH = 0;

function onResizeDown(e: MouseEvent) {
  e.preventDefault();
  resizeStartX = e.clientX; resizeStartY = e.clientY;
  resizeStartW = props.note.width; resizeStartH = props.note.height;
  const onMove = (ev: MouseEvent) => {
    emit('resize', props.note.id,
      Math.max(140, resizeStartW + ev.clientX - resizeStartX),
      Math.max(120, resizeStartH + ev.clientY - resizeStartY));
  };
  const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function onResizeTouchStart(e: TouchEvent) {
  const t = e.touches[0];
  resizeStartX = t.clientX; resizeStartY = t.clientY;
  resizeStartW = props.note.width; resizeStartH = props.note.height;
  const onMove = (ev: TouchEvent) => {
    const tt = ev.touches[0];
    emit('resize', props.note.id,
      Math.max(140, resizeStartW + tt.clientX - resizeStartX),
      Math.max(120, resizeStartH + tt.clientY - resizeStartY));
  };
  const onEnd = () => { window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd); };
  window.addEventListener('touchmove', onMove, { passive: true });
  window.addEventListener('touchend', onEnd);
}
</script>

<style scoped>
.sticky-note {
  border-radius: 4px;
  box-shadow: 3px 4px 12px rgba(0,0,0,.18), 0 1px 3px rgba(0,0,0,.12);
  display: flex;
  flex-direction: column;
  cursor: grab;
  user-select: none;
  transition: box-shadow .15s;
  min-width: 140px;
}
.sticky-note:active { cursor: grabbing; box-shadow: 6px 8px 20px rgba(0,0,0,.28); }

.sticky-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px 4px 0 0;
  background: rgba(0,0,0,.08);
  font-size: 11px;
  color: #555;
}
.sticky-author { font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sticky-time { opacity: .7; white-space: nowrap; }
.sticky-del { background: none; border: none; cursor: pointer; color: #888; padding: 0 2px; font-size: 12px; }
.sticky-del:hover { color: #e53935; }

.sticky-body { flex: 1; padding: 6px; }

.sticky-textarea {
  width: 100%; height: 100%; min-height: 90px;
  border: none; background: transparent; resize: none;
  font-size: 13px; line-height: 1.5; color: #333;
  font-family: inherit; cursor: text; outline: none;
  box-sizing: border-box;
}

.sticky-image-wrap { position: relative; width: 100%; min-height: 100px; display: flex; align-items: center; justify-content: center; }
.sticky-img { max-width: 100%; max-height: 200px; border-radius: 3px; display: block; }
.sticky-upload {
  display: flex; align-items: center; justify-content: center;
  width: 100%; min-height: 90px; border: 2px dashed #bbb; border-radius: 4px;
  cursor: pointer; color: #999; font-size: 13px;
}
.sticky-upload:hover { border-color: #888; color: #555; }
.sticky-reupload {
  position: absolute; top: 4px; right: 4px;
  background: rgba(255,255,255,.7); border-radius: 50%;
  padding: 2px 4px; cursor: pointer; font-size: 14px;
}
.sticky-caption {
  min-height: 40px;
  border-top: 1px solid rgba(0,0,0,.08);
  margin-top: 4px;
  padding-top: 4px;
}

.sticky-footer {
  display: flex; gap: 6px; padding: 4px 8px 6px;
  border-top: 1px solid rgba(0,0,0,.06);
}
.sticky-like, .sticky-comment-btn {
  background: none; border: none; cursor: pointer;
  font-size: 12px; color: #777; padding: 2px 4px; border-radius: 4px;
}
.sticky-like:hover, .sticky-comment-btn:hover { background: rgba(0,0,0,.07); }
.sticky-like.liked { color: #e53935; }

.sticky-comments {
  border-top: 1px solid rgba(0,0,0,.08);
  padding: 6px 8px; max-height: 160px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 4px;
}
.sticky-comment { font-size: 12px; line-height: 1.4; color: #444; display: flex; align-items: flex-start; gap: 4px; }
.comment-author { font-weight: 600; white-space: nowrap; color: #888; font-size: 11px; }
.comment-text { flex: 1; word-break: break-all; }
.comment-del { background: none; border: none; color: #bbb; cursor: pointer; font-size: 11px; padding: 0 2px; }
.comment-del:hover { color: #e53935; }

.sticky-comment-input { display: flex; gap: 4px; margin-top: 4px; }
.comment-input {
  flex: 1; border: 1px solid #ddd; border-radius: 4px;
  padding: 3px 6px; font-size: 12px; outline: none;
  background: rgba(255,255,255,.6);
}
.comment-input:focus { border-color: #aaa; }
.comment-submit {
  background: #555; color: #fff; border: none; border-radius: 4px;
  padding: 3px 8px; font-size: 12px; cursor: pointer;
}
.comment-submit:hover { background: #333; }

.sticky-resize {
  position: absolute; right: 0; bottom: 0;
  width: 14px; height: 14px; cursor: se-resize;
  background: linear-gradient(135deg, transparent 50%, rgba(0,0,0,.15) 50%);
  border-radius: 0 0 4px 0;
}
</style>
