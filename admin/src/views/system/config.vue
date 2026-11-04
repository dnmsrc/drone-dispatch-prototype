<template>
  <div class="page" v-loading="loading">
    <!-- 运营参数（可编辑） -->
    <div class="card">
      <h3 class="card-title">运营参数<span class="sub">保存后 H5 端实时生效</span></h3>
      <el-form label-width="130px" class="cfg-form">
        <el-row :gutter="24">
          <el-col :xs="24" :sm="12" :lg="8">
            <el-form-item label="默认可接单时段">
              <div class="slot-list">
                <div v-for="t in form.defaultSlots" :key="t" class="slot-item">
                  <span class="slot-time">{{ fmtSlot(t) }}</span>
                  <el-button link type="danger" :icon="Close" size="small" title="删除该时段" @click="removeDefaultSlot(t)" />
                </div>
                <div v-if="!form.defaultSlots.length" class="slot-empty">至少保留一个时段，否则用户无法下单</div>
              </div>
              <div class="slot-picker">
                <el-time-select v-model="newStart" start="00:00" end="23:00" step="01:00" placeholder="开始" size="small" style="width: 104px" />
                <span class="picker-sep">–</span>
                <el-time-select v-model="newEnd" start="00:00" end="23:00" step="01:00" placeholder="结束" size="small" style="width: 104px" />
                <el-button size="small" type="primary" plain :icon="Plus" @click="addDefaultSlot">添加时段</el-button>
              </div>
              <div class="form-tip">默认可接单时段 = 每天默认开放的整点区间，一段 = 一个名额；只能选整点，起止随意（如 18:00 - 19:00）。某天要单独调整请到「档期管理」。</div>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :lg="8">
            <el-form-item label="预约窗口">
              <el-input-number v-model="form.bookingWindowDays" :min="7" :max="365" style="width: 150px" />
              <div class="form-tip">用户最多可预约未来 N 天内的表演</div>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :lg="8">
            <el-form-item label="支付时限">
              <el-input-number v-model="form.payExpireMinutes" :min="1" :max="120" style="width: 150px" />
              <div class="form-tip">下单后 N 分钟内未支付自动取消（分钟）</div>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :lg="8">
            <el-form-item label="定制文字价格">
              <el-input-number v-model="form.customTextPrice" :min="0" :max="100000" :step="100" style="width: 150px" />
              <div class="form-tip">空中文字定制加价（元，最多 10 字）</div>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :lg="8">
            <el-form-item label="LOGO 定制价格">
              <el-input-number v-model="form.customLogoPrice" :min="0" :max="100000" :step="100" style="width: 150px" />
              <div class="form-tip">LOGO / 图片定制加价（元）</div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 计价规则总览（字典驱动，只读） -->
    <div class="card">
      <div class="card-head">
        <h3 class="card-title">计价规则总览<span class="sub">由字典驱动，此处只读</span></h3>
        <el-button type="primary" plain size="small" @click="$router.push('/system/dict')">前往字典管理维护</el-button>
      </div>
      <el-row :gutter="24">
        <el-col :xs="24" :md="12">
          <h4 class="section-title">架次档位（字典：drone_tier）</h4>
          <el-table :data="pricing.tiers" border size="small">
            <el-table-column label="档位" width="110">
              <template #default="{ row }">{{ row.drones }} 架</template>
            </el-table-column>
            <el-table-column label="基础价" width="120">
              <template #default="{ row }"><span class="amount-text">{{ fmtMoney(row.price) }}</span></template>
            </el-table-column>
            <el-table-column prop="desc" label="适用场景" min-width="170" />
          </el-table>

          <h4 class="section-title">表演时长（字典：duration）</h4>
          <el-table :data="pricing.durations" border size="small">
            <el-table-column prop="label" label="时长" width="170" />
            <el-table-column label="加价">
              <template #default="{ row }">{{ row.extra > 0 ? '+' + fmtMoney(row.extra) : '含在基础价内' }}</template>
            </el-table-column>
          </el-table>
        </el-col>

        <el-col :xs="24" :md="12">
          <h4 class="section-title">图案 / 时段（字典：pattern / time_slot）</h4>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="预设图案">
              <el-tag v-for="p in pricing.patterns" :key="p.key" size="small" effect="plain" style="margin-right: 6px">
                {{ p.label }}
              </el-tag>
              <span class="cell-sub">（任选，不加价）</span>
            </el-descriptions-item>
            <el-descriptions-item label="演出时段">{{ (pricing.timeSlots || []).join(' / ') }}</el-descriptions-item>
          </el-descriptions>

          <h4 class="section-title">附加服务（字典：addon）</h4>
          <el-table :data="pricing.addons" border size="small">
            <el-table-column prop="label" label="服务" min-width="170" />
            <el-table-column label="加价" width="130">
              <template #default="{ row }">+{{ fmtMoney(row.price) }}</template>
            </el-table-column>
          </el-table>
        </el-col>
      </el-row>
    </div>

    <!-- 退款阶梯（字典驱动，只读） -->
    <div class="card">
      <div class="card-head">
        <h3 class="card-title">退款阶梯规则<span class="sub">字典：refund_rule；订单未接单可申请全额退款，已接单按下表试算</span></h3>
        <el-button type="primary" plain size="small" @click="$router.push('/system/dict')">前往字典管理维护</el-button>
      </div>
      <el-table :data="refundRules" border size="small" style="max-width: 640px">
        <el-table-column label="距表演时间" min-width="200">
          <template #default="{ row }">{{ row.label.split('，')[0] }}</template>
        </el-table-column>
        <el-table-column label="退款比例" width="140">
          <template #default="{ row }">
            <el-tag :type="row.ratio >= 0.9 ? 'success' : row.ratio > 0 ? 'warning' : 'danger'">
              {{ row.ratio > 0 ? Math.round(row.ratio * 100) + '%' : '不可退款' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 危险操作 -->
    <div class="card danger-card">
      <h3 class="card-title" style="color: #f56c6c">演示数据</h3>
      <p class="danger-desc">将订单、用户、档期、字典与配置全部恢复为初始种子数据，用于重新演示完整流程。该操作不可撤销。</p>
      <el-button type="danger" :loading="resetting" @click="resetData">重置演示数据</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Close, Plus } from '@element-plus/icons-vue'
import { DEFAULT_SLOTS, fmtSlot } from '../../utils/slot'
import request from '../../utils/request'
import { fmtMoney } from '../../utils/format'

const loading = ref(false)
const saving = ref(false)
const resetting = ref(false)
const form = ref({ defaultSlots: DEFAULT_SLOTS.slice(), bookingWindowDays: 60, payExpireMinutes: 15, customTextPrice: 0, customLogoPrice: 0 })
const newStart = ref('')
const newEnd = ref('')

/** 删除默认时段 */
function removeDefaultSlot(t) {
  form.value.defaultSlots = form.value.defaultSlots.filter(x => x !== t)
}

/** 添加默认时段：整点起止（el-time-select step 1 小时，选不出半点值） */
function addDefaultSlot() {
  const a = newStart.value
  const b = newEnd.value
  if (!a || !b) return ElMessage.warning('请选择开始与结束时间')
  if (a >= b) return ElMessage.warning('结束时间要晚于开始时间')
  const id = `${a}-${b}`
  if (form.value.defaultSlots.includes(id)) return ElMessage.warning('该时段已在列表里')
  if (form.value.defaultSlots.length >= 12) return ElMessage.warning('最多 12 个时段')
  form.value.defaultSlots = [...form.value.defaultSlots, id].sort()
  newStart.value = ''
  newEnd.value = ''
}
const pricing = ref({})
const refundRules = ref([])

async function load() {
  loading.value = true
  try {
    const [cfg, p] = await Promise.all([
      request.get('/admin/config'),
      request.get('/config/pricing')
    ])
    form.value = {
      defaultSlots: cfg.defaultSlots || DEFAULT_SLOTS.slice(),
      bookingWindowDays: cfg.bookingWindowDays,
      payExpireMinutes: cfg.payExpireMinutes,
      customTextPrice: cfg.customTextPrice,
      customLogoPrice: cfg.customLogoPrice
    }
    pricing.value = p.priceRules || {}
    refundRules.value = p.refundRules || []
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    if (!form.value.defaultSlots || !form.value.defaultSlots.length) {
      ElMessage.warning('默认可接单时段至少保留一个')
      return
    }
    await request.put('/admin/config', form.value)
    ElMessage.success('配置已保存，H5 端实时生效')
    load()
  } finally {
    saving.value = false
  }
}

async function resetData() {
  await ElMessageBox.confirm(
    '确认重置演示数据？当前所有订单、字典与配置将被种子数据覆盖。',
    '重置确认',
    { confirmButtonText: '确认重置', cancelButtonText: '取消', type: 'warning' }
  )
  resetting.value = true
  try {
    await request.post('/config/reset')
    await ElMessageBox.alert('演示数据已重置，建议刷新页面查看最新数据。', '重置成功', {
      confirmButtonText: '刷新页面',
      type: 'success'
    })
    location.reload()
  } finally {
    resetting.value = false
  }
}

load()
</script>

<style scoped>
.cell-sub {
  font-size: 12px;
  color: #909399;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
  margin-top: 4px;
}

.cfg-form :deep(.el-form-item) {
  margin-bottom: 22px;
}

.danger-card {
  border: 1px solid #fde2e2;
}

.danger-desc {
  font-size: 13px;
  color: #909399;
  margin: 0 0 14px;
}

/* 默认可接单时段：条目式（选好即渲染，可随意增删），起止用整点选择器 */
.slot-list { display: flex; flex-direction: column; gap: 8px; margin: 4px 0 10px; width: 100%; }
.slot-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid #e4e7ed; border-radius: 6px; background: #fafbfc; }
.slot-item .slot-time { font-size: 14px; font-weight: 600; color: #303133; letter-spacing: .2px; }
.slot-item .el-button { margin-left: auto; }
.slot-empty { font-size: 13px; color: #909399; padding: 8px 10px; border: 1px dashed #dcdfe6; border-radius: 6px; }
.slot-picker { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.slot-picker .picker-sep { color: #909399; }
</style>
