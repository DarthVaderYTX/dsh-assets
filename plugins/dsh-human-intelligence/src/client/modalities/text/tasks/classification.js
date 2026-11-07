/* Text modality · classification task module. */
const createTextClassificationTask = ({ h, React, ui }) => {
  const { useMemo } = React;
  const { Icon } = ui;

  function Editor(props) {
    const value = props.value && typeof props.value === 'object' ? props.value : {};
    const labels = readStringList(props.options, 'labels', ['正面', '负面', '中性']);
    const selected = typeof value.label === 'string' ? value.label : '';
    const t = props.t;
    return h(
      'div',
      { className: 'hi-task' },
      h('div', { className: 'hi-text-item' }, props.item.text || ''),
      h(
        'div',
        { className: 'hi-task-card' },
        h(
          'div',
          { className: 'hi-task-card-head' },
          h('h3', null, t('task.textClassification.choose')),
          h(ui.Badge, { tone: selected ? 'brand' : undefined }, selected || t('status.todo')),
        ),
        h(
          'div',
          { className: 'hi-label-grid' },
          labels.map((label) =>
            h(
              'button',
              {
                key: label,
                type: 'button',
                className: cx('hi-label', selected === label && 'is-selected'),
                'aria-pressed': selected === label,
                onClick: () => props.onChange({ ...value, label }),
              },
              h('span', { className: 'hi-label-dot' }),
              label,
            ),
          ),
        ),
      ),
    );
  }

  return {
    id: 'text-classification',
    modality: 'text',
    titleKey: 'task.textClassification.title',
    descriptionKey: 'task.textClassification.description',
    icon: 'tag',
    messages: {
      zh: {
        'task.textClassification.title': '文本分类',
        'task.textClassification.description': '为每条文本从标签集中选择一个类别。',
        'task.textClassification.choose': '选择分类标签',
        'task.textClassification.labels': '分类标签',
        'task.textClassification.labelsHint': '用逗号或换行分隔，例如：正面, 负面, 中性',
        'task.textClassification.required': '请选择一个分类标签。',
      },
      en: {
        'task.textClassification.title': 'Text Classification',
        'task.textClassification.description': 'Assign one category from a configurable label set.',
        'task.textClassification.choose': 'Choose a label',
        'task.textClassification.labels': 'Labels',
        'task.textClassification.labelsHint': 'Separate labels with commas or new lines, e.g. Positive, Negative, Neutral',
        'task.textClassification.required': 'Choose a classification label.',
      },
    },
    options: [
      {
        key: 'labels',
        kind: 'tags',
        labelKey: 'task.textClassification.labels',
        hintKey: 'task.textClassification.labelsHint',
        default: ['正面', '负面', '中性'],
      },
    ],
    initial: () => ({ label: '' }),
    validate: (value) => (value && typeof value.label === 'string' && value.label !== '' ? null : 'task.textClassification.required'),
    summary: (value) => (value && typeof value.label === 'string' && value.label !== '' ? value.label : '—'),
    Editor,
  };
};
