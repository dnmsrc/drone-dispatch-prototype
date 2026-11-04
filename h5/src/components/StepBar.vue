<template>
  <view class="bar">
    <!-- 左箭头：滚到最左时置灰。8 步加连接线后总宽超过屏幕，靠左右两个箭头平移 -->
    <!-- 箭头用 CSS 画（方框转 45° 出的尖角），不用 ‹ › 这种生僻字符：缺字时会变成方块或问号 -->
    <view class="nav" :class="{ off: atStart }" @click="nudge(-1)"><view class="arw arw-l"></view></view>

    <scroll-view
      class="scroller" scroll-x="true" :show-scrollbar="false" :scroll-left="left"
      scroll-with-animation @scroll="onScroll"
    >
      <!-- 每个步骤项等宽、点居中、点两侧各一段虚线，所以任意两个相邻点之间的间隔区域视觉一致 -->
      <!-- 2026-10-28（用户要求，覆盖 10-27 的「完全不可点」）：只有「当前填报步骤之前」的步骤可点 ——
           已走过的步骤可回看、可改；改完只能从这一步重新往下走，当前之后的步骤不可点（goto 里挡掉）。 -->
      <view class="steps">
        <view
          v-for="(s, i) in steps" :key="s.key" class="st"
          :class="['s-' + stateOf(i), clickable(i) ? 'can' : '']" :style="itemStyle"
          @click="goto(i)"
        >
          <!-- 首项不画左虚线、末项不画右虚线：滚到两端时最外侧露出的是步骤本身，而不是一段悬空的线 -->
          <!-- flow（2026-10-28 用户要求）：只有「当前节点与上一个节点之间」那一段流动，其它段一律静态。
              走过的段 = 绿静态虚线，没走过的段 = 灰静态虚线。 -->
          <view v-if="i > 0" class="ln ln-l" :class="{ flow: flowL(i) }"></view>
          <!-- 完成勾用 CSS 画，不用 ✓(U+2713)：该字符在不少系统字体里缺字，会渲染成白色「?」压在点上 -->
          <view class="dot">
            <view v-if="stateOf(i) === 'done'" class="ck"></view>
            <text v-else class="dg">{{ i + 1 }}</text>
          </view>
          <view v-if="i < steps.length - 1" class="ln ln-r" :class="{ flow: flowR(i) }"></view>
          <text class="lb">{{ s.label }}</text>
        </view>
      </view>
    </scroll-view>

    <view class="nav" :class="{ off: atEnd }" @click="nudge(1)"><view class="arw arw-r"></view></view>
  </view>
</template>

<script>
import { ensureApply, hydrateTo, stepFilled, store, APPLY_PAGES } from '@/store'

// 拿不到标签实测宽时的兜底下限：够放 4 个 22rpx 汉字 + 左右留白。
// 真正的下限由 mounted 里实测的「最长标签宽 + 留白」算出来（见 measure）。这里不写 rpx：
// 宽屏下 CSS 的 rpx 被 App.vue 的 rem 上限锁死、跟 uni.upx2px 的换算不一致，写死就会毁掉整除。
const MIN_ITEM_PX = 88
const MIN_VISIBLE = 4      // 用户要求：一屏最少显示 4 个完整步骤

