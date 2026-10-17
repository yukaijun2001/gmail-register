<script setup lang="ts">
import { WarningFilled } from '@element-plus/icons-vue';
defineProps<{ loading?: boolean; error?: string; empty?: boolean; emptyText?: string }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <div v-if="loading" class="state-panel" aria-live="polite">
    <el-skeleton :rows="5" animated />
  </div>
  <el-result v-else-if="error" icon="error" title="数据加载失败" :sub-title="error">
    <template #extra><el-button @click="$emit('retry')">重新加载</el-button></template>
  </el-result>
  <el-empty v-else-if="empty" :description="emptyText || '暂无数据'">
    <el-icon :size="28"><WarningFilled /></el-icon>
    <slot name="empty-action" />
  </el-empty>
  <slot v-else />
</template>
