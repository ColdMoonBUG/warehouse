<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>商品管理</span>
          <el-button type="primary" @click="openForm()">+ 新增商品</el-button>
        </div>
      </template>
      <el-table :data="list" border stripe>
        <el-table-column prop="code" label="编码" width="100" />
        <el-table-column prop="name" label="名称" />
        <el-table-column label="图片" width="90">
          <template #default="{row}">
            <el-image v-if="row.imageUrl" :src="getImageUrl(row.imageUrl)" style="width:48px;height:48px" fit="cover" />
            <div v-else style="width:48px;height:48px;border:1px dashed #d9d9d9;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px">占位</div>
          </template>
        </el-table-column>
        <el-table-column prop="barcode" label="条形码" width="140" />
        <el-table-column label="厂家" width="120">
          <template #default="{row}">{{ supplierName(row.supplierId) }}</template>
        </el-table-column>
        <el-table-column prop="boxQty" label="每箱袋数" width="100" />
        <el-table-column prop="shelfDays" label="保质期(天)" width="100" />
        <el-table-column prop="purchasePrice" label="进价" width="80" />
        <el-table-column prop="salePrice" label="供货价" width="80" />
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

    <el-dialog v-model="dlg" :title="form.id?'编辑商品':'新增商品'" width="760px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="110px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="名称" prop="name"><el-input v-model="form.name" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="条形码" prop="barcode"><el-input v-model="form.barcode" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="厂家" prop="supplierId">
              <el-select v-model="form.supplierId" placeholder="请选择" style="width:100%">
                <el-option v-for="s in suppliers" :key="s.id" :label="s.name" :value="s.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="保质期(天)" prop="shelfDays">
              <el-input-number v-model="form.shelfDays" :min="1" style="width:100%" placeholder="可选" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单位">
              <el-input :model-value="'袋'" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="每箱袋数" prop="boxQty">
              <el-input-number v-model="form.boxQty" :min="1" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="进价(从厂家)" prop="purchasePrice">
              <el-input-number v-model="form.purchasePrice" :min="0" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="供货价" prop="salePrice">
              <el-input-number v-model="form.salePrice" :min="0" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="选择图片" prop="imageUrl">
              <div class="image-upload">
                <el-image v-if="form.imageUrl" :src="getImageUrl(form.imageUrl)" style="width:64px;height:64px" fit="cover" />
                <div v-else class="image-placeholder">占位</div>
                <el-upload :show-file-list="false" :http-request="onUpload" accept="image/*">
                  <el-button>选择图片</el-button>
                </el-upload>
              </div>
            </el-form-item>
          </el-col>
        </el-row>
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
import { getProducts, saveProduct, toggleProduct, deleteProduct } from '@/api/product'
import { getSuppliers } from '@/api/supplier'
import type { Product, Supplier } from '@/types'
import { uploadFile, getImageUrl } from '@/api/upload'

const list = ref<Product[]>([])
const suppliers = ref<Supplier[]>([])
const dlg = ref(false)
const formRef = ref()
const form = ref<Partial<Product>>({})
const rules = {
  name: [{ required: true, message: '请输入名称' }],
  supplierId: [{ required: true, message: '请选择厂家' }],
  boxQty: [{ required: true, message: '请输入每箱袋数' }],
  purchasePrice: [{ required: true, message: '请输入进价' }],
  salePrice: [{ required: true, message: '请输入供货价' }],
  barcode: [{ required: false }]
}

function supplierName(id: string) {
  return suppliers.value.find(s => s.id === id)?.name || '-'
}

async function load() {
  ;[list.value, suppliers.value] = await Promise.all([getProducts(), getSuppliers()])
}
onMounted(load)

function openForm(row?: Product) {
  form.value = row ? { ...row, unit: '袋' } : { unit: '袋', boxQty: 1, purchasePrice: 0, salePrice: 0 }
  dlg.value = true
}

async function submit() {
  await formRef.value.validate()
  form.value.unit = '袋'
  await saveProduct(form.value as any)
  dlg.value = false
  ElMessage.success('保存成功')
  load()
}

async function onUpload(option: any) {
  const file = option?.file as File | undefined
  if (!file) return
  try {
    const path = await uploadFile(file)
    form.value.imageUrl = path
  } catch (err: any) {
    ElMessage.error(err?.message || '上传失败')
  }
}

async function toggle(row: Product) { await toggleProduct(row.id); load() }
async function del(id: string) {
  await ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' })
  await deleteProduct(id)
  ElMessage.success('已删除'); load()
}
</script>

<style scoped>
.image-upload {
  display: flex;
  align-items: center;
  gap: 12px;
}
.image-placeholder {
  width: 64px;
  height: 64px;
  border: 1px dashed #d9d9d9;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 12px;
}
</style>
