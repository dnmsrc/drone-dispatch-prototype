<template>
  <view class="empty">
    <DroneLogo :size="150" color="#C7CEE8" rotor-color="#E3E8F7" light="#B9C4EA" />
    <text class="tip">{{ text }}</text>
    <slot />
  </view>
</template>

<script>
import DroneLogo from './DroneLogo.vue'
export default {
  name: 'Empty',
  components: { DroneLogo },
  props: { text: { type: String, default: '这里空空如也' } }
}
</script>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 100rpx 40rpx;
  gap: 24rpx;
}
.tip { color: var(--text-3); font-size: var(--fs-4); }
</style>
