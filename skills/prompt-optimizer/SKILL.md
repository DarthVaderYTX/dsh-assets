---
name: prompt-optimizer
description: 在带 rubric 的 JSONL 数据集上自动优化 prompt：先测基线，按 rubric 用 LLM 判分与确定性规则打分，分析失败样本生成候选 prompt，在数据集上实测择优并输出报告。用户给出数据集、现有 prompt、模型与预算时使用；目标是在该数据集上取得可验证的更高总分。
whenToUse: 有含 rubric 字段的 JSONL 数据集，需要把现有 prompt 调到更高分，并要可复现的评测证据时。
---

# Prompt 自动优化

本 skill 把「改 prompt」变成一次可测量、可复现的实验：**基线 → 按 rubric 判分 → 失败分析 → 候选生成 → 实测择优 → 报告**。入口脚本在 `scripts/`，示例在 `templates/`，格式与策略细节在 `references/`。

本文件所在目录记为 `$SKILL_DIR`（安装后通常是 `~/.dsh/skills/prompt-optimizer`）。脚本只依赖 Python 3.9+ 标准库，无需安装第三方包。下文的 `python` 在 Windows 上用 `python`，macOS/Linux 上用 `python3`。

## 一、适用与边界

适用：

- 用户给出 JSONL 数据集，每行有任务输入和 `rubric`（评分细则），并有一个待优化的 prompt。
- 目标是在该数据集上提高总分，并需要知道**提高了多少、代价多少、是否可信**。
- 任务与判分都能通过 OpenAI 兼容接口调用；也支持用 `--llm-cmd` 接任意本地/私有模型命令。

不适用或需要先处理：

- 数据集没有 rubric：先与用户把评分标准写成 rubric（见 `references/grading.md`），不要边优化边改评分标准。
- 用户只想要「更好的 prompt」但没有数据：本 skill 不做无依据改写；先要数据或明确改为人工评审。
- 任务需要执行代码、查外部系统才能判分：先把执行与判分封装成可调用的评分流程，或改用确定性 check。

本 skill 的分数是**在该数据集、该判分模型、该评分口径下的测量结果**，不是对线上效果的保证。不得把测量分数说成线上收益。

## 二、开工前确认（一次问清，不要逐条来回问）

能从文件和环境中确认的不要问。必须确认的只有：

1. **数据集**：路径；输入字段与 rubric 字段（若自动识别有歧义）。
2. **待优化 prompt**：文件路径或原文；它会被当作 system prompt，数据集输入作为 user message。
3. **模型**：任务模型、判分模型、优化模型的 endpoint、模型名与 API key 来源。没有 key 时提示设置 `PROMPT_OPT_API_KEY`，不要在对话或文件里回显 key。
4. **预算**：允许的调用次数或金额上限。默认先用 `--dry-run` 估算，得到用户确认后再真正调用。
5. **口径**：总分取「按行权重平均」（默认，0–100）还是「加权求和」；行是否等权；是否留出集。

评分口径一旦开始就不要中途改。确需修改（例如判分明显错误）时：停掉当前运行、修 rubric 或判分、**重跑基线**，并在报告里说明变更，不能把两次不同口径的分数直接比较。

## 三、数据集与评分契约

### 3.1 数据集

每行一个 JSON 对象，至少包含：

```json
{"id": "case-1", "input": "用户问题", "rubric": ["准则一", "准则二"], "reference": "可选参考答案", "weight": 1.0}
```

- `rubric` 必填，支持：字符串、字符串数组、对象数组、`{"criteria": [...]}`，或上述结构的 JSON 字符串。
- 每条准则：`{"id": "c1", "text": "准则描述", "weight": 2, "check": {"type": "contains", "value": "退款"}}`。`text` 也可写成 `criterion`/`description`。
- 输入字段自动识别 `input`、`question`、`query`、`messages`（取最后一条 user）等；可用 `--input-field` 等覆盖。完整字段与 check 类型见 `references/dataset-format.md`。
- 每行可有独立 rubric；报告按准则文本聚合，不按行内 id 聚合。

### 3.2 评分

