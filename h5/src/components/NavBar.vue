<template>
  <!-- 自定义导航栏 -->
  <view class="navbar" :class="{ dark }">
    <view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
    <view class="bar">
      <view class="left" @click="back">
        <svg v-if="showBack" viewBox="0 0 24 24" width="20" height="20" fill="none" :stroke="dark ? '#fff' : '#1A1D2E'" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 5l-7 7 7 7"/>
        </svg>
      </view>
      <text class="title">{{ title }}</text>
      <view class="right"><slot name="right" /></view>
    </view>
    <!-- 申请说明与已确认条款统一放在右下角；导航栏不再放占宽度的大入口。 -->
    <AckDock v-if="dockStep" :step="dockStep" />
  </view>
</template>

<script>
import AckDock from './AckDock.vue'
import { APPLY_PAGES } from '@/store'

export default {
  name: 'NavBar',
  components: { AckDock },
  props: {
    title: { type: String, default: '' },
    dark: { type: Boolean, default: false },
    showBack: { type: Boolean, default: true }
  },
  computed: {
    // 只在申请流程页出现，说明页本身不再悬浮一个入口。
    dockStep() {
      const ps = (typeof getCurrentPages === 'function' ? getCurrentPages() : [])
      const last = ps.length ? ((ps[ps.length - 1].route || '').split('/').pop() || '') : ''
      const i = APPLY_PAGES.indexOf(last)
      return i >= 0 ? i + 1 : 0
    }
  },
  data() {
    return { statusBarHeight: 0 }
  },
  created() {
    try {
      const info = uni.getSystemInfoSync()
      this.statusBarHeight = info.statusBarHeight || 0
    } catch (e) { this.statusBarHeight = 0 }
  },
  methods: {
    /**
     * 返回（2026-11-03 用户报告：预约表单里点返回直接退出到首页，而不是回上一步）。
     *
     * 根因：只看了页栈长度。从「我的预约 · 继续办理」进入、或刷新页面后，页栈里可能只剩当前一页，
     * `pages.length <= 1` 就 reLaunch 首页 —— 于是第 3/4 步点返回会跳到首页，而不是第 2/3 步。
     *
     * 现在的规则：申请流程页（APPLY_PAGES）里，返回 = 回上一步的申请页；
     *   1) 上一页确实是上一个申请步骤（正常走流程压栈）→ navigateBack，保留浏览历史；
     *   2) 否则（刷新后只有一页、或从「我的预约」直接跳进来的）→ redirectTo 上一步页面，几何上等价；
     *   3) 第 1 步（venue）→ 页栈还有上一页就回上一页（首页），没有就回首页。
     */
    back() {
      const ps = (typeof getCurrentPages === 'function' ? getCurrentPages() : [])
      const cur = ps.length ? ((ps[ps.length - 1].route || '').split('/').pop() || '') : ''
      const prev = ps.length > 1 ? ((ps[ps.length - 2].route || '').split('/').pop() || '') : ''
      const i = APPLY_PAGES.indexOf(cur)
      if (i >= 0) {
        if (prev && APPLY_PAGES.indexOf(prev) >= 0) { uni.navigateBack({ delta: 1 }); return }
        if (i > 0) { uni.redirectTo({ url: '/pages/apply/' + APPLY_PAGES[i - 1] }); return }
      }
      if (ps.length > 1) { uni.navigateBack({ delta: 1 }); return }
      uni.reLaunch({ url: '/pages/index/index' })
    }
  }
}
</script>

<style scoped>
/* 2026-10-28（用户要求）：顶部操作栏不随滚动走。
   定高页（申请流程 / 下单 / 订单列表）里顶栏在滚动区之外，天然固定；
   自然滚动的页面靠 sticky 顶住 —— 所以两层都要：sticky + z-index。 */
.navbar { background: var(--bg); position: sticky; top: 0; z-index: 70; }
/* dark 版原本透明，sticky 后内容会从它底下穿过、和标题叠在一起，所以给半透明底 + 模糊 */
.navbar.dark { background: rgba(11, 16, 38, .92); backdrop-filter: blur(10px); }
/* 标题从绝对定位改成 flex：入口出现在同一行时，绝对居中的标题会和入口叠在一起
   （标题区 right:120rpx，入口 ≈154rpx 宽）。flex 之后标题在剩下的空间里居中，几何上不会相交。 */
.bar { height: 88rpx; display: flex; align-items: center; padding: 0 20rpx; }
.left { width: 64rpx; flex: none; display: flex; align-items: center; }
.title {
  flex: 1;
  min-width: 116rpx;
  text-align: center;
  font-size: var(--fs-7);
  font-weight: var(--fw-semibold);
  color: var(--text-1);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.dark .title { color: #fff; }
.right { flex: none; margin-left: auto; display: flex; justify-content: flex-end; }
</style>
