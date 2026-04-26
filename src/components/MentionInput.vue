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
    <!-- @ 选择弹窗 -->
    <div v-if="showPicker" class="mention-picker">
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

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

watch(() => props.modelValue, v => { if (v !== localValue.value) localValue.value = v; });
watch(localValue, v => emit('update:modelValue', v));

const filteredUsers = computed(() => {
  const kw = keyword.value.toLowerCase();
  return props.users.filter(u => u.toLowerCase().includes(kw));
});

function onInput() {
  const ta = textareaEl.value;
  if (!ta) return;
  const pos = ta.selectionStart;
  const text = localValue.value;
  // 找最近的 @
  const before = text.slice(0, pos);
  const match = before.match(/@([^\s@]*)$/);
  if (match) {
    atPos = before.lastIndexOf('@');
    keyword.value = match[1];
    showPicker.value = true;
    activeIdx.value = 0;
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
  // 光标移到插入点后
  const newPos = before.length + name.length + 2;
  setTimeout(() => {
    ta?.setSelectionRange(newPos, newPos);
    ta?.focus();
  }, 0);
}
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
  resize: vertical;
  outline: none;
  transition: border-color .15s;
}
.mention-textarea:focus { border-color: var(--gold); }

.mention-picker {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  min-width: 160px;
  background: var(--card);
  border: 1px solid var(--bdr);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.12);
  z-index: 999;
  overflow: hidden;
  max-height: 200px;
  overflow-y: auto;
}
.mention-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; cursor: pointer;
  font-size: 13px; color: var(--t1);
  transition: background .1s;
}
.mention-item:hover, .mention-item.active { background: var(--bg); }
.mention-avatar {
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--gold); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 600; flex-shrink: 0;
}
.mention-empty { padding: 10px 12px; color: var(--t3); font-size: 12px; }
</style>
