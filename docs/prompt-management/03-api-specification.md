# Prompt 管理系统 - API 规范

> **相关文档**：[架构设计](./01-architecture.md) | [实施指南](./02-implementation-guide.md)

---

## 📚 API 概览

### 服务端 API

| 端点 | 方法 | 认证 | 描述 |
|------|------|------|------|
| `/admin/prompts/:service` | GET | 管理员 | 获取 prompt 内容和元数据 |
| `/admin/prompts/:service` | PUT | 管理员 | 更新 prompt 内容 |

### 内部 API

| 模块 | 方法 | 描述 |
|------|------|------|
| `promptLoader` | `initialize()` | 初始化加载所有 prompts |
| `promptLoader` | `getPrompt(service)` | 获取指定服务的 prompt |
| `promptLoader` | `reload()` | 重新加载所有 prompts |
| `promptLoader` | `getHealthStatus()` | 获取健康状态 |

---

## 🌐 HTTP API

### GET /admin/prompts/:service

获取指定服务的 prompt 内容和元数据。

#### 请求

**URL 参数**:
- `service` (string, required): 服务名称
  - 有效值: `codex`, `claudeCode`, `droid`

**请求头**:
```http
Authorization: Bearer <admin-token>
```

**示例**:
```bash
curl -X GET http://localhost:3000/admin/prompts/codex \
  -H "Authorization: Bearer admin-token-here"
```

#### 响应

**成功响应** (200 OK):
```json
{
  "service": "codex",
  "content": "You are a coding agent running in the Codex CLI...",
  "length": 23831,
  "lastModified": "2025-01-05T10:30:00.000Z",
  "enabled": true,
  "filePath": "codex.txt"
}
```

**响应字段**:
- `service` (string): 服务名称
- `content` (string): Prompt 完整内容
- `length` (number): 字符数
- `lastModified` (string, ISO 8601): 最后修改时间
- `enabled` (boolean): 是否启用
- `filePath` (string): 文件名

**错误响应**:

**400 Bad Request** - 无效的服务名称:
```json
{
  "error": "Invalid service. Must be one of: codex, claudeCode, droid"
}
```

**404 Not Found** - Prompt 文件不存在:
```json
{
  "error": "Prompt not found for service: codex"
}
```

**500 Internal Server Error** - 服务器错误:
```json
{
  "error": "Failed to retrieve prompt"
}
```

---

### PUT /admin/prompts/:service

更新指定服务的 prompt 内容。

#### 请求

**URL 参数**:
- `service` (string, required): 服务名称
  - 有效值: `codex`, `claudeCode`, `droid`

**请求头**:
```http
Authorization: Bearer <admin-token>
Content-Type: application/json
```

**请求体**:
```json
{
  "content": "You are a custom assistant..."
}
```

**字段说明**:
- `content` (string, required): 新的 prompt 内容
  - 不能为空字符串
  - 不能只包含空白字符
  - 最大长度: 1MB (1,048,576 字节)
  - 不能包含非法 Unicode 字符（控制字符、零宽字符、方向控制符等）

**示例**:
```bash
curl -X PUT http://localhost:3000/admin/prompts/codex \
  -H "Authorization: Bearer admin-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "You are a helpful coding assistant..."
  }'
```

#### 响应

**成功响应** (200 OK):
```json
{
  "success": true,
  "service": "codex",
  "length": 42,
  "message": "Prompt updated successfully"
}
```

**响应字段**:
- `success` (boolean): 操作是否成功
- `service` (string): 服务名称
- `length` (number): 更新后的字符数
- `message` (string): 成功消息

**错误响应**:

**400 Bad Request** - 无效的服务名称:
```json
{
  "error": "Invalid service"
}
```

**400 Bad Request** - content 不是字符串:
```json
{
  "error": "Content must be a string"
}
```

**400 Bad Request** - content 为空:
```json
{
  "error": "Prompt content cannot be empty"
}
```

