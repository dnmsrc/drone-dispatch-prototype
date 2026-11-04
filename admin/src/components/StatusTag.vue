<template>
  <el-tag
    v-if="conf.type"
    :type="conf.type"
    effect="light"
    round
    disable-transitions
  >{{ conf.text }}</el-tag>
  <el-tag
    v-else
    :color="conf.color"
    effect="dark"
    round
    disable-transitions
    style="border: none"
  >{{ conf.text }}</el-tag>
</template>

<script setup>
import { computed } from 'vue'
import { STATUS_MAP } from '../utils/format'

const props = defineProps({
  status: { type: String, required: true }
})

const conf = computed(() => STATUS_MAP[props.status] || { text: props.status, color: '#909399' })
</script>