export default {
  name: 'StepBar',
  props: {
    // 1 基步骤号（1 = 需求）。历史上这里比较的是 0 基下标，导致每一页都往后错一格，这里按 1 基处理
    current: { type: Number, default: 1 }
  },
  data() {
    return {
      steps: [
        // 2026-10-28（用户质疑流程顺序后核对法条链）：先定场地再定规模。
        // 依据：备案内容第七项是「活动场地管理部门同意提供活动场地的证明」（武汉规范第十七条）——场地没落实，
        // 备案材料不齐；可行性评估的对象是场地（武汉规范第十八条，只在初次活动前做一次）；时段是审批输出
        // （条例第十八、二十、二十六条）。规模必须在日期之前：它决定场地承载与 1000 架次这条组织分工门槛，
        // 观众人数决定许可层级与活动日 20 日前申请的窗口（大型群众性活动安全管理条例第六条、第十三条）。
        { key: 'venue', label: '场地' },
        { key: 'need', label: '规模与内容' },
        { key: 'date', label: '日期时段' },
        { key: 'quote', label: '报价区间' },
        { key: 'consult', label: '咨询派单' },
        { key: 'contract', label: '合同' },
        { key: 'pay', label: '付款' },
        { key: 'progress', label: '进度' }
      ],
      left: 0,          // 受控滚动位置（px），改变这个值才会滚
      atStart: true,
      atEnd: false,
      itemPx: 0,        // 单项宽度（px，由可视区宽除以整除的项数算出来，不是写死的 rpx）
      viewport: 0,      // 可视区宽度（bar 减掉两个箭头后）
      content: 0        // 内容总宽度 = steps.length * itemPx
    }
  },
  computed: {
    currentStep() { return Math.min(Math.max(this.current, 1), this.steps.length) },
    // 单项宽度直接写 px：跟着设备走，且保证「可视区宽 = 单项宽 × 整除的项数」，
    // 所以任何停靠位置左边缘都落在整项边界上，最右边也必然是完整的一项，不会中间截断。
    itemStyle() { return this.itemPx ? { width: this.itemPx + 'px' } : {} }
  },
  mounted() {
    // 演示用：把前面缺的产物按真实算法补出来 —— 页面内容需要它。
    // 补数据不等于「已保存」：步骤条只看当前之前的步骤才算保存过，当前之后一律灰（用户要求）。
    ensureApply()
    // 只补到「当前这一步」：页面需要的是上游产物，不是未来步骤的产物。
    // 之前补到 current+2 —— 在第 5 步就把第 6 步的「已签署合同」造出来了（签署人写成演示签署人、
    // 第 8 步还顺手把签署节点标成已付），用户还没签，签署页就显示了一张存证卡。
    // 合同是用户的行为（逐条确认 + 身份 + 意愿认证），不是可预置的推导结果；当前之后一律灰。
    hydrateTo(this.currentStep)
    // 两件事一起量：滚动区可视宽（决定一屏放几项）+ 最长标签的实际像素宽（决定单项的下限）。
    // 必须从 DOM 实测，不能用 uni.upx2px：宽屏下 CSS 的 rpx 被 App.vue 的 rem 上限锁死，
    // 而 upx2px 按未锁定的 windowWidth 换算，720px 屏上两者能差一倍，算出来的项宽会和 CSS 对不上。
    uni.createSelectorQuery().in(this)
      .select('.scroller').boundingClientRect()
      .selectAll('.lb').boundingClientRect()
      .exec(res => {
        const box = res && res[0]
        const labels = (res && res[1]) || []
        const maxL = Array.isArray(labels) && labels.length
          ? Math.max.apply(null, labels.map(r => (r && r.width) || 0)) : 0
        this.measure(box ? box.width : 0, maxL)
      })
  },
  methods: {
    /**
     * 三档（当前步本身是单独一档，所以渲染上是 state + cur 两层）：
     *   done  保存过的（当前之前）—— 绿
     *   cur   当前步 —— 蓝
     *   todo  没保存过的 —— 一律灰。当前之后的步骤只是「还没走到」，
     *         哪怕演示预置了数据也不能显示成已保存（2026-10-27 用户要求）。
     */
    stateOf(i) {
      const n = i + 1
      if (n === this.currentStep) return 'cur'
      if (n < this.currentStep && stepFilled(n)) return 'done'
      return 'todo'
    },
    /**
     * 只有「当前填报步骤之前」的步骤可点（2026-10-28 用户要求）：
     *   当前之后的步骤不可点 —— 改完只能从这一步重新往下走，不能跳到后面。
     *   数据不丢（草稿在 store 里），只是要重新逐步确认，所以步骤条上它们会退回灰色。
     */
    clickable(i) { return this.stateOf(i) === 'done' },
    goto(i) {
      if (!this.clickable(i)) return
      const n = i + 1
      const page = APPLY_PAGES[i]
      store.apply.step = n
      // 目标页还在页面栈里就「回退」，否则新开 —— 两种都比重复 push 干净
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
      const idx = pages.findIndex(p => String(p.route || p.id || '').endsWith('apply/' + page))
      if (idx >= 0 && idx < pages.length - 1) { uni.navigateBack({ delta: pages.length - 1 - idx }); return }
      uni.redirectTo({ url: '/pages/apply/' + page })
    },
    /**
     * 流动只发生在「当前节点 ↔ 上一个节点」这一条连接线上（2026-10-28 用户要求）。
     * 相邻两点之间的视觉连线由两半拼成（前一项的右半 + 当前项的左半），所以这条线的两半都要流动，
     * 否则一半动一半不动。更早的段（绿静态）、没走过的段（灰静态）都不参与流动。
     *   左段 —— 自己是当前步，且上一节点已保存
     *   右段 —— 自己是上一节点（已保存），且下一项就是当前步
     */
    flowL(i) {
      if (i <= 0) return false
      return this.stateOf(i) === 'cur' && this.stateOf(i - 1) === 'done'
    },
    flowR(i) {
      if (i >= this.steps.length - 1) return false
      return this.stateOf(i) === 'done' && this.stateOf(i + 1) === 'cur'
    },
    /**
     * 一屏放几个整项由设备可视宽算，而不是写死：
     *   n = 可视宽能放下的整项数（下限 4，上限步骤总数）
     *   w = 可视宽 / n  ← 整除不进去时保留小数，于是「可视宽 = n × w」严格成立；
     *   滚到头时 maxScroll = (8 - n) × w 也正好是整项的倍数，两端都不会出现半截标签。
     */
    measure(avail, maxLabelPx) {
      const total = this.steps.length
      if (!avail || !isFinite(avail)) { this.itemPx = 0; return }
      // 单项下限 = 最长标签实测宽 + 左右各 11px 留白；拿不到标签宽时用兜底常量。
      // 被除数再和「可视宽/4」取小，保证极窄屏上也至少 4 项（那时靠 flex 的 min-width:auto 撑内容）。
      const floorPx = maxLabelPx > 0 ? maxLabelPx + 22 : MIN_ITEM_PX
      const n = Math.max(MIN_VISIBLE, Math.min(total, Math.floor(avail / Math.min(floorPx, avail / MIN_VISIBLE))))
      this.itemPx = avail / n
      this.viewport = avail
      this.content = total * this.itemPx
      this.atEnd = this.content <= this.viewport + 2
      this.atStart = this.left <= 2
      this.scrollToStep(this.currentStep - 1)   // 进入时把当前步滚到中间，否则长流程下当前步常在屏外
    },
    onScroll(e) {
      const d = e.detail || {}
      this.left = d.scrollLeft || 0
      if (!this.content || !this.viewport) {
        // 有的环境事件里直接给 scrollWidth / clientWidth，也能补出尺寸
        if (d.scrollWidth && d.clientWidth) this.measure(d.clientWidth)
        else return
      }
      this.atStart = this.left <= 2
      const max = Math.max(0, this.content - this.viewport)
      this.atEnd = this.left >= max - 2
    },
    /** 滚动位置吸附到整项边界，保证两端都是完整步骤，绝不会半截 */
    snap(v) {
      const max = Math.max(0, this.content - this.viewport)
      if (!this.itemPx) return Math.max(0, Math.min(max, Math.round(v)))
      const full = Math.max(1, Math.round(this.viewport / this.itemPx))
      const k = Math.round(v / this.itemPx)
      return Math.max(0, Math.min(this.steps.length - full, k)) * this.itemPx
    },
    scrollToStep(idx) {
      if (!this.viewport || !this.itemPx) { this.left = this.left === 0 ? 1 : 0; return }
      const target = idx * this.itemPx - (this.viewport - this.itemPx) / 2
      // 先归零再设值，保证同一步骤重复点击时 scroll-left 值确实发生变化、真的会滚
      this.left = 0
      this.$nextTick(() => { this.left = this.snap(target) })
    },
    nudge(dir) {
      if (!this.viewport || !this.itemPx) {
        this.left = this.left + (dir > 0 ? 1 : -1)
        return
      }
      const max = Math.max(0, this.content - this.viewport)
      const next = this.left + dir * this.itemPx
      // 到头时直接落到 maxScroll（末项正好贴右边缘），贴左时落 0（首项正好贴左边缘）
      this.left = next >= max - 1 ? max : this.snap(next)
      this.atStart = this.left <= 2
      this.atEnd = this.left >= max - 2
    }
  }
}
</script>

