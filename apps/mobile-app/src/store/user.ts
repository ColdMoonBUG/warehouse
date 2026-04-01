import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Session, Account } from '@/types'
import { getSession, logout as apiLogout, getAccounts } from '@/api'

export const useUserStore = defineStore('user', () => {
  const session = ref<Session | null>(getSession())
  const accounts = ref<Account[]>([])

  const isLoggedIn = computed(() => !!session.value)
  const currentUser = computed(() => session.value)
  const isAdmin = computed(() => session.value?.role === 'admin')

  function init() {
    session.value = getSession()
  }

  function setSession(s: Session) {
    session.value = s
  }

  function logout() {
    apiLogout()
    session.value = null
  }

  async function loadAccounts() {
    accounts.value = await getAccounts()
  }

  return {
    session,
    accounts,
    isLoggedIn,
    currentUser,
    isAdmin,
    init,
    setSession,
    logout,
    loadAccounts,
  }
})
