# OfferTrack V2 开发路线

## Phase 1 — v2.0 自动化骨架
- [x] chrome.alarms 周期调度
- [x] 飞书任务读取、网站分组、状态 Diff、飞书回写
- [x] 安全模式与后台标签页模式

## Phase 2 — Provider 与请求优先
- [x] v2.1 Recruitment Provider Registry
- [x] Feishu Jobs / Moka / Beisen / Self-hosted SPA
- [x] v2.2 页面 JSON / SSR / MAIN-world State 读取
- [x] v2.2 安全 GET API 发现与高置信采用
- [x] v2.2 API → Structured State → Page Scan 三级降级
- [x] v2.2 成功 API Hint 的本地安全缓存
- [ ] v2.3 Session Manager / 登录健康检查
- [ ] v2.4 Job Queue、退避、错误冷却

## Phase 3 — 正确性与可观测性
- [ ] v2.5 Application Matching / providerApplicationId
- [ ] v2.6 招聘状态状态机与防错误回退
- [ ] v2.7 解析诊断中心 / 自动跟进日志
- [ ] v2.8 Provider 覆盖率与真实 Bad Case Fixture

## Phase 4 — 产品化
- [ ] v2.9 自动跟进控制台 UX
- [ ] v3.0 稳定自动跟进 Agent

原则：不保存招聘网站密码，不绕过验证码，不执行远程代码，不因为检查失败覆盖已有招聘状态。
