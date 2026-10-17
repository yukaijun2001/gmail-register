<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Delete, Plus, RefreshRight } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';
import { api, errorMessage } from '../../shared/api/admin-api';
import PageState from '../../shared/components/PageState.vue';

interface Account {
  id: string;
  firstName: string;
  lastName: string;
  birthday: string;
  gender: string;
  desiredUsername: string;
  phoneReference: string;
  recoveryEmail?: string;
  consentStatus: string;
  createdAt: string;
}
const rows = ref<Account[]>([]);
const loading = ref(true);
const error = ref('');
const dialog = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const regionNames = new Intl.DisplayNames(['zh-CN'], { type: 'region' });
const countryOptions = getCountries()
  .map((countryCode) => ({
    countryCode,
    dialCode: `+${getCountryCallingCode(countryCode)}`,
    label: `${regionNames.of(countryCode) || countryCode} +${getCountryCallingCode(countryCode)}`,
  }))
  .sort((left, right) => {
    if (left.countryCode === 'US') return -1;
    if (right.countryCode === 'US') return 1;
    return left.label.localeCompare(right.label, 'zh-CN');
  });
const form = reactive<{ phoneCountry: CountryCode; phoneNumber: string }>({
  phoneCountry: 'US',
  phoneNumber: '',
});
const selectedDialCode = computed(
  () => countryOptions.find((option) => option.countryCode === form.phoneCountry)?.dialCode || '',
);
const phonePlaceholder = computed(() =>
  form.phoneCountry === 'US' ? '202 555 0123' : '请输入本地号码',
);
const validatePhone = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  const phone =
    value && !value.startsWith('+') && /^[\d().\s-]+$/.test(value)
      ? parsePhoneNumberFromString(value, form.phoneCountry)
      : undefined;
  if (phone?.isValid() && phone.country === form.phoneCountry) callback();
  else callback(new Error('请输入符合所选国家/地区规则的手机号'));
};
const rules: FormRules = {
  phoneCountry: [{ required: true, message: '请选择国家/地区', trigger: 'change' }],
  phoneNumber: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { validator: validatePhone, trigger: ['blur', 'change'] },
  ],
};
function changeCountry() {
  form.phoneNumber = '';
  formRef.value?.clearValidate('phoneNumber');
}
async function load() {
  loading.value = true;
  error.value = '';
  try {
    rows.value = await api.accounts();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function save() {
  if (!(await formRef.value?.validate().catch(() => false))) return;
  saving.value = true;
  try {
    await api.createAccount({
      phoneCountry: form.phoneCountry,
      phoneNumber: form.phoneNumber.trim(),
    });
    dialog.value = false;
    form.phoneCountry = 'US';
    form.phoneNumber = '';
    ElMessage.success('随机账户资料已生成');
    await load();
  } catch (e) {
    ElMessage.error(errorMessage(e));
  } finally {
    saving.value = false;
  }
}
async function remove(row: Account) {
  try {
    await ElMessageBox.confirm(`删除 ${row.desiredUsername} 的资料？`, '确认删除', {
      type: 'warning',
    });
    await api.deleteAccount(row.id);
    ElMessage.success('资料已删除');
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
        <h2>账户资料</h2>
        <p>选择国家/地区并输入手机号，其余账户资料会在保存时自动生成。</p>
      </div>
      <div class="heading-actions">
        <el-button :icon="RefreshRight" circle aria-label="刷新" @click="load" /><el-button
          type="primary"
          :icon="Plus"
          @click="dialog = true"
          >新增资料</el-button
        >
      </div>
    </div>
    <PageState
      :loading="loading"
      :error="error"
      :empty="!rows.length"
      empty-text="还没有账户资料"
      @retry="load"
    >
      <template #empty-action
        ><el-button type="primary" @click="dialog = true">新增资料</el-button></template
      >
      <el-table :data="rows" class="data-table">
        <el-table-column label="姓名" min-width="140"
          ><template #default="{ row }"
            ><strong>{{ row.firstName }} {{ row.lastName }}</strong></template
          ></el-table-column
        >
        <el-table-column prop="desiredUsername" label="期望用户名" min-width="180"
          ><template #default="{ row }"
            ><span class="mono">{{ row.desiredUsername }}@gmail.com</span></template
          ></el-table-column
        >
        <el-table-column prop="birthday" label="出生日期" width="130"
          ><template #default="{ row }">{{
            String(row.birthday).slice(0, 10)
          }}</template></el-table-column
        >
        <el-table-column prop="phoneReference" label="手机号" min-width="150" />
        <el-table-column label="操作" width="80" align="right"
          ><template #default="{ row }"
            ><el-button
              :icon="Delete"
              text
              type="danger"
              aria-label="删除"
              @click="remove(row)" /></template
        ></el-table-column>
      </el-table>
    </PageState>

    <el-dialog v-model="dialog" title="新增账户资料" width="min(520px, 92vw)" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="国家/地区" prop="phoneCountry">
          <el-select
            v-model="form.phoneCountry"
            filterable
            default-first-option
            placeholder="选择国家/地区"
            class="country-select"
            @change="changeCountry"
          >
            <el-option
              v-for="country in countryOptions"
              :key="country.countryCode"
              :label="country.label"
              :value="country.countryCode"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="手机号" prop="phoneNumber"
          ><el-input
            v-model="form.phoneNumber"
            type="tel"
            autocomplete="tel-national"
            :placeholder="phonePlaceholder"
            maxlength="24"
            @keyup.enter="save"
          >
            <template #prepend>{{ selectedDialCode }}</template>
          </el-input>
          <span class="form-help">国家区号会自动添加，号码中无需重复输入。</span>
        </el-form-item>
      </el-form>
      <template #footer
        ><el-button @click="dialog = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="save">保存资料</el-button></template
      >
    </el-dialog>
  </section>
</template>

<style scoped>
.country-select {
  width: 100%;
}
</style>
