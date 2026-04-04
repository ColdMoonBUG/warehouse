import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getAccounts, getProducts, getStores, getSuppliers, getWarehouses } from '@/api'
import type { Account, Product, Salesperson, Store, Supplier, Warehouse } from '@/types'

const REFERENCE_CACHE_TTL = 5 * 60 * 1000

const CACHE_KEYS = {
  accounts: 'wh_ref_accounts',
  allAccounts: 'wh_ref_accounts_all',
  stores: 'wh_ref_stores',
  products: 'wh_ref_products',
  warehouses: 'wh_ref_warehouses',
  suppliers: 'wh_ref_suppliers',
}

interface CachedList<T> {
  loadedAt: number
  value: T[]
}

function readListCache<T>(key: string): CachedList<T> {
  try {
    const raw = uni.getStorageSync(key)
    if (!raw) return { loadedAt: 0, value: [] }
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return { loadedAt: 0, value: parsed as T[] }
    }
    if (Array.isArray(parsed?.value)) {
      return {
        loadedAt: Number(parsed.loadedAt || 0),
        value: parsed.value as T[],
      }
    }
  } catch {
    // ignore
  }
  return { loadedAt: 0, value: [] }
}

function writeListCache(key: string, value: unknown[], loadedAt: number) {
  try {
    uni.setStorageSync(key, JSON.stringify({ loadedAt, value }))
  } catch {
    // ignore cache write failures
  }
}

function isFresh(loadedAt: number) {
  return loadedAt > 0 && Date.now() - loadedAt < REFERENCE_CACHE_TTL
}

function toSalespersons(accounts: Account[]): Salesperson[] {
  return accounts.filter((account): account is Salesperson => account.role === 'salesperson')
}

