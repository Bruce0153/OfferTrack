# OfferTrack v2.0.0 内部测试报告

测试环境：GPT 沙箱中的 Node.js 静态/模拟测试。

说明：沙箱无法访问你本机 Edge 的登录 Cookie，因此不能真实登录招聘官网执行账号态网络测试。本阶段使用你此前提供的真实招聘 URL/字段样本构造回归数据，验证调度核心、任务分组、URL 选择、岗位匹配和状态变化逻辑；真实登录态检查需要安装到本机 Edge 后继续做浏览器回归。

## 代表性招聘系统

### 飞书招聘页面

样本：

- `xiaopeng.jobs.feishu.cn/398875/position/application`
- `arashivision.jobs.feishu.cn/campus/position/application`

检查：进行中记录能进入自动跟进队列；不同公司域名分别分组；申请页 URL 优先于详情页。

结果：PASS

### 京东自研 SPA

样本：

- `https://campus.jd.com/api/wx/position/index#/myDeliver`
- 岗位：`算法工程师-AI Infra`

检查：Hash 路由申请页可作为检查 URL；旧状态 `筛选中` 与新状态 `笔试/测评` 可匹配并触发状态变化。

结果：PASS

### 北森 / 智业招聘

样本：

- `https://intsig.zhiye.com/personal/deliveryRecord`
- 岗位：`27届校招-大模型算法工程师(J14380)`

检查：带岗位代码的标题能与扫描结果高置信匹配；不同状态触发 Diff。

结果：PASS

### Moka

样本：

- `https://app.mokahr.com/...#/candidateHome/applications`

检查：候选人申请页 URL 得分高于普通岗位详情 URL。

结果：PASS

## 调度器 Smoke Test

- 开启自动跟进、间隔 6 小时时创建 `offertrack-follow-up` alarm。
- `periodInMinutes = 360`。
- 关闭自动跟进后清除 alarm。

结果：PASS

## 安全逻辑

- `Offer / 已结束 / 已撤回` 默认不进入跟进队列：PASS
- 飞书“自动跟进=关闭”不进入跟进队列：PASS
- 状态未变化时不更新当前状态：PASS（纯逻辑）
- 页面未匹配岗位时不覆盖当前状态：代码路径检查 PASS

## Mocked End-to-End 自动跟进

模拟飞书中两条进行中记录：

- 京东：`筛选中 → 笔试/测评`
- INTSIG：`筛选中 → 面试中`

模拟 Edge 中已经打开对应招聘页面，执行完整链路：

`读取飞书 → 分组 → 找 Tab → SCAN_PAGE → ENHANCE_RECORDS → 岗位匹配 → 状态 Diff → batch_update`

结果：

- checked = 2
- changed = 2
- 两条记录正确写入新状态
- `检查状态=已检查`
- `登录状态=可访问`

结果：PASS

## Background Tab 实验模式

模拟小鹏飞书招聘页面未打开：

- 自动创建 `active:false` 标签页
- 页面加载完成后扫描
- 状态发生变化后回写飞书
- 完成后自动关闭创建的标签页

结果：PASS
