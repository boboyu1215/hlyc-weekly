<template>
  <div ref="noteEl" class="sticky-note" :style="noteStyle">

    <!-- 拖拽把手：仅头部触发拖拽 -->
    <div class="sticky-header" @mousedown="onDragStart" @touchstart.prevent="onTouchDragStart">
      <span class="sticky-author">{{ note.author }}</span>
      <span class="sticky-time">{{ fmtTime(note.createdAt) }}</span>
      <button class="sticky-del" @click.stop="emit('delete', note.id)">✕</button>
    </div>

    <!-- 内容区 -->
    <div class="sticky-body">
      <!-- image 类型：图片 + 说明文字 -->
      <div v-if="note.type === 'image'" class="sticky-image-wrap">
        <img v-if="note.content" :src="note.content" class="sticky-img" />
        <label v-else class="sticky-upload">
          <input type="file" accept="image/*" @change="onImageUpload" style="display:none" />
          <span>点击上传图片</span>
        </label>
        <label v-if="note.content" class="sticky-reupload" title="更换图片">
          <input type="file" accept="image/*" @change="onImageUpload" style="display:none" />↺
        </label>
        <textarea
          v-model="localCaption"
          class="sticky-textarea"
          placeholder="添加说明…"
          @blur="emit('captionChange', note.id, localCaption)"
        />
      </div>

      <!-- text 类型：只有文字 -->
      <textarea
        v-if="note.type === 'text'"
        ref="taRef"
        v-model="localContent"
        class="sticky-textarea"
        placeholder="写点什么…"
        @input="onTextInput"
        @blur="emit('contentChange', note.id, localContent)"
      />
    </div>

    <!-- 评论区（朋友圈风格） -->
    <div v-if="note.comments.length > 0" class="sticky-comments">
      <div v-for="c in note.comments" :key="c.id" class="sticky-comment">
        <span class="comment-text">{{ c.text }}</span>
        <span class="comment-author">–{{ c.author }}</span>
        <button v-if="canDelete(c)" class="comment-del" @click.stop="emit('deleteComment', note.id, c.id)">×</button>
      </div>
    </div>

    <!-- 底部操作栏 -->
    <div class="sticky-footer">
      <button class="btn-like" @click.stop="emit('like', note.id)">
        ❤ {{ note.likes?.length || 0 }}
      </button>
      <button class="btn-comment" @click.stop="isReplying = !isReplying">
        💬 {{ note.comments.length }}
      </button>
    </div>

    <!-- 回复输入框（点击💬展开） -->
    <div v-if="isReplying" class="sticky-reply">
      <input
        ref="replyRef"
        v-model="replyText"
        class="reply-input"
        placeholder="回复…"
        @keydown.enter.prevent="submitReply"
      />
      <button class="reply-submit" @click.stop="submitReply">发</button>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import type { BoardNote } from '@/stores/board';

