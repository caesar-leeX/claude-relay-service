# Prompt 管理系统文档

v2.0.0 引入的统一 Prompt 管理系统完整文档。

## 📚 文档索引

### [流程图 (FLOW.md)](./FLOW.md)
- Codex 提示词注入逻辑完整流程图
- 三级优先级决策树
- 实际场景对照表
- 代码执行路径

### [设计文档 (DESIGN.md)](./DESIGN.md)
- 方案 B 完整设计
- 架构决策分析
- 实施方案对比（方案 A vs 方案 B）
- 技术细节说明

### [实施文档 (IMPLEMENTATION.md)](./IMPLEMENTATION.md)
- 完整实施步骤
- 代码变更详情
- 测试验证结果
- 部署指南

### [完整分析 (ANALYSIS.md)](./ANALYSIS.md)
- Prompt 管理问题完整分析
- 成本和性能影响
- 向后兼容性评估
- 最佳实践建议

## 🎯 快速导航

**想了解逻辑流程？** → [FLOW.md](./FLOW.md)

**想了解为什么这样设计？** → [DESIGN.md](./DESIGN.md)

**想了解如何实施的？** → [IMPLEMENTATION.md](./IMPLEMENTATION.md)

**想了解完整分析？** → [ANALYSIS.md](./ANALYSIS.md)

## 📖 相关文档

- [CHANGELOG.md](../../CHANGELOG.md) - v2.0.0 更新日志
- [CLEANUP_REPORT_2025-10-31.md](../../CLEANUP_REPORT_2025-10-31.md) - 代码清理报告
- [PROMPT_MANAGEMENT_AUDIT_FINAL_2025-10-31.md](../../PROMPT_MANAGEMENT_AUDIT_FINAL_2025-10-31.md) - 审计报告

## 🔧 配置参考

**环境变量**：
```bash
# Codex Prompt 配置
CODEX_USE_DEFAULT_PROMPT=true          # 是否注入默认 prompt（默认 true）
CODEX_DEFAULT_SCENARIO=default         # 场景选择（default/gpt-5-codex/review）

# Claude Code Prompt 配置
OPENAI_TO_CLAUDE_USE_DEFAULT_PROMPT=true

# Droid Prompt 配置
DROID_INJECT_SYSTEM_PROMPT=true
```

**核心文件**：
- `src/services/promptLoader.js` - Prompt 加载器
- `resources/codex-prompts/` - Codex prompt 文件
- `config/config.example.js` - 配置示例

## 🚀 快速开始

### 1. 查看当前配置

```bash
grep CODEX_USE_DEFAULT_PROMPT .env
```

### 2. 修改配置

编辑 `.env` 文件：
```bash
# 禁用 Codex 默认 prompt
CODEX_USE_DEFAULT_PROMPT=false

# 切换到 GPT-5 专用场景
CODEX_DEFAULT_SCENARIO=gpt-5-codex
```

### 3. 重启服务

```bash
npm run service:restart
```

### 4. 验证

查看日志确认配置生效：
```bash
tail -f logs/claude-relay-*.log | grep "📝"
```

## 📝 版本历史

- **v2.0.0** (2025-10-31): 统一 Prompt 管理系统正式发布
  - 实现 promptLoader 服务
  - 支持 Codex/Claude Code/Droid 三个服务
  - 三级优先级系统
  - 27/27 测试通过（100%）
