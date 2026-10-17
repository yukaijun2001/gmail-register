import { createRouter, createWebHistory } from 'vue-router';
import AccountsView from '../features/accounts/AccountsView.vue';
import DashboardView from '../features/dashboard/DashboardView.vue';
import TasksView from '../features/tasks/TasksView.vue';
import WorkersView from '../features/workers/WorkersView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: DashboardView, meta: { title: '系统概览' } },
    { path: '/accounts', component: AccountsView, meta: { title: '账户资料' } },
    { path: '/tasks', component: TasksView, meta: { title: '注册任务' } },
    { path: '/workers', component: WorkersView, meta: { title: '浏览器 Worker' } },
  ],
});
