// 统一请求封装：自动带 token、统一错误提示、401 跳登录
// 2026-11-02 加 opts.silent：咨询单的「重复申请冲突（40901）」和后台轮询要自己处理提示与弹层，
// 不能被通用 toast 抢先弹一遍、也不该在轮询里把用户踹去登录页。
import { store } from '../store'
const BASE = '/api'

/** 当前页路由（登录后回跳用）；拿不到就返回空串，登录页会退化成「返回上一页」 */
function curRoute() {
  try {
    const ps = (typeof getCurrentPages === 'function' ? getCurrentPages() : [])
    if (!ps.length) return ''
    const route = ps[ps.length - 1].route || ''
    return route ? '/' + route : ''
  } catch (e) { return '' }
}

export function api(method, url, data = {}, opts = {}) {
  const silent = opts.silent === true
  return new Promise((resolve, reject) => {
    uni.request({
      url: BASE + url,
      method,
      data,
      timeout: 15000,
      header: {
        'Content-Type': 'application/json',
        // token 两个来源都看：登录成功后 setLogin 同时写内存与 storage，但页面/组件也可能在更早时机发请求，
        // 只读 storage 或只读内存都可能漏（2026-11-03 用户报告「已登录仍被要求登录」）。
        Authorization: 'Bearer ' + (store.token || (uni.getStorageSync('token') || ''))
      },
      success: (res) => {
        const r = res.data || {}
        if (r.code === 0) {
          resolve(r.data)
        } else {
          if (r.code === 40100) {
            // 登录凭证在服务端失效（token 过期 / 服务重启）：内存与 storage 都要清，
            // 否则会出现「界面还显示已登录、请求却一直被拒」的状态（2026-11-03 用户报告）。
            try { uni.removeStorageSync('token'); uni.removeStorageSync('user') } catch (e) {}
            try { store.token = ''; store.user = null } catch (e) {}
            if (!silent) {
              // 文案不能是服务端那句「请先登录」：用户明明登录着，看到这句会以为前端又拦了一次。
              uni.showToast({ title: '登录状态已失效，请重新登录', icon: 'none', duration: 2500 })
              const back = curRoute()
              setTimeout(() => {
                try { uni.hideToast() } catch (e) {}
                uni.navigateTo({ url: '/pages/login/login' + (back ? '?redirect=' + encodeURIComponent(back) : '') })
              }, 800)
            }
            reject(r)
            return
          }
          if (!silent) uni.showToast({ title: r.msg || '请求失败', icon: 'none', duration: 2500 })
          reject(r)
        }
      },
      fail: () => {
        if (!silent) uni.showToast({ title: '网络异常，请检查 Mock Server 是否启动', icon: 'none', duration: 2500 })
        reject(new Error('network error'))
      }
    })
  })
}

export const get = (url) => api('GET', url)
export const post = (url, data) => api('POST', url, data)
// 需要自己处理失败（弹自定义层 / 轮询）的请求走这两个
export const getSilent = (url) => api('GET', url, {}, { silent: true })
export const postSilent = (url, data) => api('POST', url, data, { silent: true })
