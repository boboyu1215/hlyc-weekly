<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useAppStore } from '@/stores/app';
import { useProjectStore } from '@/stores/project';
import { useAuthStore } from '@/stores/auth';
import { StorageService } from '@/services/storage';
import { wkLabel } from '@/utils/date';
import type { Project, WeeklySnapshot, TaskItem } from '@/core/types';
import { STAGES } from '@/config/constants';
import DatePicker from './DatePicker.vue';

const props = defineProps<{
  show: boolean;
  project: Project | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save'): void;
}>();

const appStore = useAppStore();
const projectStore = useProjectStore();
const authStore = useAuthStore();
const storage = StorageService.getInstance();

// 表单震动效果
const formShaking = ref(false);
function shakeForm() {
  formShaking.value = true;
  setTimeout(() => { formShaking.value = false; }, 600);
}

// 表单数据
const form = ref<WeeklySnapshot>({
  status: 'g',
  stage: 0,
  risk: [],
  coreOutput: '',
  coreOutputItems: [],  // 维度一序列化（内容+实际完成日期）
  coreAction: [],
  decision: [],
  crossDept: [],
  next: '',
  incident: '',
  knowledge: ''
});

// 计算报告周的周一和周日（用于日期边界限制）
const reportWeekBounds = computed(() => {
  const yr = appStore.yr, wk = appStore.wk;
  const jan4 = new Date(yr, 0, 4);
  const offset = (jan4.getDay() + 6) % 7;
  const mon = new Date(yr, 0, 4 - offset + (wk - 1) * 7);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { min: fmt(mon), max: fmt(sun) };
});

// 将字段值标准化为数组（兼容旧字符串格式）
function toItemList(v: any): TaskItem[] {
  if (!v || v === '无' || v === '') return [{ text: '', dueDate: '' }];
  if (Array.isArray(v)) return v.length ? v : [{ text: '', dueDate: '' }];
  // 旧字符串：按换行拆分
  return v.split('\n').filter((s: string) => s.trim()).map((s: string) => ({ text: s, dueDate: '' })).concat([{ text: '', dueDate: '' }]);
}

// 监听项目变化，加载快照数据
watch(() => props.project, (project) => {
  if (project) {
    const snap = storage.getSnap(appStore.yr, appStore.wk, project.id, projectStore.projects);
    form.value = {
      ...snap,
      risk: toItemList(snap.risk),
      coreOutputItems: toItemList((snap as any).coreOutputItems || snap.coreOutput),
      coreAction: toItemList(snap.coreAction),
      decision: toItemList(snap.decision),
      crossDept: toItemList(snap.crossDept)
    };
  }
}, { immediate: true });

// 格式化日期标签 "2026-03-28" -> "3/28"
function dueDateLabel(d: string): string {
  if (!d) return '';
  const m = d.match(/\d{4}-(\d{2})-(\d{2})/);
  if (!m) return d;
  return `${parseInt(m[1])}/${parseInt(m[2])}`;
}

// 更新列表项文本
function updateItemText(field: 'risk' | 'coreAction' | 'decision' | 'crossDept' | 'coreOutputItems', idx: number, text: string) {
  const items = form.value[field] as TaskItem[];
  items[idx] = { ...items[idx], text };
  autoStatus();
}

// 更新列表项日期
function updateItemDate(field: 'risk' | 'coreAction' | 'decision' | 'crossDept' | 'coreOutputItems', idx: number, date: string) {
  const items = form.value[field] as TaskItem[];
  items[idx] = { ...items[idx], dueDate: date };
}

// 回车增加新行
function handleKeydown(e: KeyboardEvent, field: 'risk' | 'coreAction' | 'decision' | 'crossDept' | 'coreOutputItems', idx: number) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const items = [...(form.value[field] as TaskItem[])];
  items.splice(idx + 1, 0, { text: '', dueDate: '' });
  form.value[field] = items;

  // 聚焦到新行
  nextTick(() => {
    const inputs = document.querySelectorAll(`.item-list[data-field="${field}"] .item-text`);
    if (inputs[idx + 1]) {
      (inputs[idx + 1] as HTMLInputElement).focus();
    }
  });
}