<style scoped>
.bar {
  /* width:100% 是必须的：申请页的 .page 是 display:flex; flex-direction:column，
     flex 项的 width:auto + margin:0 auto 会「先按内容收缩、再居中」（不是块布局里的占满），
     于是整条 bar 只有两个箭头那么宽（实测 57px、居中被挤成一团）。写死 100% 才占满、才轮得到内部滚动。 */
  width: 100%; max-width: 480px; margin: 0 auto; box-sizing: border-box;
  display: flex; align-items: center;
  background: #fff; border-bottom: 1rpx solid var(--line);
}
.nav {
  flex: none; width: 52rpx; height: 120rpx;
  display: flex; align-items: center; justify-content: center;
  color: var(--step-accent); font-size: var(--fs-6); font-weight: var(--fw-bold);
}
.nav.off { color: var(--step-idle-line); }
/* 箭头：一个方框加两条边转 45°，尖角是画出来的，不依赖字体字符 */
.arw { width: 16rpx; height: 16rpx; border-top: 3rpx solid currentColor; }
.arw-l { border-left: 3rpx solid currentColor; transform: rotate(-45deg); }
.arw-r { border-right: 3rpx solid currentColor; transform: rotate(45deg); }
/* 完成勾：左下两条边转 -45°，形状同 ✓，同样不依赖字体（原来的 ✓ 缺字时显示成白色「?」）。
   绝对定位 + translate(-50%,-50%) 把方框中心钉在圆心，旋转后勾的视觉中心就和圆心重合；
   之前靠 flex 交叉轴居中时勾会偏右上（图4 的「没居中」就是这个原因）。
   用 currentColor，所以勾的颜色跟着所在档走（已保存档 = 绿）。 */
