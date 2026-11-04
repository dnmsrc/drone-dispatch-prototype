<template>
  <!-- 纯说明入口：全站统一为 88rpx 胶囊。确认状态不再挂在表单项上；
       已确认条款统一从右下角「申请说明」入口回看。 -->
  <view class="entry-chip" @click="$emit('tap')">
    <text class="ec-txt">{{ label }}</text>
    <text class="ec-arr">›</text>
  </view>
</template>

<script>
export default {
  name: 'EntryChip',
  props: {
    label: { type: String, default: '依据' }
  }
}
</script>

<style scoped>
/* 恰好 88rpx 高（单行控件标准 = 44px 触摸目标），靠 min-height 而不是 padding 撑高度：
   padding 撑高度会把行撑高，min-height 只让控件自己占满一行。
   margin-left:auto 把它停在行右端——标题在左，入口在右，不靠 justify-content:space-between
   （space-between 会把没有兄弟的标题也推到右边缘）。 */
.entry-chip {
  flex: none;
  margin-left: auto;
  min-height: 88rpx;
  padding: 0 24rpx;
  display: flex;
  align-items: center;
  justify-content: center; /* 文字 + 箭头作为一组居中，不能靠左（否则「依据」二字肉眼偏左 4px） */
  gap: 8rpx;
  border-radius: 999rpx;
  background: rgba(74, 108, 247, 0.08);
  color: var(--primary);
  font-size: var(--fs-2);
  font-weight: var(--fw-semibold);
  white-space: nowrap;
}
.ec-arr { font-size: var(--fs-2); opacity: .7; }
</style>
