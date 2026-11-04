<template>
  <div class="page" v-loading="loading">
    <!-- 统计卡片 -->
    <el-row :gutter="16">
      <el-col v-for="c in cards" :key="c.label" :xs="12" :sm="12" :md="8" :lg="4" style="flex: 1">
        <div class="stat-card" :class="{ 'stat-card-link': c.path }" @click="openStat(c)">
          <div class="stat-icon" :style="{ background: c.bg, color: c.color }">
            <el-icon :size="26"><component :is="c.icon" /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ c.value }}</div>
            <div class="stat-label">{{ c.label }}</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 图表 -->
    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :xs="24" :md="16">
        <div class="card" style="margin-bottom: 0">
          <h3 class="card-title">近 7 日订单趋势<span class="sub">订单量与营收走势</span></h3>
          <div ref="trendRef" class="chart"></div>
        </div>
      </el-col>
      <el-col :xs="24" :md="8">
        <div class="card" style="margin-bottom: 0">
          <h3 class="card-title">架次营收分布<span class="sub">按架次档位统计</span></h3>
          <div ref="pieRef" class="chart"></div>
        </div>
      </el-col>
    </el-row>

    <!-- 最新订单 -->
    <div class="card" style="margin-top: 16px">
      <h3 class="card-title">
        最新订单
        <el-button link type="primary" @click="$router.push('/order/list')">查看全部</el-button>
      </h3>
      <el-table :data="latest" stripe>
        <el-table-column prop="id" label="订单号" min-width="150" />
        <el-table-column label="用户" min-width="130">
          <template #default="{ row }">{{ row.user?.nickname || '—' }}</template>
        </el-table-column>
        <el-table-column label="金额" width="120">
          <template #default="{ row }"><span class="amount-text">{{ fmtMoney(row.totalAmount) }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><StatusTag :status="row.status" /></template>
        </el-table-column>
        <el-table-column prop="performDate" label="表演日期" width="120">
          <template #default="{ row }">{{ row.performDate }} {{ row.timeSlot }}</template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import request from '../../utils/request'
import StatusTag from '../../components/StatusTag.vue'
import { fmtMoney } from '../../utils/format'

const loading = ref(false)
const stats = ref({})
const latest = ref([])
const trend = ref([])
const tierDist = ref([])

const trendRef = ref()
const pieRef = ref()
let trendChart = null
let pieChart = null

const cards = computed(() => [
  { label: '今日订单', value: stats.value.todayOrders ?? 0, icon: 'ShoppingCart', color: '#409EFF', bg: '#ecf5ff' },
  { label: '待接单', value: stats.value.pendingAccept ?? 0, icon: 'BellFilled', color: '#F56C6C', bg: '#fef0f0' },
  { label: '待执行', value: stats.value.toExecute ?? 0, icon: 'VideoPlay', color: '#8B5CF6', bg: '#f3effe' },
  { label: '本月营收', value: fmtMoney(stats.value.monthRevenue ?? 0), icon: 'Money', color: '#67C23A', bg: '#f0f9eb' },
  { label: '退款待审批', value: stats.value.pendingRefunds ?? 0, icon: 'RefreshLeft', color: '#E6A23C', bg: '#fdf6ec' },
  {
    label: '待接待咨询单',
    value: stats.value.pendingConsults ?? 0,
    icon: 'ChatDotRound',
    color: '#13C2C2',
    bg: '#e6fffb',
    path: '/consult'
  }
])

// 待办卡片可点击跳转（咨询受理工作台）
const router = useRouter()
function openStat(c) {
  if (c.path) router.push(c.path)
}

function renderCharts() {
  if (trendRef.value) {
    trendChart = echarts.init(trendRef.value)
    trendChart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['订单数', '营收'], bottom: 0 },
      grid: { left: 50, right: 60, top: 30, bottom: 40 },
      xAxis: {
        type: 'category',
        data: trend.value.map((d) => d.date.slice(5)),
        axisLine: { lineStyle: { color: '#dcdfe6' } }
      },
      yAxis: [
        { type: 'value', name: '订单数', minInterval: 1, splitLine: { lineStyle: { color: '#f0f2f5' } } },
        {
          type: 'value',
          name: '营收(¥)',
          splitLine: { show: false },
          axisLabel: { formatter: (v) => (v >= 10000 ? v / 10000 + 'w' : v) }
        }
      ],
      series: [
        {
          name: '订单数',
          type: 'line',
          smooth: true,
          data: trend.value.map((d) => d.orders),
          itemStyle: { color: '#409EFF' },
          areaStyle: { color: 'rgba(64,158,255,0.12)' }
        },
        {
          name: '营收',
          type: 'line',
          smooth: true,
          yAxisIndex: 1,
          data: trend.value.map((d) => d.revenue),
          itemStyle: { color: '#67C23A' },
          areaStyle: { color: 'rgba(103,194,58,0.10)' }
        }
      ]
    })
  }
  if (pieRef.value) {
    pieChart = echarts.init(pieRef.value)
    pieChart.setOption({
      tooltip: {
        trigger: 'item',
        formatter: (p) => `${p.name}<br/>营收：¥${Number(p.value).toLocaleString('zh-CN')}（${p.percent}%）`
      },
      legend: { bottom: 0, itemWidth: 12, itemHeight: 12, textStyle: { fontSize: 12 } },
      color: ['#409EFF', '#67C23A', '#E6A23C', '#8B5CF6', '#13C2C2'],
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '44%'],
          label: { formatter: '{b}' },
          data: tierDist.value.filter((d) => d.value > 0)
        }
      ]
    })
  }
}

function onResize() {
  trendChart?.resize()
  pieChart?.resize()
}

async function load() {
  loading.value = true
  try {
    const data = await request.get('/admin/dashboard')
    stats.value = data.stats
    trend.value = data.trend
    tierDist.value = data.tierDist
    latest.value = data.latest
    await nextTick()
    trendChart?.dispose()
    pieChart?.dispose()
    renderCharts()
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  trendChart?.dispose()
  pieChart?.dispose()
})
</script>

<style scoped>
.stat-card {
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  padding: 18px 16px;
  display: flex;
  align-items: center;
  margin-bottom: 0;
}

/* 可点击的待办卡片：鼠标手型 + 悬停加深阴影 */
.stat-card-link {
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.stat-card-link:hover {
  box-shadow: 0 3px 10px rgba(0, 21, 41, 0.16);
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-info {
  margin-left: 14px;
  min-width: 0;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}

.chart {
  height: 320px;
  width: 100%;
}
</style>
