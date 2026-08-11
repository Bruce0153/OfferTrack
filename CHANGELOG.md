# Change Log

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
