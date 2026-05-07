<template>
  <div class="mention-wrap" ref="wrapEl">
    <textarea
      ref="textareaEl"
      v-model="localValue"
      :placeholder="placeholder"
      :rows="rows"
      class="mention-textarea"
      @input="onInput"
      @keydown="onKeydown"
      @blur="onBlur"
    />
    <!-- @ 选择弹窗：Teleport 至 body，绕开父级 stacking context -->
    <Teleport to="body">
      <div
        v-if="showPicker"
        class="mention-picker-fixed"
        :style="pickerStyle"
      >
        <div
          v-for="(u, i) in filteredUsers"
          :key="u"
          class="mention-item"
          :class="{ active: i === activeIdx }"
          @mousedown.prevent="selectUser(u)"
        >
          <span class="mention-avatar">{{ u.slice(0,1) }}</span>
          <span>{{ u }}</span>
        </div>
        <div v-if="filteredUsers.length === 0" class="mention-empty">无匹配用户</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps<{
  modelValue: string;
  placeholder?: string;
  rows?: number;
  users: string[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void;
}>();

const textareaEl = ref<HTMLTextAreaElement | null>(null);
const wrapEl = ref<HTMLElement | null>(null);
const localValue = ref(props.modelValue);
const showPicker = ref(false);
const keyword = ref('');
const activeIdx = ref(0);
let atPos = -1;

// 弹窗在屏幕上的绝对坐标
const pickerPos = ref({ left: 0, top: 0 });

const pickerStyle = computed(() => ({
  left: pickerPos.value.left + 'px',
  top: pickerPos.value.top + 'px',
}));

watch(() => props.modelValue, v => {
  if (v !== localValue.value) localValue.value = v;
  nextTick(autoResize);
});
watch(localValue, v => emit('update:modelValue', v));

const filteredUsers = computed(() => {
  const kw = keyword.value.toLowerCase();
  return props.users.filter(u => u.toLowerCase().includes(kw));
});

function autoResize() {
  const ta = textareaEl.value;
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

// 计算弹窗位置：textarea 上方或下方，看屏幕剩余空间
function updatePickerPos() {
  const ta = textareaEl.value;
  if (!ta) return;
  const rect = ta.getBoundingClientRect();
  const estimatedHeight = Math.min(filteredUsers.value.length * 36 + 16, 200);
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;

  if (spaceBelow >= estimatedHeight + 8 || spaceBelow >= spaceAbove) {
    // 下方有足够空间，或下方比上方大
    pickerPos.value = {
      left: rect.left,
      top: rect.bottom + 4,
    };
  } else {
    // 向上弹
    pickerPos.value = {
      left: rect.left,
      top: rect.top - estimatedHeight - 4,
    };
  }
}

function onInput() {
  autoResize();
  const ta = textareaEl.value;
  if (!ta) return;
  const pos = ta.selectionStart;
  const text = localValue.value;
  const before = text.slice(0, pos);
  const match = before.match(/@([^\s@]*)$/);
  if (match) {
    atPos = before.lastIndexOf('@');
    keyword.value = match[1];
    showPicker.value = true;
    activeIdx.value = 0;
    nextTick(updatePickerPos);
  } else {
    showPicker.value = false;
    atPos = -1;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (!showPicker.value) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIdx.value = (activeIdx.value + 1) % Math.max(filteredUsers.value.length, 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIdx.value = (activeIdx.value - 1 + filteredUsers.value.length) % Math.max(filteredUsers.value.length, 1);
  } else if (e.key === 'Enter' && filteredUsers.value.length > 0) {
    e.preventDefault();
    selectUser(filteredUsers.value[activeIdx.value]);
  } else if (e.key === 'Escape') {
    showPicker.value = false;
  }
}

function onBlur() {
  setTimeout(() => { showPicker.value = false; }, 150);
}

function selectUser(name: string) {
  const text = localValue.value;
  const ta = textareaEl.value;
  const pos = ta?.selectionStart ?? text.length;
  const before = text.slice(0, atPos);
  const after = text.slice(pos);
  localValue.value = `${before}@${name} ${after}`;
  showPicker.value = false;
  atPos = -1;
  const newPos = before.length + name.length + 2;
  setTimeout(() => {
    ta?.setSelectionRange(newPos, newPos);
    ta?.focus();
  }, 0);
}

// 滚动 / 窗口变化时重算位置（capture: 捕获所有滚动容器，包括 modal 内的滚动）
function onScrollOrResize() {
  if (showPicker.value) updatePickerPos();
}

onMounted(() => {
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScrollOrResize, true);
  window.removeEventListener('resize', onScrollOrResize);
});
</script>

<style scoped>
.mention-wrap { position: relative; width: 100%; }
.mention-textarea {
  width: 100%; box-sizing: border-box;
  border: 1px solid var(--bdr);
  border-radius: var(--rr);
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  background: var(--bg);
  color: var(--t1);
  resize: none;
  overflow-y: hidden;
  outline: none;
  transition: border-color .15s;
}
.mention-textarea:focus { border-color: var(--gold); }
</style>

<!-- 全局样式：Teleport 后元素脱离组件作用域，scoped 不生效，需用全局 -->
<style>
.mention-picker-fixed {
  position: fixed;
  min-width: 160px;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.12);
  z-index: 99999;
  overflow: hidden;
  max-height: 200px;
  overflow-y: auto;
}
.mention-picker-fixed .mention-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; cursor: pointer;
  font-size: 13px; color: #333;
  transition: background .1s;
}
.mention-picker-fixed .mention-item:hover,
.mention-picker-fixed .mention-item.active {
  background: #f5f5f5;
}
.mention-picker-fixed .mention-avatar {
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--gold, #b8860b);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 600; flex-shrink: 0;
}
.mention-picker-fixed .mention-empty {
  padding: 10px 12px; color: #999; font-size: 12px;
}
</style>
