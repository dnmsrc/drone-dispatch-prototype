<template>
  <view class="page">
    <NavBar title="申请退款" />
    <view v-if="loaded" class="body">
      <!-- 可退试算 -->
      <view v-if="preview && preview.refundable" class="calc-card">
        <text class="cc-label">预计退款金额</text>
        <text class="cc-amount">¥{{ preview.amount.toLocaleString() }}</text>
        <view class="cc-ratio">
          <text>{{ preview.ruleLabel }}</text>
          <text>实付 ¥{{ preview.totalAmount.toLocaleString() }} × {{ Math.round(preview.ratio * 100) }}%</text>
        </view>
      </view>

      <!-- 不可退 -->
      <view v-else-if="preview" class="calc-card nope">
        <text class="cc-label">当前不可退款</text>
        <text class="cc-nope-text">{{ preview.ruleLabel }}</text>
        <text class="cc-nope-sub">如有特殊情况，请联系客服 400-888-8888 协商处理</text>
      </view>

      <!-- 阶梯规则 -->
      <view class="card">
        <view class="sec-title">退款规则</view>
        <view class="rule" v-for="(r, i) in rules" :key="i" :class="{ hit: isHit(r) }">
          <text class="rule-label">{{ r.label }}</text>
          <text class="rule-ratio">{{ r.ratio > 0 ? Math.round(r.ratio * 100) + '%' : '不可退' }}</text>
        </view>
        <text class="rule-tip">* 未接单的订单可全额退款；退款将在审核通过后 1-3 个工作日原路返回</text>
      </view>

      <!-- 退款原因 -->
      <view v-if="preview && preview.refundable" class="card">
        <view class="sec-title">退款原因</view>
        <view class="reasons">
          <view
            v-for="r in reasonOptions" :key="r"
            class="reason" :class="{ on: reason === r }"
            @click="reason = r"
          >{{ r }}</view>
        </view>
        <textarea
          v-model="detail"
          class="detail-input"
          placeholder="补充说明（选填）"
          placeholder-class="ph"
          maxlength="100"
        />
      </view>

      <view style="height: 180rpx"></view>
    </view>

    <view v-if="preview && preview.refundable" class="bottom-bar">
      <button class="submit-btn" :disabled="submitting" @click="submit">{{ submitting ? '提交中…' : '提交退款申请' }}</button>
    </view>
  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
import { post } from '@/utils/request'

export default {
  components: { NavBar },
  data() {
    return {
      id: '', loaded: false, preview: null, rules: [],
      reasonOptions: ['计划有变，无法按期举行', '场地原因', '天气原因', '预算调整', '其他原因'],
      reason: '', detail: '', submitting: false
    }
  },
  onLoad(q) {
    this.id = q.id
    post(`/orders/${this.id}/refund-preview`).then(d => {
      this.preview = d.preview
      this.rules = d.preview.rules || []
      this.loaded = true
    }).catch(() => { this.loaded = true })
  },
  methods: {
    isHit(r) {
      return this.preview && this.preview.refundable && Math.abs(r.ratio - this.preview.ratio) < 0.001
    },
    submit() {
      if (!this.reason) { uni.showToast({ title: '请选择退款原因', icon: 'none' }); return }
      if (this.submitting) return
      this.submitting = true
      const reason = this.detail.trim() ? `${this.reason}：${this.detail.trim()}` : this.reason
      post(`/orders/${this.id}/refund`, { reason })
        .then(() => {
          uni.showToast({ title: '申请已提交', icon: 'success' })
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
.calc-card {
  background: linear-gradient(160deg, #1B2452, #10173A);
  border-radius: 24rpx; padding: 40rpx 32rpx;
  display: flex; flex-direction: column; align-items: center; gap: 12rpx;
  box-shadow: 0 12rpx 36rpx rgba(16,23,58,.3);
}
.cc-label { color: rgba(232,236,255,.6); font-size: var(--fs-3); }
.cc-amount { color: #3DE0C0; font-size: var(--fs-12); font-weight: var(--fw-heavy); }
.cc-ratio {
  display: flex; flex-direction: column; align-items: center; gap: 4rpx;
  margin-top: 8rpx; padding: 14rpx 28rpx; border-radius: 16rpx;
  background: rgba(255,255,255,.06); color: rgba(232,236,255,.75); font-size: var(--fs-2);
}
.calc-card.nope .cc-label { color: #FF8A8A; font-weight: var(--fw-bold); font-size: var(--fs-6); }
.cc-nope-text { color: #fff; font-size: var(--fs-5); }
.cc-nope-sub { color: rgba(232,236,255,.5); font-size: var(--fs-2); }
.rule {
  display: flex; justify-content: space-between; align-items: center;
  padding: 18rpx 20rpx; border-radius: 14rpx; margin-bottom: 8rpx;
  background: var(--bg);
}
.rule.hit { background: rgba(61,224,192,.12); border: 2rpx solid #3DE0C0; }
.rule-label { font-size: var(--fs-3); color: var(--text-2); }
.rule.hit .rule-label { color: var(--text-1); font-weight: var(--fw-semibold); }
.rule-ratio { font-size: var(--fs-3); font-weight: var(--fw-bold); color: var(--text-3); }
.rule.hit .rule-ratio { color: var(--success); }
.rule-tip { display: block; margin-top: 12rpx; font-size: var(--fs-1); color: var(--text-4); }
.reasons { display: flex; flex-wrap: wrap; gap: 14rpx; }
.reason {
  padding: 14rpx 26rpx; border-radius: 999rpx;
  border: 2rpx solid var(--line); font-size: var(--fs-3); color: var(--text-2);
}
.reason.on { border-color: var(--primary); color: var(--primary); background: rgba(74,108,247,.06); font-weight: var(--fw-semibold); }
.detail-input {
  margin-top: 20rpx; width: 100%; height: 160rpx;
  background: var(--bg); border-radius: 16rpx; padding: 20rpx 24rpx; font-size: var(--fs-4);
}
.ph { color: var(--text-4); }
.bottom-bar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 90;
  max-width: 480px; margin: 0 auto;
  background: rgba(255,255,255,.97); border-top: 1rpx solid var(--line);
  padding: 18rpx 28rpx calc(18rpx + env(safe-area-inset-bottom));
}
.submit-btn {
  width: 100%; border: none; border-radius: 999rpx;
  background: linear-gradient(135deg, #FF7849, #FF9A6C);
  color: #fff; font-size: var(--fs-7); font-weight: var(--fw-bold); padding: 22rpx 0;
  box-shadow: 0 8rpx 22rpx rgba(255,120,73,.35);
}
.submit-btn::after { border: none; }
</style>
