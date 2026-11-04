<template>
  <div class="page">
    <!-- 工具栏 -->
    <div class="card toolbar">
      <div class="month-ctrl">
        <el-button :icon="ArrowLeft" circle plain @click="shiftMonth(-1)" />
        <el-date-picker
          v-model="month"
          type="month"
          value-format="YYYY-MM"
          :clearable="false"
          style="width: 140px; margin: 0 10px"
          @change="load"
        />
        <el-button :icon="ArrowRight" circle plain @click="shiftMonth(1)" />
        <el-button plain style="margin-left: 10px" @click="goToday">本月</el-button>
        <el-button
          class="multi-btn"
          :type="multi ? 'primary' : 'default'"
          plain
          @click="toggleMulti"
        >
          {{ multi ? '退出多选' : '多选' }}
        </el-button>
      </div>
      <div class="legend">
        <span class="legend-item"><i class="dot dot-full"></i>满档</span>
        <span class="legend-item"><i class="dot dot-noslots"></i>不接单</span>
        <span class="legend-item"><i class="dot dot-closed"></i>休整日</span>
        <span class="legend-item"><i class="dot dot-holiday"></i>节假日/特殊日</span>
        <span class="legend-item"><i class="dot dot-free"></i>可预约</span>
      </div>
    </div>

    <!-- 多选操作条 -->
    <div v-if="multi" class="card multi-bar">
      <div class="mb-left">
        <span class="mb-count">已选 <b>{{ selectedDates.size }}</b> 天</span>
        <span v-if="selectedMonths.length" class="mb-months">（{{ selectedMonths.join('、') }}）</span>
      </div>
      <div class="mb-actions">
        <el-button size="small" @click="selectRange('month')">全选本月</el-button>
        <el-button size="small" @click="selectRange('quarter')">全选本季</el-button>
        <el-button size="small" @click="selectRange('year')">全选本年</el-button>
        <el-button size="small" text @click="clearSelection">清空</el-button>
        <el-button size="small" type="primary" :disabled="selectedDates.size === 0" @click="openBulk">
          配置接单时段
        </el-button>
      </div>
      <div class="mb-tip">点格子加入 / 取消；跨月选择会累加保留，切换月份不会清空。已单独配置过时段的日期、休整日不可重复选择。</div>
    </div>

    <!-- 月历 -->
    <div class="card" v-loading="loading">
      <div class="week-row">
        <div v-for="w in weekHeaders" :key="w" class="week-cell">{{ w }}</div>
      </div>
      <div class="grid">
        <div
          v-for="(cell, i) in cells"
          :key="i"
          class="day-cell"
          :class="cellClass(cell)"
          @click="onCellClick(cell)"
        >
          <template v-if="cell">
            <!-- 2026-11-04 用户口径：多选不要用「整圈描边」表示已选（描边贴着网格线，看着挤）。
                 改为内层圆角色块：四周各留 4px 白边，相邻两格选中之间还有 8px 呼吸缝；
                 选中态靠「淡蓝填充 + 日期变蓝 + 右上角对勾」表达，不再写「已选」两个字。 -->
            <div class="day-inner">
              <div class="day-head">
                <span class="day-num" :class="{ today: cell.date === today }">{{ Number(cell.date.slice(8)) }}</span>
                <span v-if="multi && selectedDates.has(cell.date)" class="chk" title="已选">
                  <el-icon><Check /></el-icon>
                </span>
                <span v-else-if="multi && cell.closed" class="badge badge-set">休</span>
                <span v-else-if="multi && cell.slotsOverridden" class="badge badge-set">已配</span>
                <span v-else-if="cell.closed" class="badge badge-closed">休</span>
                <span v-else-if="cell.slots.length === 0" class="badge badge-noslots">停</span>
                <span v-else-if="cell.booked >= cell.limit" class="badge badge-full">满</span>
              </div>
              <div v-if="cell.holiday" class="day-holiday" :class="{ custom: cell.customHoliday }">{{ cell.holiday }}</div>
              <div class="day-booked">
                <span v-if="multi">{{ cell.slots.length }} 时段<span v-if="cell.slotsOverridden" class="override-mark" title="单独设置过时段">*</span></span>
                <span v-else>已订 {{ cell.booked }}/{{ cell.limit }}<span v-if="cell.overridden" class="override-mark" title="该日单独设置">*</span></span>
              </div>
              <div v-if="!multi && !cell.closed && cell.limit > 0" class="day-slots">
                {{ cell.slots.map(shortSlot).join(' · ') }}
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 单选：日期详情弹窗（2026-11-03 三次修正：压高度，避免出现滚动条）
         口径：① 基本信息两列排布（4 项 2 行）；② 操作区一行一个块，不重复文案；
              ③ 弹窗总高在 720 高视口内也不溢出。 -->
    <el-dialog v-model="dayDialog" class="day-dialog" top="4vh" :title="selected ? `${selected.date} 档期详情` : ''" width="640px" destroy-on-close>
      <template v-if="selected">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="日期">
            {{ selected.date }}（周{{ weekHeaders[(dayOfWeek(selected.date) + 6) % 7] }}）
            <el-tag v-if="selected.holiday" size="small" type="danger" effect="plain" style="margin-left: 6px">
              {{ selected.holiday }}{{ selected.customHoliday ? '（手动）' : '' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="当日订单数">{{ selected.booked }} 单</el-descriptions-item>
          <el-descriptions-item label="可接单时段">
            <!-- 管理员：这里只给一行汇总，具体条目在下方编辑区（同一份数据不展示两遍） -->
            <template v-if="auth.isAdmin">
              <span v-if="selected.slots.length" class="sum-line">
                {{ selected.slots.length }} 段<span v-if="bookedSlotCount">（{{ bookedSlotCount }} 已订）</span>
                <span class="cell-sub">{{ selected.overridden ? ' · 单独设置' : ' · 默认' }}</span>
              </span>
              <el-tag v-else size="small" type="info">当日不接单</el-tag>
            </template>
            <span v-else-if="selected.slots.length">
              <el-tag
                v-for="s in selected.slots"
                :key="s"
                size="small"
                :type="bookedOf(s) ? 'warning' : 'success'"
                effect="plain"
                style="margin-right: 6px"
              >
                {{ fmtSlot(s) }}<span v-if="bookedOf(s)"> · 已订</span>
              </el-tag>
            </span>
            <el-tag v-else size="small" type="info">当日不接单</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag v-if="selected.closed" type="info">休整日</el-tag>
            <el-tag v-else-if="selected.slots.length === 0" type="info">不接单</el-tag>
            <el-tag v-else-if="selected.booked >= selected.limit" type="danger">已满档</el-tag>
            <el-tag v-else type="success">可预约</el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <div v-if="auth.isAdmin" class="day-ops">
          <div v-if="selected.closed" class="slot-closed-tip">
            <span class="sct-badge">休</span>
            该日已设为休整日：全部时段停接。要配置可接单时段，请先点右下角「恢复营业」。
          </div>
          <div v-else class="op-block">
            <span class="op-label">设置当日可接单时段</span>            <div class="slot-list" :class="{ 'slot-grid': daySlotsInput.length > 4 }">
              <div v-for="t in daySlotsInput" :key="t" class="slot-item" :class="{ booked: bookedOf(t) > 0 }">
                <span class="slot-bar" :class="{ booked: bookedOf(t) > 0 }"></span>
                <span class="slot-time">{{ fmtSlot(t) }}</span>
                <span class="slot-note" :class="{ booked: bookedOf(t) > 0 }">
                  {{ bookedOf(t) > 0 ? `已订 ${bookedOf(t)} 单 · 不可删` : '可预约' }}
                </span>
                <!-- 已订时段不给删除按钮：客户已经买断了这个名额，单方面撤回等于毁约 -->
                <el-button
                  v-if="!bookedOf(t)"
                  class="slot-act"
                  link
                  type="danger"
                  :icon="Close"
                  size="small"
                  title="删除该时段"
                  @click="removeSlot('day', t)"
                />
                <el-tooltip v-else content="该时段已有订单，不能删除" placement="top">
                  <el-icon class="slot-act slot-lock"><Lock /></el-icon>
                </el-tooltip>
              </div>
              <div v-if="!daySlotsInput.length" class="slot-empty">当日不接单，在下方添加时段即可恢复</div>
            </div>
            <div class="slot-picker">
              <el-time-select v-model="newStart" start="00:00" end="23:00" step="01:00" placeholder="开始" size="small" style="width: 104px" />
              <span class="picker-sep">–</span>
              <el-time-select v-model="newEnd" start="00:00" end="23:00" step="01:00" placeholder="结束" size="small" style="width: 104px" />
              <el-button class="add-slot" size="small" type="primary" plain :icon="Plus" @click="addSlotFor('day')">添加时段</el-button>
            </div>
            <div class="op-btns">
              <el-button size="small" type="primary" :loading="acting" @click="saveDaySlots">保存时段</el-button>
              <el-button v-if="selected.slotsOverridden" size="small" plain :loading="acting" @click="resetDaySlots">
                恢复默认
              </el-button>
            </div>
          </div>
          <div class="op-row">
            <span class="op-label">特殊日</span>
            <el-input v-model="holidayInput" size="small" placeholder="如 情人节 / 店庆日" maxlength="10" style="width: 150px" />
            <el-button size="small" type="warning" plain :loading="acting" @click="saveHoliday">标注</el-button>
            <el-button v-if="selected.customHoliday" size="small" plain :loading="acting" @click="clearHoliday">取消标注</el-button>
          </div>
          <div v-if="!selected.closed" class="op-tip">
            一段 = 一个名额 · 只能选整点 · 时段不可重叠（首尾相接可以）
          </div>
        </div>
        <div v-else class="readonly-tip">操作员角色仅可查看，休整日与接单时段请联系管理员。</div>
      </template>
      <template #footer>
        <el-button @click="dayDialog = false">关闭</el-button>
        <template v-if="auth.isAdmin && selected">
          <!-- 已有订单的日子不能停工：按钮置灰并说明原因，后端同样会拒 -->
          <el-tooltip
            v-if="!selected.closed"
            :content="selected.booked > 0 ? `该日已有 ${selected.booked} 单订单，不能设为休整日` : ''"
            :disabled="selected.booked === 0"
            placement="top"
          >
            <span class="ft-btn-wrap">
              <el-button type="warning" :disabled="selected.booked > 0" :loading="acting" @click="toggleClosed(true)">
                设为休整日
              </el-button>
            </span>
          </el-tooltip>
          <el-button v-else type="success" :loading="acting" @click="toggleClosed(false)">恢复营业</el-button>
        </template>
      </template>
    </el-dialog>

    <!-- 多选：批量配置接单时段（时段直接渲染成条目，可随意增删）
         2026-11-03 三次修正：① 已选+预览合并成一行，少占一行；② 条目改双列网格，12 段也只占 6 行；
         ③ 说明压成一行——目标是在 720 高视口里也不出现滚动条。 -->
    <el-dialog v-model="bulkDialog" class="bulk-dialog" top="4vh" title="配置接单时段" width="660px" destroy-on-close>
      <div class="bulk-line bulk-head">
        <span class="bulk-k">已选日期</span>
        <span class="bulk-v">
          <b>{{ selectedDates.size }}</b> 天<span v-if="selectedMonths.length" class="cell-sub">（{{ selectedMonths.join('、') }}）</span>
          <span class="bulk-preview">{{ selectedPreview }}</span>
          <span v-if="bulkBookedDays" class="bulk-warn">含 {{ bulkBookedDays }} 天已订 · 已订时段自动保留</span>
        </span>
      </div>
      <div class="bulk-line bulk-slots">
        <span class="bulk-k">接单时段</span>
        <div class="bulk-v">
          <div class="slot-list slot-grid">
            <div v-for="t in bulkSlots" :key="t" class="slot-item">
              <span class="slot-bar"></span>
              <span class="slot-time">{{ fmtSlot(t) }}</span>
              <span class="slot-note">1 个名额</span>
              <el-button class="slot-act" link type="danger" :icon="Close" size="small" title="删除该时段" @click="removeSlot('bulk', t)" />
            </div>
            <div v-if="!bulkSlots.length" class="slot-empty">这些天暂不接单（添加时段即恢复）</div>
          </div>
          <div class="slot-picker">
            <el-time-select v-model="newStart" start="00:00" end="23:00" step="01:00" placeholder="开始" size="small" style="width: 104px" />
            <span class="picker-sep">–</span>
            <el-time-select v-model="newEnd" start="00:00" end="23:00" step="01:00" placeholder="结束" size="small" style="width: 104px" />
            <el-button class="add-slot" size="small" type="primary" plain :icon="Plus" @click="addSlotFor('bulk')">添加时段</el-button>
          </div>
          <div class="op-tip">一段 = 一个名额 · 只能选整点 · 时段不可重叠（首尾相接可以）</div>        </div>
      </div>
      <template #footer>
        <el-button @click="bulkDialog = false">取消</el-button>
        <el-button type="primary" :loading="acting" @click="submitBulk">确认（{{ selectedDates.size }} 天）</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight, Check, Close, Lock, Plus } from '@element-plus/icons-vue'
import { DEFAULT_SLOTS, fmtSlot, shortSlot } from '../../utils/slot'
import request from '../../utils/request'
import { todayStr } from '../../utils/format'
import { useAuthStore } from '../../store/auth'

const auth = useAuthStore()
const weekHeaders = ['一', '二', '三', '四', '五', '六', '日']
const today = todayStr()

const month = ref(today.slice(0, 7))
const days = ref([])
const loading = ref(false)
const acting = ref(false)
const defaultSlots = ref(DEFAULT_SLOTS.slice())

// 多选
const multi = ref(false)
const selectedDates = ref(new Set())
const bulkDialog = ref(false)
const bulkSlots = ref([])
// 新增时段用的起止（整点选择器：step 1 小时 → 只允许选整数，避开 19:30 这种半点值）
const newStart = ref('')
const newEnd = ref('')

/** 当前弹窗里这个时段有几单（0 = 可删；>0 = 已被订单占住，不许删） */
function bookedOf(slot) {
  const m = (selected.value && selected.value.bookedSlots) || {}
  return m[slot] || 0
}

/** 已订时段数（供「可接单时段」汇总行用） */
const bookedSlotCount = computed(() => Object.keys((selected.value && selected.value.bookedSlots) || {}).length)

/** 批量配置里选中的日期有几「天」已经有订单（已订时段会被后端自动保留，这里先让管理员看见） */
const bulkBookedDays = computed(() => {
  let n = 0
  for (const d of selectedDates.value) {
    const c = days.value.find(x => x.date === d)
    if (c && c.booked > 0) n++
  }
  return n
})

/** 批量配置时这个日期能不能加入多选；返回 '' 表示可以，否则是拒绝原因 */
function bulkBlockedReason(cell) {
  if (!cell) return ''
  if (cell.date <= today) return '过去的日期'
  if (cell.closed) return '该日为休整日，先恢复营业'
  if (cell.slotsOverridden) return '该日已单独配置过时段，不能重复选择'
  return ''
}

/** 删除已选时段（单日与批量共用）
 *  注意：模板里 ref 会自动解包，不能把 ref 当参数传进来（传进来是数组本体，.value 为 undefined） */
function removeSlot(which, slot) {
  if (which === 'day' && bookedOf(slot) > 0) {
    return ElMessage.warning('该时段已有订单，不能删除；如需调整请走改期或退款流程')
  }
  if (which === 'bulk') bulkSlots.value = bulkSlots.value.filter(x => x !== slot)
  else daySlotsInput.value = daySlotsInput.value.filter(x => x !== slot)
}

/** 时段区间重叠（2026-11-03 用户口径 · 三次修正：相同或覆盖仍允许选择的问题）
 *  一个时段 = 一个可接单名额，同一时间不可能接两单，所以：
 *    ① 完全相同 → 重叠；② 部分相交（19:00-21:00 vs 20:00-22:00）→ 重叠；
 *    ③ 首尾相接（19:00-20:00 vs 20:00-21:00）→ 不重叠，两个连续名额，合法。
 *  排序后只需比对相邻段：若不相邻的两段相交，中间那段必然也与其中之一相交。 */
function slotRange(id) {
  const [a, b] = String(id).split('-')
  const toMin = t => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  return [toMin(a), toMin(b)]
}
function findOverlap(list) {
  const arr = [...new Set(list.filter(Boolean))].sort()
  for (let i = 1; i < arr.length; i++) {
    const [a1, a2] = slotRange(arr[i - 1])
    const [b1, b2] = slotRange(arr[i])
    if (Math.max(a1, b1) < Math.min(a2, b2)) return [arr[i - 1], arr[i]]
  }
  return null
}

/** 添加时段：起止都必须是整点，结束必须晚于开始，相同/重叠的直接拒 */
function addSlotFor(which) {
  const listRef = which === 'bulk' ? bulkSlots : daySlotsInput
  const a = newStart.value
  const b = newEnd.value
  if (!a || !b) return ElMessage.warning('请选择开始与结束时间')
  if (a >= b) return ElMessage.warning('结束时间要晚于开始时间')
  const id = `${a}-${b}`
  if (listRef.value.includes(id)) return ElMessage.warning('该时段已在列表里')
  const hit = findOverlap([...listRef.value, id])
  if (hit) {
    const other = hit[0] === id ? hit[1] : hit[0]
    const booked = which === 'day' && bookedOf(other) > 0
    return ElMessage.warning(
      booked
        ? `该时段与「${fmtSlot(other)}」重叠，而这个时段已有订单：同一时间接不了两单，请避开它`
        : `该时段与「${fmtSlot(other)}」重叠：同一时间只能接一单，请合并或改成不重叠的区间`
    )
  }
  if (listRef.value.length >= 12) return ElMessage.warning('单日最多 12 个时段')
  listRef.value = [...listRef.value, id].sort()
  newStart.value = ''
  newEnd.value = ''
}

const dayDialog = ref(false)
const selected = ref(null)
const daySlotsInput = ref([])
const holidayInput = ref('')

const cells = computed(() => {
  if (!days.value.length) return []
  const [y, m] = month.value.split('-').map(Number)
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7
  return [...Array(offset).fill(null), ...days.value]
})

const selectedMonths = computed(() => {
  const set = new Set([...selectedDates.value].map(d => d.slice(0, 7)))
  return [...set].sort()
})

const selectedPreview = computed(() => {
  const list = [...selectedDates.value].sort()
  if (!list.length) return '—'
  // 连续日期合并成区间：全选本月只显示 "2026-11-04 ~ 2026-11-30（共 27 天）"，不列 27 个日期
  const ranges = []
  for (const d of list) {
    const last = ranges[ranges.length - 1]
    const prev = last && last.to
    if (prev && nextDayStr(prev) === d) last.to = d
    else ranges.push({ from: d, to: d })
  }
  const parts = ranges.slice(0, 3).map(r => (r.from === r.to ? r.from : `${r.from} ~ ${r.to}`))
  const more = ranges.length > 3 ? ` 等 ${list.length} 天` : ''
  // 天数由左侧「已选 N 天」显示，这里不再重复「（共 N 天）」，否则一行挤三份同类信息
  return parts.join('、') + more
})

function pad2(n) { return String(n).padStart(2, '0') }

function nextDayStr(d) {
  const [y, m, day] = d.split('-').map(Number)
  const dt = new Date(y, m - 1, day + 1)
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
}

function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getDay() // 0=周日
}

