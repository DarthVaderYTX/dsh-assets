/* Video modality · temporal segment task module. */
const createVideoSegmentTask = ({ h, React, ui }) => {
  const { useMemo, useRef, useState } = React;
  const { Icon, Badge } = ui;

  function Editor(props) {
    const t = props.t;
    const videoRef = useRef(null);
    const [duration, setDuration] = useState(0);
    const [time, setTime] = useState(0);
    const [inPoint, setInPoint] = useState(null);
    const [error, setError] = useState('');
    const labels = readStringList(props.options, 'labels', ['片段']);
    const [activeLabel, setActiveLabel] = useState(labels[0] || '片段');
    const value = props.value && typeof props.value === 'object' ? props.value : {};

    const segments = useMemo(() => {
      const source = Array.isArray(value.segments) ? value.segments : [];
      return source
        .filter((segment) => segment && typeof segment === 'object')
        .map((segment) => ({
          id: typeof segment.id === 'string' && segment.id !== '' ? segment.id : uid('seg'),
          start: Math.max(0, Number(segment.start) || 0),
          end: Math.max(0, Number(segment.end) || 0),
          label: typeof segment.label === 'string' && segment.label !== '' ? segment.label : labels[0] || '片段',
        }))
        .filter((segment) => segment.end > segment.start)
        .sort((left, right) => left.start - right.start);
    }, [value, labels]);

    const total = duration > 0 ? duration : 0;
    const availableLabels = labels.slice();
    for (const segment of segments) if (!availableLabels.includes(segment.label)) availableLabels.push(segment.label);

    function seek(seconds) {
      const video = videoRef.current;
      if (!video) return;
      const limit = total || video.duration || 0;
      const next = clamp(seconds, 0, Number.isFinite(limit) && limit > 0 ? limit : seconds);
      video.currentTime = next;
      setTime(next);
    }

    function markIn() {
      const video = videoRef.current;
      setInPoint(video ? video.currentTime : 0);
      setError('');
    }

    function addSegment() {
      const video = videoRef.current;
      if (inPoint === null) {
        setError(t('task.videoSegment.needIn'));
        return;
      }
      const end = video ? video.currentTime : 0;
      if (!(end > inPoint + 0.08)) {
        setError(t('task.videoSegment.needOut'));
        return;
      }
      const segment = {
        id: uid('seg'),
        start: Number(inPoint.toFixed(3)),
        end: Number(end.toFixed(3)),
        label: activeLabel || availableLabels[0] || '片段',
      };
      props.onChange({ ...value, segments: segments.concat(segment).sort((left, right) => left.start - right.start) });
      setInPoint(null);
      setError('');
    }

    function removeSegment(id) {
      props.onChange({ ...value, segments: segments.filter((segment) => segment.id !== id) });
    }

    function changeLabel(id, label) {
      props.onChange({
        ...value,
        segments: segments.map((segment) => (segment.id === id ? { ...segment, label } : segment)),
      });
    }

    function onTimelineClick(event) {
      if (!total) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width === 0) return;
      seek(((event.clientX - rect.left) / rect.width) * total);
    }

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
            ref: videoRef,
            src: AnnotationApi.media.url(props.item.media.file),
            controls: true,
            preload: 'metadata',
            playsInline: true,
            onLoadedMetadata: (event) => {
              const next = Number(event.currentTarget.duration);
              setDuration(Number.isFinite(next) ? next : 0);
            },
            onTimeUpdate: (event) => setTime(event.currentTarget.currentTime),
          }),
        ),
        h(
          'div',
          { className: 'hi-segment-toolbar' },
          h(
            'div',
            { className: 'hi-video-time' },
            h(Icon, { name: 'clock', size: 13 }),
            `${formatClock(time)} / ${formatClock(total)}`,
          ),
          h(ui.Button, { size: 'sm', variant: 'secondary', icon: 'bounds', onClick: markIn }, t('task.videoSegment.markIn')),
          h(
            ui.Button,
            { size: 'sm', variant: 'primary', icon: 'segment', onClick: addSegment, disabled: inPoint === null },
            t('task.videoSegment.add'),
          ),
          inPoint !== null
            ? h('span', { className: 'hi-video-time' }, t('task.videoSegment.inAt', { time: formatClock(inPoint) }))
            : null,
        ),
        h(
          'div',
          {
            className: 'hi-timeline',
            role: 'slider',
            tabIndex: 0,
            'aria-label': t('task.videoSegment.timeline'),
            'aria-valuemin': 0,
            'aria-valuemax': Math.round(total * 10),
            'aria-valuenow': Math.round(time * 10),
            onClick: onTimelineClick,
            onKeyDown: (event) => {
              if (event.key === 'ArrowRight') seek(time + 1);
              else if (event.key === 'ArrowLeft') seek(time - 1);
            },
          },
          total > 0
            ? segments.map((segment) =>
                h(
                  'div',
                  {
                    key: segment.id,
                    className: 'hi-timeline-segment',
                    style: {
                      left: `${(segment.start / total) * 100}%`,
                      width: `${Math.max(((segment.end - segment.start) / total) * 100, 0.5)}%`,
                    },
                    title: `${segment.label} · ${formatClock(segment.start)} – ${formatClock(segment.end)}`,
                    onClick: (event) => {
                      event.stopPropagation();
                      seek(segment.start);
                    },
                  },
                  segment.label,
                ),
              )
            : null,
          total > 0
            ? h('span', {
                className: 'hi-timeline-playhead',
                style: { left: `${(time / total) * 100}%` },
              })
            : null,
          total > 0 && inPoint !== null
            ? h('span', {
                className: 'hi-timeline-in',
                style: { left: `${(inPoint / total) * 100}%` },
              })
            : null,
        ),
        h(
          'div',
          { className: 'hi-label-grid', style: { marginTop: 8 } },
          availableLabels.map((label) =>
            h(
              'button',
              {
                key: label,
                type: 'button',
                className: cx('hi-label', activeLabel === label && 'is-selected'),
                onClick: () => setActiveLabel(label),
              },
              h('span', { className: 'hi-label-dot' }),
              label,
            ),
          ),
        ),
        h('p', { className: 'hi-bbox-help' }, h(Icon, { name: 'info', size: 13 }), t('task.videoSegment.help')),
        error ? h('div', { className: 'hi-form-error' }, h(Icon, { name: 'alert', size: 13 }), h('span', null, error)) : null,
      ),
      h(
        'div',
        { className: 'hi-task-card' },
        h(
          'div',
          { className: 'hi-task-card-head' },
          h('h3', null, t('task.videoSegment.list')),
          h(Badge, { tone: segments.length ? 'brand' : undefined }, t('task.videoSegment.count', { n: segments.length })),
        ),
        segments.length === 0
          ? h('p', { className: 'hi-task-note', style: { margin: 0 } }, t('task.videoSegment.empty'))
          : h(
              'div',
              { className: 'hi-segment-list' },
              segments.map((segment) =>
                h(
                  'div',
                  { key: segment.id, className: 'hi-segment-row' },
                  h('span', { className: 'hi-segment-range' }, `${formatClock(segment.start)} – ${formatClock(segment.end)}`),
                  h(ui.IconButton, {
                    icon: 'play',
                    label: t('task.videoSegment.play'),
                    onClick: () => seek(segment.start),
                  }),
                  h(
                    'select',
                    {
                      className: 'hi-select',
                      value: segment.label,
                      'aria-label': t('task.videoSegment.label'),
                      onChange: (event) => changeLabel(segment.id, event.target.value),
                    },
                    availableLabels.map((label) => h('option', { key: label, value: label }, label)),
                  ),
                  h(ui.IconButton, {
                    icon: 'trash',
                    label: t('common.delete'),
                    className: 'hi-danger-hover',
                    onClick: () => removeSegment(segment.id),
                  }),
                ),
              ),
            ),
      ),
    );
  }

  return {
    id: 'video-segment',
    modality: 'video',
    titleKey: 'task.videoSegment.title',
    descriptionKey: 'task.videoSegment.description',
    icon: 'segment',
    messages: {
      zh: {
        'task.videoSegment.title': '片段切分',
        'task.videoSegment.description': '在时间轴上标记片段起止点，并为每个片段指定类别。',
        'task.videoSegment.labels': '片段类别',
        'task.videoSegment.label': '片段类别',
        'task.videoSegment.labelsHint': '用逗号或换行分隔，例如：讲解, 演示, 片头',
        'task.videoSegment.markIn': '标记入点',
        'task.videoSegment.add': '标记出点并添加',
        'task.videoSegment.inAt': '入点 {time}',
        'task.videoSegment.needIn': '请先播放到片段起点并点击「标记入点」。',
        'task.videoSegment.needOut': '出点需要晚于入点，请继续播放后再添加。',
        'task.videoSegment.timeline': '视频时间轴',
        'task.videoSegment.help': '时间轴可以点击跳转；拖动播放器到片段末尾后添加。',
        'task.videoSegment.list': '已切分片段',
        'task.videoSegment.empty': '还没有片段。播放视频并标记入点与出点。',
        'task.videoSegment.count': '{n} 个片段',
        'task.videoSegment.play': '跳到片段起点',
        'task.videoSegment.required': '请至少切分一个片段。',
      },
      en: {
        'task.videoSegment.title': 'Temporal Segments',
        'task.videoSegment.description': 'Mark in/out points on the timeline and label each segment.',
        'task.videoSegment.labels': 'Segment categories',
        'task.videoSegment.label': 'Segment category',
        'task.videoSegment.labelsHint': 'Separate categories with commas or new lines, e.g. Intro, Demo, Outro',
        'task.videoSegment.markIn': 'Mark in',
        'task.videoSegment.add': 'Mark out and add',
        'task.videoSegment.inAt': 'In at {time}',
        'task.videoSegment.needIn': 'Play to the segment start and mark an in point first.',
        'task.videoSegment.needOut': 'The out point must follow the in point. Continue playback, then add.',
        'task.videoSegment.timeline': 'Video timeline',
        'task.videoSegment.help': 'Click the timeline to seek; add after the playhead reaches the segment end.',
        'task.videoSegment.list': 'Segments',
        'task.videoSegment.empty': 'No segments yet. Play the video and mark in and out points.',
        'task.videoSegment.count': '{n} segments',
        'task.videoSegment.play': 'Seek to segment start',
        'task.videoSegment.required': 'Create at least one segment.',
      },
    },
    styles: `.hi-segment-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; } .hi-segment-toolbar .hi-video-time { margin-right: auto; }`,
    options: [
      {
        key: 'labels',
        kind: 'tags',
        labelKey: 'task.videoSegment.labels',
        hintKey: 'task.videoSegment.labelsHint',
        default: ['片段'],
      },
    ],
    initial: () => ({ segments: [] }),
    validate: (value) =>
      value && Array.isArray(value.segments) && value.segments.length > 0 ? null : 'task.videoSegment.required',
    summary: (value, options, t) =>
      t('task.videoSegment.count', { n: value && Array.isArray(value.segments) ? value.segments.length : 0 }),
    Editor,
  };
};
