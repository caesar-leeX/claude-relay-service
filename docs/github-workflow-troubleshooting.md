# GitHub Actions Workflow 故障排查指南

## 问题场景

**症状**：代码提交后，Auto Release Pipeline 工作流未自动运行，导致 Docker 镜像未构建。

**具体案例**：v2.0.0 Prompt Management System 实现

## 根本原因

### 原因1：GitHub Actions 安全策略（主要原因）

**触发条件**：
```bash
# 提交修改了工作流文件本身
git commit .github/workflows/auto-release-pipeline.yml -m "feat: xxx"
```

**安全机制**：
- GitHub 自动阻止该工作流运行
- 防止代码注入攻击（PR 或 commit 中的恶意工作流修改）
- **需要手动批准后才能运行**

**检测方法**：
```bash
# 查看提交修改的文件
git show --name-only <commit-hash>

# 如果包含 .github/workflows/ 文件，则会被阻止
```

### 原因2：工作流配置逻辑（次要原因）

**配置位置**：`.github/workflows/auto-release-pipeline.yml` 第59-61行

```yaml
# 检查是否是需要忽略的文件
if [[ ! "$file" =~ \.(md|txt)$ ]] &&
   [[ ! "$file" =~ ^docs/ ]] &&
   [[ ! "$file" =~ ^\.github/ ]] &&  # ← 排除 .github/ 目录
```

**设计目的**：
- 防止工作流文件修改触发无限递归
- 避免纯文档修改触发版本发布

**副作用**：
- 合理的 `.github/` 修改也被跳过
- 即使通过手动批准，也会被判定为 "No significant changes"

## 完整因果链

```
提交 5bc4211 (v2.0.0 代码)
├─ 修改了 .github/workflows/auto-release-pipeline.yml
│  └─ GitHub 安全策略阻止工作流运行 ← 主要原因
│
└─ 假设工作流运行（手动批准）
   └─ 第61行 `[[ ! "$file" =~ ^\.github/ ]]` 排除所有修改
      └─ 输出 "No significant changes, skipping version bump"
         └─ 不创建 Release，不构建 Docker 镜像
```

## 解决方案

### 方案A：拆分提交（推荐，预防性）

```bash
# 1. 工作流修改单独提交
git add .github/workflows/auto-release-pipeline.yml
git commit -m "chore: update workflow configuration"
git push origin main

# 2. 等待手动批准后，再提交功能代码
git add src/ resources/ config/ docs/
git commit -m "feat: implement v2.0.0 Prompt Management System"
git push origin main  # 这次会正常触发工作流
```

**优点**：
- 完全避免安全策略阻止
- 工作流正常自动运行
- 符合 GitHub 最佳实践

### 方案B：手动创建 Release（应急方案）

```bash
# 1. 创建并推送 tag
git tag -a v2.0.0 -m "Release v2.0.0"
git push origin v2.0.0

# 2. 使用 gh CLI 创建 Release
cat > /tmp/release-notes.md <<'EOF'
## v2.0.0 - Prompt Management System

### 核心功能
- 统一 Prompt 管理系统
- Web 管理界面
- 架构优化（配置重复减少84%）

详见 [CHANGELOG.md](docs/CHANGELOG.md)
EOF

gh release create v2.0.0 \
  --title "v2.0.0 - Prompt Management System" \
  --notes-file /tmp/release-notes.md
```

**优点**：
- 快速解决问题
- 适合紧急情况

**缺点**：
- 不触发自动构建（需要额外步骤）

### 方案C：触发 Docker 构建（后续步骤）

```bash
# 方法1：修改代码文件触发
git commit --allow-empty -m "chore: trigger Docker build for v2.0.0"
git push origin main

# 方法2：修改版本号文件
echo "2.0.0" > package.json  # 修改 version 字段
git add package.json
git commit -m "chore: bump version to 2.0.0 for Docker build"
git push origin main
```

**说明**：
- 修改非 `.github/` 文件会正常触发工作流
- 工作流自动检测版本号并构建 Docker 镜像

