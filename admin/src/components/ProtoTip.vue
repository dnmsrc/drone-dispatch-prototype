<template>
  <!-- 【原型专用 · 评审辅助】页面左上角“?”悬浮说明，正式系统删除本组件及引用即可 -->
  <div
    v-if="tip"
    class="proto-tip"
    :class="{ fixed: mode === 'fixed' }"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <button class="pt-badge" type="button" aria-label="原型说明" @click.stop="pinned = !pinned">?</button>
    <transition name="pt-fade">
      <div v-show="hover || pinned" class="pt-card" @click.stop>
        <div class="pt-head">
          <span class="pt-tag">原型说明</span>
          <span class="pt-title">{{ tip.title }}</span>
          <span class="pt-close" @click.stop="close">×</span>
        </div>
        <p v-for="(line, i) in tip.lines" :key="i" class="pt-line">{{ line }}</p>
        <div class="pt-foot">仅评审辅助展示，正式系统不包含此说明</div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'

// 每个功能页面的评审说明文案
const TIPS = {
  '/index': {
    title: '工作台',
    lines: [
      '汇总今日订单、待接单、待审批退款等核心指标，数据实时来自后端接口。',
      '左侧菜单覆盖派单全流程：订单 → 退款 → 档期 → 评价。'
    ]
  },
  '/order/list': {
    title: '订单管理',
    lines: [
      '实时显示用户在 H5 端提交的订单（双端数据联动）。',
      '待接单订单可「接单 / 拒单」；已接单可「开始执行」「完成订单」，完成后自动回传演示照片。',
      '全部状态变化实时同步到 H5 端订单详情。'
    ]
  },
  '/refund/list': {
    title: '退款管理',
    lines: [
      '审批用户在 H5 端发起的退款申请，可按阶梯规则调整退款金额或拒绝。',
      '审批结果实时回显到 H5 端；仅管理员（admin）可见此菜单。'
    ]
  },
  '/schedule': {
    title: '档期管理',
    lines: [
      '顶部设置全局「默认限单数」；点击某天可单独覆盖限单（如节假日调增）、设休整日、标注特殊日。',
      '内置法定节假日自动标记（原型为今年默认数据，正式版由定时任务每年更新）。',
      '休整日设置后 H5 端日历同步置灰、不可预约，可现场演示联动效果。'
    ]
  },
  '/user/list': {
    title: '用户管理',
    lines: [
      '查看 H5 端注册用户及其订单统计；仅管理员（admin）可见。'
    ]
  },
  '/review/list': {
    title: '评价管理',
    lines: [
      '查看用户对已完成表演的评分与评价内容；仅管理员（admin）可见。'
    ]
  },
  '/venue/list': {
    title: '场地管理',
    lines: [
      '维护热门表演场地，H5 端下单页可直接选择；仅管理员（admin）可见。'
    ]
  },
  '/system/config': {
    title: '业务配置',
    lines: [
      '每日限单默认值、预约窗口、支付时限、定制文字/LOGO 价格等标量参数，保存后 H5 端实时生效。',
      '架次档位、时长、图案、附加服务、退款阶梯等业务规则已迁移到「字典管理」维护。',
      '「重置演示数据」可一键恢复初始种子数据；仅管理员（admin）可见。'
    ]
  },
  '/system/dict': {
    title: '字典管理',
    lines: [
      '若依风格字典：左侧类型、右侧键值项（键/标签/值/说明/排序/状态）。',
      '架次档位、表演时长、预设图案、附加服务、演出时段、退款阶梯均为内置字典，改价/停用后 H5 端实时生效。',
      '也可新建自定义字典（如场地类型），作为通用派单系统模板的扩展点；仅管理员（admin）可见。'
    ]
  },
  '/user/profile': {
    title: '个人中心',
    lines: ['当前登录账号信息与角色。']
  },
  '/login': {
    title: '登录页',
    lines: [
      '演示账号：admin / admin123（管理员，全部权限），operator / operator123（操作员，仅接单执行）。',
      '验证码固定为 1234；不同角色登录后可见菜单不同，可现场演示权限差异。'
    ]
  }
}

const props = defineProps({
  // absolute：放在布局容器内（默认）；fixed：用于登录页等无布局页面
  mode: { type: String, default: 'absolute' }
})

const route = useRoute()
const tip = computed(() => TIPS[route.path] || null)
const hover = ref(false)
const pinned = ref(false)

function close() {
  hover.value = false
  pinned.value = false
}
</script>

<style scoped>
.proto-tip {
  position: absolute;
  left: 10px;
  top: 10px;
  z-index: 2000;
}

.proto-tip.fixed {
  position: fixed;
  left: 14px;
  top: 14px;
}

.pt-badge {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #4a6cf7, #8a5cff);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
  text-align: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(74, 108, 247, 0.45);
  opacity: 0.9;
  padding: 0;
}

.pt-badge:hover {
  opacity: 1;
}

.pt-card {
  position: absolute;
  left: 0;
  top: 26px;
  width: 300px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 30px rgba(10, 20, 60, 0.22);
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.65;
  color: #4b5563;
  text-align: left;
}

.pt-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.pt-tag {
  flex: none;
  font-size: 10px;
  color: #fff;
  background: #4a6cf7;
  border-radius: 4px;
  padding: 1px 5px;
}

.pt-title {
  flex: 1;
  font-weight: 600;
  font-size: 13px;
  color: #1a1d2e;
}

.pt-close {
  flex: none;
  width: 18px;
  height: 18px;
  line-height: 18px;
  text-align: center;
  color: #999;
  cursor: pointer;
  font-size: 14px;
}

.pt-line {
  margin: 2px 0;
}

.pt-line::before {
  content: '· ';
  color: #4a6cf7;
  font-weight: 700;
}

.pt-foot {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed #e5e7eb;
  font-size: 11px;
  color: #9ca3af;
}

.pt-fade-enter-active,
.pt-fade-leave-active {
  transition: opacity 0.15s;
}

.pt-fade-enter-from,
.pt-fade-leave-to {
  opacity: 0;
}
</style>
