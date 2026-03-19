<template>
  <div class="sidebar-root">
    <div class="brand" :class="{ mini: collapsed }">
      <span class="dot" />
      <span class="name">ERP-zjy</span>
    </div>
    <el-menu
      :default-active="active"
      class="menu"
      :collapse="collapsed"
      :collapse-transition="false"
      background-color="var(--menu-bg)"
      text-color="var(--menu-text)"
      active-text-color="var(--menu-active)"
      router
    >
      <el-menu-item index="/dashboard">
        <i class="ri-dashboard-line" />
        <span>首页看板</span>
      </el-menu-item>

      <el-sub-menu v-if="!isSales" index="/basic">
        <template #title>
          <i class="ri-database-2-line" />
          <span>基础资料</span>
        </template>
        <el-menu-item index="/basic/supplier">厂家管理</el-menu-item>
        <el-menu-item index="/basic/product">商品管理</el-menu-item>
        <el-menu-item index="/basic/employee">员工管理</el-menu-item>
        <el-menu-item index="/basic/store">门店管理</el-menu-item>
      </el-sub-menu>

      <el-sub-menu index="/stock">
        <template #title>
          <i class="ri-archive-stack-line" />
          <span>库存/单据</span>
        </template>
        <el-menu-item index="/stock/overview">库存总览</el-menu-item>
        <el-menu-item v-if="!isSales" index="/stock/inbound">入库单</el-menu-item>
        <el-menu-item v-if="!isSales" index="/stock/transfer">出库单</el-menu-item>
        <el-menu-item index="/stock/sale">销售单</el-menu-item>
      </el-sub-menu>
    </el-menu>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getSession } from '@/api/auth'

defineProps<{ collapsed?: boolean }>()

const route = useRoute()
const active = computed(() => route.path)
const session = ref(getSession())
const isSales = computed(() => session.value?.role === 'salesperson')
</script>

<style scoped>
.sidebar-root {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 56px;
  padding: 0 14px;
  color: var(--app-text);
  font-weight: 700;
  letter-spacing: 0.5px;
}
.brand .dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #38bdf8, #0ea5e9);
  box-shadow: 0 0 16px rgba(56,189,248,0.8);
}
.brand.mini .name { opacity: 0; width: 0; }

.menu { border-right: none; }
.menu :deep(.el-sub-menu__title),
.menu :deep(.el-menu-item) {
  border-radius: 8px;
  margin: 4px 8px;
}
.menu :deep(.is-active) {
  background: linear-gradient(90deg, rgba(56,189,248,0.18), rgba(56,189,248,0.05));
}
</style>
