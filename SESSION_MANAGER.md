# OfferTrack Session Manager (v2.3)

Session Manager 负责记录“招聘网站当前是否适合自动跟进”，不负责账号登录，也不读取 Cookie。

## 状态

- `healthy`：最近一次检查能够访问并得到有效页面/记录。
- `login_required`：页面明确要求重新登录。
- `challenge`：页面明确要求滑块、人机或安全验证。
- `rate_limited`：页面提示访问频繁、异常流量或暂时受限。
- `error`：普通检查异常；连续 3 次才触发短暂熔断。

## 冷却

- login_required：12h
- challenge：2h
- rate_limited：6h
- error：连续 3 次后 1h

Alarm 自动任务遵守冷却；以下情况绕过冷却：

1. 用户点击“立即跟进一次”；
2. 用户已经主动打开该招聘网站。

一旦重新检查成功，状态自动恢复为 `healthy`。

## 本地存储

只保存：域名、Provider、状态、简短原因、检查时间、最近健康时间、连续失败次数、冷却截止时间、去除 query 的安全页面 URL。

不保存：Cookie、Token、App Secret、手机号、密码、验证码、API 响应正文。

最多保留 120 个站点，超过 90 天未检查的记录自动淘汰。
