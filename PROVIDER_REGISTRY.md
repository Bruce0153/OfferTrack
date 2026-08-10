# Recruitment Provider Registry

OfferTrack v2.1 将自动跟进从“按公司适配”升级为“按招聘系统 Provider 识别”。

当前 Provider：

- `feishu_jobs` — Feishu Jobs
- `moka` — Moka
- `beisen_zhiye` — Beisen / Zhiye
- `self_hosted_spa` — 自研 SPA / Hash 路由招聘站
- `generic_web` — 通用网页回退

每个 Provider 暴露统一元信息：

- `id / name / family`
- `strategies`
- `capabilities`
- Provider URL 检测与检查页评分

v2.1 仍以页面扫描作为实际执行层，Provider Registry 主要负责识别、检查 URL 选择和能力声明。v2.2 将在这个接口之上增加 `API -> Structured State -> Page Scan` 的三级执行策略。

原则：Provider 代码不写具体公司名称，只有真正无法归类的自研招聘站才落入 `self_hosted_spa` / `generic_web`。
