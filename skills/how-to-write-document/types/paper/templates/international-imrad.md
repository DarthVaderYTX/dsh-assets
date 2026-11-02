# International IMRaD: Internal Writing Template

Use this preset for original research manuscripts in English, with the PLOS ONE submission guidelines as a specific reference.
The twelve numbered modules are internal writing units, not an official journal layout or a prescribed set of manuscript headings.
Journal requirements vary; do not generalize PLOS ONE rules to all international journals.
Reorder or merge modules as allowed by the target journal, while preserving its required beginning and ending order.
Use English throughout this file and any English-language example: headings, instructions, placeholders, tables, captions, notes, link labels, and submission mapping.
Module numbers correspond to the shared specification in [the paper writing guide](../README.md); translated module names preserve the same meaning.

## 1. Blank Template

```markdown
## 0. Title, Authors, and Manuscript Information
[Full title; short title; authors; affiliations; corresponding author email]
[ORCID and submission metadata: verify; article type, version, and date]
[Unverified authors, dataset identifiers, and DOI remain placeholders]

## 1. Abstract and Keywords
[Objective → approach → verified main results → bounded interpretation]
[For PLOS ONE: English abstract ≤300 words, no citations; avoid abbreviations]
[Keywords: internal discovery terms; transfer only if the target journal requests them]

## 2. Introduction and Research Questions
[Background accessible beyond the specialty; specific gap and its importance]
[Research question or hypothesis; scope; overall aim and whether it was achieved]

## 3. Related Work and Contribution Positioning
[Compare relevant work, disagreements, assumptions, and evidence]
[Verified source placeholders: authors, title, year, and DOI]
[State the contribution without unsupported priority or impact claims]

## 4. Research Methods and Reproducibility
[Study design; units; selection; controls; variables; procedures; exclusions]
[Data provenance, permissions, preprocessing, and train/test separation if relevant]
[Software versions, parameters, seeds, environment, and replication instructions]
[If applicable: statistical methods, assumptions, uncertainty, and analysis code]
[If not applicable: explain the proof, qualitative, or other validation route]

## 5. Results and Evidence
[Organize findings by research question; link claims to tables, figures, or proofs]
[Verified observations and sample sizes: pending; do not invent measurements]
[Report effect estimates and confidence intervals where applicable, not mechanically]
[Negative findings, sensitivity checks, and deviations from the planned analysis]

## 6. Discussion, Limitations, and Scope of Applicability
[Interpret results against the research question and relevant prior work]
[Alternative explanations; limitations; generalizability; applicability boundaries]
[Separate observations, interpretation, and future hypotheses; avoid overstatement]

## 7. Conclusions
[Evidence-supported answer, key supporting evidence, and bounded implications]
[Do not introduce new results]
[A separate Conclusions section is optional for PLOS ONE; it may merge into Discussion]

## 8. Data, Code, and Materials Availability
[Data Availability Statement draft; repository; persistent identifier; access terms]
[Code/materials versions and licenses; identifiers or DOI: pending verification]
[Restrictions and legitimate access route if relevant; do not claim release prematurely]

## 9. Ethics, Author Contributions, Competing Interests, and Funding
[Ethics approval, consent, and privacy: applicable status and identifiers to verify]
[Author contribution roles and competing interests: obtain author confirmation]
[Funding: internal worksheet only; enter financial disclosure in the submission system]
[For PLOS ONE, remove funding from the manuscript, including Acknowledgments]
[Acknowledgments: non-author contributions and permission to name contributors]

## 10. References
[Verified bibliography only; unverified authors, dates, and DOI remain placeholders]
[PLOS ONE: Vancouver numbered references in order of first citation; no abstract citations]
[Finalize manuscript order before assigning numbers; verify corrections/retractions]

## 11. Appendices and Supporting Information
[Supporting item inventory, filenames, versions, captions, and main-text pointers]
[Detailed protocols, additional analyses, and replication material as appropriate]
```

## 2. Illustrative Example

The following English-language excerpt is entirely fictional and contains no real data.
It illustrates modules 0, 2, 4, 5, 6, and 8; it is not a complete manuscript or a completed study.
Complete the other modules using the blank template. Do not invent reference numbers, authors, repositories, or DOI identifiers.