**400 Bad Request** - content 过大（>1MB）:
```json
{
  "error": "Prompt too large. Maximum size is 1048576 bytes (1.0MB)"
}
```

**400 Bad Request** - content 包含非法 Unicode 字符:
```json
{
  "error": "Prompt contains invalid Unicode characters (control characters, zero-width characters, etc.)"
}
```

**500 Internal Server Error** - 保存失败:
```json
{
  "error": "Failed to update prompt"
}
```

---

### POST /admin/prompts/:service/upload

上传 prompt 文件。

**认证**: 需要管理员认证（`authenticateAdmin` middleware）

**路径参数**:
- `service` (string): 服务名称（`codex` | `claudeCode` | `droid`）

**请求**:
```http
POST /admin/prompts/:service/upload
Authorization: Bearer <admin-token>
Content-Type: multipart/form-data

file: <prompt文件>
```

**示例**:
```bash
curl -X POST http://localhost:3000/admin/prompts/codex/upload \
  -H "Authorization: Bearer admin-token-here" \
  -F "file=@/path/to/codex-prompt.txt"
```

**响应**:

**200 OK** - 上传成功:
```json
{
  "success": true,
  "service": "codex",
  "length": 23831,
  "source": "upload",
  "originalName": "codex-prompt.txt",
  "message": "Prompt uploaded successfully"
}
```

**400 Bad Request** - 无文件:
```json
{
  "error": "No file uploaded"
}
```

**400 Bad Request** - 文件过大（>1MB）:
```json
{
  "error": "Prompt too large. Maximum size is 1048576 bytes (1.0MB)"
}
```

**400 Bad Request** - 包含非法字符:
```json
{
  "error": "Prompt contains invalid Unicode characters (control characters, zero-width characters, etc.)"
}
```

**500 Internal Server Error**:
```json
{
  "error": "Failed to upload prompt"
}
```

---

### POST /admin/prompts/:service/import-url

从 HTTPS URL 导入 prompt。

**认证**: 需要管理员认证（`authenticateAdmin` middleware）

**路径参数**:
- `service` (string): 服务名称（`codex` | `claudeCode` | `droid`）

**请求体**:
```json
{
  "url": "https://example.com/prompts/codex-latest.txt",
  "validate": true
}
```

**字段说明**:
- `url` (string, required): HTTPS URL（仅支持 HTTPS，不支持 HTTP）
- `validate` (boolean, optional): 是否为验证模式
  - `true`（默认）: 仅下载和验证，返回预览，不保存
  - `false`: 下载、验证并保存

**示例 1 - 验证模式**:
```bash
curl -X POST http://localhost:3000/admin/prompts/codex/import-url \
  -H "Authorization: Bearer admin-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/prompts/codex.txt",
    "validate": true
  }'
```

**示例 2 - 保存模式**:
```bash
curl -X POST http://localhost:3000/admin/prompts/codex/import-url \
  -H "Authorization: Bearer admin-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/prompts/codex.txt",
    "validate": false
  }'
```

**响应**:

**200 OK** - 验证成功（validate=true）:
```json
{
  "validated": true,
  "preview": "You are a coding agent running in the Codex CLI...",
  "length": 23831,
  "url": "https://example.com/prompts/codex.txt",
  "message": "Validation successful. Send again with validate=false to save."
}
```

**200 OK** - 导入成功（validate=false）:
```json
{
  "success": true,
  "service": "codex",
  "length": 23831,
  "source": "url",
  "url": "https://example.com/prompts/codex.txt",
  "message": "Prompt imported successfully"
}
```

**400 Bad Request** - 非 HTTPS:
```json
{
  "error": "Only HTTPS URLs are allowed for security"
}
```

**400 Bad Request** - URL 格式错误:
```json
{
  "error": "Invalid URL format"
}
```

**400 Bad Request** - 下载内容为空:
```json
{
  "error": "Downloaded prompt is empty"
}
```

