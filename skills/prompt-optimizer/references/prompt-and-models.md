# Prompt 模板与模型配置

本文件是 `prompt-optimizer` 的 YAML 契约。实现以 `scripts/popt/promptspec.py`、`scripts/popt/models.py`、`scripts/popt/miniyaml.py` 为准。

## 1. Prompt 模板

### 1.1 标准形式

```yaml
name: support-zh
temperature: 0.0
max_tokens: 1024
messages:
  - role: system
    content: |
      You are a careful customer-support assistant.
      Answer in Chinese. Give the conclusion first, then the policy.
  - role: user
    content: |
      {{input}}
```

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `messages` | 是 | 非空消息列表；每条含 `role` 与 `content` |
| `name` | 否 | 仅用于展示 |
| `temperature` | 否 | 模板默认温度；模型配置/CLI 可覆盖 |
| `max_tokens` | 否 | 模板默认输出上限；模型配置/CLI 可覆盖 |

- `role`：`system`、`user`、`assistant`、`developer`。
- `content`：字符串；推荐用 `|` 块标量保留换行。
- `{{input}}` 会替换为该行的任务输入；支持 `{{ input }}`。可以出现在任意消息中，出现多次会全部替换。
- 如果整个模板没有任何占位符，会把任务输入作为**额外一条 user 消息**追加在末尾。需要精确控制消息顺序时，显式写 `{{input}}`。
- 优化对象是 **system 消息**。候选只替换 system 内容；多个 system 消息会合并成一条，位置取第一条 system 的位置；没有 system 时插入到最前面。user / assistant / developer 消息固定不动。

### 1.2 等价与兼容形式

纯文本：

```text
You are a helpful assistant.
```

视为一条 system 消息；任务输入会作为 user 消息追加。

旧版单 system JSON（仍兼容）：

```json
{
  "system": "You are ...",
  "user_template": "Question: {{input}}",
  "few_shot": [{"role": "assistant", "content": "ok"}],
  "temperature": 0.0,
  "max_tokens": 1024
}
```

会把 `system`、`few_shot`、`user_template` 按顺序转成 messages；`{input}` 也会转成 `{{input}}`。新文件不建议再用这种格式。

### 1.3 解析规则

- 文件后缀不限；内容以 `{` 开头且能解析为 JSON 时按 JSON 处理，否则按 YAML。
- 普通文本（不含 YAML 映射特征）回退为 system 消息。
- 非法 YAML、空 `messages`、未知 role、非字符串 `content` 都会直接报错，不会静默猜测。
- 支持 YAML 常用子集：块映射/序列、单双引号、`|` / `>` 块标量、`-`/`+` chomping、行内 `{}`/`[]`、注释。不支持锚点、别名、标签与多文档。

## 2. 模型配置

### 2.1 完整示例

```yaml
models:
  - name: deepseek-chat
    model: deepseek-chat
    base_url: https://api.deepseek.com/v1
    api_key_env: PROMPT_OPT_API_KEY
    temperature: 0.0
    max_tokens: 1024
    weight: 2
    headers:
      X-Tenant: acme
    timeout: 180
    max_retries: 3

  - name: local-qwen
    model: qwen2.5-7b-instruct
    base_url: http://127.0.0.1:11434/v1
    temperature: 0.2
    max_tokens: 2048
    weight: 1

judge:
  model: deepseek-chat
  base_url: https://api.deepseek.com/v1
  temperature: 0
  max_tokens: 1024
  api_key_env: PROMPT_OPT_JUDGE_API_KEY

optimizer:
  model: deepseek-chat
  base_url: https://api.deepseek.com/v1
  temperature: 0.7
  max_tokens: 2048
  api_key_env: PROMPT_OPT_API_KEY
```

`models` 也可以是映射形式（键即 name）：

```yaml
models:
  deepseek:
    model: deepseek-chat
    base_url: https://api.deepseek.com/v1
  qwen:
    model: qwen2.5-7b-instruct
    base_url: http://127.0.0.1:11434/v1
```

### 2.2 字段

