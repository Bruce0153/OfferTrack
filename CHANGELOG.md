# Change Log

## 2.3.0

- 新增 Session Manager：按招聘域名持久化健康、需要登录、需要验证、访问受限和检查异常状态。
- 新增会话熔断：登录失效默认冷却 12h，安全验证 2h，访问受限 6h；普通错误连续 3 次后冷却 1h。
- 手动“立即跟进”和用户已经打开的招聘站点会绕过冷却主动复检，成功后自动恢复为健康。
- 401/403 等 API 失败仍不直接判定掉登录；最终登录状态以页面明确证据为准。
- 重构页面会话探针，拆分“验证码登录”和“安全/人机验证”，并独立识别 rate-limit。
- 设置页新增招聘网站会话健康列表、打开需处理网站、清理会话记录。
- Popup 新增会话健康摘要。
- 新增会话问题首次出现通知，避免每一轮重复弹同一问题。
- 不新增 `cookies` 权限，不保存 Cookie、Token、手机号、密码、验证码或响应正文。
- 保留 v2.2.1 全部性能安全保护，不新增页面 MutationObserver 或高频 DOM 扫描。
- 新增 Session Manager、Probe 分类、冷却恢复 E2E 和隐私/性能安全回归。

## 2.2.1

- 性能热修复：移除已被 `content.js` 原生悬浮 UI 取代的 `content-ui.js`，消除 MutationObserver 自触发死循环。
- 页面 MutationObserver 不再监听 `characterData`，并忽略 OfferTrack 自己的 DOM 变化；自动重扫增加 4 秒最小间隔。
- Semantic Parser 改为严格按需执行：取消页面加载时全量扫描、取消 700ms 路由轮询、取消对 `chrome.runtime.sendMessage` 的 monkey-patch。
- 同一轮 Page Scan 只执行一次语义增强；Popup 和 Follow-up 不再重复发送 `ENHANCE_RECORDS`。
- 收紧全 DOM、inline script、Structured State、MAIN-world Store 和 API JSON 的扫描/复制预算。
- Application Data Extractor 增加对象相关性门控，避免对大型状态树中的每个对象都分配浅层字段快照。
- `PAGE_SCAN_RESULT` 仅在页面结果发生变化或用户主动扫描时写入 storage，减少 Service Worker 与 `chrome.storage` 抖动。
- 新增性能安全回归：旧 v2.2.0 UI 在 Chromium 合成页面中 8–12 秒内主线程失去响应；v2.2.1 在持续 50ms DOM mutation 下 14 秒 JS Heap 稳定约 1.91–1.94 MB。

## 2.2.0

- 新增自动跟进三级执行策略：`API GET -> Structured State -> Page Scan`。
- 新增安全 GET API 探测：仅尝试 HTTPS、同源、明显属于申请/投递查询、且不包含提交/撤回/修改等动作词的 URL。
- 成功且高置信的 GET 查询可缓存为站点级 API Hint，后续可在不打开招聘页面时直接复用；含 token/sign/session 等敏感参数的 URL 不缓存。
- 新增 Structured State 提取：读取页面 JSON script、SSR 数据和少量常见 MAIN-world Store，全程有界复制且不使用 `eval`。
- 新增 target-assisted Application Data Extractor，只有与飞书已有岗位高置信匹配的结构化记录才会参与状态更新。
- 新增“检查方式”飞书字段，记录本轮使用 `API GET / Structured State / Page Scan`。
- 设置页新增“优先安全 GET API”和“Structured State”开关。
- Provider Registry 升级 strategies/capabilities，为 Feishu Jobs、Moka、Beisen / Zhiye、自研 SPA 开启三级策略能力。
- 增加 API-first、Structured State、三级降级、敏感 URL 缓存保护等回归测试。

## 2.1.0

- 新增 Recruitment Provider Registry，自动识别招聘网站所属招聘系统。
- 第一批 Provider：Feishu Jobs、Moka、Beisen / Zhiye、自研 SPA、Generic Web。
- Provider 按招聘系统复用规则，不按具体公司堆叠 Adapter。
- 自动跟进时使用 Provider 参与检查 URL 选择与已打开 Tab 排序。
- 飞书自动跟进字段新增“招聘系统”。

## 2.0.0

- 新增每 6 小时自动跟进调度器，可配置 1–72 小时。
- 从飞书读取进行中的投递记录，并按招聘网站分组检查。
- 安全模式复用已打开页面；实验模式支持后台打开非激活标签页检查。
- 只有高置信匹配且状态发生变化时才更新飞书当前状态。
