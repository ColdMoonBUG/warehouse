<template>
  <div>
    <el-card>
      <template #header>
        <div class="header-row">
          <span>员工管理</span>
          <div class="header-actions">
            <el-button @click="goAccount">账户管理</el-button>
            <el-button type="primary" @click="openForm()">+ 新增员工</el-button>
          </div>
        </div>
      </template>

      <div v-if="isMobile" class="mobile-list">
        <div v-for="row in list" :key="row.id" class="mobile-item">
          <div class="mobile-main">
            <div class="name">{{ row.name }}</div>
            <div class="meta">{{ row.code }} · {{ row.phone || '-' }}</div>
          </div>
          <div class="mobile-right">
            <el-tag :type="row.status==='active'?'success':'info'">{{ row.status==='active'?'启用':'停用' }}</el-tag>
          </div>
          <div class="mobile-actions">
            <el-button link type="primary" @click="openForm(row)">编辑</el-button>
            <el-button link @click="toggle(row)">{{ row.status==='active'?'停用':'启用' }}</el-button>
            <el-button link type="danger" @click="del(row.id)">删除</el-button>
          </div>
        </div>
      </div>

      <div v-else class="table-wrap">
        <el-table :data="list" border stripe>
          <el-table-column prop="code" label="编码" width="120" />
          <el-table-column prop="name" label="姓名" />
          <el-table-column prop="phone" label="电话" />
          <el-table-column label="状态" width="80">
            <template #default="{row}">
              <el-tag :type="row.status==='active'?'success':'info'">{{ row.status==='active'?'启用':'停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160">
            <template #default="{row}">
              <el-button link type="primary" @click="openForm(row)">编辑</el-button>
              <el-button link @click="toggle(row)">{{ row.status==='active'?'停用':'启用' }}</el-button>
              <el-button link type="danger" @click="del(row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

    <el-dialog v-model="dlg" :title="form.id?'编辑员工':'新增员工'" :width="dlgWidth">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="80px">
        <el-form-item label="编码" prop="code"><el-input v-model="form.code" /></el-form-item>
        <el-form-item label="姓名" prop="name"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="电话"><el-input v-model="form.phone" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg=false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { getEmployees, saveEmployee, toggleEmployee, deleteEmployee } from '@/api/employee'
import type { Employee } from '@/types'

const list = ref<Employee[]>([])
const dlg = ref(false)
const formRef = ref()
const form = ref<Partial<Employee>>({})
const rules = {
  code: [{ required: true, message: '请输入编码' }],
  name: [{ required: true, message: '请输入姓名' }]
}

const isMobile = ref(window.innerWidth < 768)
const dlgWidth = computed(() => isMobile.value ? '92%' : '480px')
const router = useRouter()

function onResize() { isMobile.value = window.innerWidth < 768 }

async function load() { list.value = await getEmployees() }
onMounted(() => {
  load()
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

function openForm(row?: Employee) {
  form.value = row ? { ...row } : {}
  dlg.value = true
}

function goAccount() {
  router.push('/system/account')
}

async function submit() {
  await formRef.value.validate()
  await saveEmployee(form.value as any)
  dlg.value = false
  ElMessage.success('保存成功')
  load()
}

async function toggle(row: Employee) {
  await toggleEmployee(row.id)
  load()
}

async function del(id: string) {
  await ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' })
  await deleteEmployee(id)
  ElMessage.success('已删除')
  load()
}
</script>

<style scoped>
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-actions {
  display: flex;
  gap: 8px;
}
.table-wrap { overflow-x: auto; }
.mobile-list { display: flex; flex-direction: column; gap: 10px; }
.mobile-item {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 12px;
}
.mobile-main { display: flex; justify-content: space-between; align-items: center; }
.mobile-main .name { font-weight: 600; color: #e5e7eb; }
.mobile-main .meta { font-size: 12px; color: #94a3b8; }
.mobile-right { margin-top: 6px; }
.mobile-actions { margin-top: 8px; display: flex; gap: 8px; }
@media (max-width: 480px) {
  .header-row { flex-direction: column; align-items: flex-start; gap: 8px; }
  .header-actions { width: 100%; }
  .header-actions :deep(.el-button) { flex: 1; }
}
</style>
