import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import Layout from '../layout/Layout.vue'
import { brand } from '../utils/brand'

// 主框架子路由（菜单数据同源）
export const menuRoutes = [
  {
    path: 'index',
    component: () => import('../views/dashboard/index.vue'),
    meta: { title: '首页', icon: 'HomeFilled', affix: true }
  },
  {
    path: 'consult',
    component: () => import('../views/consult/index.vue'),
    meta: { title: '咨询受理', icon: 'ChatDotRound' }
  },
  {
    path: 'order/list',
    component: () => import('../views/order/list.vue'),
    meta: { title: '订单管理', icon: 'Tickets' }
  },
  {
    path: 'refund/list',
    component: () => import('../views/refund/list.vue'),
    meta: { title: '退款管理', icon: 'RefreshLeft' }
  },
  {
    path: 'schedule',
    component: () => import('../views/schedule/index.vue'),
    meta: { title: '档期管理', icon: 'Calendar' }
  },
  {
    path: 'user/list',
    component: () => import('../views/user/list.vue'),
    meta: { title: '用户管理', icon: 'User', roles: ['ADMIN'] }
  },
  {
    path: 'review/list',
    component: () => import('../views/review/list.vue'),
    meta: { title: '评价管理', icon: 'Star', roles: ['ADMIN'] }
  },
  {
    path: 'venue/list',
    component: () => import('../views/venue/list.vue'),
    meta: { title: '场地管理', icon: 'MapLocation', roles: ['ADMIN'] }
  },
  {
    path: 'system/config',
    component: () => import('../views/system/config.vue'),
    meta: { title: '业务配置', icon: 'Setting', roles: ['ADMIN'] }
  },
  {
    path: 'system/dict',
    component: () => import('../views/system/dict.vue'),
    meta: { title: '字典管理', icon: 'Collection', roles: ['ADMIN'] }
  },
  {
    path: 'user/profile',
    component: () => import('../views/user/profile.vue'),
    meta: { title: '个人中心', icon: 'UserFilled', hidden: true }
  }
]

const routes = [
  {
    path: '/login',
    component: () => import('../views/login/index.vue'),
    meta: { title: '登录', noTag: true }
  },
  {
    path: '/',
    component: Layout,
    redirect: '/index',
    children: menuRoutes
  },
  { path: '/:pathMatch(.*)*', redirect: '/index' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const token = localStorage.getItem('admin_token')
  if (to.path === '/login') {
    return token ? '/' : true
  }
  if (!token) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  // 角色拦截
  if (to.meta?.roles) {
    const info = JSON.parse(localStorage.getItem('admin_info') || 'null')
    const role = info?.role || ''
    if (!to.meta.roles.includes(role)) {
      ElMessage.warning('无权限访问该页面')
      return '/index'
    }
  }
  return true
})

router.afterEach((to) => {
  document.title = to.meta?.title ? `${to.meta.title} - ${brand.adminTitle}` : brand.adminTitle
})

export default router
