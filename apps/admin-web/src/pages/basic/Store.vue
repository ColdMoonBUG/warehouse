<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>门店管理</span>
          <el-button type="primary" @click="openForm()">+ 新增门店</el-button>
        </div>
      </template>
      <el-table :data="list" border stripe>
        <el-table-column prop="code" label="编码" width="100" />
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="address" label="地址" />
        <el-table-column label="默认业务员" width="120">
          <template #default="{row}">{{ salespersonName(row.salespersonId) }}</template>
        </el-table-column>
        <el-table-column label="经纬度" width="160">
          <template #default="{row}">{{ row.lat ? `${row.lat},${row.lng}` : '-' }}</template>
        </el-table-column>
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

    <el-dialog v-model="dlg" :title="form.id?'编辑门店':'新增门店'" width="800px" @open="initDlgMap">
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form :model="form" :rules="rules" ref="formRef" label-width="90px">
            <el-form-item label="编码" prop="code" v-if="false"><el-input v-model="form.code" placeholder="可选" /></el-form-item>
            <el-form-item label="名称" prop="name">
              <el-input v-model="form.name" />
              <div style="font-size:12px;color:#64748b;margin-top:4px">可从地图选择自动填充</div>
            </el-form-item>
            <el-form-item label="地址"><el-input v-model="form.address" /></el-form-item>
            <el-form-item label="默认业务员">
              <el-select v-model="form.salespersonId" clearable placeholder="请选择" style="width:100%">
                <el-option v-for="account in salespersonAccounts" :key="account.id" :label="account.displayName" :value="account.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="地址搜索">
              <el-input v-model="searchKw" placeholder="输入关键词" clearable @keyup.enter="searchAddr">
                <template #append><el-button @click="searchAddr">搜索</el-button></template>
              </el-input>
            </el-form-item>
            <el-form-item v-if="searchResults.length">
              <el-select v-model="selResult" placeholder="选择地址" style="width:100%" @change="applyResult">
                <el-option v-for="r in searchResults" :key="r.place_id" :label="r.display_name" :value="r.place_id" />
              </el-select>
            </el-form-item>
            <el-form-item label="纬度"><el-input-number v-model="form.lat" :precision="6" style="width:100%" /></el-form-item>
            <el-form-item label="经度"><el-input-number v-model="form.lng" :precision="6" style="width:100%" /></el-form-item>
          </el-form>
        </el-col>
        <el-col :span="12">
          <div id="dlg-map" style="height:360px;border-radius:6px;overflow:hidden" />
        </el-col>
      </el-row>
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
import { getStores, saveStore, toggleStore, deleteStore } from '@/api/store'
import { getSalespersonAccounts } from '@/api/auth'
import type { Store, Account } from '@/types'

const list = ref<Store[]>([])
const salespersonAccounts = ref<Account[]>([])
const dlg = ref(false)
const formRef = ref()
const form = ref<Partial<Store>>({})
const searchKw = ref('')
const searchResults = ref<any[]>([])
const selResult = ref<string | null>(null)
const rules = {
  name: [{ required: true, message: '请输入名称' }]
}

let dlgMap: any = null
let dlgMarker: any = null

function salespersonName(id?: string) {
  return salespersonAccounts.value.find(account => account.id === id)?.displayName || '-'
}

async function load() {
  ;[list.value, salespersonAccounts.value] = await Promise.all([getStores(), getSalespersonAccounts()])
}
onMounted(load)

function openForm(row?: Store) {
  form.value = row ? { ...row } : { code: '' }
  searchKw.value = ''
  searchResults.value = []
  selResult.value = null
  dlg.value = true
}

async function initDlgMap() {
  const load = (window as any).__loadAMap
  if (load) await load()
  const AMap = (window as any).AMap

  await new Promise(r => setTimeout(r, 100))
  if (dlgMap) { dlgMap.destroy(); dlgMap = null }
  const lat = form.value.lat || 32.9987
  const lng = form.value.lng || 112.5292
  dlgMap = new AMap.Map('dlg-map', {
    zoom: 13,
    center: [lng, lat],
    resizeEnable: true
  })
  if (form.value.lat && form.value.lng) {
    dlgMarker = new AMap.Marker({ position: [form.value.lng, form.value.lat] })
    dlgMap.add(dlgMarker)
  }
  dlgMap.on('click', (e: any) => {
    form.value.lat = +e.lnglat.lat.toFixed(6)
    form.value.lng = +e.lnglat.lng.toFixed(6)
    if (dlgMarker) dlgMarker.setPosition([form.value.lng, form.value.lat])
    else {
      dlgMarker = new AMap.Marker({ position: [form.value.lng, form.value.lat] })
      dlgMap.add(dlgMarker)
    }
    reverseGeocode(form.value.lng!, form.value.lat!)
  })
}

async function searchAddr() {
  if (!searchKw.value.trim()) return
  const load = (window as any).__loadAMap
  if (load) await load()
  const AMap = (window as any).AMap
  try {
    const placeSearch = new AMap.PlaceSearch({ pageSize: 5 })
    placeSearch.search(searchKw.value, (status: string, result: any) => {
      if (status !== 'complete' || !result?.poiList?.pois?.length) {
        searchResults.value = []
        ElMessage.info('未找到相关地址')
        return
      }
      searchResults.value = result.poiList.pois.map((p: any) => ({
        place_id: p.id,
        display_name: p.name + (p.address ? ` - ${p.address}` : ''),
        lat: p.location?.lat,
        lon: p.location?.lng,
        address: p.address
      }))
    })
  } catch {
    ElMessage.warning('地址搜索失败，请检查网络')
  }
}

function reverseGeocode(lng: number, lat: number) {
  const AMap = (window as any).AMap
  const geocoder = new AMap.Geocoder()
  geocoder.getAddress([lng, lat], (status: string, result: any) => {
    if (status !== 'complete' || !result?.regeocode?.formattedAddress) return
    form.value.address = result.regeocode.formattedAddress
    if (!form.value.name) form.value.name = result.regeocode.addressComponent?.building?.name || form.value.address
  })
}

function applyResult(placeId: string) {
  const r = searchResults.value.find(x => x.place_id === placeId)
  if (!r) return
  form.value.lat = +parseFloat(r.lat).toFixed(6)
  form.value.lng = +parseFloat(r.lon).toFixed(6)
  form.value.address = r.address || form.value.address || r.display_name
  if (!form.value.name) form.value.name = r.display_name
  if (dlgMap) {
    dlgMap.setCenter([form.value.lng, form.value.lat])
    if (dlgMarker) dlgMarker.setPosition([form.value.lng, form.value.lat])
    else {
      const AMap = (window as any).AMap
      dlgMarker = new AMap.Marker({ position: [form.value.lng, form.value.lat] })
      dlgMap.add(dlgMarker)
    }
  }
}

async function submit() {
  await formRef.value.validate()
  if (!form.value.name) {
    ElMessage.warning('请先选择地图位置或填写名称')
    return
  }
  if (!form.value.code) form.value.code = String(form.value.name || '').slice(0, 8)
  await saveStore(form.value as any)
  dlg.value = false
  if (dlgMap) { dlgMap.destroy(); dlgMap = null }
  ElMessage.success('保存成功')
  load()
}

async function toggle(row: Store) { await toggleStore(row.id); load() }
async function del(id: string) {
  await ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' })
  await deleteStore(id)
  ElMessage.success('已删除'); load()
}
</script>
