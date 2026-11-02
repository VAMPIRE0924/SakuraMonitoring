# Sakura Monitoring

Sakura Monitoring 是面向哪吒监控的独立前台主题。主题直接使用哪吒官方 API、WebSocket、路由和数据类型，并与 Dashboard 后端一起编译进 Linux 二进制文件。

当前适配基线记录在 `upstreams.lock.json`：哪吒后端 `v2.6.1`，官方前端契约 `v2.7.0`；Sakura 保持独立主题实现。

## 从源码构建

```bash
./scripts/bootstrap-macos.sh --install-all
./scripts/mac-verify.sh
```

构建脚本使用 Bash。Go 安装在项目忽略的 `.tools/go` 中；后端 CGO 测试还需要通过 `xcode-select --install` 安装 Apple Command Line Tools。

Linux `amd64` 与 `arm64` 安装包可从 GitHub Releases 下载，构建配置见 `.github/workflows/build.yml`。

构建工具链为 Go `1.26.10`，`golang.org/x/net` 包含安全更新。内置主题为 OfficialAdmin、Official、Sakura。

## 升级

```bash
# 检查上游更新
./scripts/update-upstreams.sh

# 将新版源码下载到隔离目录
./scripts/update-upstreams.sh --prepare
```

`--prepare` 将上游源码下载到隔离目录，不会覆盖当前 Sakura 实现。
