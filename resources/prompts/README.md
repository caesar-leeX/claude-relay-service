# System Prompts

此目录包含所有服务的默认系统提示词（system prompts）。

## 文件说明

- **codex.txt** - Codex CLI (OpenAI Responses) 的默认系统提示词（~24KB）
- **claude-code.txt** - Claude Code 的默认系统提示词（57字符）
- **droid.txt** - Droid (Factory.ai) 的默认系统提示词（65字符）

## 使用说明

### 文件格式
- 所有文件使用 UTF-8 编码
- 纯文本格式，无需特殊标记
- 支持多行和特殊字符

### 修改方式

1. **手动编辑**：直接修改此目录下的 .txt 文件，重启服务生效
2. **Web 界面**：通过 `/admin-next/prompts` 页面在线编辑（支持热重载）
3. **文件上传**：通过 Web 界面上传 .txt 文件（适合大型 prompt）
4. **URL 导入**：从 HTTPS URL 导入 prompt（仅支持 HTTPS）

### 配置控制

在 `config/config.js` 中可以控制每个服务的 prompt 启用/禁用：

```javascript
prompts: {
  codex: { enabled: true },      // 启用 Codex prompt
  claudeCode: { enabled: true }, // 启用 Claude Code prompt
  droid: { enabled: true }       // 启用 Droid prompt
}
```

环境变量：
```bash
CODEX_PROMPT_ENABLED=true
CLAUDE_CODE_PROMPT_ENABLED=true
DROID_PROMPT_ENABLED=true
```

### 三级优先级系统

#### Codex / Claude Code（P1 > P2 > P3）
- **P1（最高）**：用户自定义 instructions/system message（始终优先）
- **P2（默认）**：使用配置的默认 prompt（config.prompts.*.enabled = true）
- **P3（最低）**：无注入（config.prompts.*.enabled = false）

#### Droid（仅 P2/P3，无 P1）
- **P2（默认）**：前置注入 Droid prompt（config.prompts.droid.enabled = true）
- **P3（最低）**：无注入（config.prompts.droid.enabled = false）
- **特殊行为**：Droid 不检查用户自定义，始终前置注入（保持向后兼容性）

## 安全限制

通过 Web API 修改 prompt 时的安全限制：
- 需要管理员认证（Admin token）
- 最大文件大小：1MB
- 禁止控制字符（\x00-\x1F，除了 \n \r \t）
- 禁止零宽字符（\u200B-\u200D）
- 禁止方向控制符（\u202A-\u202E，如 RTL override）
- URL 导入仅支持 HTTPS（不支持 HTTP）

## 热重载

通过 Web API 修改 prompt 后会自动触发热重载，无需重启服务：
- PUT `/admin/prompts/:service` - 手动编辑保存后
- POST `/admin/prompts/:service/upload` - 文件上传后
- POST `/admin/prompts/:service/import-url` - URL 导入后

## 技术细节

- 启动时由 `promptLoader` 服务加载到内存
- O(1) 检索性能（对象属性直接访问）
- 内存占用：~25KB（所有 prompts）
- 缺失关键文件会拒绝启动（fail fast）