const props = defineProps<{
  note: BoardNote;
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

const noteEl = ref<HTMLElement | null>(null);
const localContent = ref(props.note.content || '');
const localCaption = ref(props.note.caption || '');
const replyText = ref('');
const isReplying = ref(false);
const taRef = ref<HTMLTextAreaElement | null>(null);
const replyRef = ref<HTMLInputElement | null>(null);

watch(() => props.note.content, v => { localContent.value = v || ''; nextTick(() => onTextInput()); });
watch(() => props.note.caption, v => { localCaption.value = v || ''; });
watch(isReplying, v => { if (v) nextTick(() => replyRef.value?.focus()); });

const noteStyle = computed(() => ({
  position: 'absolute' as const,
  left: props.note.position.x + 'px',
  top: props.note.position.y + 'px',
  width: props.note.width + 'px',
  zIndex: props.note.position.zIndex,
  background: props.note.color || '#deeaf7',
  transform: `rotate(${props.note.rotation}deg)`,
  transformOrigin: 'center top',
}));

function fmtTime(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function canDelete(c: any) {
  return props.isDirector || c.author === props.currentUser;
}

function onTextInput() {
  const ta = taRef.value;
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

onMounted(() => {
  nextTick(() => onTextInput());
  // 监听 CSS resize: both 的尺寸变化
  if (noteEl.value) {
    resizeObs.observe(noteEl.value);
  }
});

onBeforeUnmount(() => {
  resizeObs.disconnect();
});

// ResizeObserver：CSS resize 不会触发 JS 事件，需要这个来捕获
let resizeTid: ReturnType<typeof setTimeout> | null = null;
const resizeObs = new ResizeObserver(entries => {
  for (const entry of entries) {
    const { width, height } = entry.contentRect;
    if (width < 10 || height < 10) continue; // 忽略初始化时的异常值
    if (resizeTid) clearTimeout(resizeTid);
    resizeTid = setTimeout(() => {
      emit('resize', props.note.id, Math.round(width), Math.round(height));
    }, 300);
  }
});

function submitReply() {
  const t = replyText.value.trim();
  if (!t) return;
  emit('comment', props.note.id, t);
  replyText.value = '';
  isReplying.value = false;
}

function onImageUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => emit('contentChange', props.note.id, ev.target?.result as string);
  reader.readAsDataURL(file);
}

// 拖拽：仅头部触发
let dragStartX = 0, dragStartY = 0, dragStartNX = 0, dragStartNY = 0;

function onDragStart(e: MouseEvent) {
  emit('front', props.note.id);
  dragStartX = e.clientX; dragStartY = e.clientY;
  dragStartNX = props.note.position.x; dragStartNY = props.note.position.y;
  const onMove = (ev: MouseEvent) => {
    emit('move', props.note.id,
      dragStartNX + ev.clientX - dragStartX,
      dragStartNY + ev.clientY - dragStartY);
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function onTouchDragStart(e: TouchEvent) {
  emit('front', props.note.id);
  const t = e.touches[0];
  dragStartX = t.clientX; dragStartY = t.clientY;
  dragStartNX = props.note.position.x; dragStartNY = props.note.position.y;
  const onMove = (ev: TouchEvent) => {
    const tt = ev.touches[0];
    emit('move', props.note.id,
      dragStartNX + tt.clientX - dragStartX,
      dragStartNY + tt.clientY - dragStartY);
  };
  const onEnd = () => {
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onEnd);
  };
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onEnd);
}
</script>

<style scoped>
.sticky-note {
  border-radius: 8px;
  box-shadow: 3px 4px 12px rgba(0,0,0,.18);
  display: flex;
  flex-direction: column;
  min-width: 160px;
  position: absolute;
  transition: box-shadow .15s;
  /* 纯CSS缩放，浏览器原生右下角拖拽 */
  resize: both;
  overflow: hidden;
}

.sticky-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 9px;
  background: rgba(0,0,0,.09);
  border-radius: 8px 8px 0 0;
  cursor: grab;
  flex-shrink: 0;
  user-select: none;
}
.sticky-header:active { cursor: grabbing; }
.sticky-author { font-weight: 700; flex: 1; font-size: 12px; color: #222; }
.sticky-time { color: #666; font-size: 10px; white-space: nowrap; }
.sticky-del {
  background: none; border: none; cursor: pointer;
  color: #aaa; font-size: 12px; padding: 0 2px; line-height: 1;
  flex-shrink: 0;
}
.sticky-del:hover { color: #c00; }

.sticky-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sticky-textarea {
  width: 100%;
  border: none;
  background: transparent;
  resize: none;
  font-size: 13px;
  line-height: 1.6;
  color: #222;
  padding: 8px 10px;
  box-sizing: border-box;
  word-break: break-word;
  white-space: pre-wrap;
  overflow: hidden;
  font-family: inherit;
  cursor: text;
  user-select: text;
  min-height: 60px;
}

.sticky-image-wrap {
  position: relative;
  width: 100%;
  padding: 0 5px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.sticky-img { max-width: 100%; display: block; border-radius: 4px; }
.sticky-upload {
  width: 100%; min-height: 80px; border: 2px dashed #bbb; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 13px; color: #888;
}
.sticky-reupload {
  position: absolute; top: 8px; right: 8px;
  background: rgba(255,255,255,.85); border: none; border-radius: 50%;
  width: 24px; height: 24px; cursor: pointer; font-size: 14px;
  display: flex; align-items: center; justify-content: center;
}

.sticky-comments {
  padding: 4px 10px 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  border-top: 1px solid rgba(0,0,0,.07);
  flex-shrink: 0;
}
.sticky-comment {
  display: flex;
  align-items: flex-start;
  gap: 2px;
  font-size: 12px;
  line-height: 1.5;
}
.comment-text { color: #1a5c2a; word-break: break-all; flex: 1; }
.comment-author { color: #999; font-size: 10px; white-space: nowrap; flex-shrink: 0; margin-top: 1px; }
.comment-del {
  background: none; border: none; cursor: pointer;
  color: #ccc; font-size: 11px; padding: 0 2px; flex-shrink: 0;
}
.comment-del:hover { color: #c00; }

.sticky-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  border-top: 1px solid rgba(0,0,0,.07);
  flex-shrink: 0;
  user-select: none;
}
.btn-like, .btn-comment {
  background: none; border: none; cursor: pointer;
  font-size: 12px; color: #999; padding: 0;
}
.btn-like:hover { color: #e05; }
.btn-comment:hover { color: #4a90d9; }

.sticky-reply {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 6px;
  border-top: 1px solid rgba(0,0,0,.07);
  background: rgba(0,0,0,.03);
  flex-shrink: 0;
}
.reply-input {
  flex: 1; border: none; background: transparent;
  border-bottom: 1px solid rgba(0,0,0,.18);
  font-size: 12px; padding: 2px 4px; outline: none;
  font-family: inherit; color: #333;
}
.reply-submit {
  background: none; border: none; cursor: pointer;
  font-size: 12px; color: #555; font-weight: 500; padding: 0 4px;
}
.reply-submit:hover { color: #111; }
</style>
