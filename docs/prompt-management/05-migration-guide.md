# Prompt 管理系统 - 迁移指南

> **相关文档**：[v2.0.0 升级计划](../v2.0.0-prompt-management-plan-clean.md) | [实施指南](./02-implementation-guide.md)

---

## 📋 迁移概览

### 升级信息

- **从版本**: v1.x
- **到版本**: v2.0.0
- **升级时间**: 预计 30 分钟
- **停机时间**: 需要重启服务
- **数据迁移**: 无需数据迁移
- **回滚难度**: 简单（保留旧代码）

### 重要提示

⚠️ **必读事项**：
1. 本次升级**修复了 2 个 bug**（用户自定义被忽略）
2. 默认行为完全兼容（无用户自定义时）
3. 需要创建 `resources/prompts/` 目录和文件
4. 建议在测试环境先验证

---

## 🔍 影响评估

### 受影响的组件

| 组件 | 影响程度 | 说明 |
|------|---------|------|
| `promptLoader.js` | ✅ 新增 | 新服务，无影响 |
| `openaiRoutes.js` | ⚠️ 修改 | 删除硬编码，实现三级优先级 |
| `openaiToClaude.js` | ⚠️ 修改 | 移除 Xcode 检测，实现三级优先级 |
| `droidRelayService.js` | ⚠️ 修改 | 移除常量，使用 promptLoader |
| `config.js` | ✅ 新增 | 新增 `prompts` 配置块 |
| Web 管理界面 | ✅ 新增 | 新增 Prompts 管理页面 |

### 用户影响评估

| 用户类型 | 受影响场景 | 影响 |
|---------|-----------|------|
| **Codex 默认用户（95%）** | 无自定义 instructions | 无影响 |
| **Codex CLI 用户（4%）** | 标准格式 instructions | 无影响 |
| **Codex 自定义用户（<1%）** | 非标准格式 instructions | ✅ Bug 修复 |
| **Claude 默认用户（95%）** | 无自定义 system message | 无影响 |
| **Xcode 用户（3%）** | Xcode 格式 system message | 无影响 |
| **Claude 自定义用户（<2%）** | 非 Xcode 格式 system message | ✅ Bug 修复 |
| **Droid 用户（100%）** | 所有场景 | 无影响 |

**结论**: 90%+ 用户无影响，<5% 用户受益于 bug 修复

---

## 📦 升级前准备

### 1. 备份现有代码

```bash
# 创建备份分支
git checkout -b backup-v1.x-$(date +%Y%m%d)
git push origin backup-v1.x-$(date +%Y%m%d)

# 或打包备份
tar -czf backup-v1.x-$(date +%Y%m%d).tar.gz \
  src/routes/openaiRoutes.js \
  src/services/openaiToClaude.js \
  src/services/droidRelayService.js \
  config/config.js
```

### 2. 检查当前环境

```bash
# 检查 Node.js 版本
node --version  # 应该 >= 14.x

# 检查 Redis 连接
redis-cli ping  # 应该返回 PONG

# 检查磁盘空间（需要 ~50MB 用于 prompts）
df -h

# 检查文件权限
ls -la resources/  # 确保可写
```

### 3. 提取现有 Prompts

**Codex Prompt**:
```bash
# 从 openaiRoutes.js:283 提取
grep -A 100 "req.body.instructions =" src/routes/openaiRoutes.js | head -n 95 > /tmp/codex-prompt-backup.txt
```

**Claude Code Prompt**:
```bash
# 从 openaiToClaude.js:35 提取
grep "claudeCodeSystemMessage =" src/services/openaiToClaude.js
# 输出: const claudeCodeSystemMessage = "You are Claude Code, Anthropic's official CLI for Claude."
```

**Droid Prompt**:
```bash
# 从 droidRelayService.js:12 提取
grep "const SYSTEM_PROMPT =" src/services/droidRelayService.js
# 输出: const SYSTEM_PROMPT = 'You are Droid, an AI software engineering agent built by Factory.'
```

---

## 🚀 升级步骤

### 步骤 1: 创建 Prompt 文件

```bash
# 1.1 创建目录
mkdir -p resources/prompts

# 1.2 创建 Codex prompt
cat > resources/prompts/codex.txt << 'EOF'
You are a coding agent running in the Codex CLI, a terminal-based coding assistant...
（从 openaiRoutes.js:283 复制完整内容）
EOF

# 1.3 创建 Claude Code prompt
echo "You are Claude Code, Anthropic's official CLI for Claude." > resources/prompts/claude-code.txt

# 1.4 创建 Droid prompt
echo "You are Droid, an AI software engineering agent built by Factory." > resources/prompts/droid.txt

# 1.5 验证文件
ls -lh resources/prompts/
```

