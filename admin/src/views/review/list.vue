<template>
  <div class="page">
    <div class="card">
      <h3 class="card-title">评价管理<span class="sub">共 {{ list.length }} 条用户评价</span></h3>
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="orderId" label="订单号" min-width="150" />
        <el-table-column label="用户" min-width="130">
          <template #default="{ row }">
            <div class="user-cell">
              <el-avatar :size="28" :src="row.user?.avatar" />
              <span>{{ row.user?.nickname }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="星级" width="150">
          <template #default="{ row }">
            <el-rate :model-value="row.stars" disabled />
          </template>
        </el-table-column>
        <el-table-column label="评价内容" min-width="240">
          <template #default="{ row }">
            <el-tooltip :content="row.content" placement="top" :show-after="300">
              <span class="content-text">{{ row.content }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="关联场次" width="170">
          <template #default="{ row }">
            <div>{{ row.droneCount }} 架</div>
            <div class="cell-sub">{{ row.occasion || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="评价时间" width="160">
          <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !list.length" description="暂无评价" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import request from '../../utils/request'
import { fmtTime } from '../../utils/format'

const loading = ref(false)
const list = ref([])

async function load() {
  loading.value = true
  try {
    const data = await request.get('/admin/reviews')
    list.value = data.list
  } finally {
    loading.value = false
  }
}

load()
</script>

<style scoped>
.user-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cell-sub {
  font-size: 12px;
  color: #909399;
}

.content-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
