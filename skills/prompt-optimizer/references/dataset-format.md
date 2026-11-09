# 数据集格式与字段约定

本文件是 `prompt-optimizer` 的数据契约。实现以 `scripts/popt/dataset.py`、`scripts/popt/rubric.py` 为准。

## 1. 文件

- JSONL：一行一个 JSON 对象；空行忽略；UTF-8。
- 每行至少要有**任务输入**和 **rubric**。其余字段可选。
- 行级 `weight` 默认 1，必须是正数。
- 相同 `id` 会告警；`id` 缺省为 `row-<序号>`。

## 2. 规范字段

```json
{
  "id": "refund-1",
  "input": "我昨天被自动续费了，能退款吗？",
  "rubric": [
    {"id": "policy", "text": "说明退款政策并给出可否退款的结论", "weight": 2},
    {"id": "steps", "text": "给出退款渠道与所需材料", "weight": 1},
    {"id": "no_link", "text": "不编造链接", "check": {"type": "not_contains", "value": "http"}}
  ],
  "reference": "7 天内可无条件退款……",
  "weight": 1.0
}
```

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `id` | 否 | 稳定标识，用于报告与逐行对比；缺省按序号生成 |
| `input` | 是 | 发给模型的任务内容；字符串、内容数组或 `messages` 数组 |
| `rubric` | 是 | 评分细则，见第 3 节 |
| `reference` | 否 | 参考答案，只在判分时提供给判分模型，不会发给目标模型 |
| `weight` | 否 | 行权重，默认 1；报告中总分按权重平均，同时给加权求和 |

### 输入字段自动识别

按顺序尝试：`input`、`question`、`query`、`user_query`、`user_input`、`prompt_input`、`text`、`content`、`messages`、`instruction`。

`messages` 或 `[{role, content}, ...]` 会取**最后一条 user** 的 `content`；`content` 是分片数组时会拼接文本。歧义时用覆盖参数：

```bash
--input-field input --rubric-field rubric --id-field id \
--weight-field weight --reference-field reference
```

支持点路径，如 `--rubric-field metadata.rubric`。覆盖字段必须真实存在。若数据集把任务内容放在 `prompt` 字段（与待优化的 system prompt 同名），用 `--input-field prompt` 显式指定。

## 3. rubric 的所有写法

都归一化为「准则列表」，每条准则有 `id`、`text`、`weight`、可选 `check`。

### 3.1 单条字符串

```json
{"input": "...", "rubric": "答案必须给出可执行的下一步"}
```

### 3.2 字符串数组（等权，每条独立打分）

```json
{"input": "...", "rubric": ["给出退款结论", "给出退款渠道", "语气礼貌"]}
```

### 3.3 对象数组（可设权重与确定性检查）

```json
{"rubric": [
  {"id": "conclusion", "criterion": "给出明确结论", "weight": 3},
  {"id": "format", "description": "输出是合法 JSON", "check": "json"},
  {"id": "len", "text": "不超过 120 字", "check": {"type": "max_chars", "value": 120}}
]}
```

`text` 可使用 `criterion` / `criteria` / `description` / `requirement` / `name` / `title`。`weight` 可用 `w` / `importance`。

### 3.4 对象包装

```json
{"rubric": {"criteria": [{"text": "..."}, {"text": "..."}]}}
```

### 3.5 键值映射

```json
{"rubric": {"Accuracy": "回答事实正确", "Tone": "语气礼貌"}}
```

每个键作为准则 id，值作为准则文本，权重默认 1。

### 3.6 JSON 字符串

`rubric` 是字符串且以 `{` 或 `[` 开头时，会先尝试解析为 JSON；解析失败则当作单条准则文本。

## 4. 确定性检查（check）

有 `check` 的准则不调用判分模型，直接按规则得 0 或 1。

| type | value | 行为 |
| --- | --- | --- |
| `contains` | 字符串 | 输出包含该文本 |
| `not_contains` | 字符串 | 输出不包含该文本 |
| `any_of` / `all_of` | 字符串数组（或 `a|b`） | 至少一个 / 全部出现 |
| `regex` | 正则 | 能匹配 |
| `exact` | 字符串 | 去首尾空白后完全相等 |
| `numeric` | 数字，可带 `tolerance` | 取输出中第一个数字比较 |
| `max_words` / `min_words` | 非负整数 | 按空白切词计数 |
| `max_chars` / `min_chars` | 非负整数 | 字符数 |
| `json` | 无 | 能解析为 JSON（允许代码围栏或嵌入对象） |
| `nonempty` | 无 | 去空白后非空 |
| `starts_with` / `ends_with` | 字符串 | 前缀 / 后缀 |

可选：

- `"ignore_case": true` 或 `"flags": "i"`：忽略大小写。
- 简写字符串：`"check": "contains: 退款"`、`"check": "json"`。
- `check` 也接受 `checks` / `rule` / `assert` 键名。

规则写错（未知类型、缺 value、非法正则）会在加载数据集时直接失败，不会静默算 0。

## 5. 评分公式

对每行：

```text
行分 = 100 × Σ(准则权重 × 准则得分) / Σ(准则权重)
准则得分 ∈ {0, 0.5, 1}
```

判分模型只给 qualitative 准则打分；确定性准则由规则给出 0/1。两类可以混用。

数据集：

```text
总分（平均，0–100） = Σ(行权重 × 行分) / Σ(行权重)
加权求和 = Σ(行权重 × 行分)          # 报告中作为辅助指标
```

跳过/失败的行不计入分母，但必须在报告中显示数量；默认直接中止而不是静默跳过。

## 6. 行级 rubric 与全局 rubric

两种都支持：

- **全局 rubric**：所有行 rubric 相同，适合统一质量标准；
- **逐行 rubric**：每行有自己的准则，适合不同问题需要不同判据。

报告按**准则文本**聚合，而不是按 `c1` 这类行内 id 聚合；逐行 rubric 时某些准则只出现 1 次，属于正常现象。

## 7. 校验与常见错误

`inspect` 会检查并报告：

- 没有任何 rubric 或 input 字段；
- 某行缺 rubric、rubric 为空、准则缺文本、权重非正数；
- 重复 id、重复输入；
- 准则总数、判分/确定性比例；
- 一次全量评测的调用数。

坏行默认导致加载失败并给出行号。只有用户明确接受排除时：

```bash
--skip-invalid
```

被跳过的行会记录在 `dataset.skipped` 与报告 warnings 中。

## 8. 示例

- `templates/dataset.example.jsonl`：四种 rubric 写法、一个 reference、混合确定性检查。
- `templates/prompt.example.yaml`：YAML messages 模板。
- `templates/models.example.yaml`：多个可独立配置的目标模型。

```bash
python "$SKILL_DIR/scripts/prompt_opt.py" inspect \
  --dataset "$SKILL_DIR/templates/dataset.example.jsonl"
```
