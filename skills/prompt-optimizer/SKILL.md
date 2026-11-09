---
name: prompt-optimizer
description: 在带 rubric 的 JSONL 数据集上自动优化 YAML messages prompt：按 rubric 判分，在多个可单独配置的目标模型上实测，分析失败样本生成候选并择优，输出逐模型报告。用户给出数据集、prompt 模板、模型配置与预算时使用；目标是在所有目标模型上取得可验证的更高加权总分。
whenToUse: 有含 rubric 的 JSONL 数据集、YAML messages 模板，以及一个或多个需要一起优化、各自有 endpoint/参数的模型时。
---

# Prompt 自动优化

本 skill 把「改 prompt」变成一次可测量、可复现的实验：**基线 → 按 rubric 判分 → 失败分析 → 候选生成 → 多模型实测择优 → 逐模型报告**。入口脚本在 `scripts/`，示例在 `templates/`，格式与策略细节在 `references/`。

本文件所在目录记为 `$SKILL_DIR`（安装后通常是 `~/.dsh/skills/prompt-optimizer`）。脚本只依赖 Python 3.9+ 标准库，无需安装第三方包。下文的 `python` 在 Windows 上用 `python`，macOS/Linux 上用 `python3`。

## 一、适用与边界

适用：

- 用户给出 JSONL 数据集，每行有任务输入和 `rubric`（评分细则）。
- 待优化 prompt 是 **YAML 模板**，最终构建成 chat `messages`（system / user / assistant）。
- 需要在**一个或多个目标模型**上评测，每个模型可以有自己的 endpoint、模型名、API key 来源、temperature、max_tokens、headers 与权重。
- 目标是在这些模型上提高加权总分，并需要知道**提高了多少、代价多少、是否可信、哪个模型受益/退步**。

不适用或需要先处理：

- 数据集没有 rubric：先与用户把评分标准写成 rubric（见 `references/grading.md`），不要边优化边改评分标准。
- 没有模型配置：先让用户提供 `models.yaml`，或临时用 CLI 的 `--base-url/--model/--judge-model` 跑单模型。
- 任务需要执行代码、查外部系统才能判分：先把执行与判分封装成可调用的评分流程，或改用确定性 check。

本 skill 的分数是**在该数据集、这些目标模型、该判分模型、该评分口径下的测量结果**，不是对线上效果的保证。不得把测量分数说成线上收益。

## 二、开工前确认（一次问清，不要逐条来回问）

能从文件和环境中确认的不要问。必须确认的只有：

1. **数据集**：路径；输入字段与 rubric 字段（若自动识别有歧义）。
2. **prompt 模板**：YAML 路径；确认 `messages` 结构与 `{{input}}` 放在哪条消息里。
3. **目标模型**：`models.yaml` 路径；每个模型的 endpoint、模型名、key 来源与权重；是否还要在同一批里跑本地模型。
4. **判分/优化模型**：可由 `models.yaml` 的 `judge` / `optimizer` 段给出，也可用 CLI/环境变量；没有 key 时提示设置 `PROMPT_OPT_API_KEY` 或该模型的 `api_key_env`，不要在对话或文件里回显 key。
5. **预算**：允许的调用次数或金额上限。默认先用 `--dry-run` 估算，得到用户确认后再真正调用。
6. **口径**：总分默认是「各目标模型按权重平均，模型内按行权重平均」（0–100）；确认模型权重与行权重是否符合用户意图，是否留出集。

评分口径与模型权重一旦开始就不要中途改。确需修改（例如判分明显错误）时：停掉当前运行、修 rubric 或判分、**重跑基线**，并在报告里说明变更，不能把两次不同口径的分数直接比较。

## 三、Prompt 模板（YAML messages）

```yaml
name: customer-support
temperature: 0.0
max_tokens: 1024
messages:
  - role: system
    content: |
      You are a careful customer-support assistant.
      Answer directly, then explain the policy you apply.
  - role: user
    content: |
      {{input}}
```