**400 Bad Request** - 内容过大:
```json
{
  "error": "Downloaded prompt too large. Maximum size is 1048576 bytes (1.0MB)"
}
```

**500 Internal Server Error** - 下载失败:
```json
{
  "error": "Failed to import prompt from URL: HTTP 404: Not Found"
}
```

---

## 🔧 内部 API

### PromptLoader 类

#### 方法概览

```javascript
class PromptLoader {
  async initialize()
  getPrompt(service)
  async reload()
  getHealthStatus()
}
```

---

### initialize()

初始化 promptLoader，加载所有 prompt 文件。

**签名**:
```javascript
async initialize(): Promise<void>
```

**行为**:
1. 检查 `resources/prompts/` 目录是否存在
2. 遍历 `fileMap`，加载每个 .txt 文件
3. 将内容存储到 `this.prompts` 对象
4. 设置 `this.loaded = true`
5. 记录加载日志

**抛出异常**:
- 目录不存在时抛出 `Error`
- 文件不存在时记录警告，继续加载其他文件

**示例**:
```javascript
const promptLoader = require('./services/promptLoader')

await promptLoader.initialize()
// 日志输出:
// ✅ Loaded codex prompt (23831 chars)
// ✅ Loaded claudeCode prompt (57 chars)
// ✅ Loaded droid prompt (65 chars)
// 💬 Prompt loader initialized successfully
// 📊 Loaded 3/3 prompts
```

---

### getPrompt(service)

获取指定服务的 prompt 内容。

**签名**:
```javascript
getPrompt(service: string): string | null
```

**参数**:
- `service` (string): 服务名称
  - 有效值: `'codex'`, `'claudeCode'`, `'droid'`

**返回值**:
- `string`: Prompt 内容
- `null`: 未找到或未初始化

**示例**:
```javascript
const codexPrompt = promptLoader.getPrompt('codex')
if (codexPrompt) {
  console.log(`Codex prompt: ${codexPrompt.length} chars`)
} else {
  console.log('Codex prompt not found')
}
```

**边界情况**:
```javascript
// 未初始化
promptLoader.getPrompt('codex')  // null + 警告日志

// 无效服务
promptLoader.getPrompt('invalid')  // null + 警告日志

// 文件不存在
promptLoader.getPrompt('codex')  // null（如果 codex.txt 不存在）
```

---

### reload()

重新加载所有 prompts，用于热重载。

**签名**:
```javascript
async reload(): Promise<void>
```

**行为**:
1. 记录 "🔄 Reloading all prompts..." 日志
2. 设置 `this.loaded = false`
3. 调用 `initialize()` 重新加载

**示例**:
```javascript
// 文件更新后触发热重载
await promptLoader.reload()
```

**使用场景**:
- Web API 更新 prompt 后
- 文件监听检测到变化（未来功能）
- 手动强制重新加载

---

### getHealthStatus()

获取 promptLoader 的健康状态。

**签名**:
```javascript
getHealthStatus(): {
  loaded: boolean,
  prompts: {
    [service: string]: {
      available: boolean,
      length: number
    }
  }
}
```

**返回值**:
```typescript
{
  loaded: boolean              // 是否已初始化
  prompts: {
    codex: {
      available: boolean       // 是否可用
      length: number          // 字符数（不可用时为 0）
    },
    claudeCode: { ... },
    droid: { ... }
  }
}
```

**示例**:
```javascript
const status = promptLoader.getHealthStatus()
console.log(JSON.stringify(status, null, 2))

// 输出:
// {
//   "loaded": true,
//   "prompts": {
//     "codex": { "available": true, "length": 23831 },
//     "claudeCode": { "available": true, "length": 57 },
//     "droid": { "available": true, "length": 65 }
//   }
// }
```

**使用场景**:
- 系统健康检查端点（`/health`）
- 监控仪表板
- 调试问题

---

## 🔐 认证和授权

### 管理员认证

