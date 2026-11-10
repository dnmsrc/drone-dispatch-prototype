// 验收数据重置（幂等，可反复跑）：用 buildSeed() 重新生成验收专用数据文件 data-verify/db.json。
// 用法：node reset-verify-db.mjs
// 配套：PORT=8099 MOCK_DATA_DIR=./data-verify node server.js  →  BASE=http://localhost:8099 node verify-contracts.mjs
import { createRequire } from 'module';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const { buildSeed } = require('./seed.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, 'data-verify');
mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'db.json');
const seed = buildSeed();

// 验收造数：把一份零付款的「待签署」合同确定性回退为「草稿」，供提交签署链路（DRAFT→PENDING_SIGN）使用。
// 选 c3（PENDING_ACCEPT、两期均未付）；另一份 PENDING_SIGN（c18）保留，供上传签署件链路（PENDING_SIGN→SIGNED）使用。
const draftTarget = seed.contracts.find((c) => c.id === 'c3');
if (!draftTarget) throw new Error('验收造数失败：种子缺少合同 c3');
if (draftTarget.signStatus !== 'PENDING_SIGN') {
  throw new Error(`验收造数失败：c3 当前为 ${draftTarget.signStatus}，预期 PENDING_SIGN，种子规则可能已变化`);
}
draftTarget.signStatus = 'DRAFT';
draftTarget.schedules.forEach((s) => {
  s.status = 'PENDING';
  s.paidAmount = 0;
  s.paidAt = null;
});
draftTarget.partyASignedAt = null;
draftTarget.partyBSignedAt = null;
draftTarget.signedAt = null;
draftTarget.signedPdfUrl = '';

writeFileSync(file, JSON.stringify(seed, null, 2));

const counts = seed.contracts.reduce((m, c) => {
  m[c.signStatus] = (m[c.signStatus] || 0) + 1;
  return m;
}, {});
console.log(`[reset-verify-db] 已重写 ${file}`);
console.log(`[reset-verify-db] 订单 ${seed.orders.length} 条 / 合同 ${seed.contracts.length} 份 / 状态分布 ${JSON.stringify(counts)}`);