**预期输出**:
```
-rw-r--r-- 1 user user  57 Jan  5 10:00 claude-code.txt
-rw-r--r-- 1 user user 23K Jan  5 10:00 codex.txt
-rw-r--r-- 1 user user  65 Jan  5 10:00 droid.txt
```

### 步骤 2: 安装代码更新

参见 [实施指南](./02-implementation-guide.md) 的完整代码。

**关键文件**:
1. `src/services/promptLoader.js` - 新增
2. `src/routes/openaiRoutes.js` - 修改（第 260-289 行）
3. `src/services/openaiToClaude.js` - 修改（第 34-52 行）
4. `src/services/droidRelayService.js` - 修改（第 12、29、1008-1035 行）
5. `config/config.example.js` - 新增 `prompts` 配置块

### 步骤 3: 更新配置

**3.1 添加配置块到 config.js**:
```javascript
// 在 bedrock 配置之后添加
prompts: {
  codex: { enabled: process.env.CODEX_PROMPT_ENABLED !== 'false' },
  claudeCode: { enabled: process.env.CLAUDE_CODE_PROMPT_ENABLED !== 'false' },
  droid: { enabled: process.env.DROID_PROMPT_ENABLED !== 'false' }
}
```

**3.2 更新 .env（可选）**:
```bash
# 默认全部启用，无需修改
# 如需禁用某个 prompt，取消注释并设置为 false
# CODEX_PROMPT_ENABLED=false
# CLAUDE_CODE_PROMPT_ENABLED=false
# DROID_PROMPT_ENABLED=false
```

### 步骤 4: 初始化 promptLoader

**在 app.js 添加**:
```javascript
const promptLoader = require('./services/promptLoader')

async function initializeServices() {
  // ... 其他初始化 ...
  await promptLoader.initialize()
  // ... 其他初始化 ...
}
```

### 步骤 5: 验证安装

```bash
# 5.1 运行 linter
npm run lint

# 5.2 运行单元测试
node scripts/test-prompt-loader.js

# 5.3 运行集成测试
node scripts/test-integration-prompts.js
```

**预期所有测试通过**。

---

## 🔄 升级流程（生产环境）

### 1. 停机维护（推荐）

```bash
# 1.1 停止服务
npm run service:stop

# 1.2 备份数据
redis-cli SAVE

# 1.3 安装更新
# （执行上述"升级步骤"）

# 1.4 启动服务
npm run service:start:daemon

# 1.5 验证启动成功
npm run service:status
tail -f logs/claude-relay-*.log
```

### 2. 滚动升级（高可用）

如果使用负载均衡：

```bash
# 对每个节点：
# 2.1 从负载均衡移除
# 2.2 执行升级步骤
# 2.3 验证服务正常
# 2.4 加回负载均衡
# 2.5 继续下一个节点
```

---

## ✅ 升级后验证

### 验证清单

- [ ] **服务启动成功**
  ```bash
  npm run service:status
  # 或
  curl http://localhost:3000/health
  ```

- [ ] **Prompt Loader 已加载**
  ```bash
  tail -100 logs/claude-relay-*.log | grep "💬 Prompt loader initialized successfully"
  ```

- [ ] **所有 Prompts 已加载**
  ```bash
  tail -100 logs/claude-relay-*.log | grep "✅ Loaded"
  # 应该看到 3 条日志：codex, claudeCode, droid
  ```

- [ ] **Codex 默认行为正常**
  ```bash
  # 发送无 instructions 的请求
  curl -X POST http://localhost:3000/openai/v1/responses \
    -H "Authorization: Bearer your-api-key" \
    -H "Content-Type: application/json" \
    -d '{"model":"gpt-5","messages":[{"role":"user","content":"Test"}]}'

  # 检查日志：应该看到注入了 24KB prompt
  ```

- [ ] **Claude 默认行为正常**
  ```bash
  # 发送无 system message 的请求
  curl -X POST http://localhost:3000/openai/claude/v1/chat/completions \
    -H "Authorization: Bearer your-api-key" \
    -H "Content-Type: application/json" \
    -d '{"model":"claude-sonnet-4","messages":[{"role":"user","content":"Test"}]}'

  # 检查日志：应该看到注入了 57 字符 prompt
  ```

- [ ] **Bug 修复生效**
  ```bash
  # 测试 Codex 非标准格式
  curl -X POST http://localhost:3000/openai/v1/responses \
    -H "Authorization: Bearer your-api-key" \
    -H "Content-Type: application/json" \
    -d '{"model":"gpt-5","instructions":"Custom prompt","messages":[{"role":"user","content":"Test"}]}'

  # 检查日志：应该看到 "📝 使用用户自定义 instructions"
  # 而不是 "Non-Codex CLI request detected"
  ```