| 字段 | 必需 | 默认 | 说明 |
| --- | --- | --- | --- |
| `name` | 否 | `model` 或 `target-N` | 报告与结果中的唯一名称 |
| `model` | 是* | — | 发给 provider 的模型名 |
| `base_url` | 是* | — | OpenAI 兼容 base URL；可写到 `/chat/completions` |
| `api_key_env` | 否 | 见下 | 从该环境变量读 key |
| `api_key` | 否 | — | 直接写 key；**不推荐**，不要提交到仓库 |
| `temperature` | 否 | 模板/CLI | 0–2 |
| `max_tokens` | 否 | 模板/CLI/1024 | 正整数 |
| `weight` | 否 | 1 | 正数；用于总分加权 |
| `headers` | 否 | `{}` | 该模型的额外 HTTP headers |
| `timeout` | 否 | CLI `--timeout` | 秒 |
| `max_retries` | 否 | CLI `--max-retries` | 传输重试次数 |
| `llm_cmd` | 否 | — | 用 shell 命令替代 HTTP；从 stdin 读请求，向 stdout 写 `{"text": ...}` 或文本 |
| `enabled` | 否 | true | false 时跳过该模型 |

\* 使用 `llm_cmd` 时 `model` 和 `base_url` 可以省略；否则两者都必需。

未知字段会直接报错（防止 `base-url` 这类拼写错误被静默忽略）。`models` 为空、名称重复、权重非正数、URL/模型缺失都会报错。

### 2.3 Key 解析

按顺序：

1. 模型配置的 `api_key`；
2. `api_key_env` 指定的环境变量；
3. `PROMPT_OPT_API_KEY`；
4. `DEEPSEEK_API_KEY`；
5. `OPENAI_API_KEY`。

本地 endpoint（`localhost` / `127.0.0.1` / `::1` / `0.0.0.0`）**不会自动附带全局云 key**；需要鉴权的本地服务请显式写 `api_key_env`。远程 endpoint 无 key 时会报错；确实是无鉴权网关时加 `--allow-no-auth`。判分/优化模型各自解析，可与目标模型不同。

### 2.4 判分与优化模型

- `judge` / `optimizer` 段可选；缺省用 CLI 的 `--judge-*` / `--optimizer-*`，再缺省用 `--base-url/--model`。
- 段内字段（`model`、`base_url`、key、`temperature`、`max_tokens`、headers、`llm_cmd`）会覆盖对应 CLI 默认；段内没写的字段用 CLI 补齐。
- 判分/优化模型不参与目标模型加权。

### 2.5 设置优先级

- decoding：模型配置 > CLI `--temperature` / `--max-tokens` > prompt 模板 > 内置默认（0.0 / 1024）。
- headers：`--header` 全局 + 模型 `headers`，同名时模型覆盖。
- 目标模型列表：`--models` 文件完全决定；没有 `--models` 时用 CLI 单模型兜底。

## 3. 评分汇总

- 每对（目标模型, 行）独立生成、独立判分、得到 0–100 行分。
- 模型分 = 该模型所有行的按行权重平均。
- 总分 = `Σ(模型权重 × 模型分) / Σ(模型权重)`；报告同时给每个模型的分与 search/holdout 分。
- 报告中的「分准则得分」按准则文本跨模型聚合，观测数可能大于行数。

## 4. 验证与常见错误

```bash
python "$SKILL_DIR/scripts/prompt_opt.py" inspect --dataset data.jsonl --models models.yaml
```

常见错误：

| 错误 | 原因 |
| --- | --- |
| `invalid YAML` | 缩进不一致、tab 缩进、未闭合引号/flow、未知转义 |
| `messages must be a non-empty list` | 缺少 `messages` 或写成了标量 |
| `role must be one of ...` | role 拼错 |
| `each model needs 'model' or 'llm_cmd'` | 模型段缺字段 |
| `unknown model field(s)` | 字段拼写错误（如 `base-url`） |
| `duplicate model names` | 两个目标模型同名 |
| `no API key for ...` | 没有设置对应 env，或未加 `--allow-no-auth` |

## 5. 示例

- `templates/prompt.example.yaml`
- `templates/models.example.yaml`
- `templates/dataset.example.jsonl`

```bash
python "$SKILL_DIR/scripts/prompt_opt.py" inspect \
  --dataset "$SKILL_DIR/templates/dataset.example.jsonl" \
  --models "$SKILL_DIR/templates/models.example.yaml"
```
