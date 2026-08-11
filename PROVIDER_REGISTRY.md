# Recruitment Provider Registry — v2.2

当前 Provider：

- `feishu_jobs` — Feishu Jobs
- `moka` — Moka
- `beisen_zhiye` — Beisen / Zhiye
- `self_hosted_spa` — 自研 SPA / Hash 路由招聘站
- `generic_web` — 通用网页回退

v2.2 中 Provider 除了识别招聘系统，还声明执行能力：

- `api_get`
- `structured_state`
- `page_scan`

ATS 与自研 SPA 默认按 `API GET -> Structured State -> Page Scan` 尝试；Generic Web 默认从 Structured State 开始，不主动做 API 探测。

API GET 仅限同源 HTTPS 查询，并排除提交、修改、删除、撤回、验证码、埋点等明显非只读路径。成功 API 只有在高置信覆盖飞书目标岗位时才采用。

Provider 代码仍不写具体公司名称；不同公司的同一招聘系统共享 Provider 能力。
