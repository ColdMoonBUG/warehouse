<template>
  <span v-if="id" class="doc-link">
    <router-link :to="`/stock/${type}/${id}`">{{ code || '查看' }}</router-link>
    <el-tag v-if="status === 'voided'" type="danger" size="small" effect="plain">已作废</el-tag>
    <el-tag v-else-if="status === 'draft'" type="info" size="small" effect="plain">草稿</el-tag>
  </span>
  <span v-else>-</span>
</template>

<script setup lang="ts">
defineProps<{ type: 'sale' | 'return'; id?: string | null; code?: string | null; status?: string | null }>()
</script>

<style scoped>
.doc-link { display: inline-flex; align-items: center; gap: 4px; }
.doc-link a { color: var(--el-color-primary); text-decoration: none; }
.doc-link a:hover { text-decoration: underline; }
</style>
