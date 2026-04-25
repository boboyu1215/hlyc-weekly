<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';

const props = withDefaults(defineProps<{
  modelValue: string;          // 'YYYY-MM-DD' 格式
  label?: string;              // 有值时显示的标签，如 '4/28'
  placeholder?: string;        // 无值时的占位文字，如 '📅'
  inline?: boolean;            // 内联模式：触发器占满宽度，适配表单
}>(), {
  label: undefined,
  placeholder: '📅',
  inline: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void;
}>();

const show = ref(false);
const viewYear = ref(2026);
const viewMonth = ref(0);      // 0-11
const anchor = ref<HTMLElement | null>(null);

// 初始化视图日期
watch(() => props.modelValue, (v) => {
  if (v) {
    const d = new Date(v + 'T00:00:00');
    viewYear.value = d.getFullYear();
    viewMonth.value = d.getMonth();
  }
}, { immediate: true });

// 当弹出时，如果没有值就用当前日期
watch(show, (v) => {
  if (v && !props.modelValue) {
    const now = new Date();
    viewYear.value = now.getFullYear();
    viewMonth.value = now.getMonth();
  }
});

const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'];

// 日历网格
const calendarDays = computed(() => {
  const y = viewYear.value;
  const m = viewMonth.value;
  const first = new Date(y, m, 1);
  const startDay = first.getDay();       // 0=Sun
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrev = new Date(y, m, 0).getDate();

  const cells: { day: number; current: boolean; dateStr: string }[] = [];

  // 上月填充
  for (let i = startDay - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    const pm = m === 0 ? 11 : m - 1;
    const py = m === 0 ? y - 1 : y;
    cells.push({
      day: d,
      current: false,
      dateStr: `${py}-${String(pm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    });
  }

  // 当月
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      current: true,
      dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    });
  }

  // 下月填充（凑满 6 行）
  const remain = 42 - cells.length;
  for (let d = 1; d <= remain; d++) {
    const nm = m === 11 ? 0 : m + 1;
    const ny = m === 11 ? y + 1 : y;
    cells.push({
      day: d,
      current: false,
      dateStr: `${ny}-${String(nm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    });
  }

  return cells;
});

function isSelected(dateStr: string): boolean {
  return dateStr === props.modelValue;
}

function isToday(dateStr: string): boolean {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return dateStr === today;
}

function selectDate(dateStr: string) {
  emit('update:modelValue', dateStr);
  show.value = false;
}

function prevMonth() {
  if (viewMonth.value === 0) {
    viewMonth.value = 11;
    viewYear.value--;
  } else {
    viewMonth.value--;
  }
}

function nextMonth() {
  if (viewMonth.value === 11) {
    viewMonth.value = 0;
    viewYear.value++;
  } else {
    viewMonth.value++;
  }
}

function clearDate() {
  emit('update:modelValue', '');
  show.value = false;
}

function toggle() {
  show.value = !show.value;
}

// 格式化为中文日期 '2026-04-28' -> '2026/04/28'
function formatDateCN(dateStr: string): string {
  return dateStr.replace(/-/g, '/');
}

// 点击外部关闭
function handleClickOutside(e: MouseEvent) {
  const target = e.target as Node;
  const pickerEl = document.querySelector('.dp-popup.active');
  if (pickerEl && !pickerEl.contains(target) && anchor.value && !anchor.value.contains(target)) {
    show.value = false;
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside);
});
</script>

<template>
  <div class="dp-anchor" :class="{ 'dp-inline': inline }" ref="anchor" @click.stop="toggle">
    <span class="dp-trigger" :class="{ 'has-date': modelValue }">
      <template v-if="inline">
        <span class="dp-inline-icon">📅</span>
        <span class="dp-inline-text">{{ modelValue ? formatDateCN(modelValue) : (placeholder || '选择日期') }}</span>
        <span class="dp-inline-arrow">▾</span>
      </template>
      <template v-else>
        {{ modelValue ? (label || modelValue) : (placeholder || '📅') }}
      </template>
    </span>
    <!-- 弹出日历 -->
    <Transition name="dp-fade">
      <div v-if="show" class="dp-popup active" :class="{ 'dp-popup-left': inline }" @click.stop>
        <!-- 头部导航 -->
        <div class="dp-head">
          <button class="dp-nav" @click="prevMonth">‹</button>
          <div class="dp-title">{{ viewYear }}年 {{ MONTH_NAMES[viewMonth] }}</div>
          <button class="dp-nav" @click="nextMonth">›</button>
        </div>
        <!-- 星期头 -->
        <div class="dp-weekdays">
          <div v-for="wd in WEEK_DAYS" :key="wd" class="dp-wd" :class="{ weekend: wd === '日' || wd === '六' }">{{ wd }}</div>
        </div>
        <!-- 日期网格 -->
        <div class="dp-grid">
          <div
            v-for="(cell, idx) in calendarDays"
            :key="idx"
            class="dp-cell"
            :class="{
              'dp-other': !cell.current,
              'dp-selected': isSelected(cell.dateStr),
              'dp-today': isToday(cell.dateStr) && !isSelected(cell.dateStr)
            }"
            @click="selectDate(cell.dateStr)"
          >
            {{ cell.day }}
          </div>
        </div>
        <!-- 底部操作 -->
        <div class="dp-foot" v-if="modelValue">
          <button class="dp-clear" @click="clearDate">清除日期</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.dp-anchor {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
}

/* 内联模式：占满宽度 */
.dp-anchor.dp-inline {
  width: 100%;
  display: flex;
}

.dp-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  padding: 0 6px;
  height: 30px;
  font-size: 11px;
  color: var(--t3, #999);
  background: var(--bg, #f8f8f8);
  border: 0.5px solid var(--bdr, #e0e0e0);
  border-radius: var(--rr, 4px);
  white-space: nowrap;
  transition: all 0.15s;
  font-family: var(--fn, system-ui);
  box-sizing: border-box;
}

.dp-trigger:hover {
  border-color: var(--gold, #9a7200);
  color: var(--gold, #9a7200);
}

.dp-trigger.has-date {
  color: var(--gold, #9a7200);
  border-color: var(--gm, rgba(154,114,0,0.2));
  background: var(--gl, rgba(154,114,0,0.06));
  font-weight: 700;
}

/* 内联触发器 */
.dp-inline .dp-trigger {
  width: 100%;
  justify-content: flex-start;
  padding: 0 10px;
  height: 36px;
  font-size: 13px;
  gap: 6px;
}

.dp-inline .dp-trigger:hover {
  border-color: var(--gold, #9a7200);
}

.dp-inline .dp-inline-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.dp-inline .dp-inline-text {
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dp-inline .dp-inline-arrow {
  color: var(--t3, #999);
  font-size: 10px;
  flex-shrink: 0;
  transition: transform 0.2s;
}

/* 弹出面板左对齐（inline 模式） */
.dp-popup-left {
  left: 0;
  right: auto;
}

/* 弹出日历面板 */
.dp-popup {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 1000;
  width: 260px;
  background: var(--card, #fff);
  border: 0.5px solid var(--bdr, #e0e0e0);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
  padding: 8px;
  user-select: none;
  font-family: var(--fn, system-ui);
}

/* 头部 */
.dp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding: 0 2px;
}

.dp-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--t1, #333);
}

.dp-nav {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--t2, #666);
  font-size: 18px;
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  line-height: 1;
}

.dp-nav:hover {
  background: var(--bg, #f5f5f5);
}

/* 星期 */
.dp-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 4px;
}

.dp-wd {
  text-align: center;
  font-size: 10px;
  color: var(--t3, #999);
  padding: 2px 0;
  font-weight: 500;
}

.dp-wd.weekend {
  color: var(--rt, #b00020);
}

/* 日期网格 */
.dp-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
}

.dp-cell {
  text-align: center;
  padding: 5px 0;
  font-size: 12px;
  color: var(--t1, #333);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.12s;
  line-height: 1.2;
}

.dp-cell:hover {
  background: var(--bg, #f0f0f0);
}

.dp-cell.dp-other {
  color: var(--t3, #ccc);
}

.dp-cell.dp-today {
  color: var(--gold, #9a7200);
  font-weight: 700;
  background: var(--gl, rgba(154,114,0,0.06));
}

.dp-cell.dp-selected {
  background: var(--gold, #9a7200);
  color: #fff;
  font-weight: 700;
}

.dp-cell.dp-selected:hover {
  background: #856200;
}

/* 底部 */
.dp-foot {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 0.5px solid var(--bdr, #e0e0e0);
  text-align: center;
}

.dp-clear {
  border: none;
  background: transparent;
  color: var(--t3, #999);
  font-size: 11px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.15s;
}

.dp-clear:hover {
  color: var(--rt, #b00020);
  background: var(--rb, rgba(176,0,32,0.06));
}

/* 动画 */
.dp-fade-enter-active {
  transition: all 0.18s ease-out;
}

.dp-fade-leave-active {
  transition: all 0.12s ease-in;
}

.dp-fade-enter-from {
  opacity: 0;
  transform: translateY(-6px) scale(0.96);
}

.dp-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
