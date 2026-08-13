## v2.6.2

- 飞书表头瘦身：新表不再默认创建“下一步行动 / 面试时间 / 优先级 / 备注”，自动跟进也不再创建“最近错误 / 招聘系统 / 检查方式”；已有字段不自动删除。
- 运行时模块改为职责命名：`followup-orchestrator.js`、`followup-actions.js`，版本号不再进入架构文件名或运行时 Global。
- Queue / Review 的活动 Storage Key 与 Queue Alarm 改为无版本命名，并提供一次性旧 Key 迁移，迁移后删除旧 Key/Alarm。
- 内部消息改为 `GET_FOLLOWUP_QUEUE` / `CLEAR_FOLLOWUP_QUEUE`，移除版本化协议名。
- 删除确认无引用的 debug global 与 `normalizeCompanyComparable()` dead code。
- Safe GET 执行函数内部再次强制 same-origin，避免未来调用方绕过上游筛选。

# Changelog

## v2.6.1

- 恢复 v2.5 已验证的 Site Identity Resolver：静态招聘入口身份解析 + 必要时 inactive rendered fallback，并恢复页面级公司身份共识校正。
- 恢复 MAIN-world Structured State 安全投影：敏感 key 黑名单 + 招聘业务字段白名单 + 严格节点/深度/字符串预算。
- 恢复 Cookie Evidence 对无 Cookie 场景的 API 安全门控；无 Cookie 不判定掉线，继续 Structured State / Page Scan 兜底。
- 恢复按目标 host 查询已打开标签页，避免全 HTTPS tab 扫描。
- 保留 v2.6 的轻量设置页、人工确认、Single Flight、登录恢复和账号 UI 过滤，不回滚 UI/产品简化。

## v2.5.0

### Follow-up Orchestrator

- 新增 Job Queue 2.0：Alarm、Cookie Change、Page Open、Manual 与 Retry 统一进入站点级任务队列；同一 host 的多个岗位合并检查，后台站点任务保持单活跃实例。
- 网络/检查异常采用有上限的指数退避；登录失效、验证码、安全验证、访问受限不会自动反复重试。
- 新增 Application Matching 2.0：优先使用 Provider Application ID / Application ID / Delivery ID / Job ID / Canonical URL，再使用岗位名、投递时间和语义证据。
- 自动更新最低匹配置信度为 0.86；候选歧义或低置信结果只标记未匹配，不自动覆盖飞书状态。
- 新增 Status State Machine：允许正常向前推进和跳级，默认阻止状态回退；`已结束 / 已撤回` 需要高置信匹配和明确终态原始证据。
- 新增 Change Journal：只记录真正成功提交的状态变化，包括公司、岗位、旧状态、新状态、Provider、检查方式、匹配置信度与匹配方式。
- Change Journal 不保存 Cookie、Token、验证码、API response body、手机号或其他认证信息。
- 新增 Cookie Session Evidence：只读取与已有招聘站点相关的 Cookie 并立即汇总为 strong / possible / weak / none 等摘要；Cookie value 不持久化、不记录日志、不写飞书、不通知、不外发。
- Cookie 发生变化且该站点此前处于登录/验证/访问限制等异常状态时，进入 `pending_recheck` 并允许快速复检。
- 用户主动打开已知招聘站点时，可在低频节流条件下触发 Page Open 复检。

### Performance / Safety

- 保留 `API GET → Structured State → Page Scan` 三级降级，不增加公司硬编码 Adapter。
- 移除 `content.js` 中 1.5 秒 URL `setInterval` 轮询，改为 `hashchange / popstate / pageshow / visibilitychange` + 受限 MutationObserver 的事件驱动路由检测。
- 保留 `AUTO_SCAN_MIN_GAP >= 4000ms`、`scanPromise`、Structured State 深度/节点预算和 MAIN-world 有界复制。
- 删除旧 v2.4 payload 发布脚本/Workflow 与已废弃的额外说明文档，版本开发恢复为独立分支 + PR 流程。

### Validation

- JS `node --check`、Manifest JSON 校验通过。
- 全量历史 Mock/E2E/Provider/Session/API/Structured State/Fallback/性能回归通过。
- v2.5 新增 Application Matcher、Status State Machine、Job Queue、Change Journal、Cookie Evidence 单元测试并通过。
- 自动安全检查确认生产根目录无 `setInterval(`、无 `characterData:true`，Cookie 模块不写 storage、不输出 console 日志。
- GitHub CI 无法等价模拟真实 Microsoft Edge、真实招聘网站风控与登录状态；合入 `v2` 前仍需真实 Edge 小规模验证。

## v2.3.1

