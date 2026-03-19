<template>
  <el-breadcrumb separator="/" class="bc-root">
    <el-breadcrumb-item v-for="(item, idx) in crumbs" :key="idx">
      <router-link v-if="idx < crumbs.length - 1" :to="item.path">{{ item.meta?.title || item.name }}</router-link>
      <span v-else>{{ item.meta?.title || item.name }}</span>
    </el-breadcrumb-item>
  </el-breadcrumb>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const crumbs = computed(() => route.matched.filter(r => r.meta && r.meta.title))
</script>

<style scoped>
.bc-root :deep(.el-breadcrumb__inner) {
  color: #cbd5e1;
}
.bc-root :deep(.el-breadcrumb__item:last-child .el-breadcrumb__inner) {
  color: #e5e7eb;
}
</style>
