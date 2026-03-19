import { createRouter, createWebHashHistory } from 'vue-router'
import Layout from '@/layout/index.vue'
import { getSession } from '@/api/auth'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: () => import('@/pages/Login.vue'), meta: { title: '登录' } },
    {
      path: '/',
      component: Layout,
      redirect: '/dashboard',
      children: [
        {
          path: 'dashboard',
          component: () => import('@/pages/Dashboard.vue'),
          meta: { title: '首页看板' }
        },
        {
          path: 'basic',
          redirect: '/basic/supplier',
          meta: { title: '基础资料', adminOnly: true },
          children: [
            { path: 'supplier', component: () => import('@/pages/basic/Supplier.vue'), meta: { title: '厂家管理', adminOnly: true } },
            { path: 'product', component: () => import('@/pages/basic/Product.vue'), meta: { title: '商品管理', adminOnly: true } },
            { path: 'employee', component: () => import('@/pages/basic/Employee.vue'), meta: { title: '员工管理', adminOnly: true } },
            { path: 'store', component: () => import('@/pages/basic/Store.vue'), meta: { title: '门店管理', adminOnly: true } }
          ]
        },
        {
          path: 'stock',
          redirect: '/stock/overview',
          meta: { title: '库存/单据' },
          children: [
            { path: 'overview', component: () => import('@/pages/stock/Overview.vue'), meta: { title: '库存总览' } },
            { path: 'inbound', component: () => import('@/pages/stock/Inbound.vue'), meta: { title: '入库单', adminOnly: true } },
            { path: 'inbound/:id', component: () => import('@/pages/stock/InboundForm.vue'), meta: { title: '入库单详情', adminOnly: true } },
            { path: 'transfer', component: () => import('@/pages/stock/Transfer.vue'), meta: { title: '出库单', adminOnly: true } },
            { path: 'transfer/:id', component: () => import('@/pages/stock/TransferForm.vue'), meta: { title: '出库单详情', adminOnly: true } },
            { path: 'sale', component: () => import('@/pages/stock/Sale.vue'), meta: { title: '销售单' } },
            { path: 'sale/:id', component: () => import('@/pages/stock/SaleForm.vue'), meta: { title: '销售单详情' } }
          ]
        },
        {
          path: 'system',
          meta: { title: '系统管理', adminOnly: true },
          children: [
            { path: 'account', component: () => import('@/pages/system/Account.vue'), meta: { title: '账户管理', adminOnly: true } }
          ]
        }
      ]
    }
  ]
})

router.beforeEach((to) => {
  const session = getSession()
  if (to.path === '/login') {
    if (session) return '/'
    return true
  }
  if (!session) return '/login'

  const needAdmin = to.matched.some(r => (r.meta as any)?.adminOnly)
  if (needAdmin && session.role !== 'admin') return '/stock/overview'

  if (session.role === 'salesperson') {
    const allow = to.path === '/dashboard' || to.path === '/stock/overview' || to.path.startsWith('/stock/sale')
    if (!allow) return '/stock/overview'
  }
  return true
})

export default router
