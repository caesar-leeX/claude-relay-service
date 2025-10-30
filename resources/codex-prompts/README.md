# Codex Prompts

此目录包含从 [OpenAI Codex](https://github.com/openai/codex) 仓库同步的官方 prompt 文件。

## 文件说明

- **default.txt**: 默认 Codex prompt（通用场景）
- **gpt-5-codex.txt**: GPT-5-Codex 专用 prompt
- **review.txt**: 代码审查 prompt

## 同步方法

运行以下命令重新同步这些文件：

```bash
node scripts/sync-codex-prompts.js
```

强制覆盖已存在的文件：

```bash
node scripts/sync-codex-prompts.js --force
```

## 最后更新

- 同步时间: 2025-10-30T18:03:35.090Z
- 仓库: https://github.com/openai/codex
- 分支: main
- 路径: codex-rs/core/

## 注意事项

⚠️ 这些文件会被自动覆盖，请不要手动编辑。如需自定义 prompt，请修改相关服务的配置。
