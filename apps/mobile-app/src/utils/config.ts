// 环境配置

// 是否使用Mock数据
export const USE_MOCK = false

// 后端API地址 - H5 走代理，App 真机/打包走局域网地址
let baseUrl = ''
// #ifndef H5
baseUrl = 'http://192.168.31.85:8888'
// #endif
export const BASE_URL = baseUrl

// 高德地图Key
export const AMAP_KEY = 'f4b4dc7f2c6ab34d28831cf946effcc8'
// 高德 Web API Key（用于POI搜索）
export const AMAP_WEB_KEY = 'f4b4dc7f2c6ab34d28831cf946effcc8'

// Session配置
export const SESSION_KEY = 'wh_session'
export const SESSION_DAYS = 365
