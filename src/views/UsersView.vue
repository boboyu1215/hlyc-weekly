<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useProjectStore } from '@/stores/project';
import { useAuthStore } from '@/stores/auth';
import { StorageService } from '@/services/storage';
import type { Project } from '@/core/types';
import { STAGES } from '@/config/constants';
import DatePicker from '@/components/DatePicker.vue';
import apiClient from '@/services/api';

const route = useRoute();
const router = useRouter();
const projectStore = useProjectStore();
const authStore = useAuthStore();
const storage = StorageService.getInstance();

const form = ref<Partial<Project>>({
  name: '', area: '', startDate: '', schemeDate: '', designDate: '',
  siteDate: '', completionDate: '', openDate: '', prepOwner: '',
  designOwner: '', defStatus: 'g', defStage: 0, archived: false
});

const isEdit = computed(() => !!route.query.id);
const pageTitle = computed(() => isEdit.value ? '编辑项目' : '新增项目');

onMounted(() => {
  if (isEdit.value) {
    const id = parseInt(route.query.id as string);
    const project = projectStore.getProject(id);
    if (project) form.value = { ...project };
  }
});

const saving = ref(false);

async function saveProject() {
  if (!form.value.name || !form.value.designOwner) {
    alert('请填写项目名称和负责人');
    return;
  }
  saving.value = true;
  try {
    if (isEdit.value) {
      const id = parseInt(route.query.id as string);
      projectStore.updateProject(id, form.value);
      const result = await apiClient.updateProject(id, form.value);
      if (!result.success) throw new Error(result.error);
    } else {
      const newProject: Project = {
        id: projectStore.generateProjectId(),
        name: form.value.name!,
        area: form.value.area || '',
        startDate: form.value.startDate || '',
        schemeDate: form.value.schemeDate || '',
        designDate: form.value.designDate || '',
        siteDate: form.value.siteDate || '',
        completionDate: form.value.completionDate || '',
        openDate: form.value.openDate || '',
        prepOwner: form.value.prepOwner || '',
        designOwner: form.value.designOwner!,
        defStatus: form.value.defStatus || 'g',
        defStage: form.value.defStage || 0,
        archived: false
      };
      projectStore.addProject(newProject);
      const result = await apiClient.createProject(newProject);
      if (!result.success) throw new Error(result.error);
    }
    alert('保存成功');
    router.push('/weekly');
  } catch (err) {
    alert('保存失败：' + (err instanceof Error ? err.message : '网络错误'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="io-bar no-print">
    <button class="io-btn" @click="router.back()">← 返回</button>
  </div>
  <div class="fc">
    <div class="fc-t">{{ pageTitle }}</div>

    <div class="fg">
      <div class="ff">
        <label>项目名称 *</label>
        <input v-model="form.name" type="text" placeholder="请输入项目名称" />
      </div>
      <div class="ff">
        <label>项目面积</label>
        <input v-model="form.area" type="text" placeholder="例如：1000㎡" />
      </div>
    </div>

    <div class="fg">
      <div class="ff">
        <label>设计负责人 *</label>
        <input v-model="form.designOwner" type="text" placeholder="请输入负责人姓名" />
      </div>
      <div class="ff">
        <label>筹备负责人</label>
        <input v-model="form.prepOwner" type="text" placeholder="请输入筹备负责人姓名" />
      </div>
    </div>

    <div class="fg g3">
      <div class="ff">
        <label>启动日期</label>
        <DatePicker v-model="form.startDate" placeholder="选择启动日期" inline />
      </div>
      <div class="ff">
        <label>方案日期</label>
        <DatePicker v-model="form.schemeDate" placeholder="选择方案日期" inline />
      </div>
      <div class="ff">
        <label>设计日期</label>
        <DatePicker v-model="form.designDate" placeholder="选择设计日期" inline />
      </div>
    </div>

    <div class="fg g3">
      <div class="ff">
        <label>现场日期</label>
        <DatePicker v-model="form.siteDate" placeholder="选择现场日期" inline />
      </div>
      <div class="ff">
        <label>竣工日期</label>
        <DatePicker v-model="form.completionDate" placeholder="选择竣工日期" inline />
      </div>
      <div class="ff">
        <label>开业日期</label>
        <DatePicker v-model="form.openDate" placeholder="选择开业日期" inline />
      </div>
    </div>

    <div class="fg">
      <div class="ff">
        <label>默认状态</label>
        <div class="ssel">
          <div
            class="sopt sg" :class="{ sr: form.defStatus === 'r', sy: form.defStatus === 'y' }"
            @click="form.defStatus = 'r'"
          >红灯</div>
          <div
            class="sopt" :class="{ sy: form.defStatus === 'y' }"
            @click="form.defStatus = 'y'"
          >黄灯</div>
          <div
            class="sopt sg" :class="{}"
            @click="form.defStatus = 'g'"
          >绿灯</div>
        </div>
      </div>
      <div class="ff">
        <label>默认阶段</label>
        <select v-model.number="form.defStage">
          <option v-for="(stage, idx) in STAGES" :key="idx" :value="idx">{{ stage }}</option>
        </select>
      </div>
    </div>

    <div class="ar">
      <button class="bs" @click="router.back()">取消</button>
      <button class="bp" :disabled="saving" @click="saveProject">
        {{ saving ? '保存中…' : '保存项目' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 使用全局 main.css 的 fc/fg/ff/ssel/sopt/ar/bp/bs 类名 */
</style>