- 每条准则得分 `s ∈ {0, 0.5, 1}`：1 完全满足，0.5 部分满足，0 不满足。
- 行分 `= 100 × Σ(weight × s) / Σ(weight)`，因此每行都在 0–100。
- 总分 `= Σ(行权重 × 行分) / Σ(行权重)`，报告同时给加权求和。
- 有 `check` 的准则走确定性规则，不调用判分模型；其余准则由判分模型打分。客观约束（必须出现某词、JSON 合法、字数上限、数值范围）优先写成 check，既省成本又稳定。

### 3.3 先验证再花钱

```bash
python "$SKILL_DIR/scripts/prompt_opt.py" inspect --dataset data.jsonl
```

检查：识别到的字段、每行准则数、判分/确定性准则比例、坏行、重复输入、一次全量评测的调用数。坏行默认直接报错；只有用户接受「排除这些行」时才用 `--skip-invalid`，并在报告中记录排除数量。

## 四、执行流程

1. **检查数据集**：运行 `inspect`；确认 rubric 没有把答案直接写进准则、没有空准则、每行都有 rubric。
2. **估算预算**：先 `optimize --dry-run`，把预计调用数、模型和轮次给用户确认；设置 `--max-calls`，留 20% 余量给重试与判分修复。
3. **跑基线**：用 `score` 测现有 prompt 在**全量数据**上的分数，保存输出。人工抽查 3–5 条：模型是否真的在回答任务、判分 rationale 是否合理。若判分明显错误，先修 rubric/判分，不要优化 prompt。
4. **优化**：运行 `optimize`。它会自动完成失败分析、候选生成、search 集评测、按分数择优，并在结束时对全量数据重算基线与最优 prompt。
5. **审阅报告**：重点看 search 与 holdout 的分差、分准则变化、退步的行、warnings。只有 holdout 也提升，才能说「泛化上更好」；没有 holdout 就明确说明是样本内结果。
6. **人工复核最优 prompt**：是否混入数据集逐行事实/答案、是否提到 rubric 或判分器、是否扩大了任务范围、是否仍是用户要的语言与目标。发现作弊或跑偏就回退，不要直接交付。
7. **交付**：`prompts/best.txt`、`report.md`、`summary.json`、`results/`。汇报时给基线→最优的分差、口径、模型、预算与限制；不得省略「样本内/留出集」和判分模型。

### 命令速查

```bash
# 1) 数据集体检
python "$SKILL_DIR/scripts/prompt_opt.py" inspect --dataset data.jsonl

# 2) 预算预估（不调用模型）
python "$SKILL_DIR/scripts/prompt_opt.py" optimize \
  --dataset data.jsonl --prompt-file prompt.txt --out runs/opt --dry-run \
  --rounds 3 --candidates 4 --holdout 0.2

# 3) 基线
python "$SKILL_DIR/scripts/prompt_opt.py" score \
  --dataset data.jsonl --prompt-file prompt.txt --out runs/baseline

# 4) 优化（把 --max-calls 换成 dry-run 估算值并留余量）
python "$SKILL_DIR/scripts/prompt_opt.py" optimize \
  --dataset data.jsonl --prompt-file prompt.txt --out runs/opt \
  --rounds 3 --candidates 4 --holdout 0.2 --search-size 40 \
  --min-improvement 0.5 --patience 2 --max-calls 1600

# 5) 只重渲染报告
python "$SKILL_DIR/scripts/prompt_opt.py" report --run runs/opt
```

模型默认读环境变量：`PROMPT_OPT_BASE_URL`、`PROMPT_OPT_MODEL`、`PROMPT_OPT_JUDGE_MODEL`、`PROMPT_OPT_OPTIMIZER_MODEL`、`PROMPT_OPT_API_KEY`；也可用 `--base-url`、`--model`、`--judge-model`、`--optimizer-model`。判分模型默认与任务模型相同，**能用更强的模型判分就不要用同一个**；相同时报告会给出警告。模型只能通过本地 CLI 调用时，用 `--llm-cmd` 包装：命令从 stdin 读 `{"messages": ...}`，向 stdout 输出 `{"text": ...}` 或原始文本；不要用不可复现的交互式会话代替脚本评测。

## 五、参数与预算