// 删除行
function deleteItem(field: 'risk' | 'coreAction' | 'decision' | 'crossDept' | 'coreOutputItems', idx: number) {
  const items = [...(form.value[field] as TaskItem[])];
  items.splice(idx, 1);
  if (items.length === 0) {
    items.push({ text: '', dueDate: '' });
  }
  form.value[field] = items;
  autoStatus();
}

// 判断列表是否有实际内容
function itemListHasContent(v: any): boolean {
  if (!v) return false;
  if (Array.isArray(v)) return v.some(item => item.text && item.text.trim() && item.text.trim() !== '无');
  if (typeof v === 'string') return v.trim().length > 0 && v.trim() !== '无';
  return false;
}

// 自动状态联动
function autoStatus() {
  const hasRisk = itemListHasContent(form.value.risk);
  const hasDec = itemListHasContent(form.value.decision);
  const target = hasRisk || hasDec ? 'r' : 'g';
  if (form.value.status !== target) {
    form.value.status = target;
  }
}

// 自动高度调整
function autoHeight(e: Event) {
  const el = e.target as HTMLTextAreaElement;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// 保存
function handleSave() {
  if (!props.project) return;

  // 维度一：上周完成情况 - 日期必填验证
  const coreOutputItems = (form.value as any).coreOutputItems as TaskItem[];
  for (let i = 0; i < coreOutputItems.length; i++) {
    const item = coreOutputItems[i];
    if (item.text && item.text.trim() && !item.dueDate) {
      shakeForm();
      alert(`上周完成情况 第 ${i + 1} 项「${item.text}」未填写实际完成日期，请填写后再保存`);
      return;
    }
  }

  // 维度二：本周计划 - 日期必填验证
  const coreActions = form.value.coreAction as TaskItem[];
  for (let i = 0; i < coreActions.length; i++) {
    const item = coreActions[i];
    if (item.text && item.text.trim() && !item.dueDate) {
      shakeForm();
      alert(`本周计划 第 ${i + 1} 项「${item.text}」未设置计划完成时间，请设置后再保存`);
      return;
    }
  }

  // 清理空行
  const cleanedForm = {
    ...form.value,
    risk: (form.value.risk as TaskItem[]).filter(item => item.text.trim()),
    coreOutputItems: coreOutputItems.filter(item => item.text.trim()),
    coreAction: coreActions.filter(item => item.text.trim()),
    decision: (form.value.decision as TaskItem[]).filter(item => item.text.trim()),
    crossDept: (form.value.crossDept as TaskItem[]).filter(item => item.text.trim())
  };

  // 保存快照
  storage.setSnap(appStore.yr, appStore.wk, props.project.id, cleanedForm);

  // 标记待提交（匹配旧系统 forms.js 的 addPendingSubmit）
  storage.addPendingSubmit(props.project.id);

  // 记录活动
  storage.addActivity({
    type: 'edit',
    user: authStore.currentUser!,
    time: Date.now(),
    desc: `编辑项目「${props.project.name}」周报`,
    projectId: props.project.id,
    weekKey: appStore.weekKey
  });

  emit('save');
  emit('close');
}

// 取消
function handleCancel() {
  emit('close');
}
</script>

<template>
  <div v-if="show" class="modal-overlay">
    <div class="modal" :class="{ 'form-shake': formShaking }" style="max-width: 780px;">
      <!-- 头部 -->
      <div class="modal-header">
        <div>
          <div class="modal-title">更新工作事项状态</div>
          <div style="font-size: 11px; color: var(--t3); margin-top: 2px;">
            {{ project?.name }} · {{ wkLabel(appStore.yr, appStore.wk) }}
          </div>
        </div>
        <button class="modal-close" @click="handleCancel">×</button>
      </div>

      <!-- 主体 -->
      <div class="modal-body">
        <div style="font-size: 12px; color: var(--t2); margin-bottom: 16px;">
          未改动的字段将自动继承上周数据，只填有变化的内容即可
        </div>

        <!-- 项目状态 -->
        <div class="ff" style="margin-bottom: 11px;">
          <label class="ff-label">项目状态</label>
          <div class="ssel">
            <div
              class="sopt"
              :class="{ sr: form.status === 'r' }"
              @click="form.status = 'r'"
            >
              🔴 需决策/卡住
            </div>
            <div
              class="sopt"
              :class="{ sy: form.status === 'y' }"
              @click="form.status = 'y'"
            >
              🟡 需关注
            </div>
            <div
              class="sopt"
              :class="{ sg: form.status === 'g' }"
              @click="form.status = 'g'"
            >
              🟢 正常推进
            </div>
          </div>
        </div>

        <!-- 当前阶段 -->
        <div class="ff" style="margin-bottom: 11px;">
          <label class="ff-label">当前阶段</label>
          <div class="spk">
            <div
              v-for="(stage, idx) in STAGES"
              :key="idx"
              class="spi"
              :class="{
                ds: idx < form.stage,
                as: idx === form.stage
              }"
              @click="form.stage = idx"
            >
              {{ stage }}
            </div>
          </div>
        </div>

        <!-- 维度一：上周工作完成情况（序列填写，每条必填实际完成日期）-->
        <div style="font-size: 12px; font-weight: 700; color: var(--gold); margin: 16px 0 8px; padding-bottom: 6px; border-bottom: 0.5px solid var(--bdr);">
          维度一：上周工作完成情况
        </div>
        <div class="ff" style="margin-bottom: 6px;">
          <label class="ff-label">
            本报告周期内已完成的工作
            <span style="font-weight: 400; color: var(--t3);">（回车增加一行，必须填写实际完成日期）</span>
          </label>
          <div class="item-list" data-field="coreOutputItems">
            <div
              v-for="(item, idx) in ((form as any).coreOutputItems as TaskItem[])"
              :key="idx"
              class="item-row"
            >
              <span class="item-no">{{ idx + 1 }}.</span>
              <input
                v-model="item.text"
                class="item-text"
                type="text"
                :placeholder="idx === 0 ? '例：完成深化方案并提交大区' : '继续添加…'"
                @input="updateItemText('coreOutputItems' as any, idx, ($event.target as HTMLInputElement).value)"
                @keydown="handleKeydown($event, 'coreOutputItems' as any, idx)"
              />
              <DatePicker
                :model-value="item.dueDate"
                :label="item.dueDate ? dueDateLabel(item.dueDate) : undefined"
                placeholder="📅"
                :max="reportWeekBounds.max"
                :style="{ outline: item.text && item.text.trim() && !item.dueDate ? '1.5px solid var(--rt)' : 'none', borderRadius: '8px' }"
                @update:model-value="updateItemDate('coreOutputItems' as any, idx, $event)"
              />
              <button class="item-del" title="删除此行" @click="deleteItem('coreOutputItems' as any, idx)" tabindex="-1">×</button>
            </div>
          </div>
        </div>

        <!-- 维度二：本周计划 -->
        <div style="font-size: 12px; font-weight: 700; color: var(--gold); margin: 16px 0 8px; padding-bottom: 6px; border-bottom: 0.5px solid var(--bdr);">
          维度二：本周计划
        </div>
        <div class="ff" style="margin-bottom: 6px;">
          <label class="ff-label">
            本周必须完成的关键事项
            <span style="font-weight: 400; color: var(--t3);">（回车增加一行，📅 设置完成时间）</span>
          </label>
          <div class="item-list" data-field="coreAction">
            <div
              v-for="(item, idx) in (form.coreAction as TaskItem[])"
              :key="idx"
              class="item-row"
            >
              <span class="item-no">{{ idx + 1 }}.</span>
              <input
                v-model="item.text"
                class="item-text"
                type="text"
                :placeholder="idx === 0 ? '例：完成深化方案并提交大区' : '继续添加…'"
                @input="updateItemText('coreAction', idx, ($event.target as HTMLInputElement).value)"
                @keydown="handleKeydown($event, 'coreAction', idx)"
              />
              <DatePicker
                :model-value="item.dueDate"
                :label="item.dueDate ? dueDateLabel(item.dueDate) : undefined"
                placeholder="📅"
                :min="reportWeekBounds.max"
                @update:model-value="updateItemDate('coreAction', idx, $event)"
              />
              <button class="item-del" title="删除此行" @click="deleteItem('coreAction', idx)" tabindex="-1">
                ×
              </button>
            </div>
          </div>
        </div>

        <!-- 维度三：风险 / 卡点 -->
        <div style="font-size: 12px; font-weight: 700; color: var(--gold); margin: 16px 0 8px; padding-bottom: 6px; border-bottom: 0.5px solid var(--bdr);">
          维度三：风险 / 卡点
        </div>
        <div style="font-size: 11px; color: var(--rt); margin-bottom: 6px; padding: 4px 8px; background: var(--rb); border-radius: var(--rr); border: 0.5px solid var(--rbd);">
          ⚠ 填入风险内容或需管理层决策的事后，项目状态将自动标记为「需决策/卡住」
        </div>
        <div class="ff" style="margin-bottom: 6px;">
          <label class="ff-label">
            最大风险 / 已卡住的问题
            <span style="font-weight: 400; color: var(--t3);">（回车增加一行）</span>
          </label>
          <div class="item-list" data-field="risk">
            <div
              v-for="(item, idx) in (form.risk as TaskItem[])"
              :key="idx"
              class="item-row"
            >
              <span class="item-no">{{ idx + 1 }}.</span>
              <input
                v-model="item.text"
                class="item-text"
                type="text"
                :placeholder="idx === 0 ? '本周最大的风险或已卡住的问题' : '继续添加…'"
                @input="updateItemText('risk', idx, ($event.target as HTMLInputElement).value)"
                @keydown="handleKeydown($event, 'risk', idx)"
              />
              <DatePicker
                :model-value="item.dueDate"
                :label="item.dueDate ? dueDateLabel(item.dueDate) : undefined"
                placeholder="📅"
                @update:model-value="updateItemDate('risk', idx, $event)"
              />
              <button class="item-del" title="删除此行" @click="deleteItem('risk', idx)" tabindex="-1">
                ×
              </button>
            </div>
          </div>
        </div>

        <div class="ff" style="margin-bottom: 6px;">
          <label class="ff-label">
            需管理层决策的事
            <span style="font-weight: 400; color: var(--t3);">（回车增加一行）</span>
          </label>
          <div class="item-list" data-field="decision">
            <div
              v-for="(item, idx) in (form.decision as TaskItem[])"
              :key="idx"
              class="item-row"
            >
              <span class="item-no">{{ idx + 1 }}.</span>
              <input
                v-model="item.text"
                class="item-text"
                type="text"
                :placeholder="idx === 0 ? '需要管理层决策或协调的事项' : '继续添加…'"
                @input="updateItemText('decision', idx, ($event.target as HTMLInputElement).value)"
                @keydown="handleKeydown($event, 'decision', idx)"
              />
              <DatePicker
                :model-value="item.dueDate"
                :label="item.dueDate ? dueDateLabel(item.dueDate) : undefined"
                placeholder="📅"
                @update:model-value="updateItemDate('decision', idx, $event)"
              />
              <button class="item-del" title="删除此行" @click="deleteItem('decision', idx)" tabindex="-1">
                ×
              </button>
            </div>
          </div>
        </div>

        <!-- 维度四：跨部门支援 -->
        <div style="font-size: 12px; font-weight: 700; color: var(--gold); margin: 16px 0 8px; padding-bottom: 6px; border-bottom: 0.5px solid var(--bdr);">
          维度四：跨部门支援
        </div>
        <div class="ff" style="margin-bottom: 6px;">
          <label class="ff-label">
            本周需要哪些部门协助
            <span style="font-weight: 400; color: var(--t3);">（无则留空，回车增加一行）</span>
          </label>
          <div class="item-list" data-field="crossDept">
            <div
              v-for="(item, idx) in (form.crossDept as TaskItem[])"
              :key="idx"
              class="item-row"
            >
              <span class="item-no">{{ idx + 1 }}.</span>
              <input
                v-model="item.text"
                class="item-text"
                type="text"
                :placeholder="idx === 0 ? '例：需采购部协助核价2项' : '继续添加…'"
                @input="updateItemText('crossDept', idx, ($event.target as HTMLInputElement).value)"
                @keydown="handleKeydown($event, 'crossDept', idx)"
              />
              <DatePicker
                :model-value="item.dueDate"
                :label="item.dueDate ? dueDateLabel(item.dueDate) : undefined"
                placeholder="📅"
                @update:model-value="updateItemDate('crossDept', idx, $event)"
              />
              <button class="item-del" title="删除此行" @click="deleteItem('crossDept', idx)" tabindex="-1">
                ×
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部 -->
      <div class="modal-footer">
        <button class="bs" @click="handleCancel">取消</button>
        <button class="bp" @click="handleSave">保存本周状态</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 状态选择器 */
