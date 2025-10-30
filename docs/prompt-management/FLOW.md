# Codex 提示词注入逻辑流程图

## 📊 完整决策流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                     收到 Codex API 请求                          │
│                   (model: gpt-5 / gpt-5-codex)                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────────┐
                    │  检查请求类型？     │
                    │  req.body.         │
                    │  instructions      │
                    │  是否以特定字符串    │
                    │  开头？            │
                    └─────────┬──────────┘
                              │
                 ┌────────────┴────────────┐
                 │                         │
                 ▼                         ▼
    ┌─────────────────────┐     ┌──────────────────────┐
    │  是 Codex CLI       │     │  不是 Codex CLI      │
    │  官方客户端         │     │  (第三方客户端)      │
    └──────────┬──────────┘     └──────────┬───────────┘
               │                           │
               ▼                           ▼
    ┌─────────────────────┐     ┌──────────────────────┐
    │  直接转发           │     │  提取用户的          │
    │  不做任何处理       │     │  system message      │
    │  (保持原有          │     │  (从 messages 数组)  │
    │   instructions)     │     └──────────┬───────────┘
    └──────────┬──────────┘                │
               │                           ▼
               │              ┌─────────────────────────┐
               │              │  用户是否提供了？        │
               │              │  system message?        │
               │              └───────┬─────────────────┘
               │                      │
               │         ┌────────────┴────────────┐
               │         │                         │
               │         ▼ 有                      ▼ 没有
               │  ┌──────────────┐      ┌──────────────────┐
               │  │ P1 优先级    │      │ 检查配置开关      │
               │  │              │      │ useDefaultPrompt │
               │  │ 使用用户的   │      │ 的值？           │
               │  │ system       │      └────────┬─────────┘
               │  │ message      │               │
               │  └──────┬───────┘      ┌────────┴────────┐
               │         │              │                 │
               │         │              ▼ true            ▼ false
               │         │     ┌────────────────┐  ┌──────────────┐
               │         │     │ P2 优先级      │  │ P3 优先级    │
               │         │     │                │  │              │
               │         │     │ 从 promptLoader│  │ 完全不注入   │
               │         │     │ 加载默认 prompt│  │              │
               │         │     │ (24KB)         │  │ instructions │
               │         │     │                │  │ = undefined  │
               │         │     └────────┬───────┘  └──────┬───────┘
               │         │              │                 │
               │         └──────────────┴─────────────────┘
               │                        │
               └────────────────────────┘
                                        │
                                        ▼
                         ┌──────────────────────────┐
                         │  转发到 Codex API 后端   │
                         │  (OpenAI Responses)      │
                         └──────────────────────────┘
```

---

## 🎯 三个优先级详细说明

### P1 优先级（最高）：用户自定义
```
请求示例:
{
  "messages": [
    {"role": "system", "content": "You are a Python expert"},  ← 用户提供
    {"role": "user", "content": "Write hello world"}
  ]
}

处理结果:
req.body.instructions = "You are a Python expert"  ← 使用用户的
```
**日志**: `📝 Using custom system message (25 chars)`

---

### P2 优先级（默认）：配置默认 prompt
```
请求示例:
{
  "messages": [
    {"role": "user", "content": "Write hello world"}  ← 没有 system message
  ]
}

环境变量:
CODEX_USE_DEFAULT_PROMPT 未设置  ← 默认 true

处理结果:
req.body.instructions = "You are a coding agent running in the Codex CLI...[24KB]"
                         ↑ 从 promptLoader 加载
```
**日志**: `📝 Using Codex default prompt: default (24248 chars, from promptLoader)`

---

### P3 优先级（最低）：完全不注入
```
请求示例:
{
  "messages": [
    {"role": "user", "content": "Write hello world"}  ← 没有 system message
  ]
}

环境变量:
CODEX_USE_DEFAULT_PROMPT=false  ← 用户主动禁用

