import { createApp, h } from 'vue'
import { RouterView } from 'vue-router'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import './style.css'
import router from './router'
import { seedIfEmpty } from './mock/seed'

seedIfEmpty()

const loadAMap = (() => {
  let pending: Promise<void> | null = null
  return () => {
    if ((window as any).AMap) return Promise.resolve()
    if (pending) return pending
    const key = import.meta.env.VITE_AMAP_KEY
    if (!key) return Promise.reject(new Error('VITE_AMAP_KEY is missing'))
    const url = `https://webapi.amap.com/maps?v=2.0&key=${key}&plugin=AMap.PlaceSearch,AMap.Geocoder,AMap.AutoComplete`
    pending = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = url
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load AMap JS API'))
      document.head.appendChild(script)
    })
    return pending
  }
})()
;(window as any).__loadAMap = loadAMap

const app = createApp({ render: () => h(RouterView) })
app.use(createPinia())
app.use(ElementPlus, { locale: zhCn })
app.use(router)
app.mount('#app')
