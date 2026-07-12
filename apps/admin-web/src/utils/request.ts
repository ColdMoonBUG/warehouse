import axios from 'axios'
import { ElMessage } from 'element-plus'

const request = axios.create({
  baseURL: '/api',
  timeout: 10000,
  withCredentials: true,
})

request.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

request.interceptors.response.use(
  (response) => {
    const res = response.data
    if (res.code !== 200) {
      if (res.msg !== '未登录') {
        ElMessage.error(res.msg || '请求失败')
      }
      return Promise.reject(new Error(res.msg || '请求失败'))
    }
    return res
  },
  (error) => {
    if (error.response?.status !== 401) {
      ElMessage.error(error.message || '网络错误')
    }
    return Promise.reject(error)
  }
)

export default request