**HTTP API 认证**:
- 使用 `authenticateAdmin` 中间件
- 需要有效的管理员 JWT token
- Token 通过 `Authorization: Bearer` 头传递

**示例**:
```javascript
router.get('/prompts/:service', authenticateAdmin, async (req, res) => {
  // req.admin 包含认证信息
  // ...
})
```

**未认证响应**:
```json
{
  "error": "Unauthorized"
}
```

---

## 📊 错误码

| HTTP 状态码 | 错误原因 | 示例 |
|-----------|---------|------|
| 400 | 无效的请求参数 | 无效的 service 名称 |
| 401 | 未认证 | 缺少或无效的 admin token |
| 404 | 资源不存在 | Prompt 文件不存在 |
| 500 | 服务器内部错误 | 文件读写失败 |

---

## 🧪 API 测试示例

### cURL 测试

**获取 Codex prompt**:
```bash
curl -X GET http://localhost:3000/admin/prompts/codex \
  -H "Authorization: Bearer $(cat data/init.json | jq -r '.credentials.password')"
```

**更新 Claude Code prompt**:
```bash
curl -X PUT http://localhost:3000/admin/prompts/claudeCode \
  -H "Authorization: Bearer $(cat data/init.json | jq -r '.credentials.password')" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "You are a helpful AI assistant."
  }'
```

### JavaScript 测试

**使用 axios**:
```javascript
const axios = require('axios')

const API_BASE = 'http://localhost:3000'
const ADMIN_TOKEN = 'your-admin-token'

// 获取 prompt
async function getPrompt(service) {
  const response = await axios.get(`${API_BASE}/admin/prompts/${service}`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
  })
  return response.data
}

// 更新 prompt
async function updatePrompt(service, content) {
  const response = await axios.put(
    `${API_BASE}/admin/prompts/${service}`,
    { content },
    { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } }
  )
  return response.data
}

// 使用示例
(async () => {
  const codex = await getPrompt('codex')
  console.log(`Codex prompt: ${codex.length} chars`)

  await updatePrompt('claudeCode', 'New prompt content')
  console.log('Prompt updated successfully')
})()
```

---

## 📝 API 版本控制

**当前版本**: v1.0.0

**端点版本**:
- `/admin/prompts/*` - v1.0.0（无版本前缀，向后兼容）

**未来考虑**:
- 如需重大变更，引入 `/admin/v2/prompts/*`

---

## 🔮 未来 API 扩展

### 版本控制 API（v2.1.0+）

```javascript
// 获取历史版本
GET /admin/prompts/:service/versions
Response: [
  { version: 2, createdAt: "...", content: "...", modifiedBy: "..." },
  { version: 1, createdAt: "...", content: "...", modifiedBy: "..." }
]

// 回滚到指定版本
POST /admin/prompts/:service/rollback
Body: { version: 1 }
```

### 批量操作 API（v2.2.0+）

```javascript
// 批量获取
GET /admin/prompts
Response: { codex: {...}, claudeCode: {...}, droid: {...} }

// 批量更新
PUT /admin/prompts
Body: {
  codex: { content: "..." },
  claudeCode: { content: "..." }
}
```

### 使用统计 API（v2.2.0+）

```javascript
// 获取使用统计
GET /admin/prompts/:service/stats
Response: {
  service: "codex",
  totalRequests: 1000,
  p1Requests: 50,   // 用户自定义
  p2Requests: 950,  // 默认 prompt
  p3Requests: 0     // 禁用
}
```

---

## ✅ API 兼容性保证

### 保证事项

- ✅ 端点路径不变（`/admin/prompts/:service`）
- ✅ 请求/响应格式向后兼容
- ✅ 现有字段不删除
- ✅ 新增字段为可选

### 变更策略

- **非破坏性变更**: 直接更新
- **破坏性变更**: 引入新版本端点

---

## 📚 相关文档

- [架构设计](./01-architecture.md)
- [实施指南](./02-implementation-guide.md)
- [测试计划](./04-testing-plan.md)
