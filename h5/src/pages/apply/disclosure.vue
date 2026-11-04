<template>
  <view class="page">
    <NavBar title="申请说明（告知确认书）" />

    <scroll-view scroll-y class="body" :scroll-into-view="anchorId" scroll-with-animation>
      <view class="sec card">
        <SecHead title="告知确认书" :sub="'版本 ' + version" entry="怎么确认" @tap="open('why', '怎么确认', whyLines, '')" />
        <view class="kv"><text class="k">告知方</text><text class="v">承飞方（乙方）</text></view>
        <view class="kv"><text class="k">受告知方</text><text class="v">申请人（甲方）</text></view>
        <view class="kv"><text class="k">用途</text><text class="v">合同附件</text></view>
        <view class="kv"><text class="k">条款数</text><text class="v price">{{ total }} 条 · {{ sections.length }} 组</text></view>
        <view class="kv"><text class="k">本单适用</text><text class="v price">{{ applicable }} 条 · 已确认 {{ confirmedCount }}</text></view>
        <view class="kv"><text class="k">内容哈希</text><text class="v mono">{{ hashShort }}</text></view>
        <view class="copy-btn" @click="copy">复制全文（含版本与哈希）</view>
      </view>

      <view class="sec card" v-for="(s, i) in sections" :key="s.title" :id="'dsec-' + i" :class="{ flash: anchorSec === s.title }">
        <SecHead :title="(i + 1) + ' · ' + s.title" />
        <!-- 2026-10-29 七次调整（用户要求）：这一页只读全文，不做逐条标记、不放确认按钮。
             确认发生在填报页点击「下一步／提交／签署」时的弹窗里；这里连重大条款的颜色也去掉——读的时候不该被标记干扰。 -->
        <view class="item" v-for="c in s.items" :key="c.n">
          <text class="no">{{ c.n }}</text>
          <text class="txt">{{ c.t }}</text>
        </view>
      </view>

      <view style="height: 180rpx"></view>
    </scroll-view>

    <view class="price-bar">
      <button class="pb-btn" @click="go">{{ backMode ? '返回' : '进入第 1 步（选场地）' }}</button>
    </view>

    <BasisPop :show="pop.show" :title="pop.title" :lines="pop.lines" :sec="pop.sec" :touch="pop.touch" :must="pop.must" @close="pop.show = false" />
  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
import BasisPop from '@/components/BasisPop.vue'
import SecHead from '@/components/SecHead.vue'
import ackPop from '@/mixins/ackPop'
import { store, ensureApply } from '@/store'
import {
  DISCLOSURE_VERSION, DISCLOSURE_SECTIONS, TOUCH_CLAUSE,
  appliesTo, confirmedClauses, contentHash, fullText
} from '@/engine/disclosure'

