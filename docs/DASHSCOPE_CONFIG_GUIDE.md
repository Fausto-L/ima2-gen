# 百炼平台配置指南

> **平台**: 阿里云百炼 (DashScope)  
> **控制台**: https://bailian.console.aliyun.com  
> **API 文档**: https://help.aliyun.com/zh/model-studio/

---

## 1. API Key 管理

### 1.1 获取 Key

1. 登录 [百炼控制台](https://bailian.console.aliyun.com)
2. 左侧导航 → **API-KEY 管理**
3. 创建新 key，格式为 `sk-` 开头的长字符串

### 1.2 本工具配置

Key 保存在 `~/.ima2/config.json`：

```json
{
  "dashscopeApiKey": "sk-your-real-key-here"
}
```

**注意事项**：
- 文件权限自动设为 `0600`（仅所有者可读写）
- 写入用原子操作（临时文件 + rename），防止并发损坏
- Key 前缀校验已放宽（支持非 `sk-` 开头的 UAES 网关 key）

### 1.3 替换 Key 的方法

```bash
# 方法 1: 直接编辑配置文件
vim ~/.ima2/config.json
# 修改 "dashscopeApiKey" 字段

# 方法 2: 通过 API 保存
curl -s -X POST http://127.0.0.1:3333/api/keys \
  -H "Content-Type: application/json" \
  -d '{"provider":"dashscope","apiKey":"sk-your-new-key"}'

# 方法 3: 通过 ima2 CLI
ima2 setup
```

---

## 2. Base URL 配置

### 官方直连（推荐）

```json
{
  "dashscopeProvider": {
    "baseUrl": "https://dashscope.aliyuncs.com"
  }
}
```

### UAES 网关（不可用）

```
https://bailian.prd.aigateway.uaes.com/ips/v1
```

**UAES 网关问题**：
- DNS 解析到 Aliyun WAF
- 所有 HTTP 方法返回 405 Method Not Allowed
- 外网不可访问，仅内网可用
- **结论：不要使用 UAES 网关，改用官方直连**

### 常见配置错误

| 错误配置 | 后果 |
|----------|------|
| `baseUrl` 带 `/compatible-mode/v1` 后缀 | 适配器拼接路径后 404 |
| `baseUrl` 带 `/ips/v1` 后缀 | WAF 405 |
| `baseUrl` 为空 | 回退到默认 `https://dashscope.aliyuncs.com` |

---

## 3. 模型权限与开通

### 3.1 当前 Key 权限矩阵

| 模型 | API 路径 | 状态 | 说明 |
|------|----------|------|------|
| `qwen-image-2.0` | sync multimodal | ✅ | 基础文生图 |
| `qwen-image-2.0-pro` | sync multimodal | ✅ | 高质量文生图（主力） |
| `qwen-image-max` | sync multimodal | ✅ | 最高质量，size ≤ 1664×1664 |
| `z-image-turbo` | sync multimodal | ✅ | 快速生成，有 reasoning_content |
| `wan2.7-image-pro` | sync multimodal | ✅ | 万象 2.7 |
| `qwen-image-3.0-pro` | - | ❌ 403 | **需百炼平台申请开通** |
| `qwen-image-edit-max` | async i2i | ❌ 403 | 需开通 |
| `qwen-image-edit-plus` | async i2i | ❌ 403 | 需开通 |
| `qwen-image-plus` | - | ❌ 403 | 需开通 |
| `wanx2.1-t2i-turbo` | async t2i | ❌ 403 | 老模型需开通 |
| `wanx2.1-t2i-plus` | async t2i | ❌ 403 | 老模型需开通 |
| `wanx2.1-imageedit` | async i2i | ❌ 403 | 老编辑模型需开通 |

### 3.2 如何开通 3.0 / 编辑模型

1. 登录 [百炼控制台](https://bailian.console.aliyun.com)
2. 左侧导航 → **模型广场** (Model Garden)
3. 搜索 `qwen-image-3.0-pro` 或 `qwen-image-edit`
4. 进入模型详情页 → 点击 **申请使用** / **开通服务**
5. 部分模型需要企业认证和人工审核

### 3.3 验证 Key 权限

```bash
# 列出所有可用模型（OpenAI 兼容模式）
curl -s https://dashscope.aliyuncs.com/compatible-mode/v1/models \
  -H "Authorization: Bearer sk-your-key" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d['data'])} models available')"

# 测试特定模型
curl -s https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation \
  -H "Authorization: Bearer sk-your-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen-image-3.0-pro","input":{"messages":[{"role":"user","content":[{"text":"test"}]}]},"parameters":{"size":"1024*1024","n":1}}' \
  | python3 -m json.tool
```

---

## 4. 本工具配置文件

### 4.1 完整配置示例

`~/.ima2/config.json`:

```json
{
  "dashscopeProvider": {
    "baseUrl": "https://dashscope.aliyuncs.com",
    "customModels": "qwen-image-2.0-pro, qwen-image-max, z-image-turbo, wan2.7-image-pro",
    "defaultImageModel": "qwen-image-2.0-pro"
  },
  "dashscopeApiKey": "sk-c3c54xxxxxxxxxxxxxxxxxx44d8"
}
```

### 4.2 配置字段说明

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `dashscopeProvider.baseUrl` | API 基础 URL | `https://dashscope.aliyuncs.com` |
| `dashscopeProvider.customModels` | 自定义可选模型（逗号分隔） | 空 |
| `dashscopeProvider.defaultImageModel` | 默认生图模型 | `wanx2.1-t2i-turbo` |
| `dashscopeApiKey` | API 密钥 | 空 |

### 4.3 服务运行时查看

```bash
# DashScope 配置状态
curl -s http://127.0.0.1:3333/api/dashscope/config | python3 -m json.tool

# Key 状态
curl -s http://127.0.0.1:3333/api/keys/status | python3 -m json.tool

# 全部能力
curl -s http://127.0.0.1:3333/api/capabilities | python3 -m json.tool
```

---

## 5. 模型选择建议

### 文生图（当前可用）

| 场景 | 推荐模型 | 原因 |
|------|----------|------|
| **日常生成** | `qwen-image-2.0-pro` | 高质量 + 2048×2048 + 稳定 |
| **最高质量** | `qwen-image-max` | 画质最好，但 max size 1664×1664 |
| **快速预览** | `z-image-turbo` | 速度最快 |
| **通用兼容** | `wan2.7-image-pro` | 万象系列，2048×2048 |

### 编辑（需开通或改适配器）

| 场景 | 推荐模型 | 状态 |
|------|----------|------|
| **图片编辑** | `qwen-image-edit-max` | ❌ 需开通 |
| **图片编辑** | `qwen-image-edit-plus` | ❌ 需开通 |
| **适配器修复后** | `qwen-image-2.0-pro` + base64 参考图 | ⬜ 需修改代码 |

### 未来（3.0 系列）

| 场景 | 推荐模型 | 状态 |
|------|----------|------|
| **下一代生图** | `qwen-image-3.0-pro` | ❌ 需百炼平台申请 |
