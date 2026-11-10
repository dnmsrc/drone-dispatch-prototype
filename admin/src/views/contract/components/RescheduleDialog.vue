<template>
  <el-dialog
    v-model="visible"
    :title="`合同改期 · ${contract?.contractNo || ''}`"
    width="520px"
    destroy-on-close
    :close-on-click-modal="false"
    @open="onOpen"
  >
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="改期不退款：已付节点按原节点继续有效，已发生成本不变；改期需重新备案与空域审批。"
      class="tip"
    />

    <el-descriptions :column="1" border size="small" class="orig-box">
      <el-descriptions-item label="原表演日期">
        {{ contract?.order?.performDate }} {{ contract?.order?.timeSlot || '' }}
      </el-descriptions-item>
    </el-descriptions>

    <el-form label-position="top">
      <el-form-item label="改期责任方" required>
        <el-radio-group v-model="form.responsibility">
          <el-radio-button value="VENDOR">我方原因</el-radio-button>
          <el-radio-button value="CUSTOMER">客户原因</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="改期原因类型" required>
        <el-select v-model="form.reasonType" style="width: 100%">
          <el-option
            v-for="(conf, value) in RESCHEDULE_REASON_MAP"
            :key="value"
            :label="conf.text"
            :value="value"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="新表演日期" required>
        <el-date-picker
          v-model="form.newPerformDate"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="选择改期后的表演日期"
          :disabled-date="disabledDate"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="改期说明（必填，写入合同档案与订单时间轴）" required>
        <el-input
          v-model="form.reason"
          type="textarea"
          :rows="3"
          maxlength="200"
          show-word-limit
          placeholder="如：气象预报显示当日风速超限，经与客户沟通顺延至新日期"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">确认改期</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import request from '../../../utils/request'
import { RESCHEDULE_REASON_MAP } from '../../../utils/format'

const props = defineProps({ modelValue: Boolean, contract: { type: Object, default: null } })
const emit = defineEmits(['update:modelValue', 'done'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const submitting = ref(false)
const form = reactive({
  responsibility: 'VENDOR',
  reasonType: 'WEATHER',
  reason: '',
  newPerformDate: ''
})

function disabledDate(date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return date.getTime() < today.getTime()
}

function onOpen() {
  form.responsibility = 'VENDOR'
  form.reasonType = 'WEATHER'
  form.reason = ''
  form.newPerformDate = ''
}

async function submit() {
  if (!form.newPerformDate) {
    ElMessage.warning('请选择新的表演日期')
    return
  }
  if (!form.reason.trim()) {
    ElMessage.warning('请填写改期说明')
    return
  }
  submitting.value = true
  try {
    await request.post(`/admin/contracts/${props.contract.id}/reschedule`, {
      responsibility: form.responsibility,
      reasonType: form.reasonType,
      reason: form.reason.trim(),
      newPerformDate: form.newPerformDate
    })
    ElMessage.success('已改期，付款节点继续有效，订单表演日期同步更新')
    visible.value = false
    emit('done')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.tip {
  margin-bottom: 14px;
}
.orig-box {
  margin-bottom: 16px;
}
</style>
