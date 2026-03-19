<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>账户管理</span>
          <el-button type="primary" @click="openForm()">+ 新增账户</el-button>
        </div>
      </template>
      <el-table :data="list" border stripe>
        <el-table-column prop="username" label="用户名" width="140" />
        <el-table-column prop="displayName" label="显示名称" />
        <el-table-column label="角色" width="100">
          <template #default="{row}">{{ row.role==='admin'?'管理员':'业务员' }}</template>
        </el-table-column>
        <el-table-column label="关联员工">
          <template #default="{row}">{{ empName(row.employeeId) }}</template>
        </el-table-column>
        <el-table-column label="手势" width="80" class-name="gesture-col">
          <template #default="{row}">
            <el-tag :type="row.gestureHash?'success':'info'">{{ row.gestureHash?'已设置':'未设置' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{row}">
            <el-tag :type="row.status==='active'?'success':'info'">{{ row.status==='active'?'启用':'停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{row}">
            <el-button link type="primary" @click="openForm(row)">编辑</el-button>
            <el-button link @click="toggle(row)">{{ row.status==='active'?'停用':'启用' }}</el-button>
            <el-button link @click="openPwd(row)">设置密码</el-button>
            <el-button link type="danger" @click="del(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dlg" :title="form.id?'编辑账户':'新增账户'" width="520px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="90px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" :disabled="!!form.id" />
        </el-form-item>
        <el-form-item label="显示名称" prop="displayName">
          <el-input v-model="form.displayName" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" style="width:100%">
            <el-option label="管理员" value="admin" />
            <el-option label="业务员" value="salesperson" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联员工" prop="employeeId">
          <el-select v-model="form.employeeId" placeholder="可选" clearable style="width:100%">
            <el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg=false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="pwdDlg" title="设置密码" width="420px">
      <el-form :model="pwdForm" :rules="pwdRules" ref="pwdRef" label-width="80px">
        <el-form-item label="新密码" prop="password">
          <el-input v-model="pwdForm.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="手势">
          <GestureUnlock hint="请绘制手势密码" :min-points="4" show-reset @complete="onGestureComplete" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdDlg=false">取消</el-button>
        <el-button type="primary" @click="savePwd">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import GestureUnlock from '@/components/GestureUnlock.vue'
import { getAccounts, saveAccount, toggleAccount, deleteAccount, simpleHash } from '@/api/auth'
import { getEmployees } from '@/api/employee'
import type { Account, Employee, Role } from '@/types'

const list = ref<Account[]>([])
const employees = ref<Employee[]>([])
const dlg = ref(false)
const formRef = ref()
const form = ref<Partial<Account>>({})
const rules = {
  username: [{ required: true, message: '请输入用户名' }],
  displayName: [{ required: true, message: '请输入显示名称' }],
  role: [{ required: true, message: '请选择角色' }]
}

const pwdDlg = ref(false)
const pwdRef = ref()
const pwdForm = ref<{ id?: string; password?: string; gesture?: string }>({})
const pwdRules = {
  password: [{ required: false, message: '请输入新密码' }]
}

async function load() {
  list.value = await getAccounts()
  employees.value = await getEmployees()
}

onMounted(load)

function empName(id?: string) {
  return employees.value.find(e => e.id === id)?.name || '-'
}

function openForm(row?: Account) {
  form.value = row ? { ...row } : { role: 'salesperson' as Role }
  dlg.value = true
}

async function submit() {
  await formRef.value.validate()
  await saveAccount(form.value as any)
  dlg.value = false
  ElMessage.success('保存成功')
  load()
}

async function toggle(row: Account) {
  await toggleAccount(row.id)
  load()
}

async function del(id: string) {
  await ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' })
  await deleteAccount(id)
  ElMessage.success('已删除')
  load()
}

function openPwd(row: Account) {
  pwdForm.value = { id: row.id, password: '', gesture: '' }
  pwdDlg.value = true
}

function onGestureComplete(pattern: string) {
  pwdForm.value.gesture = pattern
}

async function savePwd() {
  await pwdRef.value.validate()
  if (!pwdForm.value.password && !pwdForm.value.gesture) {
    ElMessage.error('请设置密码或手势')
    return
  }
  const acc = list.value.find(a => a.id === pwdForm.value.id)
  if (!acc) return
  const patch: Partial<Account> = { id: acc.id }
  if (pwdForm.value.password) patch.passwordHash = simpleHash(pwdForm.value.password)
  if (pwdForm.value.gesture) patch.gestureHash = simpleHash(pwdForm.value.gesture)
  await saveAccount(patch as any)
  pwdDlg.value = false
  ElMessage.success('已保存')
  load()
}
</script>

<style scoped>
:deep(.gesture-col .cell) {
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
}
</style>
