<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RefreshRight } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, errorMessage } from '../../shared/api/admin-api';
import PageState from '../../shared/components/PageState.vue';
import StatusTag from '../../shared/components/StatusTag.vue';
interface Worker {
  id: string;
  deviceName: string;
  profileIdentifier: string;
  extensionVersion: string;
  status: string;
  isEnabled: boolean;
  currentTaskId?: string;
  lastHeartbeatAt?: string;
  createdAt: string;
}
const rows = ref<Worker[]>([]);
const loading = ref(true);
const error = ref('');
async function load() {
  loading.value = true;
  error.value = '';
  try {
    rows.value = await api.workers();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function disable(row: Worker) {
  try {
    await ElMessageBox.confirm(
      `禁用 ${row.deviceName}？其凭据将无法继续调用接口。`,
      '禁用 Worker',
      { type: 'warning' },
    );
    await api.disableWorker(row.id);
    ElMessage.success('Worker 已禁用');
    await load();
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(errorMessage(e));
  }
}
function online(row: Worker) {
  return (
    row.isEnabled &&
    row.lastHeartbeatAt &&
    Date.now() - new Date(row.lastHeartbeatAt).getTime() < 180_000
  );
}
onMounted(load);
</script>
<template>
  <section class="page-section">
    <div class="section-heading">
      <div>
        <h2>浏览器实例</h2>
        <p>每个 Chrome Profile 对应一个独立 Worker，同一时刻最多持有一个活动任务。</p>
      </div>
      <el-button :icon="RefreshRight" :loading="loading" @click="load">刷新</el-button>
    </div>
    <PageState
      :loading="loading"
      :error="error"
      :empty="!rows.length"
      empty-text="尚未连接任何浏览器插件"
      @retry="load"
      ><el-table :data="rows" class="data-table"
        ><el-table-column label="设备" min-width="170"
          ><template #default="{ row }"
            ><strong>{{ row.deviceName }}</strong
            ><small class="cell-subtitle"
              >{{ row.profileIdentifier.slice(0, 12) }}...</small
            ></template
          ></el-table-column
        ><el-table-column label="状态" width="110"
          ><template #default="{ row }"
            ><StatusTag
              :status="
                !row.isEnabled ? 'DISABLED' : online(row) ? row.status : 'OFFLINE'
              " /></template></el-table-column
        ><el-table-column prop="extensionVersion" label="插件版本" width="110" /><el-table-column
          label="当前任务"
          min-width="170"
          ><template #default="{ row }"
            ><span class="mono">{{
              row.currentTaskId ? row.currentTaskId.slice(0, 12) : '无'
            }}</span></template
          ></el-table-column
        ><el-table-column label="最后心跳" width="180"
          ><template #default="{ row }">{{
            row.lastHeartbeatAt ? new Date(row.lastHeartbeatAt).toLocaleString('zh-CN') : '从未连接'
          }}</template></el-table-column
        ><el-table-column label="操作" width="100" align="right"
          ><template #default="{ row }"
            ><el-button text type="danger" :disabled="!row.isEnabled" @click="disable(row)"
              >禁用</el-button
            ></template
          ></el-table-column
        ></el-table
      ></PageState
    >
  </section>
</template>
