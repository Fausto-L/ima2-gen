# 测试结果汇总

> **测试日期**: 2026-07-24  
> **Key**: `sk-...44d8` (masked)  
> **Base URL**: `https://dashscope.aliyuncs.com`

---

## 1. 三种 API 体系测试结果

### 1.1 异步 image-synthesis API

| 模型 | 状态码 | 结果 |
|------|--------|------|
| `wanx2.1-t2i-turbo` | 403 | AccessDenied — 账号未开通 |
| `wanx2.1-t2i-plus` | 403 | AccessDenied — 账号未开通 |
| `wanx2.1-imageedit` | 403 | AccessDenied |
| `qwen-image-2.0-pro` (走 async) | 400 | "url error" — 不支持异步 API |

**结论**: 用户 key 对老模型无权限；新模型不支持异步 API。

### 1.2 OpenAI 兼容模式 `/compatible-mode/v1/chat/completions`

| 模型 | HTTP 状态 | 响应 |
|------|-----------|------|
| `qwen-image-2.0-pro` | 200 | `content` 始终空，无图片 |
| `qwen-image-max` | 200 | `content` 空 |
| `z-image-turbo` | 200 | 把 prompt 回显在 content（当聊天对话） |
| `/compatible-mode/v1/images/generations` | 404 | 路径不存在 |

**结论**: 兼容模式**不支持**图片生成，仅支持文本对话。

### 1.3 同步 multimodal-generation API（✅ 成功路径）

| 模型 | HTTP 状态 | 结果 | 图片大小 |
|------|-----------|------|----------|
| `qwen-image-2.0-pro` | 200 ✅ | 成功出图 | 2048×2048 PNG |
| `qwen-image-max` | 200 ✅ | 成功出图 | 1664×1664（需指定） |
| `z-image-turbo` | 200 ✅ | 成功出图 | 带有 `reasoning_content` |
| `wan2.7-image-pro` | 200 ✅ | 成功出图 | 2048×2048 |

---

## 2. 各模型可调用权限

### ✅ 可用（当前 key 有权限）

| 模型 | API 路径 | 文生图 | 参考图编辑 |
|------|----------|--------|------------|
| `qwen-image-2.0` | sync multimodal | ✅ 2048² | ❌ 适配器缺口 |
| `qwen-image-2.0-pro` | sync multimodal | ✅ 2048² | ❌ 适配器缺口 |
| `qwen-image-max` | sync multimodal | ✅ ≤1664² | ❌ 适配器缺口 |
| `z-image-turbo` | sync multimodal | ✅ | ❌ 适配器缺口 |
| `wan2.7-image-pro` | sync multimodal | ✅ 2048² | ❌ 适配器缺口 |

### ❌ 不可用（403 需开通）

| 模型 | 错误 | 说明 |
|------|------|------|
| `qwen-image-3.0-pro` | 403 AccessDenied | **下一代生图，需百炼平台申请** |
| `qwen-image-edit-max` | 403 | 专用编辑模型，需开通 |
| `qwen-image-edit-plus` | 403 | 专用编辑模型，需开通 |
| `qwen-image-plus` | 403 | 需开通 |
| `wanx2.1-t2i-turbo` | 403 | 老模型，需开通 |
| `wanx2.1-t2i-plus` | 403 | 老模型，需开通 |
| `wanx2.1-imageedit` | 403 | 老编辑模型，需开通 |
| `wanx2.1-imageedit-plus` | 403 | 老编辑模型，需开通 |

---

## 3. Size 范围测试

### qwen-image-2.0 / 2.0-pro

| Size | 状态 |
|------|------|
| `2048*2048` | ✅ |
| `2688*1536` | ✅ |
| `1536*2688` | ✅ |
| `2368*1728` | ✅ |
| `1728*2368` | ✅ |
| 其他 | 回退到 `2048*2048` |

### qwen-image-max

| Size | 状态 |
|------|------|
| `1664*1664` | ✅ (上限) |
| `2048*2048` | ❌ 超限 |
| `512*512` | ✅ (下限) |

**注意**: `qwen-image-max` 的 max size 是 1664×1664，比 2.0-pro 的 2048×2048 小！

### z-image-turbo

| Size | 状态 |
|------|------|
| `1024*1024` | ✅ |
| `2048*2048` | ✅ |

### wan2.7-image-pro

| Size | 状态 |
|------|------|
| `2048*2048` | ✅ |

---

## 4. 链式编辑测试（Python 直连 API）

> 以下测试通过 Python 脚本直接调用 API 绕过适配器，验证 API 层面可行性。

### 4.1 步骤 1：改色

```
输入图片: /tmp/test_cat.png (2048×2048)
操作: "把这只猫改成白色的"
传输方式: base64
API: multimodal-generation
HTTP: 200 ✅
输出: /tmp/white_cat_step1.png (1024×1024)
```

### 4.2 步骤 2：加帽子

```
输入图片: /tmp/white_cat_step1.png
操作: "给这只白猫加一顶红色圣诞帽"
传输方式: base64
API: multimodal-generation
HTTP: 200 ✅
输出: /tmp/chained_edit_cat.png (1024×1024)
```

### 4.3 URL 传输 vs Base64 传输

| 方式 | 结果 | 说明 |
|------|------|------|
| URL（DashScope 生成的图片 URL） | ❌ 403 Forbidden | 下载链接有权限限制 |
| Base64（data:image/png;base64,...) | ✅ 成功 | 绕过 URL 权限 |

**结论**: 编辑必须使用 base64 方式传输参考图，不能用 URL。

### 4.4 编辑时 Size 行为

- 请求中传 `size: 2048*2048` → API 忽略，返回 1024×1024
- 编辑模式下 size 由 API 自行决定，不受参数控制

---

## 5. 端到端服务测试（通过 ima2-gen 工具）

### 5.1 文生图（sync 路径）

```bash
curl -s -X POST http://127.0.0.1:3333/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "dashscope",
    "model": "qwen-image-2.0-pro",
    "prompt": "a cute cat",
    "size": "2048x2048"
  }'
```

**结果**: ✅ 成功，返回 base64 编码的 PNG 图片（2048×2048，~6.5MB）

### 5.2 参考图编辑（I2I 回落路径）

```bash
curl -s -X POST http://127.0.0.1:3333/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "dashscope",
    "model": "qwen-image-2.0-pro",
    "prompt": "make the cat white",
    "references": ["data:image/png;base64,iVBORw0KG..."]
  }'
```

**结果**: ❌ 失败 — 502 `DASHSCOPE_SUBMIT_ERROR` "url error"

**原因**: `!hasRefs` 条件跳过 sync 路径 → 进入 async I2I → qwen-image-2.0-pro 不支持 async API

---

## 6. 工具功能匹配度

| ima2-gen 功能 | 当前 key 可用 | 说明 |
|---------------|-------------|------|
| **文生图** (Classic/Gen) | ✅ | sync 路径已验证 |
| **参考图编辑** (Edit) | ❌ | 适配器 `!hasRefs` 限制 |
| **Node 分支** | ❌ | 依赖参考图编辑 |
| **Multimode 批量**（无参考图） | ✅ | 纯文生图批量可用 |
| **Canvas Mode** | ⚠️ 部分 | 需要编辑能力 |
| **Storyboard** | ⚠️ 部分 | 需要角色连续性编辑 |
| **Video** (Grok) | N/A | 需配置 Grok key |