- `messages` 必填，非空；`role` 支持 `system` / `user` / `assistant` / `developer`。
- `content` 中可以用 `{{input}}`（允许空格，如 `{{ input }}`）；会替换成该行输入。模板中**没有任何占位符**时，会把输入作为额外一条 user 消息追加。
- 优化对象是 **system 消息**：候选只替换 system 内容，其他消息（user 模板、few-shot 回合）固定不变。多个 system 消息会合并成一条。
- `name`、`temperature`、`max_tokens` 可选；优先级见第六节。
- 仍兼容纯文本 prompt（当作 system 消息）和旧版 `system` / `user_template` JSON 格式，但新模板一律建议用 `messages` YAML。
- 完整字段、转义与限制见 `references/prompt-and-models.md`。

## 四、目标模型配置（models.yaml）

```yaml
models:
  - name: deepseek-chat
    model: deepseek-chat
    base_url: https://api.deepseek.com/v1
    api_key_env: PROMPT_OPT_API_KEY
    temperature: 0.0
    max_tokens: 1024
    weight: 2
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
  api_key_env: PROMPT_OPT_API_KEY

optimizer:
  model: deepseek-chat
  base_url: https://api.deepseek.com/v1
  temperature: 0.7
  max_tokens: 2048
  api_key_env: PROMPT_OPT_API_KEY
```

关键点：

- `models` 是**目标模型列表**，至少一个；`name` 必须唯一，用于报告与结果文件。
- 每个模型独立配置：`base_url`、`model`、`api_key` 或 `api_key_env`、`temperature`、`max_tokens`、`weight`、`headers`、`timeout`、`max_retries`；也可以给某个模型用 `llm_cmd` 接本地 CLI。
- `weight` 默认 1；总分按模型权重平均。想强调某个模型就调大权重，不要把它的失败平均掉。
- `judge` / `optimizer` 段可选；缺省时用 CLI 的 `--judge-*`、`--optimizer-*` 或 `--base-url/--model` 兜底。它们各自解析自己的 key，可与目标模型不同。
- 环境变量 key 优先：`api_key_env` 指定的变量优先；未指定时依次尝试 `PROMPT_OPT_API_KEY`、`DEEPSEEK_API_KEY`、`OPENAI_API_KEY`。本地 endpoint（localhost/127.0.0.1）不会自动附带全局云 key，需要鉴权时显式写 `api_key_env`；远程无 key 需显式 `--allow-no-auth`。
- 不要把 key 写进 `api_key` 字段；用 `api_key_env`。key 不会写入 run/summary/cache key 的明文。
- 字段、优先级与校验规则见 `references/prompt-and-models.md`。

## 五、评分与目标

- 对每个**模型-行**对分别调用目标模型，再用 rubric 判分。
- 每条准则得分 `s ∈ {0, 0.5, 1}`；有 `check` 的准则走确定性规则，其余由判分模型打分。
- 行分 `= 100 × Σ(weight × s) / Σ(weight)`。
- 模型分 `= 该模型所有行的按行权重平均`。
- **总分 `= Σ(模型权重 × 模型分) / Σ(模型权重)`**；报告同时给每个模型的分、search/holdout 分与加权求和。
- 这意味着：所有目标模型共用同一版 system prompt，但可以有不同的 decoding 配置；优化器会看到不同模型的失败样本，需要在「共同失败」和「单模型失败」之间取舍。

## 六、执行流程

1. **检查数据与模型**：
   ```bash
   python "$SKILL_DIR/scripts/prompt_opt.py" inspect \
     --dataset data.jsonl --models models.yaml
   ```
   确认字段识别、rubric、目标模型数量、权重、一次全量评测的调用数。坏行默认报错；只有用户接受排除时才用 `--skip-invalid`，并在报告中记录。
2. **估算预算**：先 `optimize --dry-run`，把预计调用数、模型与轮次给用户确认；设置 `--max-calls`，留 20% 余量给重试与判分修复。
3. **跑基线**：
   ```bash
   python "$SKILL_DIR/scripts/prompt_opt.py" score \
     --dataset data.jsonl --models models.yaml \
     --prompt-file prompt.yaml --out runs/baseline
   ```
   输出会按模型列出分数。人工抽查 3–5 个模型-行对：模型是否真的在回答任务、判分 rationale 是否合理。若判分明显错误，先修 rubric/判分，不要优化 prompt。