处理结果:
req.body.instructions = undefined  ← 不设置
```
**日志**: `📝 Codex default prompt disabled by config, no injection`

---

## 🔧 配置开关说明

### 环境变量：CODEX_USE_DEFAULT_PROMPT

```javascript
// config/config.example.js Line 66
useDefaultPrompt: process.env.CODEX_USE_DEFAULT_PROMPT !== 'false'
```

**真值表**：

| 环境变量值 | 表达式 | 结果 | 行为（P2 时） |
|-----------|--------|------|--------------|
| **未设置** | `undefined !== 'false'` | `true` | ✅ 注入 24KB |
| `'true'` | `'true' !== 'false'` | `true` | ✅ 注入 24KB |
| `'false'` | `'false' !== 'false'` | `false` | ❌ 不注入 |
| `''` (空) | `'' !== 'false'` | `true` | ✅ 注入 24KB |
| `'1'` | `'1' !== 'false'` | `true` | ✅ 注入 24KB |
| `'0'` | `'0' !== 'false'` | `true` | ✅ 注入 24KB |

**关键点**：
- ⚠️ 只有**精确等于字符串 `'false'`** 时才不注入
- ⚠️ 其他所有情况（包括未设置）都会注入

---

## 📈 实际场景对照表

| 场景 | 请求类型 | system message | 环境变量 | 最终 instructions | 触发优先级 |
|------|---------|---------------|---------|------------------|-----------|
| **场景1** | Codex CLI 官方 | (已有) | - | 保持原样 | - (直接转发) |
| **场景2** | 第三方客户端 | ✅ 有 | - | 用户的 | **P1** |
| **场景3** | 第三方客户端 | ❌ 无 | 未设置 (默认) | 24KB prompt | **P2** |
| **场景4** | 第三方客户端 | ❌ 无 | `=true` | 24KB prompt | **P2** |
| **场景5** | 第三方客户端 | ❌ 无 | `=false` | undefined | **P3** |

---

## 🎬 代码执行路径

### 路径 1：Codex CLI 官方客户端
```
请求
  → isCodexCLI 检测 ✅
    → 直接转发（Line 345）
      → 结束
```

### 路径 2：P1 优先级（用户自定义）
```
请求
  → isCodexCLI 检测 ❌
    → 提取 systemMessage ✅
      → if (systemMessage) 条件为 true (Line 318)
        → req.body.instructions = systemMessage
          → 结束
```

### 路径 3：P2 优先级（配置默认）
```
请求
  → isCodexCLI 检测 ❌
    → 提取 systemMessage ❌ (null)
      → if (systemMessage) 条件为 false
        → else if (config.prompts.codex.useDefaultPrompt) 条件为 true (Line 322)
          → promptLoader.getPrompt('codex', 'default')
            → req.body.instructions = defaultPrompt (24KB)
              → 结束
```

### 路径 4：P3 优先级（完全不注入）
```
请求
  → isCodexCLI 检测 ❌
    → 提取 systemMessage ❌ (null)
      → if (systemMessage) 条件为 false
        → else if (config.prompts.codex.useDefaultPrompt) 条件为 false
          → else 分支 (Line 338)
            → 不设置 instructions
              → 结束
```

---

## 🔍 关键代码位置

```javascript
// src/routes/openaiRoutes.js

Line 282-284:  isCodexCLI 检测
Line 290-292:  提取用户 system message
Line 318-321:  P1 优先级 - 用户自定义
Line 322-337:  P2 优先级 - 配置默认 prompt
Line 338-341:  P3 优先级 - 完全不注入
Line 345:      Codex CLI 直接转发
```

---

## 📝 总结

**当前默认行为**（环境变量未设置时）：
- ✅ Codex CLI 官方客户端 → 直接转发
- ✅ 用户有 system message → 使用用户的
- ✅ **用户无 system message → 注入 24KB prompt** ← 这是默认行为

**如何改变默认行为**：
- 设置 `CODEX_USE_DEFAULT_PROMPT=false` → 不注入默认 prompt
- 设置 `CODEX_USE_DEFAULT_PROMPT=true` → 注入默认 prompt（与默认相同）