export default {
  components: { NavBar, BasisPop, SecHead },
  mixins: [ackPop],
  // 锚点回看：填报页弹窗里的「查看《申请说明》对应组」带 ?sec=组名 进来，滚动到该组卡片并闪一下高亮。
  // 用组名而不是全局条款号——条款增删时编号会变，组名稳定。
  onLoad(options) {
    if (options && options.sec) this.anchorSec = decodeURIComponent(options.sec)
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    this.backMode = pages.length > 1
  },
  data() {
    const a = ensureApply()
    let no = 0
    const sections = DISCLOSURE_SECTIONS.map(s => ({
      title: s.title,
      items: s.items.map(t => { no += 1; return { n: no, t } })
    }))
    // 本单适用 = 这份草稿真的会触发的重大条款；没触发的不需要确认（用户：不该一上来确认全部）
    const applicable = Object.keys(TOUCH_CLAUSE).filter(t => appliesTo(t, a)).length
    return {
      version: DISCLOSURE_VERSION,
      sections,
      total: no,
      applicable,
      confirmedCount: confirmedClauses(a.acks, DISCLOSURE_VERSION).length,
      hashShort: contentHash().slice(0, 12),
      anchorSec: '',
      anchorId: '',
      backMode: false,
      whyLines: [
        '重大利害关系条款要逐条确认：单勾只能证明「给过文本」，证明不了对重大利害关系条款尽到提示与说明义务（民法典第四百九十六条第二款，举证责任在提供格式条款的一方）。',
        '确认发生在点击「下一步／提交／签署」时：系统会自动弹出本步尚未确认的条款，确认按钮在条款下面。填报页只专注填写，不显示确认状态；右下角「申请说明」可回看本步或全部已确认条款。',
        '只有本单真的触发的条款才需要确认——不是一上来把全部条款勾一遍。',
        '确认记录 = 版本号 + 条款号 + 触点 + 时间戳 + 账号 + 内容哈希；版本更新后必须重新确认，已确认不可撤销。'
      ]
    }
  },
  mounted() {
    // scroll-into-view 要等渲染完再设置；元素 id 以 'dsec-' 开头（uni H5 要求 id 以字母开头）
    if (this.anchorSec) {
      const i = this.sections.findIndex(s => s.title === this.anchorSec)
      if (i >= 0) setTimeout(() => { this.anchorId = 'dsec-' + i }, 350)
    }
  },
  methods: {
    go() {
      if (this.backMode) { uni.navigateBack(); return }
      store.apply.step = 1
      uni.navigateTo({ url: '/pages/apply/venue' })
    },
    copy() {
      uni.setClipboardData({ data: fullText(), success: () => uni.showToast({ title: '已复制全文（含版本与哈希）', icon: 'none' }) })
    }
  }
}
</script>

<style scoped>
.page { height: 100vh; background: var(--bg); display: flex; flex-direction: column; overflow: hidden; }
.body { flex: 1; min-height: 0; }
/* 间距标准（2026-10-28）：4 的倍数节奏；卡片留白 24、内边距 24、标题→内容 20、可点目标 ≥88rpx；卡片内不套卡片。 */
.sec { margin: 24rpx; }
/* 锚点落到哪一组就闪哪一组：动画只跑一次，不常驻高亮 */
.sec.flash { animation: sec-flash 1.8s ease-out 1; }
@keyframes sec-flash { 0% { box-shadow: 0 0 0 4rpx var(--primary); } 100% { box-shadow: 0 0 0 0 rgba(74,108,247,0); } }
/* 标题行收进共用组件（2026-10-29 十次调整）：SecHead */
.kv { display: flex; gap: 16rpx; align-items: center; padding: 12rpx 0; }
/* 标签单行 ≤5 字、不换行；值收缩 */
.k { flex: none; min-width: 116rpx; font-size: var(--fs-2); color: var(--text-3); white-space: nowrap; }
.v { flex: 1 1 auto; min-width: 116rpx; font-size: var(--fs-3); color: var(--text-2); }
.v.price { font-weight: var(--fw-semibold); color: var(--text-1); }
.v.mono { font-family: ui-monospace, Consolas, monospace; font-size: var(--fs-2); }
.copy-btn { margin-top: 20rpx; min-height: 88rpx; display: flex; align-items: center; justify-content: center; border: 2rpx solid var(--line); border-radius: 12rpx; background: #fff; font-size: var(--fs-3); color: var(--text-2); }
.item { display: flex; gap: 16rpx; align-items: center; padding: 12rpx 0; min-height: 88rpx; }
.no { flex: none; min-width: 44rpx; font-size: var(--fs-2); color: var(--text-4); font-weight: var(--fw-bold); }
.txt { flex: 1 1 auto; min-width: 116rpx; font-size: var(--fs-3); color: var(--text-2); }
.price-bar { flex: none; background: rgba(255,255,255,.97); border-top: 1rpx solid var(--line); padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom)); }
.pb-btn { width: 100%; border: none; border-radius: 999rpx; background: linear-gradient(135deg, var(--primary), var(--primary-2)); color: #fff; font-size: var(--fs-6); font-weight: var(--fw-bold); padding: 20rpx 0; min-height: 88rpx; box-sizing: border-box; }
.pb-btn::after { border: none; }
</style>
