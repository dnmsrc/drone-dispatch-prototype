<template>
  <view class="page">
    <NavBar title="评价订单" />
    <view class="body">
      <view class="card rate-card">
        <DroneLogo :size="120" color="#7E97FF" rotor-color="#A9BCFF" />
        <text class="q">这场表演，你还满意吗？</text>
        <view class="stars">
          <text
            v-for="n in 5" :key="n"
            class="star" :class="{ on: n <= stars }"
            @click="stars = n"
          >★</text>
        </view>
        <text class="star-text">{{ starText }}</text>
      </view>

      <view class="card">
        <view class="sec-title">说说你的感受</view>
        <textarea
          v-model="content"
          class="input"
          maxlength="200"
          placeholder="表演效果、服务体验、想对其他用户说的话…"
          placeholder-class="ph"
        />
        <text class="count">{{ content.length }}/200</text>
      </view>

      <view style="height: 170rpx"></view>
    </view>

    <view class="bottom-bar">
      <button class="submit-btn" :disabled="submitting" @click="submit">{{ submitting ? '提交中…' : '提交评价' }}</button>
    </view>
  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
import DroneLogo from '@/components/DroneLogo.vue'
import { post } from '@/utils/request'

export default {
  components: { NavBar, DroneLogo },
  data() {
    return { id: '', stars: 5, content: '', submitting: false }
  },
  computed: {
    starText() {
      return ['', '很不满意', '不太满意', '一般般', '比较满意', '非常满意'][this.stars]
    }
  },
  onLoad(q) { this.id = q.id },
  methods: {
    submit() {
      if (!this.content.trim()) { uni.showToast({ title: '写点感受再提交吧', icon: 'none' }); return }
      if (this.submitting) return
      this.submitting = true
      post(`/orders/${this.id}/review`, { stars: this.stars, content: this.content.trim() })
        .then(() => {
          uni.showToast({ title: '评价成功', icon: 'success' })
          setTimeout(() => uni.redirectTo({ url: `/pages/order/detail?id=${this.id}` }), 700)
        })
        .finally(() => { this.submitting = false })
    }
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: var(--bg); }
.body { padding: 24rpx; display: flex; flex-direction: column; gap: 24rpx; }
.rate-card { display: flex; flex-direction: column; align-items: center; gap: 14rpx; padding: 44rpx 28rpx; }
.q { font-size: var(--fs-7); font-weight: var(--fw-bold); }
.stars { display: flex; gap: 16rpx; margin-top: 8rpx; }
.star { font-size: var(--fs-12); color: #E3E6F0; transition: transform .12s; }
.star.on { color: #FFB02E; text-shadow: 0 4rpx 14rpx rgba(255,176,46,.4); }
.star:active { transform: scale(1.2); }
.star-text { color: #FFB02E; font-size: var(--fs-3); font-weight: var(--fw-semibold); }
.input {
  width: 100%; height: 240rpx;
  background: var(--bg); border-radius: 16rpx; padding: 22rpx 24rpx; font-size: var(--fs-4);
}
.ph { color: var(--text-4); }
.count { display: block; text-align: right; color: var(--text-4); font-size: var(--fs-1); margin-top: 8rpx; }
.bottom-bar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 90;
  max-width: 480px; margin: 0 auto;
  background: rgba(255,255,255,.97); border-top: 1rpx solid var(--line);
  padding: 18rpx 28rpx calc(18rpx + env(safe-area-inset-bottom));
}
.submit-btn {
  width: 100%; border: none; border-radius: 999rpx;
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  color: #fff; font-size: var(--fs-7); font-weight: var(--fw-bold); padding: 22rpx 0;
  box-shadow: 0 8rpx 22rpx rgba(74,108,247,.35);
}
.submit-btn::after { border: none; }
</style>
