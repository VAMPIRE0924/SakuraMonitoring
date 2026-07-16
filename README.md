# Sakura Monitoring

Sakura Monitoring 是面向哪吒监控的独立前台主题。主题直接使用哪吒官方 API、WebSocket、路由和数据类型，并与 Dashboard 后端一起编译进 Linux 二进制文件。

当前适配基线记录在 `upstreams.lock.json`：哪吒后端 `v2.2.10`，前端 `v2.4.2`。

## 构建

```powershell
# 环境与源码检查
powershell -ExecutionPolicy Bypass -File .\scripts\verify-environment.ps1 -RunGoTests -RunFrontendSmoke

# Linux x86_64
powershell -ExecutionPolicy Bypass -File .\scripts\build-sakura-release.ps1 -SkipInstall -Goarch amd64

# Linux ARM64
powershell -ExecutionPolicy Bypass -File .\scripts\build-sakura-release.ps1 -SkipInstall -Goarch arm64
```

正式构建使用 `CGO_ENABLED=1` 和静态链接，包含 SQLite、有效 GeoIP 数据库、官方管理端、官方前台及 Sakura 前台。GitHub Release 只发布 Linux amd64 与 Linux arm64。

## 升级

```powershell
# 检查上游更新
powershell -ExecutionPolicy Bypass -File .\scripts\update-upstreams.ps1

# 在隔离目录准备新版源码供适配审查
powershell -ExecutionPolicy Bypass -File .\scripts\update-upstreams.ps1 -Prepare
```

`-Prepare` 不会覆盖当前 Sakura 实现。完成源码对照、自动化测试和真实站点回归后，再更新版本锁并发布。
