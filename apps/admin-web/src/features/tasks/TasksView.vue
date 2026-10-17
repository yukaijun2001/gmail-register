<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Plus, RefreshRight } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, errorMessage } from '../../shared/api/admin-api';
import PageState from '../../shared/components/PageState.vue';
import StatusTag from '../../shared/components/StatusTag.vue';
interface Task {
  id: string;
  status: string;
  currentStep: string;
  priority: number;
  createdAt: string;
  startedAt?: string;
  account: { desiredUsername: string };
  worker?: { deviceName: string };
  _count: { events: number };
}
interface Account {
  id: string;
  desiredUsername: string;
}
const rows = ref<Task[]>([]);
const accounts = ref<Account[]>([]);
const loading = ref(true);
const error = ref('');
const dialog = ref(false);
const accountId = ref('');
const saving = ref(false);
async function load() {
  loading.value = true;
  error.value = '';
  try {
    [rows.value, accounts.value] = await Promise.all([api.tasks(), api.accounts()]);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function create() {
  if (!accountId.value) return;
  saving.value = true;
  try {
    await api.createTask(accountId.value);
    dialog.value = false;
    accountId.value = '';
    ElMessage.success('任务已创建');
    await load();
  } catch (e) {
    ElMessage.error(errorMessage(e));
  } finally {
    saving.value = false;
  }
}
async function act(row: Task, action: 'pause' | 'resume' | 'cancel') {
  try {
    if (action === 'cancel')
      await ElMessageBox.confirm('取消后任务不可自动恢复，确认继续？', '取消任务', {
        type: 'warning',
      });
    await api.taskAction(row.id, action);
    ElMessage.success('任务状态已更新');
    await load();
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(errorMessage(e));
  }
}
onMounted(load);
</script>
<template>
  <section class="page-section">
    <div class="section-heading">
      <div>
        <h2>任务队列</h2>
        <p>任务所有权由后端租约控制，结果不确定的任务由系统自动核实并收尾。</p>
      </div>
      <div class="heading-actions">
        <el-button :icon="RefreshRight" circle aria-label="刷新" @click="load" /><el-button
          type="primary"
          :icon="Plus"
          @click="dialog = true"
          >创建任务</el-button
        >
      </div>
    </div>
    <PageState
      :loading="loading"
      :error="error"
      :empty="!rows.length"
      empty-text="任务队列为空"
      @retry="load"
    >
      <template #empty-action
        ><el-button type="primary" :disabled="!accounts.length" @click="dialog = true"
          >创建任务</el-button
        ></template
      >
      <el-table :data="rows" class="data-table">
        <el-table-column label="账户" min-width="190"
          ><template #default="{ row }"
            ><span class="mono">{{ row.account.desiredUsername }}</span></template
          ></el-table-column
        >
        <el-table-column label="状态" width="110"
          ><template #default="{ row }"><StatusTag :status="row.status" /></template
        ></el-table-column>
        <el-table-column prop="currentStep" label="当前步骤" min-width="170" />
        <el-table-column label="Worker" min-width="150"
          ><template #default="{ row }">{{
            row.worker?.deviceName || '未分配'
          }}</template></el-table-column
        >
        <el-table-column label="事件" width="80"
          ><template #default="{ row }">{{ row._count.events }}</template></el-table-column
        >
        <el-table-column label="创建时间" width="170"
          ><template #default="{ row }">{{
            new Date(row.createdAt).toLocaleString('zh-CN')
          }}</template></el-table-column
        >
        <el-table-column label="操作" min-width="210" align="right"
          ><template #default="{ row }"
            ><el-button
              v-if="['CLAIMED', 'RUNNING', 'WAITING_USER'].includes(row.status)"
              text
              @click="act(row, 'pause')"
              >暂停</el-button
            ><el-button v-if="row.status === 'PAUSED'" text @click="act(row, 'resume')"
              >恢复</el-button
            ><el-button
              v-if="!['SUCCESS', 'FAILED', 'CANCELLED'].includes(row.status)"
              text
              type="danger"
              @click="act(row, 'cancel')"
              >取消</el-button
            ></template
          ></el-table-column
        >
      </el-table>
    </PageState>
    <el-dialog v-model="dialog" title="创建注册任务" width="min(520px, 92vw)"
      ><el-form label-position="top"
        ><el-form-item label="授权账户资料"
          ><el-select v-model="accountId" filterable placeholder="选择账户" style="width: 100%"
            ><el-option
              v-for="account in accounts"
              :key="account.id"
              :label="`${account.desiredUsername}@gmail.com`"
              :value="account.id" /></el-select
          ><span class="form-help">已有活动任务的账户不能重复创建。</span></el-form-item
        ></el-form
      ><template #footer
        ><el-button @click="dialog = false">取消</el-button
        ><el-button type="primary" :loading="saving" :disabled="!accountId" @click="create"
          >创建任务</el-button
        ></template
      ></el-dialog
    >
  </section>
</template>
