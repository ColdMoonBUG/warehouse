<template>
  <div>
    <el-card>
      <template #header>
        <div class="header-row">
          <div>
            <span>账户管理</span>
            <div class="header-tip">系统仅保留管理员、大车、小车、三车四个固定账户，页面仅维护登录凭据。</div>
          </div>
        </div>
      </template>
      <el-table :data="orderedAccounts" border stripe>
        <el-table-column prop="username" label="用户名" width="140" />
        <el-table-column prop="displayName" label="显示名称" />
        <el-table-column label="角色" width="100">
          <template #default="{row}">{{ row.role==='admin'?'管理员':'业务员' }}</template>
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
        <el-table-column label="操作" width="200">
          <template #default="{row}">
            <el-button link @click="toggle(row)">{{ row.status==='active'?'停用':'启用' }}</el-button>
            <el-button link @click="openPwd(row)">设置密码</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="pwdDlg" title="设置密码" width="420px">
      <el-form :model="pwdForm" :rules="pwdRules" ref="pwdRef" label-width="80px">
        <el-form-item label="新密码" prop="password">
          <el-input v-model="pwdForm.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="手势">
          <GestureUnlock ref="gestureRef" hint="请绘制手势密码" :min-points="4" show-reset @complete="onGestureComplete" />
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
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import GestureUnlock from '@/components/GestureUnlock.vue'
import { getAccounts, simpleHash, setPassword, setGesture, toggleAccount } from '@/api/auth'
import type { Account } from '@/types'

const CANONICAL_IDS = ['admin_root', 'sp_big', 'sp_small', 'sp_third']
const CANONICAL_NAMES = ['管理员', '大车', '小车', '三车']

const list = ref<Account[]>([])
const pwdDlg = ref(false)
const pwdRef = ref()
const gestureRef = ref()
const pwdForm = ref<{ id?: string; password?: string; gesture?: string }>({})
const pwdRules = {
  password: [{ required: false, message: '请输入新密码' }]
}

function accountRank(account: Account) {
  const idIndex = CANONICAL_IDS.indexOf(account.id)
  if (idIndex >= 0) return idIndex
  const nameIndex = CANONICAL_NAMES.indexOf(account.displayName)
  if (nameIndex >= 0) return nameIndex
  return account.role === 'admin' ? 10 : 100
}

const orderedAccounts = computed(() => {
  return [...list.value].sort((left, right) => {
    const rankDiff = accountRank(left) - accountRank(right)
    if (rankDiff !== 0) return rankDiff
    return left.username.localeCompare(right.username)
  })
})

async function load() {
  list.value = await getAccounts(true)
}

onMounted(load)

function openPwd(row: Account) {
  pwdForm.value = { id: row.id, password: '', gesture: '' }
  pwdDlg.value = true
  pwdRef.value?.resetFields?.()
  gestureRef.value?.reset?.()
}

async function toggle(row: Account) {
  await toggleAccount(row.id)
  load()
}

function onGestureComplete(pattern: string) {
  pwdForm.value.gesture = pattern
}

async function savePwd() {
  await pwdRef.value.validate()
  if (!pwdForm.value.id) return
  if (!pwdForm.value.password && !pwdForm.value.gesture) {
    ElMessage.error('请设置密码或手势')
    return
  }
  if (pwdForm.value.password) {
    await setPassword(pwdForm.value.id, simpleHash(pwdForm.value.password))
  }
  if (pwdForm.value.gesture) {
    await setGesture(pwdForm.value.id, pwdForm.value.gesture)
  }
  pwdDlg.value = false
  ElMessage.success('已保存')
  load()
}
</script>

<style scoped>
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-tip {
  margin-top: 4px;
  font-size: 12px;
  color: #94a3b8;
}

:deep(.gesture-col .cell) {
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
}
</style>
