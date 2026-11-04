<template>
  <div class="layout" :class="{ 'is-mobile': isMobile }">
    <!-- 手机端抽屉遮罩 -->
    <div v-show="isMobile && drawerOpen" class="drawer-mask" @click="drawerOpen = false"></div>

    <aside
      class="sidebar"
      :class="{ 'drawer-open': drawerOpen }"
      :style="{ width: isMobile ? '210px' : collapsed ? '64px' : '210px' }"
    >
      <div class="logo" @click="$router.push('/index')">
        <span class="logo-icon">
          <svg viewBox="0 0 48 48" width="30" height="30" fill="none">
            <circle cx="10" cy="10" r="7" stroke="#7db9ff" stroke-width="2.5" />
            <circle cx="38" cy="10" r="7" stroke="#7db9ff" stroke-width="2.5" />
            <circle cx="10" cy="38" r="7" stroke="#7db9ff" stroke-width="2.5" />
            <circle cx="38" cy="38" r="7" stroke="#7db9ff" stroke-width="2.5" />
            <rect x="18" y="18" width="12" height="12" rx="3" fill="#409EFF" />
            <path d="M15 15l5 5M33 15l-5 5M15 33l5-5M33 33l-5-5" stroke="#7db9ff" stroke-width="2.5" stroke-linecap="round" />
          </svg>
        </span>
        <transition name="fade">
          <span v-show="!collapsed || isMobile" class="logo-text">{{ brand.adminTitle }}</span>
        </transition>
      </div>
      <el-scrollbar class="menu-scroll">
        <el-menu
          class="side-menu"
          :collapse="isMobile ? false : collapsed"
          :default-active="$route.path"
          router
          background-color="#304156"
          text-color="#bfcbd9"
          active-text-color="#409EFF"
        >
          <el-menu-item v-for="item in menus" :key="item.path" :index="'/' + item.path">
            <el-icon><component :is="item.meta.icon" /></el-icon>
            <template #title>{{ item.meta.title }}</template>
          </el-menu-item>
        </el-menu>
      </el-scrollbar>
    </aside>

    <div class="main-wrap">
      <Navbar :collapsed="collapsed" :is-mobile="isMobile" @toggle="onToggle" />
      <TagsView />
      <main class="app-main">
        <!-- 【原型专用 · 评审辅助】页面左上角“?”悬浮说明，正式系统删除本行及 import 即可 -->
        <ProtoTip />
        <router-view v-slot="{ Component }">
          <transition name="fade-transform" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import Navbar from './components/Navbar.vue'
import TagsView from './components/TagsView.vue'
import ProtoTip from '../components/ProtoTip.vue'
import { menuRoutes } from '../router'
import { useAuthStore } from '../store/auth'
import { brand } from '../utils/brand'

const manualCollapsed = ref(false) // 桌面端手动折叠
const autoCollapsed = ref(false) // 窄屏（<992px）自动折叠
const isMobile = ref(false) // 手机端（<768px）：侧边栏变抽屉
const drawerOpen = ref(false)
const route = useRoute()
const auth = useAuthStore()

const collapsed = computed(() => manualCollapsed.value || autoCollapsed.value)

function onToggle() {
  if (isMobile.value) drawerOpen.value = !drawerOpen.value
  else manualCollapsed.value = !manualCollapsed.value
}

function onResize() {
  const w = window.innerWidth
  isMobile.value = w < 768
  autoCollapsed.value = w < 992
  if (!isMobile.value) drawerOpen.value = false
}

// 手机端点菜单跳转后自动收起抽屉
watch(
  () => route.path,
  () => {
    drawerOpen.value = false
  }
)

onMounted(() => {
  onResize()
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

const menus = computed(() =>
  menuRoutes.filter((r) => {
    if (r.meta?.hidden) return false
    if (r.meta?.roles && !r.meta.roles.includes(auth.role)) return false
    return true
  })
)
</script>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  background: #304156;
  transition: width 0.28s;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.logo {
  height: 56px;
  background: #2b2f3a;
  display: flex;
  align-items: center;
  padding: 0 14px;
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  flex-shrink: 0;
}

.logo-icon {
  display: flex;
  align-items: center;
  margin-right: 8px;
}

.logo-text {
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 1px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.menu-scroll {
  flex: 1;
}

.side-menu {
  border-right: none;
}

.side-menu:not(.el-menu--collapse) {
  width: 210px;
}

.side-menu :deep(.el-menu-item) {
  position: relative;
  height: 50px;
  line-height: 50px;
}

.side-menu :deep(.el-menu-item:hover) {
  background-color: #263445 !important;
}

.side-menu :deep(.el-menu-item.is-active) {
  background-color: #263445 !important;
  color: #409eff;
}

.side-menu :deep(.el-menu-item.is-active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: #409eff;
}

.main-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.app-main {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  background: #f0f2f5;
  position: relative;
}

/* ===== 手机端（<768px）：侧边栏改为抽屉 ===== */
.drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 1001;
  background: rgba(0, 0, 0, 0.45);
}

@media (max-width: 767px) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 1002;
    transform: translateX(-100%);
    transition: transform 0.28s;
  }

  .sidebar.drawer-open {
    transform: translateX(0);
    box-shadow: 4px 0 16px rgba(0, 0, 0, 0.28);
  }
}
</style>