.ssel {
  display: flex;
  gap: 6px;
}

.sopt {
  flex: 1;
  padding: 8px 12px;
  border: 0.5px solid var(--bdr);
  border-radius: var(--rr);
  background: var(--card);
  color: var(--t2);
  font-size: 12px;
  text-align: center;
  cursor: pointer;
  transition: all 0.15s;
}

.sopt:hover {
  border-color: var(--gold);
}

.sopt.sr {
  background: var(--rb);
  border-color: var(--rbd);
  color: var(--rt);
  font-weight: 700;
}

.sopt.sy {
  background: var(--yb);
  border-color: var(--ybd);
  color: var(--yt);
  font-weight: 700;
}

.sopt.sg {
  background: var(--gb);
  border-color: var(--gbd);
  color: var(--gt);
  font-weight: 700;
}

/* 阶段选择器 */
.spk {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.spi {
  flex: 0 0 calc(14.28% - 4px); /* 每行7个，13个选项分两行 */
  min-width: 52px;
  padding: 7px 4px;
  border: 0.5px solid var(--bdr);
  border-radius: var(--rr);
  background: var(--card);
  color: var(--t3);
  font-size: 11px;
  text-align: center;
  cursor: pointer;
  transition: all 0.15s;
  word-break: keep-all;
  line-height: 1.3;
}

.spi:hover {
  border-color: var(--gold);
}

.spi.ds {
  background: var(--gl);
  border-color: var(--gm);
  color: var(--gold);
  font-weight: 700;
}

.spi.as {
  background: var(--gold);
  border-color: var(--gold);
  color: white;
  font-weight: 700;
}

/* 维度一日期输入框（有边界限制）*/
.date-input-bounded {
  width: 100px;
  padding: 3px 6px;
  font-size: 11px;
  border: 1px solid var(--bdr);
  border-radius: 7px;
  background: var(--bg);
  color: var(--tx);
  font-family: var(--fn);
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color .15s;
}
.date-input-bounded:focus { border-color: var(--gold); outline: none; }

/* coreOutputItems field */
.item-list[data-field="coreOutputItems"] .item-text { flex: 1; }

/* 弹窗震动动画 */
@keyframes modalShake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
  20%, 40%, 60%, 80% { transform: translateX(4px); }
}
.form-shake {
  animation: modalShake 0.5s ease-in-out;
}
</style>
