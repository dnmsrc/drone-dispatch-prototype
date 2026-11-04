<template>
  <!-- 自定义底部 TabBar：首页 / 订单 / 我的 -->
  <view class="tabbar">
    <view
      v-for="t in tabs"
      :key="t.key"
      class="tab"
      :class="{ active: current === t.key }"
      @click="go(t)"
    >
      <view class="icon" v-html="current === t.key ? t.iconActive : t.icon"></view>
      <text class="label">{{ t.label }}</text>
      <view v-if="current === t.key" class="dot"></view>
    </view>
  </view>
</template>

<script>
const svg = (path, color) =>
  `<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${path}</svg>`
const home = '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>'
const order = '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'
const user = '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>'
const C1 = '#9AA0B5', C2 = '#4A6CF7'

export default {
  name: 'TabBar',
  props: { current: { type: String, default: 'home' } },
  data() {
    return {
      tabs: [
        { key: 'home', label: '首页', url: '/pages/index/index', icon: svg(home, C1), iconActive: svg(home, C2) },
        { key: 'order', label: '订单', url: '/pages/order/list', icon: svg(order, C1), iconActive: svg(order, C2) },
        { key: 'user', label: '我的', url: '/pages/user/index', icon: svg(user, C1), iconActive: svg(user, C2) }
      ]
    }
  },
  methods: {
    go(t) {
      if (t.key === this.current) return
      uni.reLaunch({ url: t.url })
    }
  }
}
</script>

<style scoped>
.tabbar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 99;
  display: flex;
  background: rgba(255, 255, 255, .96);
  backdrop-filter: blur(10px);
  border-top: 1rpx solid var(--line);
  padding-bottom: env(safe-area-inset-bottom);
  max-width: 480px;
  margin: 0 auto;
}
.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12rpx 0 10rpx;
  position: relative;
}
.icon { height: 46rpx; display: flex; align-items: center; }
.label { font-size: var(--fs-2); color: var(--text-3); margin-top: 2rpx; }
.tab.active .label { color: var(--primary); font-weight: var(--fw-semibold); }
.dot {
  position: absolute;
  bottom: 2rpx;
  width: 10rpx; height: 10rpx; border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), #3DE0C0);
}
</style>