| 参数 | 默认 | 用法 |
| --- | --- | --- |
| `--rounds` | 3 | 迭代轮数；预算紧用 1–2，平台期明显时无需加 |
| `--candidates` | 4 | 每轮候选数；候选越多样越可能突破，但成本线性增长 |
| `--search-size` | 0（全部） | 每轮候选评测的行数；数据 >60 行建议 30–60，最终仍全量重算 |
| `--holdout` | 0 | 留出比例（`0.2`）或行数（`20`）；不参与优化，只用于验证泛化 |
| `--analysis-items` | 8 | 每轮展示给优化模型的最差样本数 |
| `--min-improvement` | 0 | 接受候选所需的最小提升；判分有噪声时设 0.5–1 |
| `--patience` | 2 | 连续多少轮无提升就停 |
| `--max-calls` | 0（不限） | **必须设置**；缓存命中和重试策略会影响实际消耗 |

调用量估算（全量、每行 1 次任务调用 + 1 次判分调用时）：

```text
≈ 基线(search) + 轮数 × (1 次候选生成 + 候选数 × search 行数 × 2) + 全量重算(基线 + 最优)
```

`--dry-run` 会按你的参数打印估算，直接用它设置 `--max-calls`。

其他：`--concurrency` 默认 4，遇到 429 降低它；`--cache-dir` 默认 `~/.cache/prompt-optimizer`，缓存包含模型输出，敏感数据用 `--no-cache`；`--on-error skip` 只应在用户接受缺行时使用。

## 六、防作弊与防过拟合（硬要求）

- **绝对禁止**把数据集的逐行输入、标准答案、行 id 或只在某一行成立的事实写进要部署的 prompt；也不得针对判分器的固定措辞、开头词或长度偏好做套利。发现候选这样写就丢弃并说明。
- 可以把 rubric 表达的**通用要求**转写为任务规则（例如「必须给出退款渠道」），但不能在 prompt 里提到 rubric、判分器、数据集或评测。
- 优化集与验证集分离：行数允许时用 `--holdout`；最终汇报必须区分 search 与 holdout，并说明是否有留出集。
- 单次提升可能来自判分噪声。预算允许时重跑一次 `score`（或换 `--seed` 再优化一轮）确认方向；不要把 ±1 分说成显著提升。
- 不改变用户任务的实质范围、语言与合规要求来换分。分数提高但任务跑偏，属于失败。
- 不得为了让分数好看而放宽判分、删掉难例或修改数据集；这些只能由用户明确决定并在报告中记录。

## 七、判分与失败处理

- 判分模型必须看到：任务输入、模型输出、该行全部 rubric 准则；有 `reference` 时一并提供。判分不要看到被优化的 prompt，避免对某版 prompt 产生偏好。
- 判分返回严格 JSON（每个准则一条，0/0.5/1 + 理由）。解析失败会自动重试一次；仍失败则按 `--on-judge-error` 中止（默认）或记 0。默认中止是为了不把判分故障伪装成低分。
- 常见错误：`401/403` 查 key；`404` 查 base URL；`429` 降并发/重试；`response_format` 不支持时客户端会自动回退；输出为空通常是 `--max-tokens` 太小；预算耗尽退出码为 3。
- 判分器过于宽松或严格时，先修 rubric（更具体、可观察、分档明确），不要在优化中途换判分模型。
- 详细判分设计与校准方法见 `references/grading.md`。

## 八、交付检查清单

- [ ] 数据集每行 rubric 有效；坏行/排除行已记录。
- [ ] 评分口径（权重、平均/求和、判分模型）已固定并在报告中写明。
- [ ] 基线是在全量数据上测得，且抽查过判分合理性。
- [ ] 报告给出基线→最优、search、holdout、分准则与退步行。
- [ ] 最优 prompt 不含数据集答案、行级事实、rubric/判分器字样，未改变任务范围。
- [ ] 明确说明样本内/留出集、判分偏差与随机性；没有把测量分数说成线上收益。
- [ ] 交付了 `prompts/best.txt`、`report.md`、`summary.json` 与可复现的 `summary.command`。
- [ ] 未泄露 API key；数据集敏感时已提醒会发送给模型提供方。

## 九、脚本自检

修改本 skill 的脚本后运行：

```bash
python -m unittest discover -s "$SKILL_DIR/scripts/tests"
```

测试用本地 stub 模型服务覆盖 HTTP 调用、判分、候选生成、择优、留出集与报告渲染，不需要真实 API key。
