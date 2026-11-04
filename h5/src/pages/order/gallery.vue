<template>
  <view class="page">
    <NavBar title="现场回传" dark />
    <view v-if="o" class="body">
      <NightSky :star-count="30">
        <view class="head">
          <text class="h-title">{{ o.occasion || '无人机编队表演' }}</text>
          <text class="h-meta">{{ o.performDate }} {{ o.timeSlot }} · {{ o.droneCount }} 架 · {{ o.venue.name }}</text>
        </view>
      </NightSky>

      <!-- 视频 -->
      <view class="sec-title" style="padding: 30rpx 24rpx 0">表演回放</view>
      <view class="video-card" @click="playVideo">
        <view class="v-mask">
          <view class="play-btn">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="#fff" xmlns="http://www.w3.org/2000/svg"><path d="M8 5.5v13l11-6.5z"/></svg>
          </view>
          <text class="v-title">表演全程回放</text>
          <text class="v-sub">{{ o.duration }} 分钟 · 航拍双机位</text>
        </view>
      </view>

      <!-- 照片 -->
      <view class="sec-title" style="padding: 30rpx 24rpx 0">现场照片（{{ photos.length }}）</view>
      <view class="photo-grid">
        <image
          v-for="(p, i) in photos" :key="i"
          :src="p" mode="aspectFill"
          class="photo"
          @click="preview(i)"
        />
      </view>
      <view v-if="!photos.length" class="none">商户暂未回传照片</view>

      <view class="demo-tip">照片/视频由操作员在完成订单时回传 · 演示环境为占位素材</view>
      <view style="height: 60rpx"></view>
    </view>
  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
import NightSky from '@/components/NightSky.vue'
import { get } from '@/utils/request'

export default {
  components: { NavBar, NightSky },
  data() { return { id: '', o: null } },
  computed: {
    photos() { return (this.o && this.o.media && this.o.media.photos) || [] }
  },
  onLoad(q) {
    this.id = q.id
    get(`/orders/${this.id}`).then(d => { this.o = d.order }).catch(() => {})
  },
  methods: {
    preview(i) { uni.previewImage({ urls: this.photos, current: i }) },
    playVideo() { uni.showToast({ title: '演示版无真实视频文件', icon: 'none' }) }
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: var(--bg); }
.head { padding: 20rpx 36rpx 40rpx; display: flex; flex-direction: column; gap: 10rpx; }
.h-title { color: #fff; font-size: var(--fs-10); font-weight: var(--fw-heavy); }
.h-meta { color: rgba(232,236,255,.6); font-size: var(--fs-2); }
.video-card {
  margin: 20rpx 24rpx 0; height: 300rpx; border-radius: 24rpx; overflow: hidden;
  background: linear-gradient(160deg, #232C5E, #0E1530);
  position: relative; box-shadow: var(--shadow);
}
.v-mask {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10rpx;
}
.play-btn {
  width: 110rpx; height: 110rpx; border-radius: 50%;
  background: rgba(255,255,255,.16); border: 2rpx solid rgba(255,255,255,.4);
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(4px);
}
.v-title { color: #fff; font-size: var(--fs-5); font-weight: var(--fw-bold); }
.v-sub { color: rgba(232,236,255,.5); font-size: var(--fs-2); }
.photo-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16rpx;
  padding: 20rpx 24rpx 0;
}
.photo { width: 100%; height: 240rpx; border-radius: 18rpx; background: #E9ECF6; }
.none { text-align: center; color: var(--text-3); font-size: var(--fs-3); padding: 40rpx 0; }
.demo-tip { text-align: center; color: var(--text-4); font-size: var(--fs-1); margin-top: 36rpx; }
</style>