export const useReferenceStore = defineStore('reference', () => {
  const hydrated = ref(false)
  const accounts = ref<Account[]>([])
  const allAccounts = ref<Account[]>([])
  const stores = ref<Store[]>([])
  const products = ref<Product[]>([])
  const warehouses = ref<Warehouse[]>([])
  const suppliers = ref<Supplier[]>([])
  const accountsLoadedAt = ref(0)
  const allAccountsLoadedAt = ref(0)
  const storesLoadedAt = ref(0)
  const productsLoadedAt = ref(0)
  const warehousesLoadedAt = ref(0)
  const suppliersLoadedAt = ref(0)
  const accountsLoading = ref(false)
  const coreLoading = ref(false)
  const allAccountsLoading = ref(false)
  const suppliersLoading = ref(false)
  const accountsError = ref('')
  const coreError = ref('')
  const allAccountsError = ref('')
  const suppliersError = ref('')

  let accountsPromise: Promise<void> | null = null
  let corePromise: Promise<void> | null = null
  let allAccountsPromise: Promise<void> | null = null
  let suppliersPromise: Promise<void> | null = null

  const salespersons = computed(() => toSalespersons(accounts.value))
  const allSalespersons = computed(() => toSalespersons(allAccounts.value))

  function hydrate() {
    if (hydrated.value) return
    const cachedAccounts = readListCache<Account>(CACHE_KEYS.accounts)
    const cachedAllAccounts = readListCache<Account>(CACHE_KEYS.allAccounts)
    const cachedStores = readListCache<Store>(CACHE_KEYS.stores)
    const cachedProducts = readListCache<Product>(CACHE_KEYS.products)
    const cachedWarehouses = readListCache<Warehouse>(CACHE_KEYS.warehouses)
    const cachedSuppliers = readListCache<Supplier>(CACHE_KEYS.suppliers)

    accounts.value = cachedAccounts.value
    allAccounts.value = cachedAllAccounts.value
    stores.value = cachedStores.value
    products.value = cachedProducts.value
    warehouses.value = cachedWarehouses.value
    suppliers.value = cachedSuppliers.value
    accountsLoadedAt.value = cachedAccounts.loadedAt
    allAccountsLoadedAt.value = cachedAllAccounts.loadedAt
    storesLoadedAt.value = cachedStores.loadedAt
    productsLoadedAt.value = cachedProducts.loadedAt
    warehousesLoadedAt.value = cachedWarehouses.loadedAt
    suppliersLoadedAt.value = cachedSuppliers.loadedAt
    hydrated.value = true
  }

  function setAccounts(nextAccounts: Account[]) {
    const loadedAt = Date.now()
    accounts.value = nextAccounts
    accountsLoadedAt.value = loadedAt
    writeListCache(CACHE_KEYS.accounts, nextAccounts, loadedAt)
  }

  function setAllAccounts(nextAccounts: Account[]) {
    const loadedAt = Date.now()
    allAccounts.value = nextAccounts
    allAccountsLoadedAt.value = loadedAt
    writeListCache(CACHE_KEYS.allAccounts, nextAccounts, loadedAt)
  }

  function setStores(nextStores: Store[]) {
    const loadedAt = Date.now()
    stores.value = nextStores
    storesLoadedAt.value = loadedAt
    writeListCache(CACHE_KEYS.stores, nextStores, loadedAt)
  }

  function setProducts(nextProducts: Product[]) {
    const loadedAt = Date.now()
    products.value = nextProducts
    productsLoadedAt.value = loadedAt
    writeListCache(CACHE_KEYS.products, nextProducts, loadedAt)
  }

  function setWarehouses(nextWarehouses: Warehouse[]) {
    const loadedAt = Date.now()
    warehouses.value = nextWarehouses
    warehousesLoadedAt.value = loadedAt
    writeListCache(CACHE_KEYS.warehouses, nextWarehouses, loadedAt)
  }

  function setSuppliers(nextSuppliers: Supplier[]) {
    const loadedAt = Date.now()
    suppliers.value = nextSuppliers
    suppliersLoadedAt.value = loadedAt
    writeListCache(CACHE_KEYS.suppliers, nextSuppliers, loadedAt)
  }

  function hasFreshCoreData() {
    return isFresh(accountsLoadedAt.value)
      && isFresh(storesLoadedAt.value)
      && isFresh(productsLoadedAt.value)
      && isFresh(warehousesLoadedAt.value)
  }

  async function preloadAccounts(force = false) {
    hydrate()
    if (!force && isFresh(accountsLoadedAt.value)) {
      return
    }
    if (accountsPromise) return accountsPromise

    accountsError.value = ''
    accountsLoading.value = true
    accountsPromise = (async () => {
      setAccounts(await getAccounts())
    })()
      .catch((error: any) => {
        accountsError.value = error?.message || '账户资料加载失败'
        throw error
      })
      .finally(() => {
        accountsLoading.value = false
        accountsPromise = null
      })

    return accountsPromise
  }

  async function preloadCore(force = false) {
    hydrate()
    if (!force && hasFreshCoreData()) {
      return
    }
    if (corePromise) return corePromise

    coreError.value = ''
    coreLoading.value = true
    corePromise = (async () => {
      const [nextAccounts, nextStores, nextProducts, nextWarehouses] = await Promise.all([
        getAccounts(),
        getStores(),
        getProducts(),
        getWarehouses(),
      ])
      setAccounts(nextAccounts)
      setStores(nextStores)
      setProducts(nextProducts)
      setWarehouses(nextWarehouses)
    })()
      .catch((error: any) => {
        coreError.value = error?.message || '基础资料加载失败'
        throw error
      })
      .finally(() => {
        coreLoading.value = false
        corePromise = null
      })

    return corePromise
  }

  async function preloadAllAccounts(force = false) {
    hydrate()
    if (!force && isFresh(allAccountsLoadedAt.value)) {
      return
    }
    if (allAccountsPromise) return allAccountsPromise

    allAccountsError.value = ''
    allAccountsLoading.value = true
    allAccountsPromise = (async () => {
      setAllAccounts(await getAccounts(true))
    })()
      .catch((error: any) => {
        allAccountsError.value = error?.message || '账户资料加载失败'
        throw error
      })
      .finally(() => {
        allAccountsLoading.value = false
        allAccountsPromise = null
      })

    return allAccountsPromise
  }

  async function preloadSuppliers(force = false) {
    hydrate()
    if (!force && isFresh(suppliersLoadedAt.value)) {
      return
    }
    if (suppliersPromise) return suppliersPromise

    suppliersError.value = ''
    suppliersLoading.value = true
    suppliersPromise = (async () => {
      setSuppliers(await getSuppliers())
    })()
      .catch((error: any) => {
        suppliersError.value = error?.message || '供应商资料加载失败'
        throw error
      })
      .finally(() => {
        suppliersLoading.value = false
        suppliersPromise = null
      })

    return suppliersPromise
  }

  function warmForSession(isAdmin: boolean) {
    hydrate()
    void preloadCore().catch(() => {})
    if (isAdmin) {
      void preloadAllAccounts().catch(() => {})
      void preloadSuppliers().catch(() => {})
    }
  }

  return {
    accounts,
    allAccounts,
    stores,
    products,
    warehouses,
    suppliers,
    salespersons,
    allSalespersons,
    accountsLoading,
    coreLoading,
    allAccountsLoading,
    suppliersLoading,
    accountsError,
    coreError,
    allAccountsError,
    suppliersError,
    hydrate,
    preloadAccounts,
    preloadCore,
    preloadAllAccounts,
    preloadSuppliers,
    warmForSession,
  }
})
