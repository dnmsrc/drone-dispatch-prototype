<template>
  <div class="page">
    <div class="card">
      <h3 class="card-title">用户管理<span class="sub">共 {{ list.length }} 位用户</span></h3>
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column label="头像" width="80" align="center">
          <template #default="{ row }">
            <el-avatar :size="36" :src="row.avatar" />
          </template>
        </el-table-column>
        <el-table-column prop="nickname" label="昵称" min-width="140" />
        <el-table-column prop="phone" label="手机号" min-width="130" />
        <el-table-column prop="orderCount" label="订单数" width="90" align="center" sortable />
        <el-table-column label="累计消费" width="140" sortable :sort-method="(a, b) => a.totalSpent - b.totalSpent">
          <template #default="{ row }"><span class="amount-text">{{ fmtMoney(row.totalSpent) }}</span></template>
        </el-table-column>
        <el-table-column label="最近下单时间" width="170">
          <template #default="{ row }">{{ row.lastOrderAt ? fmtTime(row.lastOrderAt) : '—' }}</template>
        </el-table-column>
        <el-table-column label="注册时间" width="170">
          <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import request from '../../utils/request'
import { fmtMoney, fmtTime } from '../../utils/format'

const loading = ref(false)
const list = ref([])

async function load() {
  loading.value = true
  try {
    const data = await request.get('/admin/users')
    list.value = data.list
  } finally {
    loading.value = false
  }
}

load()
</script>
