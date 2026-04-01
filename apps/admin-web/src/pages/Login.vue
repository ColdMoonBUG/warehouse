<template>
  <div class="login-bg">
    <div class="login-card">
      <div class="login-logo">
        <span class="dot" />
        <span class="brand">进销存管理系统</span>
      </div>

      <!-- 选账户 -->
      <div v-if="step==='select'" class="step">
        <div class="step-title">选择账户</div>
        <div class="account-list">
          <div v-for="acc in accounts" :key="acc.id"
            class="account-item" @click="selectAccount(acc)">
            <el-icon size="28"><UserFilled /></el-icon>
            <div class="acc-info">
              <div class="acc-name">{{ acc.displayName }}</div>
              <div class="acc-role">{{ acc.role==='admin'?'管理员':'业务员' }}</div>
            </div>
            <el-icon class="arrow"><ArrowRight /></el-icon>
          </div>
        </div>
      </div>

      <!-- 手势密码 -->
      <div v-else-if="step==='gesture'" class="step">
        <div class="step-title">{{ current?.displayName }} — 手势解锁</div>
        <GestureUnlock hint="请绘制手势密码" :min-points="4" show-reset @complete="onGesture" />
        <el-button link class="use-pwd-btn" @click="step='password'">使用文字密码</el-button>
        <el-button link class="back-btn" @click="step='select'">← 返回</el-button>
      </div>

      <!-- 文字密码 -->
      <div v-else-if="step==='password'" class="step">
        <div class="step-title">{{ current?.displayName }} — 输入密码</div>
        <el-form @submit.prevent="onPassword" style="width:260px">
          <el-form-item>
            <el-input v-model="pwd" type="password" placeholder="请输入密码" show-password
              autofocus @keyup.enter="onPassword" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" style="width:100%" @click="onPassword">登录</el-button>
          </el-form-item>
        </el-form>
        <el-button link class="back-btn" @click="step='gesture'">← 使用手势密码</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { UserFilled, ArrowRight } from '@element-plus/icons-vue'
import GestureUnlock from '@/components/GestureUnlock.vue'
import { getAccounts, loginByGesture, loginByPassword } from '@/api/auth'
import type { Account } from '@/types'

const router = useRouter()
const accounts = ref<Account[]>([])
const current = ref<Account | null>(null)
const step = ref<'select'|'gesture'|'password'>('select')
const pwd = ref('')


onMounted(async () => {
  accounts.value = (await getAccounts()).filter(a => a.status === 'active')
})

function selectAccount(acc: Account) {
  current.value = acc
  step.value = acc.gestureHash ? 'gesture' : 'password'
}

async function onGesture(pattern: string) {
  try {
    await loginByGesture(current.value!.username, pattern)
    router.replace('/')
  } catch (e: any) {
    ElMessage.error(e.message)
  }
}

async function onPassword() {
  try {
    await loginByPassword(current.value!.username, pwd.value)
    router.replace('/')
  } catch (e: any) {
    ElMessage.error(e.message)
  }
}
</script>

<style scoped>
.login-bg {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
}
.login-card {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  padding: 36px 32px;
  width: 340px;
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
.login-logo { display:flex; align-items:center; gap:10px; margin-bottom:28px; justify-content:center; }
.dot { width:12px; height:12px; border-radius:50%; background:radial-gradient(circle at 30% 30%,#38bdf8,#0ea5e9); box-shadow:0 0 16px rgba(56,189,248,0.8); }
.brand { font-size:18px; font-weight:700; color:#e5e7eb; }
.step { display:flex; flex-direction:column; align-items:center; gap:16px; }
.step-title { font-size:15px; color:#94a3b8; }
.account-list { width:100%; display:flex; flex-direction:column; gap:8px; }
.account-item {
  display:flex; align-items:center; gap:12px;
  padding:12px 16px; border-radius:10px;
  background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08);
  cursor:pointer; color:#e5e7eb; transition:background 0.2s;
}
.account-item:hover { background:rgba(56,189,248,0.12); border-color:#38bdf8; }
.acc-info { flex:1; }
.acc-name { font-weight:600; font-size:15px; }
.acc-role { font-size:12px; color:#64748b; margin-top:2px; }
.arrow { color:#475569; }
.use-pwd-btn { color:#60a5fa; font-size:13px; }
.back-btn { color:#475569; font-size:12px; }
</style>
