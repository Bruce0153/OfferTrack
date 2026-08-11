# OfferTrack v2.2.0 内部测试报告

测试环境：GPT 沙箱 Node.js、Mock Browser API、模拟飞书 API、代表性招聘系统 JSON Fixture。

## v2.2 风险分析

1. API 误识别：页面资源里可能同时存在职位搜索、埋点、登录、提交等接口。v2.2 只尝试同源 HTTPS、明显属于 application/apply/delivery/process/progress 的 GET URL，并显式屏蔽 submit/create/update/delete/withdraw/cancel 等路径。
2. API 登录/CSRF：扩展后台 fetch 即使带浏览器会话，也可能因为 CSRF、自定义 Header、Origin 校验返回 401/403/405。任何失败都会降级，不把 403 单独视为“已退出登录”。
3. API 返回错误业务数据：只有解析结果与飞书目标岗位高置信匹配且覆盖率达到阈值时才采用。
4. 敏感 URL 缓存：包含 token/auth/sign/session/ticket/share/code 等参数的 URL 不写入本地 API Hint。
5. Structured State 过大或循环引用：MAIN-world 快照限制全局变量白名单、深度、节点数、数组长度和字符串长度。
6. 页面运行时隔离：普通 content script 无法读取页面 JS 全局变量，因此 v2.2 使用 chrome.scripting MAIN world 只读抓取少量已知 Store；不向 MAIN world 暴露 App Secret/飞书 Token。
7. 结构化数据噪声：Application Data Extractor 以飞书已有岗位作为 target-assisted 约束；“跟进应聘进度/查询投递记录”类说明文本不会形成申请记录。
8. 多岗位页面部分覆盖：API/Structured State 必须达到目标岗位覆盖阈值，否则继续 Page Scan，避免把其余岗位误标成“未匹配”。
9. 缓存 API 失效：缓存只保留成功过的安全 GET Hint，最长 30 天；失效后自然回退页面策略。
10. Manifest V3 生命周期：三级检查仍由 alarm 唤醒 Service Worker 执行，不依赖永久后台定时器。

## 测试矩阵

### Application Data Extractor
- Feishu-like positionName/applicationStatus：PASS
- Moka-like job.title/process.statusName：PASS
- Beisen-like position.name/processStatus：PASS
- 功能说明文本负样本：PASS

### API 安全策略
- 同源 application list GET：PASS
- submit API 拒绝：PASS
- 跨源 API 拒绝：PASS
- token 参数禁止缓存：PASS
- cache-buster 参数清理：PASS

### Structured State E2E
飞书旧状态“筛选中”，页面 JSON State 返回“待测评”。
- 未调用 Page Scan
- 正确更新为“笔试/测评”
- 飞书“检查方式”= Structured State
结果：PASS

### API-first E2E
Resource Timing 暴露同源 application list GET，返回高置信岗位状态“面试中”。
- API 优先于 Structured State / Page Scan
- 成功 API Hint 写入本地缓存
- 第二轮关闭招聘 Tab 后仍可复用缓存 API
- 飞书“检查方式”= API GET
结果：PASS

### 三级降级
API 返回无关 JSON，Structured State 仅含说明文字。
- 两层均拒绝采用
- 自动降级 Page Scan
- 正确更新状态
结果：PASS

### 旧版回归
- Provider Registry：PASS
- Scheduler：PASS
- 自动跟进 Mock E2E：PASS
- Background Tab：PASS
- Follow-up Core：PASS
- Service Worker import：PASS
- 全部 JS `node --check`：PASS

## 仍需真实 Edge 验证

GPT 沙箱无法访问用户本机 Edge 的真实 Cookie / Session，因此以下属于 v2.2 本机验证项：
- 扩展 background fetch 对真实招聘 API 的 Cookie 携带情况
- 真实站点 CSRF / Origin / 自定义 Header 要求
- MAIN-world Store 在不同招聘系统实际暴露情况
- API Hint 在真实登录过期后的表现

这些失败路径均设计为安全降级，不会覆盖飞书已有招聘状态。