.ck {
  position: absolute; left: 50%; top: 50%;
  width: 15rpx; height: 9rpx;
  border-left: 3rpx solid currentColor; border-bottom: 3rpx solid currentColor;
  transform: translate(-50%, -50%) rotate(-45deg);
  box-sizing: border-box;
}
/* 滚动区宽度 = 整条 bar 减掉两个箭头（各 52rpx）。
   光写 min-width:0 要靠 flex-shrink 硬压 uni-scroll-view 自带的 width:100%，
   一旦外层宽度是按内容算出来的（见上面 .bar 的坑），basis 就永远算错、右箭头被顶出屏幕；
   直接写死 calc(100% - 104rpx) 后 basis 与外层无关，箭头必在屏内，内容在自己盒子里滚。
   （若 uni 不认 calc 里的 rpx，这行被丢弃，退回 min-width:0 + shrink 也能撑住。） */
.scroller { flex: 1 1 auto; width: calc(100% - 104rpx); min-width: 0; overflow: hidden; height: 120rpx; white-space: nowrap; }
.steps { display: inline-flex; align-items: flex-start; }
.st {
  /* 单项宽度由 mounted 里按「可视区宽 ÷ 整除的项数」算出来（inline px），这里不写 min-width：
     flex 项的 min-width:auto 本来就等于内容宽（标签是 nowrap），它是最后一道防线；
     再叠一条 rpx 下限反而会在宽屏（rem 被 App.vue 锁死）把项顶大、毁掉整除，半截就是这么来的。
     首末项也不特殊收窄——等宽 + 可视区整除，才能让两端都贴边而且都是完整的一项。 */
  position: relative; flex: none; height: 120rpx;
  padding-top: 20rpx;
  display: flex; flex-direction: column; align-items: center; gap: 10rpx;
}
/* 点两侧各一段虚线、两段等长（点宽 44rpx，剩下的左右平分），所以相邻两点之间的间隔视觉一致 */
.ln { position: absolute; top: 42rpx; height: 0; border-bottom: 2rpx dashed var(--step-dash); }
.ln-l { left: 0; right: calc(50% + 24rpx); }
.ln-r { right: 0; left: calc(50% + 24rpx); }
/* 蓝色流动只给「当前节点 ↔ 上一个节点」那一条连线（2026-10-28 用户要求，收窄 10-27 的「走过的路都流动」）。
   这里必须用 background-image 而不是 border-bottom：border 的位置不能做动画，流动只能靠背景平移。
   一个周期 14rpx：前 7rpx 实、后 7rpx 空（空档用淡蓝，所以看得出在走），
   background-position 每 1.1s 正好平移一个完整周期 → 首尾无缝，不会跳一下。
   height 从 0 改成 2rpx 才能铺背景，位置仍和原来的下边框同一行（42rpx 起）。 */