- [ ] **Web 管理界面可用**
  ```bash
  # 访问浏览器
  open http://localhost:3000/admin-next/prompts

  # 或测试 API
  curl http://localhost:3000/admin/prompts/codex \
    -H "Authorization: Bearer $(cat data/init.json | jq -r '.credentials.password')"
  ```

---

## 🔙 回滚方案

### 快速回滚（< 5 分钟）

如果升级后发现问题，可以快速回滚：

```bash
# 1. 停止服务
npm run service:stop

# 2. 回滚代码
git checkout backup-v1.x-20250105

# 或从备份恢复
tar -xzf backup-v1.x-20250105.tar.gz

# 3. 启动服务
npm run service:start:daemon

# 4. 验证服务
npm run service:status
```

### 回滚清理

**删除新增的文件**（可选）:
```bash
rm -rf resources/prompts/
rm src/services/promptLoader.js
```

**恢复配置文件**:
```bash
# 从 config.js 删除 prompts 配置块
# 从 .env 删除 PROMPT_ENABLED 变量
```

---

## 📊 升级监控

### 关键指标

**升级前记录**:
```bash
# 内存使用
ps aux | grep node | awk '{print $6}'

# 平均响应时间
curl -w "@curl-format.txt" http://localhost:3000/health

# 错误率
grep "ERROR" logs/claude-relay-*.log | wc -l
```

**升级后对比**:
- 内存增加应该 <100KB
- 响应时间增加应该 <20ms
- 错误率应该不变

### 日志监控

**关键日志模式**:
```bash
# 成功日志
tail -f logs/claude-relay-*.log | grep "💬 Prompt loader initialized"

# 警告日志
tail -f logs/claude-relay-*.log | grep "⚠️"

# 错误日志
tail -f logs/claude-relay-*.log | grep "❌"
```

---

## 🚨 常见问题和解决方案

### 问题 1: promptLoader 初始化失败

**症状**:
```
❌ Failed to initialize prompt loader: Error: Prompts directory not found
```

**解决**:
```bash
# 检查目录
ls -la resources/prompts/

# 如果不存在，创建
mkdir -p resources/prompts
# 然后创建 3 个 .txt 文件
```

---

### 问题 2: 某个 Prompt 未加载

**症状**:
```
⚠️ Prompt file not found: codex.txt, skipping
```

**解决**:
```bash
# 检查文件
ls -la resources/prompts/codex.txt

# 如果不存在，从备份恢复
cat /tmp/codex-prompt-backup.txt > resources/prompts/codex.txt

# 重启服务
npm run service:stop && npm run service:start:daemon
```

---

### 问题 3: 配置未生效

**症状**:
- 设置 `CODEX_PROMPT_ENABLED=false`
- 但仍然在注入 prompt

**解决**:
```bash
# 1. 检查 .env 文件
cat .env | grep CODEX_PROMPT_ENABLED

# 2. 检查配置是否加载
node -e "console.log(require('./config/config').prompts.codex.enabled)"

# 3. 确保重启了服务
npm run service:stop && npm run service:start:daemon
```

---

### 问题 4: Web 界面 404

**症状**:
- 访问 `/admin-next/prompts` 返回 404

**解决**:
```bash
# 1. 检查路由是否添加
grep "prompts" web/admin-spa/src/router/index.js

# 2. 重新构建前端
cd web/admin-spa
npm run build

# 3. 重启服务
npm run service:stop && npm run service:start:daemon
```

---

## 📋 升级检查清单

### 升级前

- [ ] 阅读升级计划和迁移指南
- [ ] 备份现有代码
- [ ] 备份 Redis 数据
- [ ] 提取现有 prompts
- [ ] 在测试环境验证

### 升级中

- [ ] 创建 `resources/prompts/` 目录
- [ ] 创建 3 个 .txt 文件
- [ ] 安装代码更新
- [ ] 更新配置文件
- [ ] 运行 linter 和测试

### 升级后

- [ ] 验证服务启动成功
- [ ] 验证 promptLoader 已加载
- [ ] 验证默认行为正常
- [ ] 验证 bug 修复生效
- [ ] 验证 Web 管理界面
- [ ] 监控关键指标 24 小时

---

## 📚 相关文档

- [v2.0.0 升级计划](../v2.0.0-prompt-management-plan-clean.md)
- [架构设计](./01-architecture.md)
- [实施指南](./02-implementation-guide.md)
- [测试计划](./04-testing-plan.md)
