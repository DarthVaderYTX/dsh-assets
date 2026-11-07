/* Video modality module: upload importer plus its task modules. */
const createVideoModality = ({ h, React, ui, taskFactories }) => {
  const tasks = taskFactories.map((factory) => factory({ h, React, ui }));

  const FileItemImporter = createFileItemImporter({
    h,
    React,
    ui,
    kind: 'video',
    accept: 'video/mp4,video/webm,video/ogg,video/quicktime,video/x-matroska',
    typesLabel: 'MP4, WebM, OGG, MOV, MKV',
    sizeLabel: '512 MB',
    maxBytes: 512 * 1024 * 1024,
    icon: 'video',
  });

  return {
    id: 'video',
    titleKey: 'modality.video.title',
    descriptionKey: 'modality.video.description',
    icon: 'video',
    messages: {
      zh: {
        'modality.video.title': '视频',
        'modality.video.description': '录像、直播切片、演示与任意动态影像。',
      },
      en: {
        'modality.video.title': 'Video',
        'modality.video.description': 'Recordings, stream clips, demos, and other moving images.',
      },
    },
    tasks,
    ItemImporter: FileItemImporter,
  };
};
