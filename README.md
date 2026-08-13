# OfferTrack v2.6.2

> v2.6.2 在保留稳定 Site Identity、Provider、Matcher、Queue/Session 的基础上完成安全与架构收口：字段契约集中、Structured State 最小化投影、显式 Follow-up Decision、按站点授权，以及更干净的飞书表格。

OfferTrack 是一个面向秋招、校招和实习投递管理的 Microsoft Edge / Chromium Manifest V3 扩展。

它可以从招聘网站的“我的投递 / 投递记录 / 应聘记录 / 我的申请”等页面解析公司、岗位、地点、投递时间和招聘流程状态，预览后去重同步到飞书多维表格，并自动跟进仍在进行中的招聘流程。

## 核心原则

- Provider 泛化优先于 Company Adapter。
- `Cookie 会话证据 → API GET → Structured State → Page Scan` 四级流程始终保留；Cookie 缺失不会直接判定掉线。
- 宁可不更新，也不能错误更新。
- 事件驱动优于轮询。
- Cookie 只作为 Session Evidence；Cookie value 永不持久化、日志、飞书、通知或外发。

## 主要功能

- 自动解析招聘网站投递记录并同步飞书。
- Feishu Jobs、Moka、Beisen / Zhiye、Self-hosted SPA、Generic Web Provider Registry。
- 安全 GET API、Structured State、DOM/Semantic Parser 三级检查。
- Session Manager：健康 / 需要登录 / 需要验证 / 访问受限 / 检查异常 / pending recheck。
- Job Queue 2.0：Alarm、Manual、Cookie Change、Page Open、Retry 统一调度；同一 host 多岗位合并检查。
- Application Matching 2.0：优先稳定 ID 和 Canonical URL，再使用岗位名、投递时间和语义证据；低置信和歧义结果不自动更新。
- Status State Machine：允许正常前进和跳级，阻止错误回退；终态要求强证据。
- Change Journal：只记录真正成功提交的状态变化和匹配置信度。
- 登录失效、验证码和风控进入冷却，不反复打开网站。
- 状态变化后发送 Edge / 系统通知。

## 安装

1. 解压 `OfferTrack_Edge_v2.6.2.zip`。
2. Edge 打开 `edge://extensions/`。
3. 开启“开发人员模式”。
4. 点击“加载解压缩的扩展”。
5. 选择解压后的 OfferTrack 文件夹。

升级旧版本时，建议覆盖原来已经加载的固定目录，然后在 `edge://extensions/` 点击“重新加载”，通常可以保留已有本地飞书配置。

从 v2.6.2 起，招聘网站不再使用安装时的全 HTTPS 永久权限。首次在某个招聘站点手动同步时，OfferTrack 会请求该站点的精确 HTTPS Origin 权限；拒绝不会影响当前手动同步，但后台自动跟进会跳过该站点，直到你主动授权。

App Secret 默认只保存在 `chrome.storage.session` 的浏览器会话内存中；需要浏览器重启后仍无人值守自动跟进时，可在设置页显式勾选“在本机记住 App Secret”。普通 `settings` 对象不再保存 App Secret。

## 配置飞书

### 1. 创建企业自建应用

打开飞书开放平台：`https://open.feishu.cn/app?lang=zh-CN`

创建企业自建应用，复制 App ID / App Secret，并在应用身份下至少开通：

- `bitable:app`
- Wiki 多维表格需要 `wiki:node:read`

权限修改后如提示待发布，需要发布新的应用版本。

### 2. 添加文档应用

打开目标飞书多维表格，在右上角菜单中添加 OfferTrack 对应的文档应用，并给足够的编辑权限。

在 OfferTrack 设置页粘贴多维表格链接后依次执行：

1. 从链接解析
2. 测试连接
3. 初始化表头
4. 保存设置

## 飞书字段

基础字段包括：公司、岗位名称、工作地点、投递时间、当前状态、招聘平台、岗位链接、最近更新时间、唯一记录ID、原始状态。

自动跟进只额外使用：自动跟进。

运行状态、登录状态、检查方式、最近错误等诊断信息保留在插件 Session / Journal / 运行摘要中，不再写进业务表。旧版本已经创建的“最后检查时间 / 状态更新时间 / 检查状态 / 登录状态 / 下一步行动 / 面试时间 / 优先级 / 备注 / 最近错误 / 招聘系统 / 检查方式”等列不会自动删除，以避免破坏历史数据。

`自动跟进` 留空时默认参与检查；填写 `关闭`、`否` 或 `不跟进` 时跳过。

## Provider Strategy Executor

自动跟进依次尝试：

`Cookie 会话证据 → API GET → Structured State → Page Scan`

### API GET

