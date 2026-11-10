<template>
  <div class="page">
    <!-- 搜索栏 -->
    <div class="card search-card">
      <el-form :inline="true" @submit.prevent>
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            placeholder="合同号 / 订单号 / 甲方 / 电话"
            clearable
            style="width: 240px"
            @keyup.enter="load(1)"
          />
        </el-form-item>
        <el-form-item label="签署状态">
          <el-select v-model="query.signStatus" placeholder="全部状态" clearable style="width: 160px">
            <el-option v-for="(conf, key) in CONTRACT_SIGN_MAP" :key="key" :label="conf.text" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="load(1)">查询</el-button>
          <el-button :icon="Refresh" @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 合同表格 -->
    <div class="card">
      <el-table :data="list" v-loading="loading" stripe row-key="id">
        <el-table-column label="合同号 / 订单号" min-width="190">
          <template #default="{ row }">
            <div class="strong">{{ row.contractNo }}</div>
            <div class="cell-sub">{{ row.orderId }}</div>
          </template>
        </el-table-column>
        <el-table-column label="甲方" min-width="150">
          <template #default="{ row }">
            <div>{{ row.partyAName }}</div>
            <div class="cell-sub">{{ row.partyAPhone }}</div>
          </template>
        </el-table-column>
        <el-table-column label="合同金额" width="120">
          <template #default="{ row }"><span class="amount-text">{{ fmtMoney(row.totalAmount) }}</span></template>
        </el-table-column>
        <el-table-column label="付款进度" width="150">
          <template #default="{ row }">
            <div>{{ fmtMoney(paidOf(row)) }}</div>
            <div class="cell-sub">{{ paidStages(row) }}/{{ row.schedules.length }} 期{{ settled(row) ? ' · 已结清' : ' · 待付' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="签署状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="signMap(row.signStatus).type" :color="signMap(row.signStatus).color" size="small">
              {{ signMap(row.signStatus).text }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="表演日期" width="120">
          <template #default="{ row }">
            <span>{{ row.order?.performDate }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button v-if="row.signStatus === 'DRAFT'" link type="warning" @click="handleSubmitSign(row)">提交签署</el-button>
            <el-button v-if="row.signStatus === 'PENDING_SIGN'" link type="success" @click="openUpload(row)">上传签署件</el-button>
            <el-button v-if="row.actions?.canVoid" link type="info" @click="openVoid(row)">作废</el-button>
            <el-button v-if="row.actions?.canReschedule" link type="primary" @click="openReschedule(row)">改期</el-button>
            <el-button
              v-if="row.actions?.canTerminate && auth.isAdmin"
              link
              type="danger"
              @click="openTerminate(row)"
            >终止</el-button>
            <el-tooltip v-if="row.actions?.blockedReason" :content="row.actions.blockedReason" placement="top">
              <el-icon class="lock-icon"><Lock /></el-icon>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !list.length" description="暂无合同 —— 有效订单创建时会同步生成合同草稿" />

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

    <!-- 作废弹窗 -->
    <el-dialog v-model="voidDialog" :title="`作废合同 · ${actingRow?.contractNo || ''}`" width="480px" destroy-on-close>
      <el-alert
        v-if="actingRow"
        :title="paidOf(actingRow) > 0 ? '该合同已收款，不能作废，请改用终止' : '作废后合同自始不发生结算，关联订单将置为已取消'"
        :type="paidOf(actingRow) > 0 ? 'error' : 'info'"
        :closable="false"
        show-icon
        class="tip"
      />
      <el-form label-position="top">
        <el-form-item label="作废原因（必填）" required>
          <el-input v-model="voidReason" type="textarea" :rows="3" maxlength="200" show-word-limit
            placeholder="请填写作废原因，将记录在合同档案中" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="voidDialog = false">取消</el-button>
        <el-button type="info" :loading="acting" @click="doVoid">确认作废</el-button>
      </template>
    </el-dialog>

    <!-- 上传签署件弹窗 -->
    <el-dialog v-model="uploadDialog" :title="`上传签署件 · ${actingRow?.contractNo || ''}`" width="480px" destroy-on-close>
      <el-alert type="info" :closable="false" show-icon class="tip"
        title="一期不对接电子签平台：上传已签 PDF 即把合同置为「已签署」" />
      <el-form label-position="top">
        <el-form-item label="已签署合同 PDF 地址" required>
          <el-input v-model="pdfUrl" maxlength="255" placeholder="/api/media/contract/xxx.pdf（正式版走文件上传）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="uploadDialog = false">取消</el-button>
        <el-button type="success" :loading="acting" @click="doUpload">确认上传并签署</el-button>
      </template>
    </el-dialog>

    <!-- 终止 / 改期 / 详情 -->
    <TerminateDialog v-model="terminateDialog" :contract="actingRow" @done="afterAction" />
    <RescheduleDialog v-model="rescheduleDialog" :contract="actingRow" @done="afterAction" />
    <ContractDetailDrawer ref="detailRef" v-model="detailDrawer" />
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { Search, Refresh, Lock } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../../utils/request'
import { fmtMoney, CONTRACT_SIGN_MAP } from '../../utils/format'
import { useAuthStore } from '../../store/auth'
import TerminateDialog from './components/TerminateDialog.vue'
import RescheduleDialog from './components/RescheduleDialog.vue'
import ContractDetailDrawer from './components/ContractDetailDrawer.vue'

const auth = useAuthStore()
const loading = ref(false)
const acting = ref(false)
const list = ref([])
const total = ref(0)
const query = reactive({ keyword: '', signStatus: '', page: 1, size: 10 })

const voidDialog = ref(false)
const uploadDialog = ref(false)
const terminateDialog = ref(false)
const rescheduleDialog = ref(false)
const detailDrawer = ref(false)
const actingRow = ref(null)
const voidReason = ref('')
const pdfUrl = ref('')
const detailRef = ref(null)

function signMap(status) {
  return CONTRACT_SIGN_MAP[status] || { text: status }
}
function paidOf(row) {
  return (row.schedules || []).reduce((sum, s) => sum + (Number(s.paidAmount) || 0), 0)
}
function paidStages(row) {
  return (row.schedules || []).filter(s => s.status === 'PAID').length
}
function settled(row) {
  return row.schedules.length > 0 && paidStages(row) === row.schedules.length
}

async function load() {
  loading.value = true
  try {
    const params = { page: query.page, size: query.size }
    if (query.keyword) params.keyword = query.keyword
    if (query.signStatus) params.signStatus = query.signStatus
    const data = await request.get('/admin/contracts', { params })
    list.value = data.list
    total.value = data.total
  } finally {
    loading.value = false
  }
}

function reset() {
  query.keyword = ''
  query.signStatus = ''
  load(1)
}

async function afterAction() {
  await load()
}

function openDetail(row) {
  detailRef.value.open(row.id)
}

async function handleSubmitSign(row) {
  try {
    await ElMessageBox.confirm(`确认把合同「${row.contractNo}」提交签署？提交后等待客户回签。`, '提交签署', {
      confirmButtonText: '确认提交',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await request.post(`/admin/contracts/${row.id}/submit-sign`)
    ElMessage.success('已提交，等待客户回签/盖章')
    load()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.message || '操作失败')
  }
}

function openUpload(row) {
  actingRow.value = row
  pdfUrl.value = row.signedPdfUrl || ''
  uploadDialog.value = true
}
async function doUpload() {
  if (!pdfUrl.value.trim()) {
    ElMessage.warning('请填写已签署合同 PDF 的地址')
    return
  }
  acting.value = true
  try {
    await request.post(`/admin/contracts/${actingRow.value.id}/upload-pdf`, { pdfUrl: pdfUrl.value.trim() })
    ElMessage.success('签署件已上传，合同置为已签署')
    uploadDialog.value = false
    load()
  } finally {
    acting.value = false
  }
}

function openVoid(row) {
  actingRow.value = row
  voidReason.value = ''
  voidDialog.value = true
}
async function doVoid() {
  if (!voidReason.value.trim()) {
    ElMessage.warning('请填写作废原因')
    return
  }
  acting.value = true
  try {
    await request.post(`/admin/contracts/${actingRow.value.id}/void`, { voidReason: voidReason.value.trim() })
    ElMessage.success('合同已作废（无资金结算，关联订单已置为已取消）')
    voidDialog.value = false
    load()
  } finally {
    acting.value = false
  }
}

function openTerminate(row) {
  if (!auth.isAdmin) {
    ElMessage.warning('仅管理员可终止已生效合同')
    return
  }
  actingRow.value = row
  terminateDialog.value = true
}
function openReschedule(row) {
  actingRow.value = row
  rescheduleDialog.value = true
}

load()
</script>

<style scoped>
.cell-sub {
  font-size: 12px;
  color: #909399;
}
.strong {
  font-weight: 600;
  color: #303133;
}
.amount-text {
  color: #f56c6c;
  font-weight: 600;
}
.lock-icon {
  color: #c0c4cc;
  margin-left: 4px;
  cursor: help;
}
.tip {
  margin-bottom: 14px;
}
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
