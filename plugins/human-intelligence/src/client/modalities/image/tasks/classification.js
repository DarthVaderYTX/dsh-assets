/* Image modality · classification task module. */
const createImageClassificationTask = ({ h, React, ui }) => {
  function Editor(props) {
    const t = props.t;
    const value = props.value && typeof props.value === 'object' ? props.value : {};
    const labels = readStringList(props.options, 'labels', ['目标', '背景']);
    const selected = typeof value.label === 'string' ? value.label : '';
    return h(
      'div',
      { className: 'hi-task' },
      h(
        'div',
        { className: 'hi-task-card', style: { textAlign: 'center' } },
        h(
          'div',
          { className: 'hi-media-frame' },
          h('img', {
            src: AnnotationApi.media.url(props.item.media.file),
            alt: props.item.name || '',
            draggable: false,
          }),
        ),
      ),
      h(
        'div',
        { className: 'hi-task-card' },
        h(
          'div',
          { className: 'hi-task-card-head' },
          h('h3', null, t('task.imageClassification.choose')),
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
    id: 'image-classification',
    modality: 'image',
    titleKey: 'task.imageClassification.title',
    descriptionKey: 'task.imageClassification.description',
    icon: 'tag',
    messages: {
      zh: {
        'task.imageClassification.title': '图片分类',
        'task.imageClassification.description': '为整张图片选择一个类别标签。',
        'task.imageClassification.choose': '选择图片标签',
        'task.imageClassification.labels': '分类标签',
        'task.imageClassification.labelsHint': '用逗号或换行分隔，例如：目标, 背景',
        'task.imageClassification.required': '请选择一个图片标签。',
      },
      en: {
        'task.imageClassification.title': 'Image Classification',
        'task.imageClassification.description': 'Assign one category label to the whole image.',
        'task.imageClassification.choose': 'Choose an image label',
        'task.imageClassification.labels': 'Labels',
        'task.imageClassification.labelsHint': 'Separate labels with commas or new lines, e.g. Target, Background',
        'task.imageClassification.required': 'Choose an image label.',
      },
    },
    options: [
      {
        key: 'labels',
        kind: 'tags',
        labelKey: 'task.imageClassification.labels',
        hintKey: 'task.imageClassification.labelsHint',
        default: ['目标', '背景'],
      },
    ],
    initial: () => ({ label: '' }),
    validate: (value) =>
      value && typeof value.label === 'string' && value.label !== '' ? null : 'task.imageClassification.required',
    summary: (value) => (value && typeof value.label === 'string' && value.label !== '' ? value.label : '—'),
    Editor,
  };
};
