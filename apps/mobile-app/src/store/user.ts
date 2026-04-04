import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Session, Account } from '@/types'
import { getSession, logout as apiLogout } from '@/api'
import { useReferenceStore } from './reference'

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
    const referenceStore = useReferenceStore()
    referenceStore.warmForSession(s.role === 'admin')
  }

  function logout() {
    apiLogout()
    session.value = null
    accounts.value = []
  }

  async function loadAccounts(force = false) {
    const referenceStore = useReferenceStore()
    referenceStore.hydrate()
    accounts.value = referenceStore.accounts
    await referenceStore.preloadAccounts(force)
    accounts.value = referenceStore.accounts
    return accounts.value
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
