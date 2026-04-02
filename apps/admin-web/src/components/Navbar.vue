<template>
  <div class="navbar-root">
    <el-button link class="toggle" @click="$emit('toggle')">
      <i class="ri-menu-2-line" />
    </el-button>
    <div class="spacer" />
    <el-switch v-model="theme" class="theme-switch" active-text="白" inactive-text="黑" @change="applyTheme" />
    <el-dropdown @command="onCommand">
      <div class="user-btn">
        <el-icon size="18"><UserFilled /></el-icon>
        <span>{{ session?.displayName || '账户' }}</span>
      </div>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item disabled>{{ session?.username || '-' }}</el-dropdown-item>
          <el-dropdown-item disabled>{{ roleLabel }}</el-dropdown-item>
          <el-dropdown-item divided command="switch">切换账户</el-dropdown-item>
          <el-dropdown-item command="logout">退出登录</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { UserFilled } from '@element-plus/icons-vue'
import { getSession, logoutRemote } from '@/api/auth'

const theme = ref(localStorage.getItem('theme') === 'light')

defineProps<{ collapsed?: boolean }>()
defineEmits<{ (e: 'toggle'): void }>()

const router = useRouter()
const session = getSession()
const roleLabel = computed(() => session?.role === 'admin' ? '管理员' : '业务员')

function applyTheme() {
  document.documentElement.classList.toggle('theme-light', theme.value)
  localStorage.setItem('theme', theme.value ? 'light' : 'dark')
}

async function onCommand(cmd: string) {
  if (cmd === 'switch' || cmd === 'logout') {
    await logoutRemote()
    router.replace('/login')
  }
}

onMounted(() => {
  applyTheme()
})
</script>

<style scoped>
.navbar-root {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  width: 100%;
}
.toggle {
  font-size: 26px;
  color: #fff;
  background: #0ea5e9;
  border-radius: 10px;
  padding: 6px 10px;
  box-shadow: 0 0 0 2px rgba(255,255,255,0.15) inset, 0 2px 8px rgba(14,165,233,0.45);
}
.toggle:active { background: #0284c7; }
.spacer { flex: 1; }
.user-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #e5e7eb;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
}
.user-btn:hover { background: rgba(255,255,255,0.08); }
</style>
