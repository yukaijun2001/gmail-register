<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { DataAnalysis, Fold, Monitor, Tickets, UserFilled } from '@element-plus/icons-vue';

const collapsed = ref(false);
const route = useRoute();
const title = computed(() => String(route.meta.title || '注册协作台'));
</script>

<template>
  <div class="app-shell" :class="{ collapsed }">
    <aside class="sidebar" aria-label="主导航">
      <div class="brand">
        <div class="brand-mark">GR</div>
        <div v-if="!collapsed" class="brand-copy">
          <strong>注册协作台</strong>
          <span>全自动任务管理</span>
        </div>
      </div>
      <el-menu :default-active="route.path" router class="nav-menu" :collapse="collapsed">
        <el-menu-item index="/"
          ><el-icon><DataAnalysis /></el-icon><template #title>系统概览</template></el-menu-item
        >
        <el-menu-item index="/accounts"
          ><el-icon><UserFilled /></el-icon><template #title>账户资料</template></el-menu-item
        >
        <el-menu-item index="/tasks"
          ><el-icon><Tickets /></el-icon><template #title>注册任务</template></el-menu-item
        >
        <el-menu-item index="/workers"
          ><el-icon><Monitor /></el-icon><template #title>浏览器 Worker</template></el-menu-item
        >
      </el-menu>
      <button
        class="collapse-button"
        type="button"
        :aria-label="collapsed ? '展开导航' : '收起导航'"
        @click="collapsed = !collapsed"
      >
        <el-icon><Fold /></el-icon><span v-if="!collapsed">收起导航</span>
      </button>
    </aside>

    <main class="main-area">
      <header class="topbar">
        <div>
          <p class="context-label">GMAIL REGISTRATION MANAGER</p>
          <h1>{{ title }}</h1>
        </div>
        <div class="system-state"><span class="state-dot" />管理服务已连接</div>
      </header>
      <router-view />
    </main>
  </div>
</template>
