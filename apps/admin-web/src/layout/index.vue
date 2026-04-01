<template>
  <el-container class="app-layout" :class="{ collapsed: isCollapsed }">
    <el-aside v-show="!isMobile" class="sidebar" :width="isCollapsed ? '64px' : '220px'">
      <slot name="sidebar">
        <Sidebar :collapsed="isCollapsed" />
      </slot>
    </el-aside>
    <el-container>
      <el-header class="navbar">
        <slot name="navbar">
          <Navbar :collapsed="isCollapsed" @toggle="toggleCollapse" />
        </slot>
      </el-header>
      <div class="breadcrumb-wrap">
        <slot name="breadcrumb">
          <Breadcrumb />
        </slot>
      </div>
      <el-main class="content">
        <slot>
          <router-view v-slot="{ Component, route }">
            <component :is="Component" :key="route.fullPath" />
          </router-view>
        </slot>
      </el-main>
    </el-container>
  </el-container>

  <el-drawer v-model="drawer" direction="ltr" size="220px" :with-header="false" class="mobile-drawer">
    <Sidebar :collapsed="false" />
  </el-drawer>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import Sidebar from '@/components/Sidebar.vue'
import Navbar from '@/components/Navbar.vue'
import Breadcrumb from '@/components/Breadcrumb.vue'

const isCollapsed = ref(false)
const isMobile = ref(window.innerWidth < 768)
const drawer = ref(false)
const mobileInit = ref(false)

const computeCollapsed = () => {
  const wasMobile = isMobile.value
  isMobile.value = window.innerWidth < 768
  if (!isMobile.value) {
    drawer.value = false
    return
  }
  if (!wasMobile || !mobileInit.value) {
    drawer.value = true
    mobileInit.value = true
  }
}

const toggleCollapse = () => {
  if (isMobile.value) {
    drawer.value = true
    return
  }
  isCollapsed.value = !isCollapsed.value
}

onMounted(() => {
  computeCollapsed()
  window.addEventListener('resize', computeCollapsed)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', computeCollapsed)
})
</script>

<style scoped>
.app-layout {
  height: 100vh;
  background: var(--app-bg);
  color: var(--app-text);
}

.sidebar {
  border-right: 1px solid var(--border-color);
  backdrop-filter: blur(6px);
  background: var(--sidebar-bg);
}

.navbar {
  height: 56px;
  padding: 0;
  display: flex;
  align-items: center;
  background: var(--navbar-bg);
  border-bottom: 1px solid var(--border-color);
}

.breadcrumb-wrap {
  padding: 10px 16px;
  background: var(--breadcrumb-bg);
}

.content {
  padding: 16px;
}

/* Smooth width transition */
.sidebar { transition: width 200ms ease; }
.collapsed .sidebar { width: 64px !important; }

:deep(.mobile-drawer) {
  --el-drawer-bg-color: var(--sidebar-bg);
}
:deep(.mobile-drawer .el-drawer__body) {
  color: var(--app-text);
}
</style>
