<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RefreshRight } from '@element-plus/icons-vue';
import { api, errorMessage } from '../../shared/api/admin-api';
import PageState from '../../shared/components/PageState.vue';

interface Stats {
  counts: Record<string, number>;
  onlineWorkers: number;
  totalAccounts: number;
  totalTasks: number;
}
const stats = ref<Stats>();
const loading = ref(true);
const error = ref('');
const metrics = [
  ['PENDING', '待执行'],
  ['RUNNING', '执行中'],
  ['WAITING_USER', '等待人工'],
  ['AUTO_VERIFICATION', '自动核实中'],
  ['SUCCESS', '已成功'],
  ['FAILED', '失败'],
] as const;

async function load() {
  loading.value = true;
  error.value = '';
  try {
    stats.value = await api.stats();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>

<template>
  <section class="page-section">
    <div class="section-heading">
      <div>
        <h2>运行态势</h2>
        <p>集中查看任务吞吐、人工接管和浏览器连接状态。</p>
      </div>
      <el-button :icon="RefreshRight" :loading="loading" @click="load">刷新</el-button>
    </div>
    <PageState :loading="loading" :error="error" @retry="load">
      <div v-if="stats" class="summary-band">
        <div>
          <span>账户资料</span><strong>{{ stats.totalAccounts }}</strong>
        </div>
        <div>
          <span>任务总数</span><strong>{{ stats.totalTasks }}</strong>
        </div>
        <div>
          <span>在线 Worker</span><strong>{{ stats.onlineWorkers }}</strong>
        </div>
      </div>
      <div v-if="stats" class="metric-grid">
        <article
          v-for="[key, label] in metrics"
          :key="key"
          class="metric-card"
          :class="`metric-${key.toLowerCase()}`"
        >
          <span>{{ label }}</span
          ><strong>{{ stats.counts[key] || 0 }}</strong>
        </article>
      </div>
      <div class="attention-panel">
        <div>
          <h3>需要人工处理</h3>
          <p>
            CAPTCHA 等安全验证需要人工在页面上完成后，点击扩展的「重新检测页面」继续；结果不确定的任务由系统自动核实并收尾。
          </p>
        </div>
        <strong>{{
          (stats?.counts.WAITING_USER || 0) + (stats?.counts.AUTO_VERIFICATION || 0)
        }}</strong>
      </div>
    </PageState>
  </section>
</template>
