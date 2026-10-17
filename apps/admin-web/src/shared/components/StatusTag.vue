<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ status: string }>();
const types: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'primary'> = {
  SUCCESS: 'success',
  RUNNING: 'primary',
  CLAIMED: 'primary',
  WAITING_USER: 'warning',
  PAUSED: 'warning',
  AUTO_VERIFICATION: 'warning',
  FAILED: 'danger',
  CANCELLED: 'info',
  PENDING: 'info',
  IDLE: 'success',
  BUSY: 'primary',
  OFFLINE: 'info',
  DISABLED: 'danger',
};
const labels: Record<string, string> = {
  SUCCESS: '已成功',
  RUNNING: '执行中',
  CLAIMED: '已领取',
  WAITING_USER: '等待人工',
  PAUSED: '已暂停',
  AUTO_VERIFICATION: '自动核实中',
  FAILED: '失败',
  CANCELLED: '已取消',
  PENDING: '待执行',
  IDLE: '空闲',
  BUSY: '忙碌',
  OFFLINE: '离线',
};
const type = computed(() => types[props.status] || 'info');
</script>

<template>
  <el-tag :type="type" effect="light" size="small">{{ labels[status] || status }}</el-tag>
</template>
