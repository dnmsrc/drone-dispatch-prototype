<template>
  <div class="page">
    <!-- 搜索栏 -->
    <div class="card search-card">
      <el-form :inline="true" @submit.prevent>
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            placeholder="咨询单号 / 昵称 / 手机号"
            clearable
            style="width: 240px"
            @keyup.enter="load(1)"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="load(1)">查询</el-button>
          <el-button :icon="Refresh" @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 咨询单列表 -->
    <div class="card">
      <h3 class="card-title">
        咨询受理
        <span class="pending-tip">待接待 {{ pendingCount }} 单</span>
      </h3>

      <el-tabs v-model="tab" @tab-change="onTabChange">
        <el-tab-pane v-for="t in TABS" :key="t.name" :name="t.name" :label="tabLabel(t)" />
      </el-tabs>

      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="id" label="咨询单号" width="160" />
        <el-table-column label="用户" width="85">
          <template #default="{ row }">
            <div class="ellipsis" :title="row.user?.nickname">{{ row.user?.nickname || '—' }}</div>
            <div class="cell-sub ellipsis" :title="row.user?.phone">{{ row.user?.phone || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="场地" width="90">
          <template #default="{ row }">
            <div class="ellipsis" :title="row.venue?.name">{{ row.venue?.name || '—' }}</div>
            <div class="cell-sub ellipsis" :title="venueSub(row)">{{ venueSub(row) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="申请日期/时段" width="118">
          <template #default="{ row }">
            <div>{{ row.performDate || '—' }}</div>
            <div class="cell-sub">{{ row.timeSlot || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="架次" width="75">
          <template #default="{ row }">
            <div>{{ row.need?.droneCount ?? '—' }} 架</div>
            <div class="cell-sub">{{ row.need?.duration ? row.need.duration + ' 分钟' : '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="判定结论" width="100">
          <template #default="{ row }">
            <span class="ellipsis" :title="row.judgment?.conclusionText">{{ row.judgment?.conclusionText || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="报价区间" width="150">
          <template #default="{ row }">
            <span class="amount-text ellipsis" :title="`预估合计 ${fmtMoney(row.quote?.total)}`">{{ quoteText(row.quote) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="115">
          <template #default="{ row }">
            <el-tag :type="statusConf(row.status).type" size="small" :title="row.statusText">
              {{ statusConf(row.status).text }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="提交时间" width="140">
          <template #default="{ row }"><span class="nowrap">{{ fmtTime(row.submittedAt) }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="125" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'PENDING'">
              <el-button link type="primary" @click="doReceive(row)">接待</el-button>
            </template>
            <template v-else-if="row.status === 'RECEIVED'">
              <el-button link type="primary" @click="openDispatch(row)">创建派单</el-button>
              <el-button link type="danger" @click="doReject(row)">驳回</el-button>
            </template>
            <el-button v-else link type="primary" @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无咨询单 —— 用户在 H5 提交咨询后出现在这里" :image-size="80" />
        </template>
      </el-table>

      <div class="pager">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :page-sizes="[10, 20, 50]"
          @change="load()"
        />
      </div>
    </div>

    <!-- 创建派单弹窗 -->
    <el-dialog v-model="dispatchDialog" title="创建派单" width="660px" destroy-on-close>
      <template v-if="dispatchTarget">
        <el-descriptions :column="2" border size="small" style="margin-bottom: 16px">
          <el-descriptions-item label="咨询单号" :span="2">{{ dispatchTarget.id }}</el-descriptions-item>
          <el-descriptions-item label="用户">
            {{ dispatchTarget.user?.nickname || '—' }}（{{ dispatchTarget.user?.phone || '—' }}）
          </el-descriptions-item>
          <el-descriptions-item label="场地">{{ dispatchTarget.venue?.name || '—' }}</el-descriptions-item>
          <el-descriptions-item label="申请日期">
            {{ dispatchTarget.performDate }} {{ dispatchTarget.timeSlot }}
          </el-descriptions-item>
          <el-descriptions-item label="用户预估区间">{{ quoteText(dispatchTarget.quote) }}</el-descriptions-item>
        </el-descriptions>

        <el-form ref="dispatchFormRef" :model="dispatchForm" :rules="dispatchRules" label-position="top">
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="报价下限（元）" prop="quoteLo">
                <el-input-number v-model="dispatchForm.quoteLo" :min="0" :step="100" controls-position="right" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="报价上限（元）" prop="quoteHi">
                <el-input-number v-model="dispatchForm.quoteHi" :min="0" :step="100" controls-position="right" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-form-item
            v-for="t in TEXT_TERMS"
            :key="t.key"
            :label="t.label"
            :prop="`terms.${t.key}`"
          >
            <el-input
              v-model="dispatchForm.terms[t.key]"
              :type="t.rows > 1 ? 'textarea' : 'text'"
              :rows="t.rows"
              :placeholder="t.placeholder"
              maxlength="100"
              show-word-limit
            />
          </el-form-item>

          <el-form-item label="责任保险保额（元）" prop="terms.insuranceAmount">
            <el-input-number
              v-model="dispatchForm.terms.insuranceAmount"
              :min="0"
              :step="10000"
              :precision="0"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>

          <el-form-item label="客服备注">
            <el-input
              v-model="dispatchForm.note"
              type="textarea"
              :rows="3"
              maxlength="200"
              show-word-limit
              placeholder="对用户的补充说明，例如沟通结论、待补材料、签署注意事项"
            />
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="dispatchDialog = false">取消</el-button>
        <el-button type="primary" :loading="acting" @click="submitDispatch">确认创建派单</el-button>
      </template>
    </el-dialog>

    <!-- 详情抽屉 -->
    <el-drawer v-model="drawer" size="660px" :title="detail ? `咨询单详情 ${detail.id}` : '咨询单详情'">
      <div v-if="detail" v-loading="detailLoading" class="drawer-body">
        <h4 class="section-title">基本信息</h4>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="咨询单号" :span="2">{{ detail.id }}</el-descriptions-item>
          <el-descriptions-item label="当前状态">
            <el-tag :type="statusConf(detail.status).type" size="small">
              {{ detail.statusText || statusConf(detail.status).text }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="提交时间">{{ fmtTime(detail.submittedAt) }}</el-descriptions-item>
          <el-descriptions-item label="用户">
            {{ detail.user?.nickname || '—' }}（{{ detail.user?.phone || '—' }}）
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ fmtTime(detail.updatedAt) }}</el-descriptions-item>
          <el-descriptions-item label="场地" :span="2">
            {{ detail.venue?.name || '—' }}
            <span class="cell-sub">{{ venueSub(detail) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="申请日期">
            {{ detail.performDate || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="申请时段">{{ detail.timeSlot || '—' }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.note" label="用户补充说明" :span="2">{{ detail.note }}</el-descriptions-item>
        </el-descriptions>

        <h4 class="section-title">规模与内容</h4>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="机队规模">{{ needText('droneCount') }}</el-descriptions-item>
          <el-descriptions-item label="表演时长">{{ need.duration ? need.duration + ' 分钟' : '—' }}</el-descriptions-item>
          <el-descriptions-item label="预计观众">{{ need.audience ? need.audience + ' 人' : '—' }}</el-descriptions-item>
          <el-descriptions-item label="内容复杂度">{{ CONTENT_MODE_LABELS[need.contentMode] || need.contentMode || '—' }}</el-descriptions-item>
          <template v-if="need.contentMode && need.contentMode !== 'template'">
            <el-descriptions-item label="画面数量">{{ SCREEN_LABELS[need.screens] || need.screens || '—' }}</el-descriptions-item>
            <el-descriptions-item label="维度">{{ need.dimension || '—' }}</el-descriptions-item>
            <el-descriptions-item label="运动方式">{{ MOTION_LABELS[need.motion] || need.motion || '—' }}</el-descriptions-item>
            <el-descriptions-item label="矩阵数">{{ need.matrix ? need.matrix + ' 矩阵' : '—' }}</el-descriptions-item>
          </template>
          <el-descriptions-item label="附加内容" :span="2">{{ addonsText(need.addons) }}</el-descriptions-item>
        </el-descriptions>

        <h4 class="section-title">判定结论</h4>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="判定结论">{{ detail.judgment?.conclusionText || '—' }}</el-descriptions-item>
        </el-descriptions>
        <div v-if="abnormalChecks.length" class="check-tags">
          <el-tag
            v-for="c in abnormalChecks"
            :key="c.key"
            :type="c.result === 'FAIL' ? 'danger' : 'warning'"
            size="small"
            effect="plain"
          >{{ c.label }}</el-tag>
        </div>

        <h4 class="section-title">转人工原因</h4>
        <div v-if="detail.reasons?.length" class="reason-list">
          <div v-for="(r, i) in detail.reasons" :key="i" class="reason-item">
            <el-tag type="danger" size="small" effect="plain">{{ r.label || r.key || '转人工' }}</el-tag>
            <div class="reason-why">{{ r.why }}</div>
          </div>
        </div>
        <span v-else class="cell-sub">本单未触发转人工项</span>

        <h4 class="section-title">报价区间</h4>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="区间">
            <span class="amount-text">{{ quoteText(detail.quote) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="预估合计">{{ fmtMoney(detail.quote?.total) }}</el-descriptions-item>
        </el-descriptions>

        <template v-if="detail.dispatch">
          <h4 class="section-title">派单信息</h4>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="派单号" :span="2">{{ detail.dispatch.id || '—' }}</el-descriptions-item>
            <el-descriptions-item label="创建人">{{ detail.dispatch.createdBy || '—' }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ fmtTime(detail.dispatch.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="派单状态">{{ dispatchStatusText(detail.dispatch.status) }}</el-descriptions-item>
            <el-descriptions-item label="正式报价区间">{{ dispatchQuoteText(detail.dispatch) }}</el-descriptions-item>
            <template v-if="detail.dispatch.status === 'CONFIRMED'">
              <el-descriptions-item label="用户确认时间">{{ fmtTime(detail.dispatch.confirmedAt) }}</el-descriptions-item>
              <el-descriptions-item label="确认人">{{ detail.dispatch.confirmedBy || '—' }}</el-descriptions-item>
            </template>
          </el-descriptions>

          <div class="fill-list">
            <div v-for="t in dispatchTermRows" :key="t.key" class="fill-row">
              <div class="fill-label">{{ t.label }}</div>
              <div class="fill-value" :class="{ miss: !t.hasValue }">{{ t.value }}</div>
              <div v-if="t.note" class="fill-note">{{ t.note }}</div>
            </div>
          </div>

          <div class="fill-note" style="margin-top: 12px">
            <strong>客服备注：</strong>{{ detail.dispatch.note || '—' }}
          </div>
        </template>

        <template v-if="detail.reject">
          <h4 class="section-title">驳回信息</h4>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="驳回原因">{{ detail.reject.reason || '—' }}</el-descriptions-item>
            <el-descriptions-item label="操作人">
              {{ detail.reject.by || '—' }} · {{ fmtTime(detail.reject.at) }}
            </el-descriptions-item>
          </el-descriptions>
        </template>

        <h4 class="section-title">时间轴</h4>
        <el-timeline class="timeline">
          <el-timeline-item
            v-for="(t, i) in sortedTimeline"
            :key="i"
            :timestamp="fmtTime(t.at)"
            :type="i === sortedTimeline.length - 1 ? 'primary' : ''"
          >
            <div>{{ t.text }}</div>
            <div v-if="t.by" class="cell-sub">{{ t.by }}</div>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-if="!sortedTimeline.length" description="暂无流程记录" :image-size="60" />
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh } from '@element-plus/icons-vue'
import request from '../../utils/request'
import { fmtMoney, fmtTime } from '../../utils/format'

// 咨询单状态字典（与契约 docs/consult-workflow.md 一一对应，字段名不改）
const STATUS_CONF = {
  PENDING: { text: '待接待', type: 'danger' },
  RECEIVED: { text: '已接待', type: 'warning' },
  DISPATCHED: { text: '已派单待确认', type: 'primary' },
  CONFIRMED: { text: '已确认', type: 'success' },
  REJECTED: { text: '已驳回', type: 'info' },
  ABANDONED: { text: '已废弃', type: 'info' }
}

const TABS = [
  { name: 'PENDING', label: '待接待' },
  { name: 'RECEIVED', label: '已接待' },
  { name: 'DISPATCHED', label: '已派单待确认' },
  { name: 'CONFIRMED', label: '已确认' },
  { name: 'REJECTED', label: '已驳回' },
  { name: 'ABANDONED', label: '已废弃' },
  { name: 'ALL', label: '全部' }
]

// need / judgment 展示用中文标签（只做展示映射，不改契约字段）
const CONTENT_MODE_LABELS = { template: '预设模板', deep: '深度定制', matrix: '多矩阵编排' }
const SCREEN_LABELS = { low: '≤3 个画面', mid: '4-8 个画面', high: '9 个以上画面' }
const MOTION_LABELS = { static: '静态编队', dynamic: '动态编队' }
const ADDON_LABELS = {
  music: '专属音乐编曲',
  narration: '现场旁白解说',
  aerial: '双机位航拍记录',
  module: '选配模块（烟花 / 降落伞 / 孔明灯）',
  urgent: '加急服务'
}

// 六项必填的文本项（insuranceAmount 是数字，单独用数字输入框；顺序与契约一致）
const TEXT_TERMS = [
  {
    key: 'approvalOwner',
    label: '审批义务承担主体',
    rows: 2,
    placeholder: '例如：承飞方（乙方）负责空域申请与备案'
  },
  {
    key: 'approvalFailLiability',
    label: '审批失败责任划分',
    rows: 2,
    placeholder: '例如：乙方未按时取得批复 → 乙方全责退还已付费用'
  },
  {
    key: 'subcontractApproved',
    label: '转包是否经甲方书面同意',
    rows: 1,
    placeholder: '例如：是（甲方书面同意）；未经书面同意不得转包'
  },
  {
    key: 'depositNature',
    label: '签约节点是定金还是预付款',
    rows: 1,
    placeholder: '例如：预付款（未约定定金条款，不适用定金罚则）'
  },
  {
    key: 'scaleBasis',
    label: '计价与验收按投入规模还是峰值',
    rows: 2,
    placeholder: '例如：按投入规模（实际投入的机队数）计价与验收，峰值不作为验收口径'
  }
]

const FALLBACK_TERM_LABELS = {
  approvalOwner: '审批义务承担主体',
  approvalFailLiability: '审批失败责任划分',
  subcontractApproved: '转包是否经甲方书面同意',
  depositNature: '签约节点是定金还是预付款',
  insuranceAmount: '责任保险保额',
  scaleBasis: '计价与验收按投入规模还是峰值'
}

const tab = ref('PENDING')
const loading = ref(false)
const list = ref([])
const total = ref(0)
const counts = ref({ PENDING: 0, RECEIVED: 0, DISPATCHED: 0, CONFIRMED: 0, REJECTED: 0, ABANDONED: 0 })
const query = reactive({ keyword: '', page: 1, size: 10 })

const drawer = ref(false)
const detail = ref(null)
const detailLoading = ref(false)

const dispatchDialog = ref(false)
const dispatchTarget = ref(null)
const dispatchFormRef = ref()
const acting = ref(false)
const dispatchForm = reactive({
  quoteLo: 0,
  quoteHi: 0,
  terms: {
    approvalOwner: '',
    approvalFailLiability: '',
    subcontractApproved: '',
    depositNature: '',
    insuranceAmount: 1000000,
    scaleBasis: ''
  },
  note: ''
})

const pendingCount = computed(() => counts.value.PENDING || 0)
const allCount = computed(() =>
  ['PENDING', 'RECEIVED', 'DISPATCHED', 'CONFIRMED', 'REJECTED', 'ABANDONED'].reduce(
    (sum, k) => sum + (counts.value[k] || 0),
    0
  )
)
const need = computed(() => detail.value?.need || {})
const abnormalChecks = computed(() =>
  (detail.value?.judgment?.checks || []).filter((c) => c.result === 'FAIL' || c.result === 'PENDING')
)
const sortedTimeline = computed(() =>
  [...(detail.value?.timeline || [])].sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0))
)
const dispatchTermRows = computed(() => {
  const d = detail.value?.dispatch
  if (!d) return []
  if (Array.isArray(d.mustFill) && d.mustFill.length) {
    return d.mustFill.map((m) => ({
      key: m.key,
      label: m.label || FALLBACK_TERM_LABELS[m.key] || m.key,
      value: fillValue(m.value),
      hasValue: m.value !== null && m.value !== undefined && m.value !== '',
      note: m.note || ''
    }))
  }
  // 兜底：后端没给派生结果时，按 terms 渲染，保证六项不漏
  return Object.keys(FALLBACK_TERM_LABELS).map((key) => ({
    key,
    label: FALLBACK_TERM_LABELS[key],
    value: fillValue(d.terms ? d.terms[key] : null),
    hasValue: !!(d.terms && d.terms[key] !== null && d.terms[key] !== undefined && d.terms[key] !== ''),
    note: ''
  }))
})

// 六项必填的 el-form 校验：全非空（保险保额还需为 > 0 的数字）
function requiredTextRule(label) {
  return {
    validator: (_rule, value, callback) => {
      if (String(value ?? '').trim()) callback()
      else callback(new Error(`请填写「${label}」（缺项即合同约定不明）`))
    },
    trigger: 'blur'
  }
}

const dispatchRules = {
  quoteLo: [{ required: true, message: '请填写报价下限', trigger: 'blur' }],
  quoteHi: [{ required: true, message: '请填写报价上限', trigger: 'blur' }],
  'terms.insuranceAmount': [
    {
      validator: (_rule, value, callback) => {
        const n = Number(value)
        if (Number.isFinite(n) && n > 0) callback()
        else callback(new Error('请填写责任保险保额（大于 0 的数字）'))
      },
      trigger: 'blur'
    }
  ]
}
TEXT_TERMS.forEach((t) => {
  dispatchRules[`terms.${t.key}`] = [requiredTextRule(t.label)]
})

function statusConf(status) {
  return STATUS_CONF[status] || { text: status || '—', type: 'info' }
}

function countOf(name) {
  if (name === 'ALL') return allCount.value
  return counts.value[name] || 0
}

function tabLabel(t) {
  return `${t.label} ${countOf(t.name)}`
}

function quoteText(quote) {
  const lo = quote?.lo
  const hi = quote?.hi
  const fmt = (n) => (n === null || n === undefined ? '—' : fmtMoney(n))
  return `${fmt(lo)} ~ ${fmt(hi)}`
}

function dispatchQuoteText(d) {
  const r = d?.quoteRange || []
  return `${fmtMoney(r[0])} ~ ${fmtMoney(r[1])}`
}

function dispatchStatusText(status) {
  return { PENDING_CONFIRM: '待用户确认', CONFIRMED: '用户已确认' }[status] || status || '—'
}

function venueSub(row) {
  const v = row?.venue || {}
  const parts = []
  const typeText = { preset: '预设场地', map: '地图选点', manual: '手动输入' }[v.type]
  if (typeText) parts.push(typeText)
  if (v.address) parts.push(v.address)
  return parts.join(' · ') || '—'
}

function needText(key) {
  const v = need.value[key]
  if (key === 'droneCount') return v ? `${v} 架` : '—'
  return v || '—'
}

function addonsText(addons) {
  if (!addons || !addons.length) return '无'
  return addons.map((k) => ADDON_LABELS[k] || k).join('、')
}

function fillValue(v) {
  if (v === null || v === undefined || v === '') return '未填写'
  return typeof v === 'number' ? fmtMoney(v) : v
}

async function load(page) {
  if (page) query.page = page
  loading.value = true
  try {
    const params = { page: query.page, size: query.size }
    if (tab.value !== 'ALL') params.status = tab.value
    if (query.keyword.trim()) params.keyword = query.keyword.trim()
    const data = await request.get('/admin/consults', { params })
    list.value = data.list || []
    total.value = data.total || 0
    counts.value = { ...counts.value, ...(data.counts || {}) }
  } finally {
    loading.value = false
  }
}

function onTabChange() {
  query.page = 1
  load(1)
}

function reset() {
  query.keyword = ''
  query.page = 1
  load(1)
}

async function doReceive(row) {
  try {
    await ElMessageBox.confirm(
      `确认接待咨询单 ${row.id}？接待后可创建派单，用户侧状态变为「客服已接待·拟方案」。`,
      '接待确认',
      { confirmButtonText: '确认接待', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  acting.value = true
  try {
    await request.post(`/admin/consults/${row.id}/receive`)
    ElMessage.success('已接待，可以创建派单')
    load()
  } finally {
    acting.value = false
  }
}

function openDispatch(row) {
  dispatchTarget.value = row
  dispatchForm.quoteLo = row.quote?.lo ?? 0
  dispatchForm.quoteHi = row.quote?.hi ?? 0
  dispatchForm.terms = {
    approvalOwner: '',
    approvalFailLiability: '',
    subcontractApproved: '',
    depositNature: '',
    insuranceAmount: 1000000,
    scaleBasis: ''
  }
  dispatchForm.note = ''
  dispatchDialog.value = true
  nextTick(() => dispatchFormRef.value?.clearValidate())
}

async function submitDispatch() {
  if (!dispatchFormRef.value) return
  try {
    await dispatchFormRef.value.validate()
  } catch {
    return
  }
  const lo = Number(dispatchForm.quoteLo)
  const hi = Number(dispatchForm.quoteHi)
  if (lo > hi) {
    ElMessage.warning('报价下限不能大于报价上限')
    return
  }
  acting.value = true
  try {
    await request.post(`/admin/consults/${dispatchTarget.value.id}/dispatch`, {
      quoteLo: lo,
      quoteHi: hi,
      terms: {
        ...dispatchForm.terms,
        insuranceAmount: Number(dispatchForm.terms.insuranceAmount)
      },
      note: dispatchForm.note.trim()
    })
    ElMessage.success('派单已创建，等待用户在 H5 确认')
    dispatchDialog.value = false
    load()
  } finally {
    acting.value = false
  }
}

async function doReject(row) {
  let reason = ''
  try {
    const { value } = await ElMessageBox.prompt(
      `驳回咨询单 ${row.id}，请填写驳回原因（用户可见）。`,
      '驳回咨询单',
      {
        confirmButtonText: '确认驳回',
        cancelButtonText: '取消',
        inputType: 'textarea',
        inputPlaceholder: '例如：该场地处于禁飞区，无法执行飞行',
        inputValidator: (v) => (String(v || '').trim() ? true : '请填写驳回原因')
      }
    )
    reason = String(value || '').trim()
  } catch {
    return
  }
  acting.value = true
  try {
    await request.post(`/admin/consults/${row.id}/reject`, { reason })
    ElMessage.success('已驳回咨询单')
    load()
  } finally {
    acting.value = false
  }
}

async function openDetail(row) {
  drawer.value = true
  detailLoading.value = true
  detail.value = null
  try {
    const data = await request.get(`/admin/consults/${row.id}`)
    // 列表项带 user，详情接口可能不带：这里只做合并，不扩展接口
    detail.value = { ...data.consult, user: data.consult?.user || row.user }
  } finally {
    detailLoading.value = false
  }
}

load()
</script>

<style scoped>
.pending-tip {
  font-size: 12px;
  font-weight: 400;
  color: #f56c6c;
}

.cell-sub {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}

/* 单元格单行省略（完整内容看 title 悬浮提示，详情抽屉里也有全量） */
.ellipsis {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.nowrap {
  white-space: nowrap;
}

.drawer-body {
  padding-bottom: 8px;
}

.check-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.reason-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reason-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.reason-why {
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
  flex: 1;
}

.fill-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.fill-row {
  border-left: 3px solid #409eff;
  background: #f8fafc;
  border-radius: 4px;
  padding: 10px 12px;
}

.fill-label {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.fill-value {
  font-size: 13px;
  color: #67c23a;
  margin-top: 4px;
  line-height: 1.6;
  word-break: break-all;
}

.fill-value.miss {
  color: #f56c6c;
}

.fill-note {
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
  margin-top: 4px;
}

.timeline {
  padding-left: 2px;
}
</style>