4. **优化**：
   ```bash
   python "$SKILL_DIR/scripts/prompt_opt.py" optimize \
     --dataset data.jsonl --models models.yaml \
     --prompt-file prompt.yaml --out runs/opt \
     --rounds 3 --candidates 4 --holdout 0.2 --search-size 40 \
     --min-improvement 0.5 --patience 2 --max-calls 2400
   ```
   工具会自动完成失败分析、候选生成、search 集评测、按总分择优，并在结束时对全量数据重算基线与最优 prompt。
5. **审阅报告**：重点看总分、每个模型的分差、search 与 holdout、分准则变化、退步的模型-行对、warnings。只有 holdout 也提升，才能说「泛化上更好」；没有 holdout 就明确说明是样本内结果。**如果只有某个模型提升而另一个明显退步，即使加权总分上涨也要向用户指出。**
6. **人工复核最优 prompt**：是否混入数据集逐行事实/答案、是否提到 rubric 或判分器、是否扩大了任务范围、是否仍是用户要的语言与目标。发现作弊或跑偏就回退，不要直接交付。
7. **交付**：`prompts/best.txt`（完整 YAML 模板）、`report.md`、`summary.json`、`results/`。汇报时给总分与逐模型分差、口径、模型配置（不含 key）、预算与限制；不得省略「样本内/留出集」和判分模型。

### 命令速查

```bash
# 数据 + 模型配置体检
python "$SKILL_DIR/scripts/prompt_opt.py" inspect --dataset data.jsonl --models models.yaml

# 预算预估（不调用模型）
python "$SKILL_DIR/scripts/prompt_opt.py" optimize \
  --dataset data.jsonl --models models.yaml \
  --prompt-file prompt.yaml --out runs/opt --dry-run \
  --rounds 3 --candidates 4 --holdout 0.2

# 基线（按模型输出分数）
python "$SKILL_DIR/scripts/prompt_opt.py" score \
  --dataset data.jsonl --models models.yaml \
  --prompt-file prompt.yaml --out runs/baseline

# 优化
python "$SKILL_DIR/scripts/prompt_opt.py" optimize \
  --dataset data.jsonl --models models.yaml \
  --prompt-file prompt.yaml --out runs/opt \
  --rounds 3 --candidates 4 --holdout 0.2 --search-size 40 \
  --min-improvement 0.5 --patience 2 --max-calls 2400

# 只重渲染报告
python "$SKILL_DIR/scripts/prompt_opt.py" report --run runs/opt
```

没有 `--models` 时，可用 `--base-url`、`--model`、`--api-key` 跑单模型兜底；判分/优化模型仍可用 `--judge-model`、`--optimizer-model` 等覆盖。

## 七、参数、优先级与预算

| 参数 | 默认 | 用法 |
| --- | --- | --- |
| `--rounds` | 3 | 迭代轮数；预算紧用 1–2 |
| `--candidates` | 4 | 每轮候选数；成本随候选线性增长 |
| `--search-size` | 0（全部） | 每轮候选评测的行数；数据 >60 行建议 30–60，最终仍全量重算 |
| `--holdout` | 0 | 留出比例（`0.2`）或行数（`20`）；不参与优化，只用于验证泛化 |
| `--analysis-items` | 8 | 每轮展示给优化模型的最差模型-行对数量 |
| `--min-improvement` | 0 | 接受候选所需的最小总分提升；判分有噪声时设 0.5–1 |
| `--patience` | 2 | 连续多少轮无提升就停 |
| `--max-calls` | 0（不限） | **必须设置**；按模型-行对计数 |

调用量估算（每对 1 次任务调用 + 1 次判分调用）：

```text
行数 × 目标模型数 = 模型-行对数
≈ 基线(search) + 轮数 × (1 次候选生成 + 候选数 × search 对数 × 2) + 全量重算(基线 + 最优)
```

`--dry-run` 会按你的参数打印估算，直接用它设置 `--max-calls`。**模型越多，成本按模型数线性增长。**

优先级：

- decoding：模型配置的 `temperature` / `max_tokens` > CLI `--temperature` / `--max-tokens` > prompt 模板 > 内置默认（0.0 / 1024）。
- 判分/优化模型：`models.yaml` 的 `judge` / `optimizer` 段 > CLI 对应参数 > 全局 `--base-url/--model`。
- HTTP headers：`--header` 全局 + 模型自己的 `headers`（同名时模型覆盖）。