## 验证工作流运行

### 方法1：GitHub Web UI

```
https://github.com/<username>/<repo>/actions
```

### 方法2：GitHub API

```bash
# 获取最近的工作流运行记录
curl -s "https://api.github.com/repos/<username>/<repo>/actions/runs?per_page=5" \
  | jq -r '.workflow_runs[] | "\(.id) | \(.status) | \(.conclusion) | \(.head_commit.message[0:60])"'
```

### 方法3：gh CLI

```bash
# 查看最近10次运行
gh run list --limit 10

# 查看特定运行的详细信息
gh run view <run-id>
```

## 预防措施

### 开发流程规范

1. **工作流修改独立处理**
   - 永远单独提交工作流文件
   - 等待手动批准后再提交功能代码

2. **版本发布检查清单**
   ```bash
   # 提交前检查
   git diff --name-only HEAD

   # 如果包含 .github/workflows/，拆分提交
   git reset HEAD .github/workflows/
   ```

3. **CI/CD 监控**
   - 每次推送后检查 Actions 页面
   - 设置 Webhook 通知（Telegram/Slack）

### 工作流配置优化（可选）

如果需要允许某些 `.github/` 文件修改触发构建，可以修改判断逻辑：

```yaml
# 当前逻辑（第61行）
[[ ! "$file" =~ ^\.github/ ]] &&

# 优化逻辑（仅排除 workflows）
[[ ! "$file" =~ ^\.github/workflows/ ]] &&
```

**注意**：
- 修改后仍然会受 GitHub 安全策略影响
- 建议保持当前配置，通过流程规范避免问题

## 实际案例：v2.0.0 发布过程

### 时间线

1. **2025-01-05 00:30** - 提交 5bc4211 (v2.0.0 代码)
   - ❌ 工作流未运行（修改了 workflow 文件）

2. **2025-01-05 00:48** - 提交 7c0bc50 (CHANGELOG.md)
   - ✅ 工作流运行
   - ⚠️ 输出 "No significant changes" （只修改了 docs/）

3. **2025-01-05 01:08** - 手动创建 Release v2.0.0
   - ✅ Release 发布成功
   - ❌ Docker 镜像未构建（未触发工作流）

4. **2025-01-05 09:15** - 修改 package.json 触发构建
   - ✅ 工作流正常运行
   - ✅ Docker 镜像构建成功（v2.0.1）

### 教训总结

1. **工作流修改必须拆分提交** - 避免 GitHub 安全策略阻止
2. **Release 创建不等于 Docker 构建** - 需要额外触发工作流
3. **监控 Actions 页面** - 及时发现问题
4. **保留应急方案** - 手动创建 Release + 触发构建

## 相关资源

- [GitHub Actions 安全策略](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [工作流语法参考](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [项目工作流配置](../.github/workflows/auto-release-pipeline.yml)
- [CHANGELOG.md](./CHANGELOG.md)

## 快速参考

### 常见错误判断

| 症状 | 原因 | 解决方案 |
|------|------|----------|
| 工作流未运行 | 修改了 workflow 文件 | 拆分提交 |
| "No significant changes" | 只修改了 docs/ 或 .github/ | 修改代码文件触发 |
| Release 创建但无 Docker 镜像 | Release 不触发工作流 | 手动触发构建 |
| 工作流运行但跳过构建 | VERSION 文件未更新 | 修改 package.json 或 VERSION |

### 快速命令

```bash
# 检查最近提交修改的文件
git log --name-only -1

# 拆分已提交的修改
git reset --soft HEAD~1
git add .github/workflows/
git commit -m "chore: update workflow"
git push
git add .
git commit -m "feat: original changes"
git push

# 手动触发构建
git commit --allow-empty -m "chore: trigger CI/CD"
git push

# 查看工作流状态
gh run list --limit 5
```

---

**最后更新**: 2025-01-05
**适用版本**: v2.0.0+