function cellClass(cell) {
  if (!cell) return 'empty'
  const lockReason = multi.value ? bulkBlockedReason(cell) : ''
  return {
    past: cell.date <= today,
    closed: cell.closed,
    full: !cell.closed && cell.slots.length > 0 && cell.booked >= cell.limit,
    noslots: !cell.closed && cell.slots.length === 0,
    picking: multi.value && cell.date > today && !lockReason,
    locked: !!lockReason && !selectedDates.value.has(cell.date),
    picked: multi.value && selectedDates.value.has(cell.date)
  }
}

async function load() {
  loading.value = true
  try {
    const data = await request.get('/admin/schedule', { params: { month: month.value } })
    days.value = data.days
    if (data.defaultSlots) defaultSlots.value = data.defaultSlots
  } finally {
    loading.value = false
  }
}

function shiftMonth(n) {
  const [y, m] = month.value.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  month.value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
  load()
}

function goToday() {
  month.value = today.slice(0, 7)
  load()
}

/* ---------------- 多选 ---------------- */
function toggleMulti() {
  multi.value = !multi.value
  if (!multi.value) selectedDates.value = new Set()
}

function clearSelection() {
  selectedDates.value = new Set()
}

/** 全选本月 / 本季 / 本年：只取今天之后的日期，并跳过已经单独配置过时段的日期与休整日
 *  （跨月要按月把档期拉回来，否则不知道哪些天已经被配置过，会在提交时撞后端校验） */
