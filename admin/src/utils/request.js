import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router'

// 统一请求封装：baseURL /api，响应 {code,msg,data}，code===0 返回 data
const service = axios.create({
  baseURL: '/api',
  timeout: 15000
})

service.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('admin_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

service.interceptors.response.use(
  (response) => {
    const body = response.data
    if (body && body.code === 0) {
      return body.data
    }
    const code = body ? body.code : 50000
    const msg = (body && body.msg) || '请求失败'
    if (code === 40100) {
      // 未登录 / 登录失效
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_info')
      ElMessage.error('登录已失效，请重新登录')
      const current = router.currentRoute.value
      if (current.path !== '/login') {
        router.replace({ path: '/login', query: { redirect: current.fullPath } })
      }
    } else if (code === 40300) {
      ElMessage.error(msg || '无权限执行此操作')
    } else {
      ElMessage.error(msg)
    }
    return Promise.reject(new Error(msg))
  },
  (error) => {
    const msg = error.response?.data?.msg || error.message || '网络异常，请稍后重试'
    ElMessage.error(msg)
    return Promise.reject(error)
  }
)

export default service
