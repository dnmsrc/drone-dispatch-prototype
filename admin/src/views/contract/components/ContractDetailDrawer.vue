<template>
  <el-drawer v-model="visible" size="640px" :title="contract ? `合同详情 ${contract.contractNo}` : '合同详情'">
    <div v-if="contract" v-loading="loading" class="drawer-body">
      <!-- 状态与闸门提示 -->
      <el-alert
        v-if="actions.blockedReason"
        :title="actions.blockedReason"
        type="warning"
        :closable="false"
        show-icon
        class="tip"
      />

      <h4 class="section-title">订单摘要</h4>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="订单号" :span="2">{{ contract.order.orderNo }}</el-descriptions-item>
        <el-descriptions-item label="订单状态">
          <StatusTag :status="contract.order.status" />
        </el-descriptions-item>
        <el-descriptions-item label="表演日期">{{ contract.order.performDate }} {{ contract.order.timeSlot || '' }}</el-descriptions-item>
        <el-descriptions-item label="投入规模">{{ contract.order.droneCount }} 架 · {{ contract.order.duration }} 分钟</el-descriptions-item>
        <el-descriptions-item label="表演场地" :span="2">{{ contract.order.venueName || '—' }}</el-descriptions-item>
      </el-descriptions>

      <h4 class="section-title">签署状态与存档</h4>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="签署状态">
          <el-tag :type="signConf.type" :color="signConf.color" effect="light">{{ signConf.text }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="合同模板">{{ contract.templateCode }} {{ contract.templateVersion }}</el-descriptions-item>
        <el-descriptions-item label="甲方签署时间">{{ fmtTime(contract.partyASignedAt) }}</el-descriptions-item>
        <el-descriptions-item label="乙方盖章时间">{{ fmtTime(contract.partyBSignedAt) }}</el-descriptions-item>
        <el-descriptions-item label="生效时间" :span="2">{{ fmtTime(contract.signedAt) }}</el-descriptions-item>
        <el-descriptions-item label="已签 PDF" :span="2">
          <el-link v-if="contract.signedPdfUrl" type="primary" :href="contract.signedPdfUrl" target="_blank">
            {{ contract.signedPdfUrl }}
          </el-link>
          <span v-else class="cell-sub">暂未上传</span>
        </el-descriptions-item>
      </el-descriptions>

      <h4 class="section-title">甲乙双方</h4>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="甲方（客户）" :span="2">{{ contract.partyAName }}</el-descriptions-item>
        <el-descriptions-item label="联系人">{{ contract.partyAContact || '—' }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ contract.partyAPhone || '—' }}</el-descriptions-item>
        <el-descriptions-item label="证件类型">{{ contract.partyAIdType === 'ID_CARD' ? '身份证' : '统一社会信用代码' }}</el-descriptions-item>
        <el-descriptions-item label="证件号">{{ contract.partyAIdNo || '—' }}</el-descriptions-item>
        <el-descriptions-item label="乙方（承飞方）" :span="2">{{ contract.partyBName }}</el-descriptions-item>
        <el-descriptions-item label="统一社会信用代码" :span="2">{{ contract.partyBCreditCode }}</el-descriptions-item>
      </el-descriptions>

      <h4 class="section-title">金额与付款条款</h4>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="合同总额">
          <span class="amount-text">{{ fmtMoney(contract.totalAmount) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="已付总额">
          <span class="amount-text">{{ fmtMoney(paidAmount) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="付款条款" :span="2">{{ contract.paymentTerms }}</el-descriptions-item>
      </el-descriptions>

      <h4 class="section-title">分期付款计划</h4>
      <el-table :data="contract.schedules" border size="small" stripe>
        <el-table-column prop="installmentNo" label="期次" width="60" />
        <el-table-column prop="stageName" label="节点" min-width="110" />
        <el-table-column label="触发条件" min-width="150">
          <template #default="{ row }">
            <div>{{ row.triggerEvent }}</div>
            <div class="cell-sub">{{ row.dueDate ? '应付日 ' + row.dueDate : '按节点动态计算' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="应付" width="110">
          <template #default="{ row }">{{ fmtMoney(row.planAmount) }}</template>
        </el-table-column>
        <el-table-column label="实付" width="110">
          <template #default="{ row }">{{ fmtMoney(row.paidAmount) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="scheduleTag(row.status).type" size="small">{{ scheduleTag(row.status).text }}</el-tag>
          </template>
        </el-table-column>
      </el-table>

      <!-- 终止留痕 -->
      <template v-if="contract.signStatus === 'TERMINATED'">
        <h4 class="section-title">终止结算留痕</h4>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="责任方">
            <el-tag :type="contract.terminateResponsibility === 'VENDOR' ? 'danger' : 'warning'" size="small">
              {{ CONTRACT_RESPONSIBILITY_MAP[contract.terminateResponsibility]?.text || contract.terminateResponsibility }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="终止时间">{{ fmtTime(contract.terminatedAt) }}</el-descriptions-item>
          <el-descriptions-item label="终止原因" :span="2">{{ contract.terminateReason }}</el-descriptions-item>
          <el-descriptions-item label="关联退款单号" :span="2">
            <el-link v-if="contract.refundNo" type="primary">{{ contract.refundNo }}</el-link>
            <span v-else>—</span>
          </el-descriptions-item>
        </el-descriptions>
      </template>

      <!-- 改期留痕 -->
      <template v-if="contract.originalPerformDate">
        <h4 class="section-title">改期留痕</h4>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="表演日期变更" :span="2">
            <span class="strike">{{ contract.originalPerformDate }}</span>
            <el-icon class="arrow"><ArrowRight /></el-icon>
            <span class="amount-text">{{ contract.rescheduledPerformDate }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="责任方">
            {{ CONTRACT_RESPONSIBILITY_MAP[contract.rescheduleResponsibility]?.text || contract.rescheduleResponsibility }}
          </el-descriptions-item>
          <el-descriptions-item label="改期时间">{{ fmtTime(contract.rescheduledAt) }}</el-descriptions-item>
          <el-descriptions-item label="改期原因" :span="2">
            {{ contract.rescheduleReasonType ? RESCHEDULE_REASON_MAP[contract.rescheduleReasonType]?.text + '｜' : '' }}{{ contract.rescheduleReason }}
          </el-descriptions-item>
        </el-descriptions>
      </template>

      <!-- 作废留痕 -->
      <template v-if="contract.signStatus === 'VOID'">
        <h4 class="section-title">作废留痕</h4>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="作废原因">{{ contract.voidReason }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </div>
  </el-drawer>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'
import request from '../../../utils/request'
import StatusTag from '../../../components/StatusTag.vue'
import {
  fmtMoney,
  fmtTime,
  CONTRACT_SIGN_MAP,
  CONTRACT_RESPONSIBILITY_MAP,
  RESCHEDULE_REASON_MAP
} from '../../../utils/format'

const props = defineProps({ modelValue: Boolean, contractId: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const loading = ref(false)
const contract = ref(null)
const actions = ref({ canVoid: false, canTerminate: false, canReschedule: false, readonly: false, blockedReason: '' })

const signConf = computed(() => CONTRACT_SIGN_MAP[contract.value?.signStatus] || { text: contract.value?.signStatus })
const paidAmount = computed(() =>
  (contract.value?.schedules || []).reduce((sum, s) => sum + (Number(s.paidAmount) || 0), 0)
)

function scheduleTag(status) {
  return {
    PENDING: { text: '待付', type: 'info' },
    PARTIAL: { text: '部分支付', type: 'warning' },
    PAID: { text: '已付', type: 'success' },
    OVERDUE: { text: '逾期', type: 'danger' }
  }[status] || { text: status, type: 'info' }
}

async function open(id) {
  if (!id) return
  loading.value = true
  visible.value = true
  try {
    const data = await request.get(`/admin/contracts/${id}`)
    contract.value = data.contract
    actions.value = data.actions
  } finally {
    loading.value = false
  }
}

defineExpose({ open })
</script>

<style scoped>
.drawer-body {
  padding-bottom: 8px;
}
.section-title {
  margin: 18px 0 10px;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}
.section-title:first-child {
  margin-top: 4px;
}
.tip {
  margin-bottom: 14px;
}
.cell-sub {
  font-size: 12px;
  color: #909399;
}
.amount-text {
  color: #f56c6c;
  font-weight: 600;
}
.strike {
  text-decoration: line-through;
  color: #909399;
  margin-right: 8px;
}
.arrow {
  margin: 0 8px;
  color: #409eff;
}
</style>