- 修复扩展更新/重新加载后旧招聘页面无法建立消息连接的问题。
- 修复 Session Manager 消息被基础后台路由抢占的问题。
- 公司名解析增加通用栏目噪声硬过滤，并增强底层 JSON/声明字段/Meta/Header 多源证据融合。
- 双语品牌仅生成候选变体，需要其他证据共识后才提高优先级。
- 增加常见候选人中心申请记录路由识别。
- 保留 v2.2.1 性能保护，不新增高频页面扫描。

## v2.3.0

- 新增 Session Manager：按招聘域名持久化健康、需要登录、需要验证、访问受限和检查异常状态。
- 新增会话熔断：登录失效默认冷却 12h，安全验证 2h，访问受限 6h；普通错误连续 3 次后冷却 1h。
- 手动“立即跟进”和用户已经打开的招聘站点会绕过冷却主动复检，成功后自动恢复为健康。
- 401/403 等 API 失败仍不直接判定掉登录；最终登录状态以页面明确证据为准。
- 重构页面会话探针，拆分“验证码登录”和“安全/人机验证”，并独立识别 rate-limit。
- 设置页新增招聘网站会话健康列表、打开需处理网站、清理会话记录。
- Popup 新增会话健康摘要。
- 新增会话问题首次出现通知，避免每一轮重复弹同一问题。
- 不保存 Cookie、Token、手机号、密码、验证码或响应正文。
- 保留 v2.2.1 全部性能安全保护，不新增页面 MutationObserver 或高频 DOM 扫描。
- 新增 Session Manager、Probe 分类、冷却恢复 E2E 和隐私/性能安全回归。

## v2.2.1

- 性能热修复：移除已被 `content.js` 原生悬浮 UI 取代的 `content-ui.js`，消除 MutationObserver 自触发死循环。
- 页面 MutationObserver 不再监听 `characterData`，并忽略 OfferTrack 自己的 DOM 变化；自动重扫增加 4 秒最小间隔。
- Semantic Parser 改为严格按需执行：取消页面加载时全量扫描、取消 700ms 路由轮询、取消对 `chrome.runtime.sendMessage` 的 monkey-patch。
- 同一轮 Page Scan 只执行一次语义增强；Popup 和 Follow-up 不再重复发送 `ENHANCE_RECORDS`。
- 收紧全 DOM、inline script、Structured State、MAIN-world Store 和 API JSON 的扫描/复制预算。
- Application Data Extractor 增加对象相关性门控，避免对大型状态树中的每个对象都分配浅层字段快照。
- `PAGE_SCAN_RESULT` 仅在页面结果发生变化或用户主动扫描时写入 storage，减少 Service Worker 与 `chrome.storage` 抖动。
- 新增性能安全回归：旧 v2.2.0 UI 在 Chromium 合成页面中 8–12 秒内主线程失去响应；v2.2.1 在持续 50ms DOM mutation 下 14 秒 JS Heap 稳定约 1.91–1.94 MB。

## v2.2.0

- 新增自动跟进三级执行策略：`API GET -> Structured State -> Page Scan`。
- 新增安全 GET API 探测：仅尝试 HTTPS、同源、明显属于申请/投递查询、且不包含提交/撤回/修改等动作词的 URL。
- 成功且高置信的 GET 查询可缓存为站点级 API Hint，后续可在不打开招聘页面时直接复用；含 token/sign/session 等敏感参数的 URL 不缓存。
- 新增 Structured State 提取：读取页面 JSON script、SSR 数据和少量常见 MAIN-world Store，全程有界复制且不使用 `eval`。
- 新增 target-assisted Application Data Extractor，只有与飞书已有岗位高置信匹配的结构化记录才会参与状态更新。
- 新增“检查方式”飞书字段，记录本轮使用 `API GET / Structured State / Page Scan`。
- 设置页新增“优先安全 GET API”和“Structured State”开关。
- Provider Registry 升级 strategies/capabilities，为 Feishu Jobs、Moka、Beisen / Zhiye、自研 SPA 开启三级策略能力。
- 增加 API-first、Structured State、三级降级、敏感 URL 缓存保护等回归测试。

## v2.1.0

- 新增 Recruitment Provider Registry，自动识别招聘网站所属招聘系统。
- 第一批 Provider：Feishu Jobs、Moka、Beisen / Zhiye、自研 SPA、Generic Web。
- Provider 按招聘系统复用规则，不按具体公司堆叠 Adapter。
- 自动跟进时使用 Provider 参与检查 URL 选择与已打开 Tab 排序。
- 飞书自动跟进字段新增“招聘系统”。

## v2.0.0

- 新增每 6 小时自动跟进调度器，可配置 1–72 小时。
- 从飞书读取进行中的投递记录，并按招聘网站分组检查。
- 安全模式复用已打开页面；实验模式支持后台打开非激活标签页检查。
- 只有高置信匹配且状态发生变化时才更新飞书当前状态。
