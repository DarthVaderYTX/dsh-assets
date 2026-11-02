# 类型目录索引

一种文档类型一个文件夹，文件夹内两件东西：

- `README.md`：该类文档的整体要求与约束、整体结构、各部分写作要求、交付前检查。
- `templates/`：该类文档的可复制模板，内含空白模板、填写示例与真实示例链接。

入口 [SKILL.md](../SKILL.md) 只放通用要求、类型选择与执行流程，不重复类型细节。

## 目录结构

```
types/
├── technical-design/
│   ├── README.md
│   └── templates/technical-design.md
├── prd/
│   ├── README.md
│   └── templates/prd.md
├── one-pager/
│   ├── README.md
│   └── templates/one-pager.md
├── experiment-report/
│   ├── README.md
│   └── templates/experiment-report.md
├── research-report/
│   ├── README.md
│   └── templates/research-report.md
└── paper/
    ├── README.md
    └── templates/
        ├── undergraduate-thesis.md
        ├── chinese-research.md
        ├── international-imrad.md
        └── review.md
```

## 文件清单

| 类型 | 规范 | 模板 | 主要要解决的问题 |
|---|---|---|---|
| 技术方案 / 设计文档 | [technical-design/README.md](technical-design/README.md) | [templates/technical-design.md](technical-design/templates/technical-design.md) | 技术选择是否合理、如何实现、如何验证与上线 |
| PRD | [prd/README.md](prd/README.md) | [templates/prd.md](prd/templates/prd.md) | 为谁解决什么问题、做什么与不做什么、如何验收 |
| One Pager（一页纸） | [one-pager/README.md](one-pager/README.md) | [templates/one-pager.md](one-pager/templates/one-pager.md) | 该批准什么投入、为什么值得、如何控制风险 |
| 实验报告 | [experiment-report/README.md](experiment-report/README.md) | [templates/experiment-report.md](experiment-report/templates/experiment-report.md) | 改动是否有效、数据是否可信、结论适用于哪里 |
| 调研报告 | [research-report/README.md](research-report/README.md) | [templates/research-report.md](research-report/templates/research-report.md) | 研究问题的答案是什么、证据如何支持判断、该如何行动 |
| 论文 | [paper/README.md](paper/README.md) | [本科毕业论文](paper/templates/undergraduate-thesis.md)、[中文研究](paper/templates/chinese-research.md)、[国际实证 IMRaD](paper/templates/international-imrad.md)、[综述](paper/templates/review.md) | 学术问题、原创贡献、研究证据与适用边界；学位论文另受学校模板与流程约束 |

## 每个类型的阅读顺序

1. **README「一、整体要求与约束」**：先明确用途、读者、证据要求、篇幅取舍与缺失信息处理。
2. **README「二、整体结构与模板」**：确认章节序列，再按用途打开 `templates/` 下相应预设，取空白模板。
3. **模板「二、填写示例」**：对照示例理解每节应达到的粒度；示例值一律为虚构，只学写法不抄数据。
4. **README「三、各部分写作要求」**：按模板顺序逐节核对内容、表达、检查与禁忌，不能只填模板。
5. **README「四、交付前检查」**：核查内容覆盖、章节关联与关键证据；模板「三、真实示例」可作参照。

模板的标准模块与 README 第三部分必须一一对应，包括头部信息；英文模板按模块编号及英文译名的语义对应，学位论文模板按编号对应、章节名按学位论文惯例调整，均不要求与中文规范标题逐字相同。英文模板与例子的所有语言内容均为英文。两者信息不一致时修正模板。论文允许按目标期刊合并、重排和拆分声明，须保留模块映射；官方指南优先于内部默认结构，不能把内部检查字段全部提交为正文。

## 使用约定

- 按主问题只加载需要的类型目录，不一次读全部类型。确实需要多种交付物时，分开成文并相互引用。
- 结构是默认顺序；用户已有固定模板时可映射章节，但不得遗漏关键内容，也不得把风险移到不可见位置。
- “必须”“建议”“条件适用”强度不同；未满足关键条件时说明缺口，不能靠标“不适用”绕过要求。
- 实验报告的离线评测是同一报告的一种数据方式；调研报告覆盖访谈、竞品、市场与选型，都不新增类型目录。
- 结论要短而明确，数据要真实可核查。实验报告与调研报告必须给出支持重要结论的典型例子；未发现反例时说明检查范围，不伪造例子。
- 模板中的占位符与示例值在实际交付前替换为真实材料或明确的待确认项；示例数据不得当成实测结果引用。
- 真实示例只登记可核查链接；没有实例就写“暂无”，不编造链接、客户名或内部编号。
