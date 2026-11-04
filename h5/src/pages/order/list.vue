<template>
  <view class="page">
    <NavBar title="我的订单" :show-back="false" />
    <!-- 状态 Tab -->
    <scroll-view scroll-x class="tabs" enhanced :show-scrollbar="false">
      <view class="tabs-row">
        <view
          v-for="t in tabs" :key="t.key"
          class="tab" :class="{ on: active === t.key }"
          @click="active = t.key; load()"
        >{{ t.label }}</view>
      </view>
    </scroll-view>

    <scroll-view scroll-y class="list" @scrolltolower="noop">
      <view v-if="!loading && !orders.length">
        <Empty text="暂无相关订单">
          <button class="btn-primary go-btn" @click="goCreate">去预约一场表演</button>
        </Empty>
      </view>
      <view
        v-for="o in orders" :key="o.id"
        class="order-card card"
        @click="goDetail(o.id)"
      >
        <view class="oc-head">
          <text class="oc-title">{{ o.occasion || '无人机编队表演' }}</text>
          <StatusTag :status="o.status" />
        </view>
        <view class="oc-summary">{{ summary(o) }}</view>
        <view class="oc-meta">
          <text class="oc-date">{{ o.performDate }} {{ o.timeSlot }}</text>
          <text class="oc-venue">{{ o.venue.name }}</text>
        </view>
        <view class="oc-foot">
          <text class="oc-time">下单：{{ fmtTime(o.createdAt) }}</text>
          <text class="oc-amount">¥{{ o.totalAmount.toLocaleString() }}</text>
        </view>
        <!-- 快捷操作 -->
        <view v-if="o.status === 'PENDING_PAY'" class="oc-actions" @click.stop>
          <button class="mini ghost" @click.stop="cancel(o)">取消订单</button>
          <button class="mini primary" @click.stop="goPay(o.id)">去支付</button>
        </view>
        <view v-else-if="['PENDING_ACCEPT','ACCEPTED'].includes(o.status)" class="oc-actions" @click.stop>
          <button class="mini ghost" @click.stop="goRefund(o.id)">申请退款</button>
        </view>
        <view v-else-if="o.status === 'COMPLETED'" class="oc-actions" @click.stop>
          <button class="mini ghost" @click.stop="goGallery(o.id)">现场照片</button>
          <button class="mini primary" @click.stop="goReview(o.id)">评价</button>
        </view>
      </view>
      <view style="height: 150rpx"></view>
    </scroll-view>
    <TabBar current="order" />
  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
import TabBar from '@/components/TabBar.vue'
import StatusTag from '@/components/StatusTag.vue'
import Empty from '@/components/Empty.vue'
import { get, post } from '@/utils/request'
import { store, isLoggedIn } from '@/store'
import { fmtTime, orderSummary } from '@/utils/format'

export default {
  components: { NavBar, TabBar, StatusTag, Empty },
  data() {
    return {
      active: 'all',
      tabs: [
        { key: 'all', label: '全部' },
        { key: 'PENDING_PAY', label: '待支付' },
        { key: 'PENDING_ACCEPT', label: '待接单' },
        { key: 'doing', label: '进行中' },
        { key: 'done', label: '已完成' },
        { key: 'aftersale', label: '退款/售后' }
      ],
      orders: [],
      loading: false
    }
  },
  onLoad(q) {
    if (q && q.tab) this.active = q.tab
  },
  onShow() {
    if (!isLoggedIn()) { uni.navigateTo({ url: '/pages/login/login' }); return }
    this.load()
  },
  methods: {
    fmtTime, summary: orderSummary,
    noop() {},
    statusParam() {
      return {
        all: '', PENDING_PAY: 'PENDING_PAY', PENDING_ACCEPT: 'PENDING_ACCEPT',
        doing: 'ACCEPTED,IN_SERVICE', done: 'COMPLETED,REVIEWED',
        aftersale: 'REFUNDING,REFUNDED,CANCELLED'
      }[this.active]
    },
    load() {
      this.loading = true
      const s = this.statusParam()
      get(`/orders${s ? '?status=' + s : ''}`).then(d => { this.orders = d.list }).finally(() => { this.loading = false })
    },
    goCreate() { uni.navigateTo({ url: '/pages/order/create' }) },
    goDetail(id) { uni.navigateTo({ url: `/pages/order/detail?id=${id}` }) },
    goPay(id) { uni.navigateTo({ url: `/pages/order/cashier?id=${id}` }) },
    goRefund(id) { uni.navigateTo({ url: `/pages/order/refund?id=${id}` }) },
    goReview(id) { uni.navigateTo({ url: `/pages/order/review?id=${id}` }) },
    goGallery(id) { uni.navigateTo({ url: `/pages/order/gallery?id=${id}` }) },
    cancel(o) {
      uni.showModal({
        title: '取消订单', content: '确定取消该订单吗？',
        success: (r) => {
          if (!r.confirm) return
          post(`/orders/${o.id}/cancel`).then(() => {
            uni.showToast({ title: '已取消', icon: 'success' })
            this.load()
          })
        }
      })
    }
  }
}
</script>

<style scoped>
.page { height: 100vh; background: var(--bg); display: flex; flex-direction: column; overflow: hidden; }
.tabs { background: var(--bg); padding: 10rpx 24rpx; white-space: nowrap; }
.tabs-row { display: inline-flex; gap: 14rpx; }
.tab { padding: 12rpx 28rpx; border-radius: 999rpx; font-size: var(--fs-4); color: var(--text-2); background: #fff; }
.tab.on { background: linear-gradient(135deg, var(--primary), var(--primary-2)); color: #fff; font-weight: var(--fw-semibold); box-shadow: 0 6rpx 16rpx rgba(74,108,247,.3); }
.list { flex: 1; min-height: 0; padding: 10rpx 0 0; }
.order-card { margin: 16rpx 24rpx 0; }
.oc-head { display: flex; justify-content: space-between; align-items: center; }
.oc-title { font-size: var(--fs-6); font-weight: var(--fw-bold); }
.oc-summary { color: var(--text-2); font-size: var(--fs-3); margin-top: 10rpx; }
.oc-meta { display: flex; gap: 20rpx; margin-top: 8rpx; }
.oc-date { color: var(--primary); font-size: var(--fs-3); font-weight: var(--fw-semibold); }
.oc-venue { color: var(--text-3); font-size: var(--fs-2); }
.oc-foot {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid var(--bg-2);
}
.oc-time { color: var(--text-4); font-size: var(--fs-1); }
.oc-amount { font-size: var(--fs-7); font-weight: var(--fw-heavy); }
.oc-actions { display: flex; justify-content: flex-end; gap: 16rpx; margin-top: 16rpx; }
.mini { font-size: var(--fs-3); padding: 10rpx 32rpx; border-radius: 999rpx; margin: 0; line-height: 1.6; }
.mini.primary { background: linear-gradient(135deg, var(--primary), var(--primary-2)); color: #fff; border: none; }
.mini.ghost { background: #fff; color: var(--primary); border: 2rpx solid var(--primary); }
.mini::after { border: none; }
.go-btn { margin-top: 20rpx; font-size: var(--fs-4); padding: 16rpx 40rpx; }
</style>
