import { createSSRApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import { useReferenceStore } from './store/reference'

export function createApp() {
  const app = createSSRApp(App)
  const pinia = createPinia()
  app.use(pinia)
  const referenceStore = useReferenceStore(pinia)
  referenceStore.hydrate()
  return { app }
}
