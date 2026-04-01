<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>厂家管理</span>
          <el-button type="primary" @click="openForm()">+ 新增厂家</el-button>
        </div>
      </template>
      <el-table :data="list" border stripe>
        <el-table-column prop="code" label="编码" width="120" />
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="contact" label="联系人" />
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
    </el-card>

    <el-dialog v-model="dlg" :title="form.id?'编辑厂家':'新增厂家'" width="480px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="80px">
        <el-form-item label="名称" prop="name"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="联系人"><el-input v-model="form.contact" /></el-form-item>
        <el-form-item label="电话"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="地址"><el-input v-model="form.address" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg=false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getSuppliers, saveSupplier, toggleSupplier, deleteSupplier } from '@/api/supplier'
import type { Supplier } from '@/types'

const list = ref<Supplier[]>([])
const dlg = ref(false)
const formRef = ref()
const form = ref<Partial<Supplier>>({})
const rules = {
  name: [{ required: true, message: '请输入名称' }]
}

async function load() { list.value = await getSuppliers() }
onMounted(load)

function openForm(row?: Supplier) {
  form.value = row ? { ...row } : {}
  dlg.value = true
}

async function submit() {
  await formRef.value.validate()
  await saveSupplier(form.value as any)
  dlg.value = false
  ElMessage.success('保存成功')
  load()
}

async function toggle(row: Supplier) {
  await toggleSupplier(row.id)
  load()
}

async function del(id: string) {
  await ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' })
  await deleteSupplier(id)
  ElMessage.success('已删除')
  load()
}
</script>
