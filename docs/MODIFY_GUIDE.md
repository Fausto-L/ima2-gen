# 代码修改指南

> 本文记录所有对 ima2-gen 代码库的修改，包括原因、方法、注意事项。  
> **修改日期**: 2026-07-24

---

## 修改文件清单

| # | 文件 | 修改类型 | 说明 |
|---|------|----------|------|
| 1 | `routes/keys.ts` + `.js` | ✏️ 编辑 | DashScope key 前缀校验放宽 |
| 2 | `lib/dashscopeImageAdapter.ts` + `.js` | ➕ 新增功能 | 同步 multimodal-generation 路径 |
| 3 | `lib/imageModels.ts` + `.js` | ✏️ 编辑 | 新增 5 个 dashscope 模型到注册表 |
| 4 | `lib/capabilities.ts` + `.js` | ✏️ 编辑 | dashscopeSupported 数组扩展 |
| 5 | `ui/src/lib/imageModels.ts` | ✏️ 编辑 | UI 下拉菜单新增 dashscope 模型 |
| 6 | `~/.ima2/config.json` | ✏️ 编辑 | baseUrl 修正、模型配置 |
| 7 | `start.sh` | ➕ 新建 | 启动脚本 |

---

## 1. routes/keys.ts — Key 前缀校验

### 问题

原代码硬编码 `dashscope: ["sk-"]` 前缀要求，UAES 网关 16 字符 key 被拒绝保存。

### 修改

```typescript
// 修改前
const KEY_PREFIX_MAP: Record<KeyProvider, string[]> = {
  // ...
  dashscope: ["sk-"],
};

// 修改后
const KEY_PREFIX_MAP: Record<KeyProvider, string[]> = {
  openai: ["sk-"],
  xai: ["xai-"],
  gemini: ["AI"],
  dashscope: [],  // 不强制前缀，支持 UAES 网关 key
};

// 新增：不需要前缀校验的 provider
const NO_PREFIX_CHECK = new Set<string>(["dashscope"]);
```

### 校验逻辑

```typescript
// 前缀校验改为非阻塞（dashscope key 可不带 sk- 前缀）
if (prefixes.length > 0 && !NO_PREFIX_CHECK.has(provider)) {
  // 前缀不匹配时拒绝
}
```

---

## 2. lib/dashscopeImageAdapter.ts — 同步路径

### 问题

原适配器只支持异步 image-synthesis API（T2I/I2I + 轮询），用户 key 对老模型无权限（403），对新模型（qwen-image-2.0）返回 400（不支持异步）。

### 新增内容

#### 2.1 SYNC_MODELS 集合（line 37-43）

```typescript
const SYNC_MODELS = new Set([
  "qwen-image-2.0",
  "qwen-image-2.0-pro",
  "qwen-image-max",
  "z-image-turbo",
  "wan2.7-image-pro",
]);
```

#### 2.2 SYNC_SUPPORTED_SIZES（line 46-52）

```typescript
const SYNC_SUPPORTED_SIZES: string[] = [
  "2048*2048",
  "2688*1536",
  "1536*2688",
  "2368*1728",
  "1728*2368",
];
```

#### 2.3 getMultimodalGenUrl（line 72-74）

