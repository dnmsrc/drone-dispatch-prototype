<template>
  <div class="page">
    <!-- 搜索栏 -->
    <div class="card search-card">
      <el-form :inline="true" @submit.prevent>
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            placeholder="订单号 / 手机号 / 昵称"
            clearable
            style="width: 220px"
            @keyup.enter="load(1)"
          />
        </el-form-item>
        <el-form-item label="订单状态">
          <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 170px">
            <el-option v-for="(v, k) in STATUS_MAP" :key="k" :label="v.text" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="表演日期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 260px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="load(1)">查询</el-button>
          <el-button :icon="Refresh" @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 订单表格 -->
    <div class="card">
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="id" label="订单号" min-width="150" />
        <el-table-column label="用户" min-width="130">
          <template #default="{ row }">
            <div>{{ row.user?.nickname }}</div>
            <div class="cell-sub">{{ row.user?.phone }}</div>
          </template>
        </el-table-column>
        <el-table-column label="方案摘要" min-width="170">
          <template #default="{ row }">{{ orderSummary(row) }}</template>
        </el-table-column>
        <el-table-column label="表演日期 / 时段" width="150">
          <template #default="{ row }">
            <div>{{ row.performDate }}</div>
            <div class="cell-sub">{{ row.timeSlot }}</div>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="120">
          <template #default="{ row }"><span class="amount-text">{{ fmtMoney(row.totalAmount) }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }"><StatusTag :status="row.status" /></template>
        </el-table-column>
        <el-table-column label="创建时间" width="150">
          <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
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

    <!-- 详情抽屉 -->
    <el-drawer v-model="drawer" size="620px" :title="detail ? `订单详情 ${detail.id}` : '订单详情'">
      <div v-if="detail" v-loading="detailLoading" class="drawer-body">
        <h4 class="section-title">基本信息</h4>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="订单号" :span="2">{{ detail.id }}</el-descriptions-item>
          <el-descriptions-item label="订单状态"><StatusTag :status="detail.status" /></el-descriptions-item>
          <el-descriptions-item label="下单时间">{{ fmtTime(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="用户">{{ detail.user?.nickname }}（{{ detail.user?.phone }}）</el-descriptions-item>
          <el-descriptions-item label="场次场合">{{ detail.occasion || '—' }}</el-descriptions-item>
          <el-descriptions-item label="表演时间">{{ detail.performDate }} {{ detail.timeSlot }}</el-descriptions-item>
          <el-descriptions-item label="联系人">{{ detail.contact?.name }} {{ detail.contact?.phone }}</el-descriptions-item>
          <el-descriptions-item label="表演场地" :span="2">
            {{ detail.venue?.name }}
            <span class="cell-sub">（{{ VENUE_TYPE_LABELS[detail.venue?.type] || '其他' }} · {{ detail.venue?.address }}）</span>
          </el-descriptions-item>
          <el-descriptions-item v-if="detail.cancelReason" label="取消原因" :span="2">{{ detail.cancelReason }}</el-descriptions-item>
        </el-descriptions>

        <h4 class="section-title">方案明细</h4>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="投入规模">{{ detail.droneCount }} 架</el-descriptions-item>
          <el-descriptions-item label="表演时长">{{ detail.duration }} 分钟</el-descriptions-item>
          <el-descriptions-item label="预设图案">{{ patternsText(detail.patternPreset) }}</el-descriptions-item>
          <el-descriptions-item label="定制文字">{{ detail.customText || '—' }}</el-descriptions-item>
          <el-descriptions-item label="LOGO 定制" :span="2">{{ detail.customLogo || '—' }}</el-descriptions-item>
          <el-descriptions-item label="附加服务" :span="2">{{ addonsText(detail.addons) }}</el-descriptions-item>
        </el-descriptions>

        <h4 class="section-title">价格明细</h4>
        <div class="price-list">
          <div v-for="(p, i) in detail.priceDetail" :key="i" class="price-row">
            <span>{{ p.label }}</span>
            <span>{{ fmtMoney(p.amount) }}</span>
          </div>
          <div class="price-row total">
            <span>订单合计</span>
            <span class="amount-text">{{ fmtMoney(detail.totalAmount) }}</span>
          </div>
        </div>

        <template v-if="detail.paidAt">
          <h4 class="section-title">支付信息</h4>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="支付方式">{{ PAY_CHANNEL_LABELS[detail.payChannel] || detail.payChannel }}</el-descriptions-item>
            <el-descriptions-item label="支付时间">{{ fmtTime(detail.paidAt) }}</el-descriptions-item>
            <el-descriptions-item label="交易流水号" :span="2">{{ detail.payTradeNo }}</el-descriptions-item>
          </el-descriptions>
        </template>

        <template v-if="detail.refund">
          <h4 class="section-title">退款信息</h4>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="退款原因" :span="2">{{ detail.refund.reason }}</el-descriptions-item>
            <el-descriptions-item label="试算金额">{{ fmtMoney(detail.refund.applyAmount) }}（{{ Math.round((detail.refund.ratio || 0) * 100) }}%）</el-descriptions-item>
            <el-descriptions-item label="审批状态">
              <el-tag :type="REFUND_STATUS_MAP[detail.refund.status]?.type || 'info'" size="small">
                {{ REFUND_STATUS_MAP[detail.refund.status]?.text || detail.refund.status }}
              </el-tag>
            </el-descriptions-item>
            <template v-if="detail.refund.status !== 'PENDING'">
              <el-descriptions-item label="实退金额">{{ fmtMoney(detail.refund.refundAmount) }}</el-descriptions-item>
              <el-descriptions-item label="退款流水号">{{ detail.refund.refundNo || '—' }}</el-descriptions-item>
              <el-descriptions-item label="审批人">{{ detail.refund.auditBy || '—' }}</el-descriptions-item>
              <el-descriptions-item label="审批时间">{{ fmtTime(detail.refund.auditedAt) }}</el-descriptions-item>
              <el-descriptions-item label="审批备注" :span="2">{{ detail.refund.auditNote || '—' }}</el-descriptions-item>
            </template>
          </el-descriptions>
        </template>

        <template v-if="detail.media?.photos?.length">
          <h4 class="section-title">现场回传</h4>
          <div class="media-grid">
            <el-image
              v-for="(p, i) in detail.media.photos"
              :key="i"
              :src="p"
              :preview-src-list="detail.media.photos"
              :initial-index="i"
              fit="cover"
              class="media-img"
            />
            <div v-for="(v, i) in detail.media.videos" :key="'v' + i" class="media-video">
              <el-icon :size="22"><VideoPlay /></el-icon>
              <span>视频回传（演示）</span>
            </div>
          </div>
        </template>

        <h4 class="section-title">状态时间线</h4>
        <el-timeline class="timeline">
          <el-timeline-item
            v-for="(t, i) in detail.timeline"
            :key="i"
            :timestamp="fmtTime(t.time)"
            :type="i === detail.timeline.length - 1 ? 'primary' : ''"
          >
            {{ t.text }}
          </el-timeline-item>
        </el-timeline>
      </div>

      <template #footer v-if="detail">
        <div class="drawer-footer">
          <template v-if="detail.status === 'PENDING_ACCEPT'">
            <el-button type="primary" :loading="acting" @click="doAccept">接单</el-button>
            <el-button type="danger" plain :loading="acting" @click="rejectDialog = true">拒单</el-button>
          </template>
          <el-button v-else-if="detail.status === 'ACCEPTED'" type="primary" :loading="acting" @click="doStart">
            开始执行
          </el-button>
          <el-button v-else-if="detail.status === 'IN_SERVICE'" type="success" :loading="acting" @click="openComplete">
            完成订单
          </el-button>
          <span v-else class="cell-sub">当前状态无可执行操作</span>
        </div>
      </template>
    </el-drawer>

    <!-- 拒单弹窗 -->
    <el-dialog v-model="rejectDialog" title="拒单确认" width="440px" destroy-on-close>
      <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 14px"
        title="拒单后系统将按 100% 自动全额退款，订单直接变为「已退款」。" />
      <el-form label-position="top">
        <el-form-item label="拒单原因（必填）" required>
          <el-input v-model="rejectReason" type="textarea" :rows="3" maxlength="100" show-word-limit
            placeholder="例如：该场地位于航线管制区，无法执行飞行" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDialog = false">取消</el-button>
        <el-button type="danger" :loading="acting" @click="doReject">确认拒单并退款</el-button>
      </template>
    </el-dialog>

    <!-- 完成订单弹窗 -->
    <el-dialog v-model="completeDialog" title="完成订单 · 回传现场照片/视频" width="560px" destroy-on-close>
      <el-form label-position="top">
        <el-form-item label="照片 URL 列表（可编辑）">
          <div v-for="(p, i) in completeForm.photos" :key="i" class="photo-row">
            <el-input v-model="completeForm.photos[i]" placeholder="https://... 或 /api/media/photo/xxx" clearable />
            <el-button :icon="Delete" circle plain type="danger" @click="completeForm.photos.splice(i, 1)" />
          </div>
          <el-button :icon="Plus" plain size="small" @click="completeForm.photos.push('')">添加一行</el-button>
        </el-form-item>
        <el-form-item label="视频 URL（可编辑）">
          <el-input v-model="completeForm.videos[0]" placeholder="视频地址（演示版为占位）" clearable />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="success" plain :loading="acting" @click="autoComplete">自动生成演示照片并提交</el-button>
        <el-button @click="completeDialog = false">取消</el-button>
        <el-button type="primary" :loading="acting" @click="doComplete">提交完成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Plus, Delete, VideoPlay } from '@element-plus/icons-vue'
import request from '../../utils/request'
import StatusTag from '../../components/StatusTag.vue'
import {
  STATUS_MAP, REFUND_STATUS_MAP, VENUE_TYPE_LABELS, PAY_CHANNEL_LABELS,
  fmtMoney, fmtTime, orderSummary, addonsText, patternsText
} from '../../utils/format'

const loading = ref(false)
const list = ref([])
const total = ref(0)
const dateRange = ref(null)
const query = reactive({ keyword: '', status: '', page: 1, size: 10 })

const drawer = ref(false)
const detail = ref(null)
const detailLoading = ref(false)
const acting = ref(false)

const rejectDialog = ref(false)
const rejectReason = ref('')

const completeDialog = ref(false)
const completeForm = reactive({ photos: [''], videos: [''] })

async function load(page) {
  if (page) query.page = page
  loading.value = true
  try {
    const params = { page: query.page, size: query.size }
    if (query.keyword) params.keyword = query.keyword
    if (query.status) params.status = query.status
    if (dateRange.value?.[0]) params.dateFrom = dateRange.value[0]
    if (dateRange.value?.[1]) params.dateTo = dateRange.value[1]
    const data = await request.get('/admin/orders', { params })
    list.value = data.list
    total.value = data.total
  } finally {
    loading.value = false
  }
}

function reset() {
  query.keyword = ''
  query.status = ''
  dateRange.value = null
  load(1)
}

async function openDetail(row) {
  drawer.value = true
  detailLoading.value = true
  try {
    const data = await request.get(`/admin/orders/${row.id}`)
    detail.value = data.order
  } finally {
    detailLoading.value = false
  }
}

async function refreshDetail() {
  const data = await request.get(`/admin/orders/${detail.value.id}`)
  detail.value = data.order
}

async function afterAction(msg) {
  ElMessage.success(msg)
  await Promise.all([load(), refreshDetail()])
}

async function doAccept() {
  await ElMessageBox.confirm('确认接单？接单后订单进入「已接单·待执行」状态。', '接单确认', {
    confirmButtonText: '确认接单',
    cancelButtonText: '取消',
    type: 'warning'
  })
  acting.value = true
  try {
    const data = await request.post(`/admin/orders/${detail.value.id}/accept`)
    await afterAction(data ? '已接单' : '已接单')
  } finally {
    acting.value = false
  }
}

async function doReject() {
  if (!rejectReason.value.trim()) {
    ElMessage.warning('请填写拒单原因')
    return
  }
  acting.value = true
  try {
    await request.post(`/admin/orders/${detail.value.id}/reject`, { reason: rejectReason.value.trim() })
    rejectDialog.value = false
    rejectReason.value = ''
    await afterAction('已拒单并全额退款')
  } finally {
    acting.value = false
  }
}

async function doStart() {
  await ElMessageBox.confirm('确认表演开始执行？订单将进入「执行中」状态。', '开始执行', {
    confirmButtonText: '开始执行',
    cancelButtonText: '取消',
    type: 'warning'
  })
  acting.value = true
  try {
    await request.post(`/admin/orders/${detail.value.id}/start`)
    await afterAction('表演已开始执行')
  } finally {
    acting.value = false
  }
}

function openComplete() {
  completeForm.photos = detail.value.media?.photos?.length ? [...detail.value.media.photos] : ['', '']
  completeForm.videos = detail.value.media?.videos?.length ? [...detail.value.media.videos] : ['']
  completeDialog.value = true
}

async function submitComplete(photos, videos) {
  acting.value = true
  try {
    await request.post(`/admin/orders/${detail.value.id}/complete`, { photos, videos })
    completeDialog.value = false
    await afterAction('订单已完成，现场照片已回传')
  } finally {
    acting.value = false
  }
}

function doComplete() {
  const photos = completeForm.photos.map((s) => s.trim()).filter(Boolean)
  const videos = completeForm.videos.map((s) => s.trim()).filter(Boolean)
  submitComplete(photos, videos)
}

function autoComplete() {
  const id = detail.value.id
  const photos = [1, 2, 3, 4].map((i) => `/api/media/photo/${id}-${i}`)
  const videos = [`/api/media/video/${id}-1`]
  completeForm.photos = [...photos]
  completeForm.videos = [...videos]
  submitComplete(photos, videos)
}

load()
</script>

<style scoped>
.cell-sub {
  font-size: 12px;
  color: #909399;
}

.drawer-body {
  padding-bottom: 8px;
}

.drawer-footer {
  display: flex;
  gap: 10px;
  align-items: center;
}

.media-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.media-img {
  width: 128px;
  height: 80px;
  border-radius: 4px;
  border: 1px solid #ebeef5;
}

.media-video {
  width: 128px;
  height: 80px;
  border-radius: 4px;
  border: 1px dashed #c0c4cc;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
  font-size: 12px;
  gap: 4px;
}

.photo-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  width: 100%;
}

.timeline {
  padding-left: 2px;
}
</style>