```markdown
Title (module 0): Dependency-aware candidate generation for header decomposition
Authors, affiliations, and DOI: pending; this is a fictional writing exercise.
Question (module 2): Can dependency constraints identify candidates worth manual review?
Methods (module 4): We represent symbol references as a directed graph and filter
candidate partitions using explicit dependency constraints. Evaluation has not yet been run.
Results (module 5): Validity, build impact, and review effort will be reported separately;
all measurements remain pending, so no improvement or significance claim is made.
Discussion (module 6): Conditional compilation may invalidate the graph abstraction.
Availability (module 8): No dataset or code has been released; identifiers are pending.
```

## 3. Published Examples and Official Sources

- [PLOS ONE Submission Guidelines](https://journals.plos.org/plosone/s/submission-guidelines): English manuscripts; abstracts of no more than 300 words without citations; Vancouver numbered references; double spacing; a single column; page numbers and continuous line numbering. Statistical methods and confidence intervals depend on the study design.
- [Ten simple rules for structuring papers](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1005619): an **Editorial in PLOS Computational Biology, not an original research article**. Use it to study the central contribution, paragraph logic, and narrative structure, not as an example of experimental design or research results.
- [Correction to the Editorial](https://doi.org/10.1371/journal.pcbi.1005830): check the publication's correction status when citing it; do not copy passages from the article.
- [PLOS ONE Data Availability](https://journals.plos.org/plosone/s/data-availability): separately verify the disclosure and data-access requirements for module 8. A placeholder does not establish policy compliance.

### arXiv References and Preprint Preparation

- [arXiv Submission Overview](https://info.arxiv.org/help/submit/index.html): official guidance on submission files, metadata, figures, licensing, moderation, and revisions. arXiv is a research repository, not a journal; moderation is not journal peer review, and availability on arXiv does not establish acceptance or correctness.
- [Attention Is All You Need — arXiv:1706.03762v7](https://arxiv.org/abs/1706.03762v7): a version-pinned English research example. Use it to study the problem-to-method-to-evidence narrative and the organization of a machine-learning methods paper; do not treat its structure or reported results as requirements for every paper.
- Cite the exact arXiv identifier and version used. Check revision history and any journal/conference publication record; distinguish repository versions from published versions and avoid counting them as independent studies.
- For an arXiv preprint, retain the paper's appropriate disciplinary structure rather than mechanically applying PLOS ONE headings, abstract limits, reference style, or funding placement. Journal-specific instructions below apply only when preparing that journal's submission.
- For TeX/LaTeX manuscripts, prepare the source and required figure/style files according to current arXiv guidance; do not substitute a TeX-generated PDF for required source files. Verify compilation, figure completeness, metadata consistency, licensing, and the target category before submission.
- Do not invent an arXiv identifier, publication status, license selection, or author authorization. Check the target journal's preprint policy separately when planning subsequent submission.

### Mapping to Submission Components

- Module 0 → Title page; module 1 → Abstract; module 2 and relevant material from module 3 → Introduction. Preserve the journal's required beginning order.
- Modules 4, 5, and 6 → Materials and Methods, Results, and Discussion. Middle sections may be renamed, reordered, or combined as permitted; merging must not remove essential methodological information.
- Module 7 → optional Conclusions, or the final part of Discussion. Do not add a separate Conclusions section solely to retain an internal module.
- Module 8 → the Data Availability submission statement and corresponding methods/materials information. Verify the actual submission location under the current policy.
- Module 9 → ethics information in the appropriate manuscript location; CRediT author contributions and competing interests in the required submission fields; non-author acknowledgments in Acknowledgments.
- Funding information from module 9 belongs only in the submission financial disclosure for PLOS ONE, not in the manuscript or Acknowledgments. Remove the internal funding worksheet when exporting the manuscript.
- Modules 10 and 11 → References and Supporting information captions. Preserve the ending order: Acknowledgments → References → applicable Supporting information captions.
- Place figure captions after the paragraph where the figure is first cited; upload figure files separately. Place tables after their first-citation paragraph and upload supporting files separately.
- Before export, replace internal numbering with submission headings as appropriate and verify double spacing, a single column, and continuous line numbering. Markdown alone does not establish layout compliance.
