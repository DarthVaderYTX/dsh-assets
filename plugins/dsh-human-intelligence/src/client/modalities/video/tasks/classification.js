/* Video modality · classification task module. */
const createVideoClassificationTask = ({ h, React, ui }) => {
  function Editor(props) {
    const t = props.t;
    const value = props.value && typeof props.value === 'object' ? props.value : {};
    const labels = readStringList(props.options, 'labels', ['事件 A', '事件 B']);
    const selected = typeof value.label === 'string' ? value.label : '';
    return h(
      'div',
      { className: 'hi-task' },
      h(
        'div',
        { className: 'hi-task-card' },
        h(
          'div',
          { className: 'hi-media-frame', style: { display: 'block', width: '100%' } },
          h('video', {
            src: AnnotationApi.media.url(props.item.media.file),
            controls: true,
            preload: 'metadata',
            playsInline: true,
          }),
        ),
      ),
      h(
        'div',
        { className: 'hi-task-card' },
        h(
          'div',
          { className: 'hi-task-card-head' },
          h('h3', null, t('task.videoClassification.choose')),
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
    id: 'video-classification',
    modality: 'video',
    titleKey: 'task.videoClassification.title',
    descriptionKey: 'task.videoClassification.description',
    icon: 'tag',
    messages: {
      zh: {
        'task.videoClassification.title': '视频分类',
        'task.videoClassification.description': '观看视频后为整段视频选择一个类别。',
        'task.videoClassification.choose': '选择视频标签',
        'task.videoClassification.labels': '分类标签',
        'task.videoClassification.labelsHint': '用逗号或换行分隔，例如：高光, 普通, 无效',
        'task.videoClassification.required': '请选择一个视频标签。',
      },
      en: {
        'task.videoClassification.title': 'Video Classification',
        'task.videoClassification.description': 'Watch the clip and assign one category to the whole video.',
        'task.videoClassification.choose': 'Choose a video label',
        'task.videoClassification.labels': 'Labels',
        'task.videoClassification.labelsHint': 'Separate labels with commas or new lines, e.g. Highlight, Normal, Invalid',
        'task.videoClassification.required': 'Choose a video label.',
      },
    },
    options: [
      {
        key: 'labels',
        kind: 'tags',
        labelKey: 'task.videoClassification.labels',
        hintKey: 'task.videoClassification.labelsHint',
        default: ['高光', '普通', '无效'],
      },
    ],
    initial: () => ({ label: '' }),
    validate: (value) =>
      value && typeof value.label === 'string' && value.label !== '' ? null : 'task.videoClassification.required',
    summary: (value) => (value && typeof value.label === 'string' && value.label !== '' ? value.label : '—'),
    Editor,
  };
};
