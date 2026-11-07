/* Text modality module: bulk text import plus its task modules. */
const createTextModality = ({ h, React, ui, taskFactories }) => {
  const { useMemo, useState } = React;
  const { Icon } = ui;

  const tasks = taskFactories.map((factory) => factory({ h, React, ui }));

  function defaultParse(raw) {
    return String(raw || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => ({
        name: line.length > 60 ? `${line.slice(0, 57)}…` : line || `#${index + 1}`,
        text: line,
      }));
  }

  function TextItemImporter(props) {
    const t = props.t;
    const task = props.task;
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const parse = task && typeof task.parsePaste === 'function' ? task.parsePaste : defaultParse;
    const parsed = useMemo(() => {
      if (draft.trim() === '') return { items: [], error: '' };
      try {
        const items = parse(draft, t);
        return { items: Array.isArray(items) ? items : [], error: '' };
      } catch (failure) {
        return {
          items: [],
          error:
            failure && failure.messageKey
              ? t(failure.messageKey)
              : failure && failure.message
                ? failure.message
                : t('common.networkError'),
        };
      }
    }, [draft, parse, t]);
    const displayError = error || (draft.trim() !== '' ? parsed.error : '');
    const hint = task && task.importHintKey ? t(task.importHintKey) : t('importer.text.hint');
    const placeholder = task && task.importPlaceholderKey ? t(task.importPlaceholderKey) : t('importer.text.placeholder');
    const countLabel =
      task && task.importCountKey
        ? t(task.importCountKey, { n: parsed.items.length })
        : t('importer.text.lines', { n: parsed.items.length });

    async function submit() {
      if (parsed.items.length === 0) {
        setError(parsed.error || t('importer.text.empty'));
        return;
      }
      setBusy(true);
      setError('');
      try {
        await props.onAdd(parsed.items);
      } catch (failure) {
        setError(
          failure && failure.message === 'NETWORK'
            ? t('common.networkError')
            : failure && failure.message
              ? failure.message
              : t('common.networkError'),
        );
      } finally {
        setBusy(false);
      }
    }

    return h(
      'div',
      { className: 'hi-form' },
      h('p', { className: 'hi-task-note' }, hint),
      h('textarea', {
        className: 'hi-textarea',
        rows: 8,
        value: draft,
        placeholder,
        onChange: (event) => setDraft(event.target.value),
      }),
      h(
        'div',
        { className: 'hi-modal-foot', style: { padding: 0, border: 0, background: 'transparent' } },
        h('span', { className: 'hi-toolbar-count', style: { marginRight: 'auto' } }, countLabel),
        h(
          ui.Button,
          {
            variant: 'primary',
            icon: 'plus',
            disabled: busy || parsed.items.length === 0,
            onClick: () => void submit(),
          },
          busy ? t('common.loading') : t('importer.text.submit', { n: parsed.items.length }),
        ),
      ),
      displayError
        ? h(
            'div',
            { className: 'hi-form-error' },
            h(Icon, { name: 'alert', size: 14 }),
            h('span', null, displayError),
          )
        : null,
    );
  }

  return {
    id: 'text',
    titleKey: 'modality.text.title',
    descriptionKey: 'modality.text.description',
    icon: 'text',
    messages: {
      zh: {
        'modality.text.title': '文本',
        'modality.text.description': '语料、评论、对话与任意纯文本记录。',
      },
      en: {
        'modality.text.title': 'Text',
        'modality.text.description': 'Corpora, reviews, conversations, and plain text records.',
      },
    },
    tasks,
    ItemImporter: TextItemImporter,
  };
};
