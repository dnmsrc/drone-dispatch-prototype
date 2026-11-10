<template>
  <el-dialog
    v-model="visible"
    :title="`终止合同 · ${contract?.contractNo || ''}`"
    width="560px"
    destroy-on-close
    :close-on-click-modal="false"
    @open="onOpen"
  >
    <div v-loading="loading">
      <!-- 结算确认单 -->
      <el-descriptions :column="2" border size="small" class="quote-box">
        <el-descriptions-item label="合同总额">{{ fmtMoney(contract?.totalAmount) }}</el-descriptions-item>
        <el-descriptions-item label="已付金额（退款基数）">
          <span class="amount-text">{{ fmtMoney(quote.paidAmount) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="适用规则" :span="2">
          <span :class="isVendor ? 'rule-vendor' : 'rule-customer'">{{ quote.ruleLabel }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="试算可退">
          <span class="amount-text">{{ fmtMoney(quote.refundAmount) }}</span>
          （{{ Math.round((quote.ratio || 0) * 100) }}%）
        </el-descriptions-item>
        <el-descriptions-item label="成本/违约金扣除">
          <span :class="quote.deductAmount > 0 ? 'amount-danger' : ''">{{ fmtMoney(quote.deductAmount) }}</span>
        </el-descriptions-item>
      </el-descriptions>

      <el-alert
        v-if="isVendor"
        type="error"
        :closable="false"
        show-icon
        title="我方原因无法履行：按合同条款全额退还已付费用，不扣除任何成本"
        class="tip"
      />
      <el-alert
        v-else
        type="warning"
        :closable="false"
        show-icon
        title="客户原因终止：按距演出天数的阶梯比例近似抵扣已发生成本（一期不建成本台账）"
        class="tip"
      />

      <el-form label-position="top">
        <el-form-item label="终止责任方" required>
          <el-radio-group v-model="form.responsibility" @change="loadQuote">
            <el-radio-button value="CUSTOMER">客户原因</el-radio-button>
            <el-radio-button value="VENDOR">我方原因</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="实际退款金额" required>
          <el-input-number
            v-model="form.refundAmount"
            :min="0"
            :max="quote.paidAmount || 0"
            :step="100"
            :disabled="isVendor"
            style="width: 220px"
          />
          <span class="cell-sub" style="margin-left: 10px">
            {{ isVendor ? '我方原因固定全额退，不可调整' : '默认按试算额，可在已付额度内调整' }}
          </span>
        </el-form-item>

        <el-form-item label="终止原因（必填，写入合同档案与退款单，对客户可见）" required>
          <el-input
            v-model="form.reason"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="如：空域审批未通过 / 天气不满足飞行条件 / 客户计划变更等"
          />
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="danger" :loading="submitting" @click="submit">确认终止并生成退款单</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import request from '../../../utils/request'
import { fmtMoney } from '../../../utils/format'

const props = defineProps({ modelValue: Boolean, contract: { type: Object, default: null } })
const emit = defineEmits(['update:modelValue', 'done'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const loading = ref(false)
const submitting = ref(false)
const form = reactive({ responsibility: 'CUSTOMER', reason: '', refundAmount: 0 })
const quote = ref({ paidAmount: 0, ratio: 0, refundAmount: 0, deductAmount: 0, ruleLabel: '', daysToPerform: null })

const isVendor = computed(() => form.responsibility === 'VENDOR')

async function loadQuote() {
  if (!props.contract) return
  loading.value = true
  try {
    const data = await request.post(`/admin/contracts/${props.contract.id}/terminate-quote`, {
      responsibility: form.responsibility
    })
    quote.value = data.quote
    // 责任方切换时把实退额重置为该责任方的试算可退额（我方锁定全额）
    form.refundAmount = data.quote.refundAmount
  } finally {
    loading.value = false
  }
}

function onOpen() {
  form.responsibility = 'CUSTOMER'
  form.reason = ''
  loadQuote()
}

async function submit() {
  if (!form.reason.trim()) {
    ElMessage.warning('请填写终止原因')
    return
  }
  if (!(form.refundAmount > 0 && form.refundAmount <= quote.value.paidAmount)) {
    ElMessage.warning(`退款金额需在 0 ~ ${fmtMoney(quote.value.paidAmount)} 之间`)
    return
  }
  submitting.value = true
  try {
    await request.post(`/admin/contracts/${props.contract.id}/terminate`, {
      responsibility: form.responsibility,
      reason: form.reason.trim(),
      ratio: quote.value.ratio,
      refundAmount: form.refundAmount
    })
    ElMessage.success('合同已终止，已生成待审批退款单（退款管理页可处理）')
    visible.value = false
    emit('done')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.quote-box {
  margin-bottom: 14px;
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
.amount-danger {
  color: #f56c6c;
  font-weight: 600;
}
.rule-vendor {
  color: #f56c6c;
  font-weight: 600;
}
.rule-customer {
  color: #e6a23c;
}
</style>
