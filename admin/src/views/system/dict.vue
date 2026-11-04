<template>
  <div class="page">
    <div class="dict-wrap">
      <!-- 左：字典类型 -->
      <div class="card type-card">
        <div class="card-head">
          <h3 class="card-title">字典类型</h3>
          <el-button v-if="auth.isAdmin" type="primary" size="small" :icon="Plus" @click="openTypeDialog()">新增类型</el-button>
        </div>
        <el-table :data="types" size="small" highlight-current-row v-loading="loadingTypes"
                  @current-change="onSelectType" row-key="type" ref="typeTable">
          <el-table-column label="类型" min-width="130">
            <template #default="{ row }">
              <div class="type-name">{{ row.name }}</div>
              <div class="type-key">{{ row.type }}</div>
            </template>
          </el-table-column>
          <el-table-column label="条目" width="60" align="center">
            <template #default="{ row }">{{ row.itemCount }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100" align="center">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click.stop="openTypeDialog(row)">编辑</el-button>
              <el-button v-if="!row.system" link type="danger" size="small" @click.stop="removeType(row)">删除</el-button>
              <el-tooltip v-else content="系统内置字典被业务引用，不可删除" placement="top">
                <el-button link type="info" size="small" disabled>删除</el-button>
              </el-tooltip>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 右：字典项 -->
      <div class="card item-card">
        <div class="card-head">
          <h3 class="card-title">
            字典项
            <template v-if="current">
              <span class="cur-tag">{{ current.name }}（{{ current.type }}）</span>
              <el-tag v-if="current.system" size="small" type="warning" effect="plain">内置</el-tag>
            </template>
          </h3>
          <el-button v-if="auth.isAdmin && current" type="primary" size="small" :icon="Plus" @click="openItemDialog()">新增字典项</el-button>
        </div>
        <p v-if="current?.remark" class="remark">{{ current.remark }}</p>
        <el-empty v-if="!current" description="请先选择左侧字典类型" :image-size="80" />
        <el-table v-else :data="items" size="small" border v-loading="loadingItems">
          <el-table-column prop="label" label="标签" min-width="130" />
          <el-table-column prop="key" label="键" min-width="100" />
          <el-table-column label="值" width="110" align="right">
            <template #default="{ row }">
              <span v-if="isPriceType" class="amount-text">{{ row.value ? fmtMoney(row.value) : '0' }}</span>
              <span v-else-if="current.type === 'refund_rule'">{{ Math.round(row.value * 100) }}%</span>
              <span v-else>{{ row.value }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="extra" label="说明" min-width="140" show-overflow-tooltip />
          <el-table-column prop="sort" label="排序" width="60" align="center" />
          <el-table-column label="状态" width="80" align="center">
            <template #default="{ row }">
              <el-switch :model-value="row.status === 1" :disabled="!auth.isAdmin"
                         @change="toggleStatus(row, $event)" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="110" align="center" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openItemDialog(row)">编辑</el-button>
              <el-button link type="danger" size="small" @click="removeItem(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- 类型编辑弹窗 -->
    <el-dialog v-model="typeDialog" :title="typeForm.oldType ? '编辑字典类型' : '新增字典类型'" width="420px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="类型标识" required>
          <el-input v-model="typeForm.type" :disabled="!!typeForm.oldType" placeholder="如 venue_type（小写英文/数字/下划线）" />
        </el-form-item>
        <el-form-item label="类型名称" required>
          <el-input v-model="typeForm.name" placeholder="如 场地类型" maxlength="20" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="typeForm.remark" type="textarea" :rows="2" maxlength="100" placeholder="该字典的用途说明（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="typeDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveType">保存</el-button>
      </template>
    </el-dialog>

    <!-- 字典项编辑弹窗 -->
    <el-dialog v-model="itemDialog" :title="itemForm.id ? '编辑字典项' : `新增字典项 - ${current?.name || ''}`" width="460px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="标签" required>
          <el-input v-model="itemForm.label" placeholder="展示名称，如 100 架" maxlength="40" />
        </el-form-item>
        <el-form-item label="键" required>
          <el-input v-model="itemForm.key" :disabled="!!itemForm.id && current?.system" placeholder="程序使用的标识，如 100" maxlength="40" />
          <div v-if="current?.system && itemForm.id" class="form-tip">内置字典的键被业务引用，不可修改</div>
        </el-form-item>
        <el-form-item :label="valueLabel">
          <el-input-number v-model="itemForm.value" :min="0" :max="current?.type === 'refund_rule' ? 1 : 1000000"
                           :step="current?.type === 'refund_rule' ? 0.05 : 100" :precision="current?.type === 'refund_rule' ? 2 : 0"
                           style="width: 180px" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="itemForm.extra" placeholder="补充说明，如 适用场景（可选）" maxlength="100" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="itemForm.sort" :min="1" :max="999" style="width: 120px" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="itemForm.status" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="itemDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveItem">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import request from '../../utils/request'
import { fmtMoney } from '../../utils/format'
import { useAuthStore } from '../../store/auth'

const auth = useAuthStore()
const types = ref([])
const current = ref(null)
const items = ref([])
const loadingTypes = ref(false)
const loadingItems = ref(false)
const saving = ref(false)
const typeTable = ref(null)

const typeDialog = ref(false)
const itemDialog = ref(false)
const typeForm = ref({ oldType: '', type: '', name: '', remark: '' })
const itemForm = ref({ id: '', key: '', label: '', value: 0, extra: '', sort: 1, status: true })

const PRICE_TYPES = ['drone_tier', 'duration', 'addon']
const isPriceType = computed(() => current.value && PRICE_TYPES.includes(current.value.type))
const valueLabel = computed(() => {
  if (!current.value) return '值'
  if (isPriceType.value) return '价格（元）'
  if (current.value.type === 'refund_rule') return '退款比例'
  return '值'
})

async function loadTypes(keepSelection = true) {
  loadingTypes.value = true
  try {
    const data = await request.get('/admin/dict')
    types.value = data.list
    if (keepSelection && current.value) {
      const t = types.value.find(x => x.type === current.value.type)
      current.value = t || null
      if (t) typeTable.value?.setCurrentRow(t)
    }
    if (!current.value && types.value.length) {
      typeTable.value?.setCurrentRow(types.value[0])
      onSelectType(types.value[0])
    }
  } finally {
    loadingTypes.value = false
  }
}

async function onSelectType(row) {
  if (!row) return
  current.value = row
  loadingItems.value = true
  try {
    const data = await request.get(`/admin/dict/${row.type}/items`)
    items.value = data.list
    current.value = { ...row, remark: data.remark, system: data.system }
  } finally {
    loadingItems.value = false
  }
}

// ---- 类型 CRUD ----
function openTypeDialog(row) {
  typeForm.value = row
    ? { oldType: row.type, type: row.type, name: row.name, remark: row.remark }
    : { oldType: '', type: '', name: '', remark: '' }
  typeDialog.value = true
}

async function saveType() {
  const f = typeForm.value
  if (!f.name.trim()) return ElMessage.warning('请填写类型名称')
  saving.value = true
  try {
    if (f.oldType) {
      await request.put(`/admin/dict/types/${f.oldType}`, { name: f.name, remark: f.remark })
    } else {
      await request.post('/admin/dict/types', { type: f.type, name: f.name, remark: f.remark })
    }
    ElMessage.success('已保存')
    typeDialog.value = false
    loadTypes()
  } finally {
    saving.value = false
  }
}

async function removeType(row) {
  await ElMessageBox.confirm(`确认删除字典类型「${row.name}」及其全部字典项？`, '删除确认', { type: 'warning' })
  await request.delete(`/admin/dict/types/${row.type}`)
  ElMessage.success('已删除')
  if (current.value?.type === row.type) { current.value = null; items.value = [] }
  loadTypes()
}

// ---- 字典项 CRUD ----
function openItemDialog(row) {
  itemForm.value = row
    ? { id: row.id, key: row.key, label: row.label, value: row.value, extra: row.extra || '', sort: row.sort, status: row.status === 1 }
    : { id: '', key: '', label: '', value: 0, extra: '', sort: (items.value.length + 1), status: true }
  itemDialog.value = true
}

async function saveItem() {
  const f = itemForm.value
  if (!f.label.trim() || !String(f.key).trim()) return ElMessage.warning('请填写标签与键')
  saving.value = true
  try {
    const payload = { key: f.key, label: f.label, value: f.value, extra: f.extra, sort: f.sort, status: f.status ? 1 : 0 }
    if (f.id) await request.put(`/admin/dict/${current.value.type}/items/${f.id}`, payload)
    else await request.post(`/admin/dict/${current.value.type}/items`, payload)
    ElMessage.success('已保存')
    itemDialog.value = false
    onSelectType(current.value)
    loadTypes()
  } finally {
    saving.value = false
  }
}

async function toggleStatus(row, val) {
  await request.put(`/admin/dict/${current.value.type}/items/${row.id}`, { status: val ? 1 : 0 })
  row.status = val ? 1 : 0
  ElMessage.success(val ? '已启用' : '已停用（H5 端将不再展示该项）')
  loadTypes()
}

async function removeItem(row) {
  await ElMessageBox.confirm(`确认删除字典项「${row.label}」？`, '删除确认', { type: 'warning' })
  await request.delete(`/admin/dict/${current.value.type}/items/${row.id}`)
  ElMessage.success('已删除')
  onSelectType(current.value)
  loadTypes()
}

loadTypes(false)
</script>

<style scoped>
.dict-wrap {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.type-card {
  flex: 0 0 380px;
}

.item-card {
  flex: 1;
  min-width: 0;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.card-head .card-title {
  margin: 0;
}

.type-name {
  font-weight: 600;
  color: #303133;
}

.type-key {
  font-size: 12px;
  color: #909399;
}

.cur-tag {
  font-size: 13px;
  font-weight: 400;
  color: #606266;
  margin: 0 8px;
}

.remark {
  margin: -4px 0 12px;
  font-size: 12px;
  color: #909399;
}

.form-tip {
  font-size: 12px;
  color: #e6a23c;
  line-height: 1.4;
  margin-top: 4px;
}

/* 窄屏自适应：左右栏堆叠 */
@media (max-width: 992px) {
  .dict-wrap {
    flex-direction: column;
  }
  .type-card,
  .item-card {
    flex: none;
    width: 100%;
  }
}
</style>