.ln.flow {
  height: 2rpx;
  border-bottom: 0;
  background-image: repeating-linear-gradient(90deg, var(--step-flow) 0 7rpx, var(--step-flow-soft) 7rpx 14rpx);
  background-size: 14rpx 2rpx;
  animation: step-flow 1.1s linear infinite;
}
@keyframes step-flow {
  from { background-position: 0 0; }
  to { background-position: 14rpx 0; }
}
/* 系统开了「减少动效」时只留静态蓝虚线，不流动 */
@media (prefers-reduced-motion: reduce) {
  .ln.flow { animation: none; }
}
/* grid + place-items:center 把数字的方框中心严格对齐圆心；flex 的基线参与会让数字上下偏移
   （图3 的「1」在圆里没水平垂直居中，就是这么来的）。勾走绝对定位居中（见 .ck）。 */
.dot {
  position: relative; z-index: 1;
  width: 44rpx; height: 44rpx; border-radius: 50%;
  background: #fff; border: 2rpx solid var(--step-idle-line);
  display: grid; place-items: center; flex: none;
}
.dg { font-size: var(--fs-2); line-height: 1; font-weight: var(--fw-bold); color: var(--step-idle-text); }
.lb { font-size: var(--fs-2); line-height: 30rpx; color: var(--step-idle-text); white-space: nowrap; }

/* 没保存过（默认档）：白底浅灰环 + 灰字。整档最弱，和绿色「已保存」形成对比。
   当前之后的步骤全部走这一档 —— 没保存过就是灰，不能因为演示预置了数据就变绿。 */
.st.s-todo .dot { background: #fff; border-color: var(--step-idle-line); }
.st.s-todo .dg { color: var(--step-idle-text); }
.st.s-todo .lb { color: var(--step-idle-text); }
.st.s-todo .ln { border-bottom-color: var(--step-dash); }

/* 已保存（当前之前）：淡绿底 + 绿勾 + 绿标签。
   描边语言不变（白底/淡底 + 同族描边 + 同族字），只换色相；勾走 currentColor 自动变绿。
   这一段连线不再用绿色虚线，改走蓝色流动档（走过的路 → 当前）。 */
.st.s-done { color: var(--step-saved); }
.st.s-done .dot { background: var(--step-saved-soft); border-color: var(--step-saved-line); }
.st.s-done .lb { color: var(--step-saved); }
/* 走过的段（当前节点之前）不流动，用绿色静态虚线表示「已经走过的路」；
   只有接进当前节点的那一条是蓝色流动（见 flowL/flowR）。 */
.st.s-done .ln { border-bottom-color: var(--step-saved-line); }

/* 可点 = 当前之前、已走过的步骤（2026-10-28 用户要求）：下划线表示可回看可改。
   当前之后的步骤没有 click 绑定（goto 里也挡掉），所以不会出现下划线。 */
.st.can { cursor: pointer; }
.st.can .lb { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 4rpx; }

/* 当前步骤：保持原样（淡蓝底 + 蓝描边 + 蓝色加粗），不并入绿色档——
   当前是「选中」而不是「已保存」，两者必须能同时显示：绿的是走过的路，蓝的是现在站着的位置。
   它与上一节点之间那条连线是唯一的流动段（见 .ln.flow）。 */
.st.s-cur .dot {
  background: var(--step-accent-soft); border: 2rpx solid var(--step-accent-line);
}
.st.s-cur .dg { color: var(--step-accent); }
.st.s-cur .lb { color: var(--step-accent); font-weight: var(--fw-bold); }
</style>
