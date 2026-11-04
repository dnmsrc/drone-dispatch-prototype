<template>
  <div class="page">
    <div class="card">
      <el-tabs v-model="tab" @tab-change="load">
        <el-tab-pane label="待审批" name="PENDING" />
        <el-tab-pane label="已通过" name="APPROVED" />
        <el-tab-pane label="已拒绝" name="REJECTED" />
        <el-tab-pane label="全部" name="ALL" />
      </el-tabs>

      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="id" label="订单号" min-width="150" />
        <el-table-column label="用户" min-width="120">
          <template #default="{ row }">
            <div>{{ row.user?.nickname }}</div>
            <div class="cell-sub">{{ row.user?.phone }}</div>
          </template>
        </el-table-column>
        <el-table-column label="订单金额" width="120">
          <template #default="{ row }">{{ fmtMoney(row.totalAmount) }}</template>
        </el-table-column>
        <el-table-column label="试算金额" width="170">
          <template #default="{ row }">
            <span class="amount-text">{{ fmtMoney(row.refund?.applyAmount) }}</span>
            <el-tag size="small" effect="plain" style="margin-left: 6px">
              {{ Math.round((row.refund?.ratio || 0) * 100) }}%
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="退款原因" min-width="200">
          <template #default="{ row }">
            <el-tooltip :content="row.refund?.reason" placement="top" :show-after="300">
              <span class="reason-text">{{ row.refund?.reason }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="150">
          <template #default="{ row }">{{ fmtTime(row.refund?.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="REFUND_STATUS_MAP[row.refund?.status]?.type || 'info'">
              {{ REFUND_STATUS_MAP[row.refund?.status]?.text || row.refund?.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="auth.isAdmin && row.refund?.status === 'PENDING'"
              link
              type="primary"
              @click="openAudit(row)"
            >审批</el-button>
            <el-tooltip v-else-if="row.refund?.status !== 'PENDING'" :content="auditTip(row)" placement="top">
              <span class="cell-sub">已处理</span>
            </el-tooltip>
            <span v-else class="cell-sub">仅管理员可审批</span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !list.length" description="暂无退款记录" />
    </div>

    <!-- 审批弹窗 -->
    <el-dialog v-model="auditDialog" title="退款审批" width="520px" destroy-on-close>
      <template v-if="current">
        <el-descriptions :column="2" border size="small" style="margin-bottom: 16px">
          <el-descriptions-item label="订单号" :span="2">{{ current.id }}</el-descriptions-item>
          <el-descriptions-item label="订单金额">{{ fmtMoney(current.totalAmount) }}</el-descriptions-item>
          <el-descriptions-item label="试算金额">
            <span class="amount-text">{{ fmtMoney(current.refund?.applyAmount) }}</span>
            （{{ Math.round((current.refund?.ratio || 0) * 100) }}%）
          </el-descriptions-item>
          <el-descriptions-item label="退款原因" :span="2">{{ current.refund?.reason }}</el-descriptions-item>
        </el-descriptions>

        <el-radio-group v-model="mode" style="margin-bottom: 16px">
          <el-radio-button value="approve">批准退款</el-radio-button>
          <el-radio-button value="reject">拒绝退款</el-radio-button>
        </el-radio-group>

        <el-form v-if="mode === 'approve'" label-position="top">
          <el-form-item :label="`实际退款金额（0 ~ ${fmtMoney(current.totalAmount)}）`">
            <el-input-number
              v-model="approveForm.amount"
              :min="1"
              :max="current.totalAmount"
              :step="100"
              style="width: 220px"
            />
            <span class="cell-sub" style="margin-left: 10px">默认按试算金额退款，可调整</span>
          </el-form-item>
          <el-form-item label="审批备注">
            <el-input v-model="approveForm.note" placeholder="同意退款" maxlength="50" />
          </el-form-item>
        </el-form>

        <el-form v-else label-position="top">
          <el-form-item label="拒绝理由（必填）" required>
            <el-input
              v-model="rejectForm.note"
              type="textarea"
              :rows="3"
              maxlength="100"
              show-word-limit
              placeholder="拒绝后订单将回到申请前状态，理由对用户可见"
            />
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="auditDialog = false">取消</el-button>
        <el-button v-if="mode === 'approve'" type="primary" :loading="acting" @click="doApprove">批准退款</el-button>
        <el-button v-else type="danger" :loading="acting" @click="doReject">拒绝退款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import request from '../../utils/request'
import { fmtMoney, fmtTime, REFUND_STATUS_MAP } from '../../utils/format'
import { useAuthStore } from '../../store/auth'

const auth = useAuthStore()
const tab = ref('PENDING')
const loading = ref(false)
const list = ref([])

const auditDialog = ref(false)
const current = ref(null)
const mode = ref('approve')
const acting = ref(false)
const approveForm = reactive({ amount: 0, note: '' })
const rejectForm = reactive({ note: '' })

async function load() {
  loading.value = true
  try {
    const params = tab.value === 'ALL' ? {} : { status: tab.value }
    const data = await request.get('/admin/refunds', { params })
    list.value = data.list
  } finally {
    loading.value = false
  }
}

function auditTip(row) {
  const r = row.refund || {}
  if (r.status === 'APPROVED') {
    return `实退 ${fmtMoney(r.refundAmount)}${r.refundNo ? ` · 流水号 ${r.refundNo}` : ''} · ${fmtTime(r.auditedAt)}`
  }
  return `拒绝理由：${r.auditNote || '—'} · ${fmtTime(r.auditedAt)}`
}

function openAudit(row) {
  current.value = row
  mode.value = 'approve'
  approveForm.amount = row.refund?.applyAmount || row.totalAmount
  approveForm.note = ''
  rejectForm.note = ''
  auditDialog.value = true
}

async function doApprove() {
  if (!(approveForm.amount > 0 && approveForm.amount <= current.value.totalAmount)) {
    ElMessage.warning(`退款金额需在 0 ~ ${fmtMoney(current.value.totalAmount)} 之间`)
    return
  }
  acting.value = true
  try {
    await request.post(`/admin/refunds/${current.value.id}/approve`, {
      amount: approveForm.amount,
      note: approveForm.note
    })
    ElMessage.success('退款已批准')
    auditDialog.value = false
    load()
  } finally {
    acting.value = false
  }
}

async function doReject() {
  if (!rejectForm.note.trim()) {
    ElMessage.warning('请填写拒绝理由')
    return
  }
  acting.value = true
  try {
    await request.post(`/admin/refunds/${current.value.id}/reject`, { note: rejectForm.note.trim() })
    ElMessage.success('已拒绝退款')
    auditDialog.value = false
    load()
  } finally {
    acting.value = false
  }
}

load()
</script>

<style scoped>
.cell-sub {
  font-size: 12px;
  color: #909399;
}

.reason-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