其他：`--concurrency` 默认 4，作用于所有模型-行对，遇到 429 降低它；`--cache-dir` 默认 `~/.cache/prompt-optimizer`，缓存包含模型输出，敏感数据用 `--no-cache`；`--on-error skip` 只应在用户接受缺行时使用。

## 八、防作弊与防过拟合（硬要求）

- **绝对禁止**把数据集的逐行输入、标准答案、行 id 或只在某一行成立的事实写进要部署的 system prompt；也不得针对判分器的固定措辞、开头词或长度偏好做套利。发现候选这样写就丢弃并说明（脚本会拦截逐字复制长输入/答案的候选，并提示 rubric/grader 字样）。
- 只优化 system 消息；不得把 user 模板、few-shot 示例改成对某一行答案的提示。
- 可以把 rubric 表达的**通用要求**转写为任务规则（例如「必须给出退款渠道」），但不能在 prompt 里提到 rubric、判分器、数据集或评测。
- 多模型优化时，必须看**每个模型**的分数变化，不能只看加权总分；一个模型大涨、另一个退步可能只是权重掩盖。
- 优化集与验证集分离：行数允许时用 `--holdout`；最终汇报必须区分 search 与 holdout，并说明是否有留出集。
- 单次提升可能来自判分噪声。预算允许时重跑一次 `score`（或换 `--seed` 再优化一轮）确认方向；不要把 ±1 分说成显著提升。
- 不改变用户任务的实质范围、语言与合规要求来换分。分数提高但任务跑偏，属于失败。
- 不得为了让分数好看而放宽判分、删掉难例、调小某模型权重或修改数据集；这些只能由用户明确决定并在报告中记录。

## 九、判分与失败处理

- 判分模型看到：任务输入、该模型的输出、该行全部 rubric 准则；有 `reference` 时一并提供。判分不要看到被优化的 prompt，避免对某版 prompt 产生偏好。
- 判分按**模型-行对**独立进行；同一行在不同模型上的输出分别判分。
- 判分返回严格 JSON（每个准则一条，0/0.5/1 + 理由）。解析失败会自动重试一次；仍失败则按 `--on-judge-error` 中止（默认）或记 0。默认中止是为了不把判分故障伪装成低分。
- 常见错误：`401/403` 查对应模型的 key；`404` 查 base URL；`429` 降并发/重试；`response_format` 不支持时客户端会自动回退；输出为空通常是 `max_tokens` 太小；预算耗尽退出码为 3。
- 判分器过于宽松或严格时，先修 rubric（更具体、可观察、分档明确），不要在优化中途换判分模型。
- 详细判分设计与校准方法见 `references/grading.md`。

## 十、交付检查清单

- [ ] 数据集每行 rubric 有效；坏行/排除行已记录。
- [ ] prompt 模板是合法 YAML，`messages` 非空，`{{input}}` 位置正确。
- [ ] `models.yaml` 中每个目标模型的 endpoint/model/key 来源明确，权重符合用户意图；没有泄露 key。
- [ ] 评分口径（模型权重、行权重、平均/求和、判分模型）已固定并在报告中写明。
- [ ] 基线是在全部模型-行对上测得，且抽查过判分合理性。
- [ ] 报告给出总分、逐模型分、search、holdout、分准则与退步对。
- [ ] 最优 prompt 不含数据集答案、行级事实、rubric/判分器字样，未改变任务范围。
- [ ] 明确说明样本内/留出集、判分偏差与随机性；没有把测量分数说成线上收益。
- [ ] 交付了 `prompts/best.txt`、`report.md`、`summary.json` 与可复现的 `summary.command`。
- [ ] 未泄露 API key；数据集敏感时已提醒会发送给各模型提供方。

## 十一、脚本自检

修改本 skill 的脚本后运行：

```bash
python -m unittest discover -s "$SKILL_DIR/scripts/tests"
```

测试用本地 stub 模型服务覆盖 YAML 解析、模型配置、HTTP 调用、判分、候选生成、多模型加权择优、留出集与报告渲染，不需要真实 API key。
