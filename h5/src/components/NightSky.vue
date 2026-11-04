<template>
  <!-- 夜空背景：深蓝紫渐变 + 星星 + 光晕，内容通过 slot 注入 -->
  <view class="night-sky">
    <view class="glow glow-a"></view>
    <view class="glow glow-b"></view>
    <view
      v-for="(s, i) in stars"
      :key="i"
      class="star"
      :class="{ twinkle: i % 3 === 0 }"
      :style="{ left: s.x + '%', top: s.y + '%', width: s.s + 'rpx', height: s.s + 'rpx', opacity: s.o, animationDelay: (i % 5) * 0.6 + 's' }"
    ></view>
    <view class="sky-content"><slot /></view>
  </view>
</template>

<script>
export default {
  name: 'NightSky',
  props: { starCount: { type: Number, default: 46 } },
  data() {
    const stars = []
    // 固定伪随机，避免每次渲染闪动
    let seed = 42
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
    for (let i = 0; i < this.starCount; i++) {
      stars.push({ x: (rnd() * 100).toFixed(2), y: (rnd() * 100).toFixed(2), s: (2 + rnd() * 4).toFixed(1), o: (0.35 + rnd() * 0.65).toFixed(2) })
    }
    return { stars }
  }
}
</script>

<style scoped>
.night-sky {
  position: relative;
  overflow: hidden;
  background: linear-gradient(180deg, #1B2452 0%, #141B3D 45%, #0B1026 100%);
}
.glow { position: absolute; border-radius: 50%; filter: blur(60rpx); pointer-events: none; }
.glow-a { width: 420rpx; height: 420rpx; right: -140rpx; top: -120rpx; background: rgba(74, 108, 247, .35); }
.glow-b { width: 360rpx; height: 360rpx; left: -120rpx; bottom: -80rpx; background: rgba(61, 224, 192, .16); }
.star { position: absolute; border-radius: 50%; background: #fff; }
.star.twinkle { animation: twinkle 2.6s ease-in-out infinite; }
@keyframes twinkle { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
.sky-content { position: relative; z-index: 2; }
</style>
