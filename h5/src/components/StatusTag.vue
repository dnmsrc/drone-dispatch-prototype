<template>
  <text class="status-tag" :style="{ color: s.color, background: s.bg }">{{ s.text }}</text>
</template>

<script>
import { statusOf } from '@/utils/format'
export default {
  name: 'StatusTag',
  props: { status: { type: String, required: true } },
  computed: {
    s() { return statusOf(this.status) }
  }
}
</script>

<style scoped>
.status-tag {
  font-size: var(--fs-2);
  font-weight: var(--fw-semibold);
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
  white-space: nowrap;
}
</style>
