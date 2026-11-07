/* Image modality module: upload importer plus its task modules. */
const createImageModality = ({ h, React, ui, taskFactories }) => {
  const tasks = taskFactories.map((factory) => factory({ h, React, ui }));

  const FileItemImporter = createFileItemImporter({
    h,
    React,
    ui,
    kind: 'image',
    accept: 'image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp',
    typesLabel: 'PNG, JPG, WebP, GIF, AVIF, BMP',
    sizeLabel: '512 MB',
    maxBytes: 512 * 1024 * 1024,
    icon: 'image',
  });

  return {
    id: 'image',
    titleKey: 'modality.image.title',
    descriptionKey: 'modality.image.description',
    icon: 'image',
    messages: {
      zh: {
        'modality.image.title': '图片',
        'modality.image.description': '照片、截图、图表与任意静态图像。',
      },
      en: {
        'modality.image.title': 'Image',
        'modality.image.description': 'Photos, screenshots, diagrams, and other still images.',
      },
    },
    tasks,
    ItemImporter: FileItemImporter,
  };
};
