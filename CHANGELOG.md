# Change Log

## 2.1.0

- 新增 Recruitment Provider Registry，自动识别招聘网站所属招聘系统。
- 第一批 Provider：Feishu Jobs、Moka、Beisen / Zhiye、自研 SPA、Generic Web。
- Provider 按招聘系统复用规则，不按具体公司堆叠 Adapter。
- 自动跟进时使用 Provider 参与检查 URL 选择与已打开 Tab 排序。
- 飞书自动跟进字段新增“招聘系统”，便于后续诊断和 Provider 统计。
- 自动跟进运行结果新增 Provider 分布统计。
- 为 v2.2 预留统一 strategies / capabilities 接口，下一阶段接入 API -> Structured State -> Page Scan 三级降级。
- 新增 Provider Registry 单元测试与跨 Provider E2E 回归。

## 2.0.0

- 新增每 6 小时自动跟进调度器，可配置 1–72 小时。
- 从飞书读取进行中的投递记录，并按招聘网站分组检查。
- 安全模式复用已打开页面；实验模式支持后台打开非激活标签页检查。
- 新增登录失效、页面为空、检查失败、岗位未匹配等保护状态。
- 只有高置信匹配且状态发生变化时才更新飞书当前状态。
- 新增状态变化系统通知、立即跟进按钮和自动跟进状态面板。
