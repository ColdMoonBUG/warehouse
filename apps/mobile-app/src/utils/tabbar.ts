import { useUserStore } from '@/store/user'

const ADMIN_HOME_PATH = '/pages/settings/index'
const SALES_HOME_PATH = '/pages/map/index'

export function getRoleHomePath(isAdmin: boolean) {
  return isAdmin ? ADMIN_HOME_PATH : SALES_HOME_PATH
}

export function switchToRoleHome() {
  const userStore = useUserStore()
  const target = getRoleHomePath(!!userStore.isAdmin)
  uni.switchTab({ url: target })
}

export function applyRoleTabBar() {
  try {
    const userStore = useUserStore()
    const isAdmin = userStore.isAdmin
    const config = isAdmin ? (uni as any).__uniConfig?.tabBarAdmin : (uni as any).__uniConfig?.tabBarSales
    const list = config?.list || []
    if (!list.length || typeof uni.setTabBarItem !== 'function') return

    list.forEach((item: any, index: number) => {
      if (!item?.pagePath) return
      uni.setTabBarItem({
        index,
        text: item.text,
        pagePath: item.pagePath,
      } as any)
    })
  } catch {
    // ignore
  }
}