- 只尝试 HTTPS、同源、明显属于申请/投递查询的只读 GET 地址。
- 包含 submit / create / update / delete / withdraw / cancel 等动作语义时拒绝。
- 只在返回数据能够高置信匹配飞书已有岗位时采用结果。
- API 失败、非 JSON、响应过大或匹配不足时自动降级。
- API Hint 只有在 URL 不含 token/sign/session 等敏感参数时才允许缓存。

### Structured State

读取页面已有 JSON、SSR 数据和少量常见 MAIN-world Store；全程使用节点、深度、数组和字符串预算，不执行 `eval`，不无限复制大对象。

### Page Scan

前两层证据不足时使用 DOM + Semantic Parser 兜底。任何上层策略失败都不会阻断 Page Scan。

## Job Queue 2.0

自动跟进事件统一进入站点级任务队列：

`Alarm / Manual / Cookie Change / Page Open / Retry → Priority Queue`

原则：

- 同一 host 多个岗位合并为一次站点检查。
- 后台站点任务保持单活跃实例，避免并发打开多个招聘页。
- 手工触发优先级最高，其次是 Cookie Change、Page Open、Alarm、Retry。
- 普通网络/检查错误使用有上限指数退避。
- 登录失效、验证码、安全验证、rate limit 不自动反复 retry。

## Application Matching 2.0

匹配优先级大致为：

`Provider Application ID → Application/Delivery ID → Job/Position ID → Canonical URL → 岗位名 + 投递时间 → Semantic Evidence`

自动更新最低置信度为 0.86。多个候选差距过小会被判为歧义；ID 明确冲突时直接拒绝匹配。低置信或歧义结果不会覆盖飞书旧状态。

## Status State Machine

主要状态：

`已投递 → 筛选中 → 笔试/测评 → 面试中 → Offer`

允许正常向前推进和合理跳级，例如 `筛选中 → 面试中`。

默认阻止 `面试中 → 已投递` 等错误回退。`已结束 / 已撤回` 为强终态，只有高置信匹配且原始状态存在明确结束/撤回证据时才允许进入。终态默认保持，不因后续弱页面证据重新打开流程。

## Cookie Session Evidence

OfferTrack 可以读取已授权招聘站点相关的 Cookie，但 Cookie 不是“已登录”的真值，只用于辅助判断 Session Health。

只保留这种摘要：

- strong / possible / weak / none
- cookieCount
- sessionLikeCount
- httpOnlyCount
- secureCount
- expiryState

Cookie value 使用后立即丢弃，并且：

- 不写 `chrome.storage`
- 不写飞书
- 不写 console / 诊断日志
- 不显示通知
- 不发送第三方服务器

Cookie Change 只有在对应 host 已属于 OfferTrack 的招聘站点，并且此前存在会话异常时，才允许触发低频快速复检。

## Change Journal

只记录真正成功提交的招聘状态变化：

- 时间
- 公司
- 岗位
- 旧状态
- 新状态
- Provider
- 检查方式
- matchConfidence
- matchMethod

不会保存 Cookie、Token、验证码、API response body、手机号等敏感信息。

## 性能保护

OfferTrack 保留 v2.2.1 后的性能红线：

- Production Code 不使用高频 `setInterval` URL/DOM 轮询。
- MutationObserver 不使用 `characterData:true`。
- Observer 忽略 OfferTrack 自己的 UI，避免自身 DOM 反馈循环。
- `AUTO_SCAN_MIN_GAP >= 4000ms`。
- `scanPromise` 阻止并发 Page Scan。
- Structured State / MAIN-world 数据复制严格有预算。
- SPA 路由使用 `hashchange / popstate / pageshow / visibilitychange` 与受限 MutationObserver。

## 自动跟进安全原则

以下情况不会覆盖已有招聘状态：页面打不开、需要重新登录、验证码/风控、没有解析到投递记录、岗位匹配不足、匹配歧义、状态机判断为错误回退、终态证据不足。

这些情况下只更新检查相关字段或等待用户处理。

## 当前版本链路

`Scheduler / Event → Job Queue → Provider Registry → Session Manager → Cookie Evidence → API GET → Safe Structured State → Page Scan → Application Matcher → Follow-up Decision → Status State Machine → Feishu Update → Change Journal / Notification`

## 验证说明

仓库自动测试覆盖 Node 语法、Manifest、Mock Browser E2E、Provider、API-first、Structured State、三级降级、Session、Application Matching、Status State Machine、Queue、Journal、Cookie 隐私边界和性能安全规则。

GitHub CI 无法等价模拟真实 Microsoft Edge、真实招聘网站登录态、验证码和风控。版本合入 `v2` 前仍应在真实 Edge 上进行少量代表性招聘站点验证。
