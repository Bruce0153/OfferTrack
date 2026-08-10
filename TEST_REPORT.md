# OfferTrack v2.1.0 内部测试报告

测试环境：GPT 沙箱中的 Node.js 静态测试、Mock Browser E2E 与代表性招聘系统样本。

说明：沙箱不能访问用户本机 Edge 的真实招聘网站登录 Cookie，因此账号态网络测试仍需安装到本机 Edge 后验证。本轮重点验证 Provider Registry、Provider URL 选择、自动跟进集成与旧版回归。

## Provider Registry 代表样本

### Feishu Jobs

- `*.jobs.feishu.cn/.../position/application`
- 覆盖普通 position/application、campus/position/application、campusrecruitment/position/application。
- 结果：PASS

### Moka

- `app.mokahr.com/...#/candidateHome/applications`
- 结果：PASS

### Beisen / Zhiye

- `*.zhiye.com/personal/deliveryRecord`
- 结果：PASS

### Self-hosted SPA

- Hash Router 的 `#/.../my-apply` / `#/myDeliver` 类页面，以及通用 candidate/account/apply 路径。
- 不依赖具体公司名称。
- 结果：PASS

### Generic Web

- 无已知 Provider 特征的网站安全落入 Generic Web。
- 结果：PASS

## 防硬编码检查

Provider Registry 源码不得包含代表公司的中文/英文公司名，仅允许招聘系统域名与通用 URL 模式。

结果：PASS

## 自动跟进 E2E

Mock 飞书记录包含：

- 自研 SPA 类型：岗位状态 `筛选中 -> 笔试/测评`
- Beisen / Zhiye：岗位状态 `筛选中 -> 面试中`
- Feishu Jobs：后台 Tab 模式 `筛选中 -> 笔试/测评`

检查：

- Provider 正确识别。
- 状态 Diff 正确。
- 飞书更新增加“招聘系统”。
- Provider 统计写入 lastFollowUp。
- 未匹配/失败路径不覆盖当前状态。

结果：PASS

## 回归测试

- `provider-registry.test.js`: PASS
- `service-worker-imports.test.js`: PASS
- `followup-core.test.js`: PASS
- `background-scheduler.test.js`: PASS
- `background-followup-flow.test.js`: PASS
- `background-tab-mode.test.js`: PASS
- 全部 JavaScript `node --check`: PASS
- Manifest 引用检查: PASS
- ZIP 完整性检查: PASS
