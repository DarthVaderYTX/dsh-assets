/* Text modality · quality rating task module. */
const createTextRatingTask = ({ h, React, ui }) => {
  const { Icon } = ui;

  function Editor(props) {
    const t = props.t;
    const value = props.value && typeof props.value === 'object' ? props.value : {};
    const scale = Number(props.options && props.options.scale) || 5;
    const score = Number(value.score) || 0;
    const note = typeof value.note === 'string' ? value.note : '';
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
          h('h3', null, t('task.textRating.prompt')),
          score > 0 ? h(ui.Badge, { tone: 'brand' }, `${score} / ${scale}`) : null,
        ),
        h(
          'div',
          { className: 'hi-rating-row' },
          Array.from({ length: scale }, (_, offset) => offset + 1).map((candidate) =>
            h(
              'button',
              {
                key: candidate,
                type: 'button',
                className: cx('hi-rating-btn', score === candidate && 'is-selected'),
                'aria-pressed': score === candidate,
                onClick: () => props.onChange({ ...value, score: candidate, note }),
              },
              candidate,
            ),
          ),
          score > 0
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'hi-btn hi-btn-ghost hi-btn-sm',
                  onClick: () => props.onChange({ ...value, score: 0, note }),
                },
                t('task.textRating.clear'),
              )
            : null,
        ),
        h(
          'div',
          { className: 'hi-field hi-rating-note' },
          h('span', { className: 'hi-field-label' }, t('task.textRating.note')),
          h('textarea', {
            className: 'hi-textarea',
            rows: 2,
            value: note,
            placeholder: t('task.textRating.notePlaceholder'),
            onChange: (event) => props.onChange({ ...value, score, note: event.target.value }),
          }),
        ),
      ),
    );
  }

  return {
    id: 'text-rating',
    modality: 'text',
    titleKey: 'task.textRating.title',
    descriptionKey: 'task.textRating.description',
    icon: 'star',
    messages: {
      zh: {
        'task.textRating.title': '质量评分',
        'task.textRating.description': '按设定量表为文本质量打分，并可补充备注。',
        'task.textRating.scale': '评分量表',
        'task.textRating.scaleHint': '选择最高分，评分按钮将从 1 到该分值。',
        'task.textRating.prompt': '这条文本的质量如何？',
        'task.textRating.clear': '清除',
        'task.textRating.note': '备注',
        'task.textRating.notePlaceholder': '可选：写下评分理由或需要复核的问题…',
        'task.textRating.required': '请先选择一个分数。',
      },
      en: {
        'task.textRating.title': 'Quality Rating',
        'task.textRating.description': 'Score text quality on a configurable scale, with an optional note.',
        'task.textRating.scale': 'Scale',
        'task.textRating.scaleHint': 'The rating buttons run from 1 to this maximum.',
        'task.textRating.prompt': 'How good is this text?',
        'task.textRating.clear': 'Clear',
        'task.textRating.note': 'Note',
        'task.textRating.notePlaceholder': 'Optional: explain the score or flag something for review…',
        'task.textRating.required': 'Choose a score first.',
      },
    },
    options: [
      {
        key: 'scale',
        kind: 'select',
        labelKey: 'task.textRating.scale',
        hintKey: 'task.textRating.scaleHint',
        choices: [3, 5, 10],
        default: 5,
      },
    ],
    initial: () => ({ score: 0, note: '' }),
    validate: (value) => (Number(value && value.score) >= 1 ? null : 'task.textRating.required'),
    summary: (value, options) => {
      const score = Number(value && value.score) || 0;
      const scale = Number(options && options.scale) || 5;
      return score > 0 ? `${score} / ${scale}` : '—';
    },
    Editor,
  };
};