```typescript
function getMultimodalGenUrl(baseUrl: string): string {
  return `${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`;
}
```

#### 2.4 normalizeSyncSize（line 137-143）

```typescript
function normalizeSyncSize(size?: string): string {
  if (!size || size === "auto") return "2048*2048";
  const { width, height } = parseSize(size);
  const target = `${width}*${height}`;
  if (SYNC_SUPPORTED_SIZES.includes(target)) return target;
  return "2048*2048";  // 不支持的 size 回退
}
```

#### 2.5 buildMultimodalBody（line 145-165）

```typescript
function buildMultimodalBody(
  prompt: string,
  model: string,
  size: string,
  n: number,
): Record<string, unknown> {
  return {
    model,
    input: {
      messages: [
        { role: "user", content: [{ text: prompt }] },
      ],
    },
    parameters: {
      size: normalizeSyncSize(size),
      n,
      prompt_extend: true,
      watermark: false,
    },
  };
}
```

#### 2.6 generateSync（line 278-326）

同步请求函数：POST → 解析 `output.choices[0].message.content[0].image` → 返回图片 URL。

#### 2.7 主函数分支（line 368）

```typescript
// 同步 multimodal-generation 路径
if (SYNC_MODELS.has(model) && !hasRefs) {
  const syncUrl = getMultimodalGenUrl(baseUrl);
  const syncBody = buildMultimodalBody(prompt, model, options.size || "1024x1024", options.n || 1);
  const { imageUrl, revisedPrompt } = await generateSync(syncUrl, apiKey, syncBody, options.signal);
  const { b64, mime } = await downloadImageAsB64(imageUrl, options.signal);
  return { b64, revisedPrompt, usage, webSearchCalls: 0, mime };
}
```

### ⚠️ 关键缺口

**`&& !hasRefs`** 条件导致带参考图时跳过同步路径。详见 [GAP_AND_ROADMAP.md](./GAP_AND_ROADMAP.md)。

---

## 3. lib/imageModels.ts — 模型注册表

### 修改

```typescript
// VALID_DASHSCOPE_MODELS 新增 5 个模型
const VALID_DASHSCOPE_MODELS = new Set([
  "wanx2.1-t2i-turbo",
  "wanx2.1-t2i-plus",
  "wanx-v1.1-t2i-turbo",
  "wanx2.1-t2i-turbo-auto",
  "wanx2.1-imageedit",
  "wanx2.1-imageedit-plus",
  // 新增 ↓
  "qwen-image-2.0",
  "qwen-image-2.0-pro",
  "qwen-image-max",
  "z-image-turbo",
  "wan2.7-image-pro",
]);
```

---

## 4. lib/capabilities.ts — 能力声明

### 修改

```typescript
dashscopeSupported: [
  "wanx2.1-t2i-turbo", "wanx2.1-t2i-plus",
  "wanx-v1.1-t2i-turbo", "wanx2.1-t2i-turbo-auto",
  "wanx2.1-imageedit", "wanx2.1-imageedit-plus",
  // 新增 ↓
  "qwen-image-2.0", "qwen-image-2.0-pro",
  "qwen-image-max", "z-image-turbo", "wan2.7-image-pro",
],
```

---

## 5. ui/src/lib/imageModels.ts — UI 模型列表

### 修改

```typescript
// DASHSCOPE_MODEL_VALUES 新增
const DASHSCOPE_MODEL_VALUES = new Set<string>([
  "wanx2.1-t2i-turbo", "wanx2.1-t2i-plus",
  "wanx2.1-imageedit", "wanx2.1-imageedit-plus",
  // 新增 ↓
  "qwen-image-2.0-pro", "qwen-image-max",
  "z-image-turbo", "wan2.7-image-pro",
]);
```

---

## 6. ~/.ima2/config.json — 运行时配置

```json
{
  "dashscopeProvider": {
    "baseUrl": "https://dashscope.aliyuncs.com",
    "customModels": "qwen-image-2.0-pro, qwen-image-max, z-image-turbo, wan2.7-image-pro",
    "defaultImageModel": "qwen-image-2.0-pro"
  },
  "dashscopeApiKey": "sk-c3c54...44d8"
}
```

---

## 7. start.sh — 启动脚本

```bash
#!/bin/bash
cd /Users/faustolin/Documents/生图调研/ima2-gen
set -a; source .env; set +a
node server.js &
SERVER_PID=$!
echo $SERVER_PID > /tmp/ima2-gen.pid
echo "ima2-gen started (PID: $SERVER_PID) on http://127.0.0.1:3333"
for i in $(seq 1 10); do
  if curl -s http://127.0.0.1:3333/api/capabilities > /dev/null 2>&1; then
    echo "Server is ready"; exit 0
  fi
  sleep 1
done
echo "Server failed to start"; exit 1
```

---

## ⚠️ 修改注意事项

### .ts 和 .js 都要改

- `.ts` 是源文件，`.js` 是实际运行文件
- 只改 `.ts` 不改 `.js` → 运行时不生效
- `.js` 文件被 `.gitignore` 排除

### edit 工具安全过滤器

`edit` / `view` 工具会把 `Bearer ${apiKey}` 替换为 `******`，导致 JS 语法错误。

**涉及行**:
- `submitTask()` line 180
- `pollTask()` line 231
- `generateSync()` line 291

**解决**: 修改这些函数时必须用 Python 写文件：

```python
with open(filepath, 'w') as f:
    f.write(content)
```

### 重启服务

代码修改后必须重启服务：

```bash
kill $(cat /tmp/ima2-gen.pid) 2>/dev/null
cd /Users/faustolin/Documents/生图调研/ima2-gen
nohup bash start.sh > /tmp/ima2-start.log 2>&1 &
```
