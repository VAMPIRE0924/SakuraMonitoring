# Sakura Monitoring

Sakura Monitoring 是面向哪吒监控的独立前台主题。主题直接使用哪吒官方 API、WebSocket、路由和数据类型，并与 Dashboard 后端一起编译进 Linux 二进制文件。

当前适配基线记录在 `upstreams.lock.json`：哪吒后端 `v2.6.1`，官方前端契约 `v2.7.0`；Sakura 保持独立主题实现。

## macOS 初始化与验证

```bash
./scripts/bootstrap-macos.sh --install-all
./scripts/mac-verify.sh
```

项目日常工具使用 Bash，不要求 PowerShell。Go 安装在项目忽略的 `.tools/go` 中；后端 CGO 测试还需要通过 `xcode-select --install` 安装 Apple Command Line Tools。

正式 Linux `amd64` 与 `arm64` 包由 `.github/workflows/build.yml` 构建和验证；`v*` 标签会创建 GitHub Release。

官方 `v2.6.1` 使用 Go `1.26.9`；本项目经授权将工具链锁定为安全修复版 Go `1.26.10`，并最小更新 `golang.org/x/net` 修复已知漏洞，业务逻辑跟随官方，前端安装限制为内嵌的 OfficialAdmin、Official、Sakura。发布验证包含旧、新 Agent 的持续上报、任务连接、WebSocket 在线状态、GPU 显存和在线历史契约检查。

## 升级

```bash
# 检查上游更新
./scripts/update-upstreams.sh

# 在隔离目录准备新版源码供适配审查
./scripts/update-upstreams.sh --prepare
```

`--prepare` 不会覆盖当前 Sakura 实现。完成源码对照、自动化测试和真实站点回归后，再更新版本锁并发布。
