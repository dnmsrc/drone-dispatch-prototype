<template>
  <div class="page">
    <div class="card">
      <h3 class="card-title">
        场地管理<span class="sub">预设表演场地，用户下单时可直接选择</span>
        <el-button type="primary" :icon="Plus" @click="openForm()">新增场地</el-button>
      </h3>
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="name" label="场地名称" min-width="160" />
        <el-table-column prop="address" label="地址" min-width="240" show-overflow-tooltip />
        <el-table-column prop="lng" label="经度" width="110" />
        <el-table-column prop="lat" label="纬度" width="110" />
        <el-table-column label="启用状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Edit" @click="openForm(row)">编辑</el-button>
            <el-button link type="danger" :icon="Delete" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialog" :title="form.id ? '编辑场地' : '新增场地'" width="480px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="场地名称" prop="name">
          <el-input v-model="form.name" placeholder="例如：滨江世纪广场" maxlength="30" />
        </el-form-item>
        <el-form-item label="详细地址" prop="address">
          <el-input v-model="form.address" placeholder="例如：杭州市滨江区江南大道 100 号" maxlength="60" />
        </el-form-item>
        <el-form-item label="经度">
          <el-input-number v-model="form.lng" :precision="3" :step="0.001" :min="-180" :max="180" style="width: 100%" />
        </el-form-item>
        <el-form-item label="纬度">
          <el-input-number v-model="form.lat" :precision="3" :step="0.001" :min="-90" :max="90" style="width: 100%" />
        </el-form-item>
        <el-form-item label="启用状态">
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import request from '../../utils/request'

const loading = ref(false)
const saving = ref(false)
const list = ref([])
const dialog = ref(false)
const formRef = ref()

const form = reactive({ id: '', name: '', address: '', lng: 120.2, lat: 30.25, enabled: true })

const rules = {
  name: [{ required: true, message: '请填写场地名称', trigger: 'blur' }],
  address: [{ required: true, message: '请填写详细地址', trigger: 'blur' }]
}

async function load() {
  loading.value = true
  try {
    const data = await request.get('/admin/venues')
    list.value = data.list
  } finally {
    loading.value = false
  }
}

function openForm(row) {
  if (row) {
    Object.assign(form, { id: row.id, name: row.name, address: row.address, lng: row.lng, lat: row.lat, enabled: row.enabled })
  } else {
    Object.assign(form, { id: '', name: '', address: '', lng: 120.2, lat: 30.25, enabled: true })
  }
  dialog.value = true
}

async function save() {
  await formRef.value.validate()
  saving.value = true
  try {
    const body = { name: form.name, address: form.address, lng: form.lng, lat: form.lat, enabled: form.enabled }
    if (form.id) {
      await request.put(`/admin/venues/${form.id}`, body)
      ElMessage.success('场地已保存')
    } else {
      await request.post('/admin/venues', body)
      ElMessage.success('场地已新增')
    }
    dialog.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  await ElMessageBox.confirm(`确认删除场地「${row.name}」？删除后不可恢复。`, '删除确认', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  })
  await request.delete(`/admin/venues/${row.id}`)
  ElMessage.success('已删除')
  load()
}

load()
</script>
