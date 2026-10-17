import axios from 'axios';
import type { ApiResponse } from '@gmail-manager/contracts';

const client = axios.create({
  baseURL: '/api/v1',
  timeout: 10_000,
});

client.interceptors.response.use((response) => {
  const envelope = response.data as ApiResponse<unknown>;
  if (!envelope.success) throw new Error(envelope.error.message);
  return { ...response, data: envelope.data };
});

export const api = {
  stats: () => client.get('/admin/tasks/stats').then((response) => response.data),
  accounts: () => client.get('/admin/accounts').then((response) => response.data),
  createAccount: (input: unknown) =>
    client.post('/admin/accounts', input).then((response) => response.data),
  updateAccount: (id: string, input: unknown) =>
    client.patch(`/admin/accounts/${id}`, input).then((response) => response.data),
  deleteAccount: (id: string) =>
    client.delete(`/admin/accounts/${id}`).then((response) => response.data),
  tasks: () => client.get('/admin/tasks').then((response) => response.data),
  createTask: (accountId: string, priority = 0) =>
    client.post('/admin/tasks', { accountId, priority }).then((response) => response.data),
  taskAction: (id: string, action: 'pause' | 'resume' | 'cancel') =>
    client.post(`/admin/tasks/${id}/${action}`).then((response) => response.data),
  workers: () => client.get('/admin/workers').then((response) => response.data),
  disableWorker: (id: string) =>
    client.post(`/admin/workers/${id}/disable`).then((response) => response.data),
};

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) return error.response?.data?.error?.message || error.message;
  return error instanceof Error ? error.message : '请求失败';
}