async function selectRange(kind) {
  const [y, m] = month.value.split('-').map(Number)
  let from, to, label
  if (kind === 'month') {
    from = new Date(y, m - 1, 1)
    to = new Date(y, m, 0)
    label = '本月'
  } else if (kind === 'quarter') {
    const q = Math.floor((m - 1) / 3)
    from = new Date(y, q * 3, 1)
    to = new Date(y, q * 3 + 3, 0)
    label = '本季'
  } else {
    from = new Date(y, 0, 1)
    to = new Date(y, 11, 31)
    label = '本年'
  }
  const cur = new Date(Math.max(from.getTime(), new Date(`${today}T00:00:00`).getTime() + 86400000))
  const monthKeys = new Set()
  for (let d = cur; d <= to; d = new Date(d.getTime() + 86400000)) {
    monthKeys.add(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`)
  }
  const map = new Map()
  loading.value = true
  try {
    await Promise.all([...monthKeys].map(async mk => {
      const data = await request.get('/admin/schedule', { params: { month: mk } })
      for (const c of (data.days || [])) map.set(c.date, c)
    }))
  } finally {
    loading.value = false
  }
  const next = new Set(selectedDates.value)
  const skipped = []
  for (let d = cur; d <= to; d = new Date(d.getTime() + 86400000)) {
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    const why = bulkBlockedReason(map.get(key))
    if (why) skipped.push({ date: key, why })
    else next.add(key)
  }
  selectedDates.value = next
  const skipNote = skipped.length ? `；跳过 ${skipped.length} 天（已单独配置过时段或休整日）` : ''
  ElMessage.success(`已选 ${next.size} 天（${label}剩余日期）${skipNote}`)
}

function toggleDate(date) {
  const next = new Set(selectedDates.value)
  if (next.has(date)) next.delete(date)
  else next.add(date)
  selectedDates.value = next
}

function openBulk() {
  if (!selectedDates.value.size) return ElMessage.warning('请先选择日期')
  // 已加载的月份里，被单独配置过的日期 / 休整日先剔掉；跨月没加载的交给后端兜底拒绝
  const locked = [...selectedDates.value].filter(d => {
    const cell = days.value.find(c => c.date === d)
    return !!(cell && bulkBlockedReason(cell))
  })
  if (locked.length) {
    const keep = new Set([...selectedDates.value].filter(d => !locked.includes(d)))
    selectedDates.value = keep
    ElMessage.warning(`已剔除 ${locked.length} 个不能批量配置的日期（已单独配置过时段或休整日）`)
    if (!keep.size) return
  }
  bulkSlots.value = defaultSlots.value.slice()
  bulkDialog.value = true
}

async function submitBulk() {
  const ov = findOverlap(bulkSlots.value)
  if (ov) {
    return ElMessage.warning(`「${fmtSlot(ov[0])}」与「${fmtSlot(ov[1])}」重叠：同一时间只能接一单，请先删掉或合并其中一段`)
  }
  acting.value = true
  try {
    const dates = [...selectedDates.value].sort()
    const data = await request.post('/admin/schedule/slots', { dates, slots: bulkSlots.value, mode: 'bulk' })
    const blocked = (data && data.blocked) || []
    if (blocked.length) {
      ElMessage.warning(`已更新 ${dates.length} 天；${blocked.length} 个时段因已有订单保持不变`)
    } else {
      ElMessage.success(`已更新 ${dates.length} 天的接单时段`)
    }
    bulkDialog.value = false
    multi.value = false
    selectedDates.value = new Set()
    load()
  } catch (e) {
    // 后端拒绝（如跨月选中的日期已被单独配置）：提示已在 request 拦截器里弹出，这里保留选择让用户改
  } finally {
    acting.value = false
  }
}

/* ---------------- 单选 ---------------- */
function onCellClick(cell) {
  if (!cell) return
  if (multi.value) {
    if (cell.date <= today) {
      ElMessage.warning('过去的日期不能配置')
      return
    }
    // 取消选择永远允许；加入前先判能不能批量配置（已单独配置过的日期不许重复选择）
    if (selectedDates.value.has(cell.date)) {
      toggleDate(cell.date)
      return
    }
    const why = bulkBlockedReason(cell)
    if (why) {
      ElMessage.warning(`${cell.date}：${why}`)
      return
    }
    toggleDate(cell.date)
    return
  }
  openDay(cell)
}

function openDay(cell) {
  selected.value = cell
  // 已订时段即使历史上被从配置里删掉过，也要列出来：必须让管理员看见「这段已经被买断了」
  const bookedKeys = Object.keys(cell.bookedSlots || {})
  daySlotsInput.value = [...new Set([...cell.slots, ...bookedKeys])].sort()
  holidayInput.value = cell.customHoliday ? cell.holiday : ''
  dayDialog.value = true
}

async function saveDaySlots() {
  if (selected.value.closed) return ElMessage.warning('该日已设为休整日，请先恢复营业再配置时段')
  // 兜底：列表里可能还留着历史脏数据（过去能存进重叠段），保存前整表再过一遍
  const ov = findOverlap(daySlotsInput.value)
  if (ov) {
    return ElMessage.warning(`「${fmtSlot(ov[0])}」与「${fmtSlot(ov[1])}」重叠：同一时间只能接一单，请先删掉或合并其中一段`)
  }
  acting.value = true
  try {
    const data = await request.post('/admin/schedule/slots', {
      dates: [selected.value.date],
      slots: daySlotsInput.value,
      mode: 'single'
    })
    const blocked = (data && data.blocked) || []
    if (blocked.length) ElMessage.warning(`${blocked.length} 个时段因已有订单保持不变`)
    else ElMessage.success(daySlotsInput.value.length ? '已保存当日接单时段' : '已设为当日不接单')
    dayDialog.value = false
    load()
  } catch (e) {
    // 错误提示由 request 拦截器统一弹出
  } finally {
    acting.value = false
  }
}

async function resetDaySlots() {
  acting.value = true
  try {
    await request.post('/admin/schedule/slots', { dates: [selected.value.date], slots: null, mode: 'single' })
    ElMessage.success('已恢复默认时段')
    dayDialog.value = false
    load()
  } catch (e) {
    // 错误提示由 request 拦截器统一弹出
  } finally {
    acting.value = false
  }
}

async function saveHoliday() {
  if (!holidayInput.value.trim()) return ElMessage.warning('请输入特殊日名称')
  acting.value = true
  try {
    await request.post('/admin/schedule/holiday', { date: selected.value.date, name: holidayInput.value.trim() })
    ElMessage.success('已标注特殊日')
    dayDialog.value = false
    load()
  } finally {
    acting.value = false
  }
}

async function clearHoliday() {
  acting.value = true
  try {
    await request.post('/admin/schedule/holiday', { date: selected.value.date, name: '' })
    ElMessage.success('已取消标注')
    dayDialog.value = false
    load()
  } finally {
    acting.value = false
  }
}

async function toggleClosed(closed) {
  acting.value = true
  try {
    await request.post('/admin/schedule/close', { date: selected.value.date, closed })
    ElMessage.success(closed ? '已设为休整日' : '已恢复营业')
    dayDialog.value = false
    load()
  } catch (e) {
    // 后端拒绝（该日已有订单）：提示由 request 拦截器弹出，弹窗保持打开
  } finally {
    acting.value = false
  }
}

load()
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.month-ctrl {
  display: flex;
  align-items: center;
}

.multi-btn {
  margin-left: 10px;
}

.legend {
  margin-left: auto;
  display: flex;
  gap: 14px;
}

.legend-item {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #909399;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 5px;
}

.dot-full { background: #f56c6c; }
.dot-closed { background: #c0c4cc; }
.dot-holiday { background: #e6a23c; }
.dot-free { background: #67c23a; }
.dot-noslots { background: #b1b3b8; }

/* 多选操作条 */
.multi-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
  background: #f2f8ff;
  border: 1px solid #d9ecff;
}

.mb-left {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.mb-count {
  font-size: 14px;
  color: #303133;
}

.mb-count b {
  color: #409eff;
  font-size: 16px;
  margin: 0 2px;
}

.mb-months {
  font-size: 12px;
  color: #909399;
}

.mb-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mb-tip {
  flex-basis: 100%;
  font-size: 12px;
  color: #909399;
}

.week-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border: 1px solid #ebeef5;
  border-bottom: none;
  background: #fafafa;
}

.week-cell {
  padding: 8px 0;
  text-align: center;
  font-size: 13px;
  color: #909399;
}

.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-left: 1px solid #ebeef5;
  border-top: 1px solid #ebeef5;
}

.day-cell {
  min-height: 100px;
  border-right: 1px solid #ebeef5;
  border-bottom: 1px solid #ebeef5;
  cursor: pointer;
  background: #fff;
  position: relative;
  box-sizing: border-box;
  display: flex;
}

/* 内层块：底色只铺在内层并四周各留 4px 白边，相邻两格之间因此始终有 8px 呼吸缝。
   状态一律用「填充 + 颜色」表达，不用整圈描边（描边会贴着网格线，视觉上很挤）。 */
.day-inner {
  flex: 1;
  min-width: 0;
  margin: 4px;
  padding: 8px;
  border-radius: 8px;
  box-sizing: border-box;
  transition: background 0.15s;
}

.day-cell:not(.empty):hover .day-inner {
  background: #f5f9ff;
}

.day-cell.empty {
  background: #fafafa;
  cursor: default;
}

.day-cell.past {
  opacity: 0.45;
}

.day-cell.closed {
  background: #f4f4f5;
}

.day-cell.full {
  background: #fef0f0;
}

.day-cell.noslots {
  background: #fafafa;
}

/* 多选：未来日期给「可加入」提示 */
.day-cell.picking:hover .day-inner {
  background: #ecf5ff;
}

/* 多选：已选 —— 淡蓝填充 + 日期变蓝 + 右上角对勾；悬停略深，不给描边 */
.day-cell.picked .day-inner {
  background: #e8f2ff;
}

.day-cell.picked:hover .day-inner {
  background: #dceafc;
}

.day-cell.picked .day-num {
  color: #2b7cff;
}

.day-cell.picked .day-booked {
  color: #5d7fa8;
}

.day-cell.picked .day-slots {
  color: #7d9bbb;
}

/* 多选：已单独配置过时段的日期 / 休整日不可重复选择，用斜纹表示「锁住」 */
.day-cell.locked {
  cursor: not-allowed;
}

.day-cell.locked .day-inner {
  background: repeating-linear-gradient(135deg, #fafafa, #fafafa 5px, #f2f3f5 5px, #f2f3f5 10px);
}

.day-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.day-num {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.day-num.today {
  color: #fff;
  background: #409eff;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
}

.badge {
  font-size: 12px;
  padding: 1px 7px;
  border-radius: 8px;
  color: #fff;
}

.badge-full { background: #f56c6c; }
.badge-closed { background: #909399; }
.badge-noslots { background: #b1b3b8; }
/* 多选「已选」标记：一个 18px 蓝底白勾的圆，比「已选」两字徽章轻一半，也不挤占日期行 */
.chk {
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #409eff;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(64, 158, 255, 0.35);
}

.chk .el-icon {
  font-size: 12px;
}
.badge-set { background: #a8abb2; }

.day-booked {
  margin-top: 6px;
  font-size: 12px;
  color: #606266;
}

.day-slots {
  margin-top: 3px;
  font-size: 11px;
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.day-holiday {
  margin-top: 4px;
  font-size: 11px;
  color: #e6a23c;
  background: #fdf6ec;
  border-radius: 3px;
  padding: 0 4px;
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.day-holiday.custom {
  color: #b88230;
  border: 1px dashed #e6a23c;
}

.override-mark {
  color: #e6a23c;
  font-weight: 700;
  margin-left: 4px;
}

.day-ops {
  margin-top: 14px;
  border-top: 1px dashed #ebeef5;
  padding-top: 12px;
}

.op-block {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  margin-bottom: 14px;
}

.op-block .op-label {
  width: auto;
  line-height: 1.4;
  font-weight: 500;
  color: #303133;
}

.op-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.op-label {
  flex: none;
  width: 84px;
  font-size: 12px;
  color: #606266;
  line-height: 20px;
}

.op-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.op-btns {
  display: flex;
  gap: 8px;
}

.op-tip {
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
}

.cell-sub {
  font-size: 12px;
  color: #909399;
}

.bulk-line {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 10px;
}

/* 已选日期 + 日期预览合并成一行：预览太长时在行内换行，不额外占一整行 */
.bulk-head .bulk-v {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
  line-height: 1.5;
}

.bulk-preview {
  font-size: 12px;
  color: #909399;
}

.bulk-k {
  flex: none;
  width: 72px;
  font-size: 13px;
  color: #606266;
  line-height: 32px;
}

.bulk-v {
  flex: 1;
  font-size: 13px;
  color: #303133;
  line-height: 32px;
}

.bulk-v.preview {
  color: #606266;
  line-height: 1.6;
  word-break: break-word;
}

.bulk-warn {
  margin-left: 8px;
  font-size: 12px;
  color: #e6a23c;
  background: #fdf6ec;
  border-radius: 3px;
  padding: 1px 6px;
  white-space: nowrap;
}

.bulk-slots .op-tip {
  margin-top: 6px;
}

/* 时段条目改双列网格：段数一多（6~12 段）也只占一半行数，把弹窗高度压回视口内。
   注意特异性：必须 `.slot-list.slot-grid`，否则会被上面的 `.slot-list{display:flex}` 覆盖掉。 */
.slot-list.slot-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.slot-grid .slot-empty {
  grid-column: 1 / -1;
}

.readonly-tip {
  margin-top: 14px;
  font-size: 12px;
  color: #e6a23c;
  background: #fdf6ec;
  border-radius: 4px;
  padding: 8px 12px;
}

/* ===== 时段条目（2026-11-03 用户口径 · 二次修正）=====
   时段是「起-止」整点区间：选好即渲染成条目，可随意删除/新增，不再用复选框二次勾选。
   起止时间用 el-time-select（step 1 小时）→ 只可能选出整数整点。
   布局口径：① 条目撑满可用宽度（左色条 + 时间 + 状态 + 右侧操作贴右），消除弹窗右侧大片空白；
            ② 条与条 12px 间距，不再「看着粘在一起」；
            ③ 已订时段整条换暖色、右侧给锁图标，不给删除按钮。 */
.slot-list { display: flex; flex-direction: column; gap: 12px; width: 100%; margin: 4px 0 10px; box-sizing: border-box; }
.slot-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
  min-height: 46px;
  padding: 10px 14px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.slot-item:hover {
  border-color: #c6e2ff;
  box-shadow: 0 1px 6px rgba(64, 158, 255, 0.08);
}
.slot-item.booked {
  background: #fffaf2;
  border-color: #f5dab1;
}
.slot-bar {
  flex: none;
  width: 4px;
  height: 18px;
  border-radius: 2px;
  background: #67c23a;
}
.slot-bar.booked {
  background: #e6a23c;
}
.slot-time {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  letter-spacing: 0.2px;
  font-variant-numeric: tabular-nums;
}
.slot-note {
  font-size: 12px;
  color: #67c23a;
}
.slot-note.booked {
  color: #e6a23c;
  font-weight: 600;
}
.slot-act {
  margin-left: auto;
}
.slot-lock {
  color: #e6a23c;
  font-size: 15px;
}
.slot-empty {
  font-size: 13px;
  color: #909399;
  padding: 8px 10px;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
}
.slot-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-bottom: 8px;
}
.slot-picker .picker-sep {
  color: #909399;
}
.slot-picker .add-slot {
  margin-left: auto;
}
.slot-closed-tip {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #909399;
  line-height: 1.6;
  background: #f4f4f5;
  border: 1px solid #e9e9eb;
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 14px;
}
.sct-badge {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #909399;
  color: #fff;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sum-line {
  font-size: 13px;
  color: #303133;
}
.ft-btn-wrap {
  display: inline-block;
}
</style>

<!-- 弹窗兜底（非 scoped：el-dialog 会 teleport 到 body，scoped 选择器选不到它）
     常态 3~6 段已经压到 720 高视口也不滚；只有极端情况（单日自己加到 10 段以上 / 窗口特别矮）
     才把内容限制在弹窗内部滚动 —— 绝不让整个遮罩层撑出滚动条、把页面挤歪。 -->
<style>
.day-dialog .el-dialog__body,
.bulk-dialog .el-dialog__body {
  max-height: calc(100vh - 210px);
  overflow-y: auto;
}

/* 提示条默认在 20px，弹窗（top 4vh）标题正好在 60px 附近，会被压住 —— 整体上移到 8px 让开 */
.el-message {
  top: 8px !important;
}
</style>
