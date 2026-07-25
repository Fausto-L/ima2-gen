# 部署运维笔记

> **工具版本**: ima2-gen v2.0.20  
> **部署环境**: macOS (Darwin)  
> **工作目录**: `/Users/faustolin/Documents/生图调研/ima2-gen`

---

## 1. 启动与停止

### 启动

```bash
cd /Users/faustolin/Documents/生图调研/ima2-gen
nohup bash start.sh > /tmp/ima2-start.log 2>&1 &
```

- PID 文件: `/tmp/ima2-gen.pid`
- 日志文件: `/tmp/ima2-start.log`
- 默认端口: `3333`（被占用时自动找下一个可用端口）
- 访问地址: `http://127.0.0.1:3333`

### 停止

```bash
kill $(cat /tmp/ima2-gen.pid) 2>/dev/null
```

### 重启

```bash
kill $(cat /tmp/ima2-gen.pid) 2>/dev/null; sleep 1
cd /Users/faustolin/Documents/生图调研/ima2-gen
nohup bash start.sh > /tmp/ima2-start.log 2>&1 &
```

---

## 2. 环境变量

`.env` 文件位于项目根目录，启动脚本通过 `source .env` 加载。

### 必需变量

```bash
# DashScope（百炼）
DASHSCOPE_API_KEY=sk-your-api-key
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com

# OpenAI（可选，额度已用尽）
OPENAI_API_KEY=
```

### 配置优先级

```
~/.ima2/config.json  >  .env  >  默认值
```

运行时以 `~/.ima2/config.json` 为准。通过 UI 或 API 保存的 key 写入此文件。

---

## 3. 健康检查

```bash
# 服务是否运行
curl -s http://127.0.0.1:3333/api/capabilities | python3 -m json.tool

# Key 状态
curl -s http://127.0.0.1:3333/api/keys/status | python3 -m json.tool

# DashScope 配置
curl -s http://127.0.0.1:3333/api/dashscope/config | python3 -m json.tool
```

### 预期输出

```json
// /api/capabilities
{
  "ok": true,
  "name": "ima2",
  "version": "2.0.20",
  "providers": { "dashscope": { "configured": true, "valid": true } }
}

// /api/keys/status
{
  "dashscope": { "configured": true, "valid": true, "maskedKey": "sk-c3c54...44d8" }
}
```

---

## 4. 常见故障排查

### 4.1 405 Method Not Allowed

```
DASHSCOPE_SUBMIT_ERROR (405)
```

**原因**: baseUrl 指向 UAES 网关，被 Aliyun WAF 拦截。  
**修复**: 改 baseUrl 为 `https://dashscope.aliyuncs.com`

### 4.2 403 AccessDenied

```
DASHSCOPE_AUTH_ERROR (403)
Model.AccessDenied
```

**原因**: 当前 key 对该模型无权限。  
**修复**:
- 在百炼控制台开通对应模型
- 或切换到有权限的模型（qwen-image-2.0-pro 等）

### 4.3 400 url error

```
DASHSCOPE_SUBMIT_ERROR (400)
url error
```

**原因**: qwen-image-2.0 系列走 async API 不支持。  
**修复**: 确保 `SYNC_MODELS` 包含该模型，走同步路径。

### 4.4 400 "url error"（带参考图编辑时）

**原因**: `!hasRefs` 条件导致带参考图时跳出 sync 路径，回落 async I2I。  
**修复**: 去掉 `!hasRefs` 限制（见 [GAP_AND_ROADMAP.md](./GAP_AND_ROADMAP.md)）。

### 4.5 key 保存失败

**原因**: key 前缀不匹配 `sk-`。  
**修复**: 已修复，dashscope 不再强制前缀校验。

### 4.6 服务无法启动

```bash
# 检查 PID 文件
cat /tmp/ima2-gen.pid

# 检查端口占用
lsof -i :3333

# 查看启动日志
cat /tmp/ima2-start.log

# 手动启动看错误输出
cd /Users/faustolin/Documents/生图调研/ima2-gen
node server.js
```

---

## 5. 日志

```bash
# 启动日志
cat /tmp/ima2-start.log

# 运行时事件日志（在服务输出中）
# dashscope:generate:start / sync:start / generate:done 等
```

### 关键日志事件

| 事件 | 说明 |
|------|------|
| `dashscope:generate:start` | 开始生成，含 model/promptChars/refs |
| `dashscope:sync:start` | 同步路径开始，含 model/syncUrl/size |
| `dashscope:sync:imageReady` | 同步返回图片 URL |
| `dashscope:task:submitted` | 异步路径提交成功，含 taskId |
| `dashscope:generate:done` | 生成完成，含 b64Len/mime/sync |

---

## 6. 文件位置

| 文件 | 路径 | 说明 |
|------|------|------|
| 项目根目录 | `/Users/faustolin/Documents/生图调研/ima2-gen` | 代码仓库 |
| 运行时配置 | `~/.ima2/config.json` | key、baseUrl、模型配置 |
| PID 文件 | `/tmp/ima2-gen.pid` | 服务进程 PID |
| 启动日志 | `/tmp/ima2-start.log` | nohup 输出 |
| 测试图片 | `/tmp/test_cat.png` 等 | 测试生成结果 |
| HTML 报告 | `/Users/faustolin/Documents/生图调研/dashscope-report.html` | 可视化报告 |

---

## 7. 性能数据

| 操作 | 耗时 | 说明 |
|------|------|------|
| 文生图 (qwen-image-2.0-pro) | ~15-30s | 2048×2048，6.5MB PNG |
| 文生图 (z-image-turbo) | ~5-10s | 快速生成 |
| 链式编辑 (base64) | ~10-20s/步 | Python 直连，不走适配器 |
| 服务启动 | ~3-5s | 含 UI 静态文件加载 |
