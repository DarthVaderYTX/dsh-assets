/*
 * Plugin bootstrap: compose the modality modules into a registry, register the
 * locale dictionaries, and claim the sidebar entry plus its main panel.
 */
const NS = 'human-intelligence';
const UI = createUI({ h, React });
const REGISTRY = createRegistry({
  h,
  React,
  ui: UI,
  modalityFactories: [
    {
      factory: createTextModality,
      tasks: [createTextClassificationTask, createTextEntityTask, createTextRatingTask, createTextRankingTask],
    },
    {
      factory: createImageModality,
      tasks: [createImageClassificationTask, createImageBboxTask],
    },
    {
      factory: createVideoModality,
      tasks: [createVideoClassificationTask, createVideoSegmentTask],
    },
  ],
});
const DICTIONARIES = mergeDictionaries(BASE_MESSAGES, REGISTRY.messages());
const TOTAL_CSS = [BASE_CSS].concat(REGISTRY.styles()).join('\n');

function HumanIntelligencePanel(props) {
  return h(WorkbenchPage, {
    ...props,
    registry: REGISTRY,
    ui: UI,
    css: TOTAL_CSS,
    fallbackTranslate: props.fallbackTranslate,
  });
}

function HumanIntelligenceNav(props) {
  return h(HumanIntelligenceIcon, { size: props.size || 20 });
}

return {
  inject: ['slots', 'locale'],
  apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, DICTIONARIES), 'human-intelligence: dictionaries');
    const t = ctx.locale.bind(NS);
    ctx.slots.inject('main', () =>
      ctx.slots.register(
        {
          name: 'main',
          key: 'human-intelligence',
          locale: NS,
          inject: () => ({
            fallbackTranslate: t,
            getLocaleId: () => ctx.locale.getLocale().active,
          }),
        },
        HumanIntelligencePanel,
      ),
    );
    ctx.slots.inject('sidebar.panellist', () =>
      ctx.slots.register(
        {
          name: 'sidebar.panellist',
          id: 'human-intelligence',
          order: 30,
          locale: NS,
          label: () => t('panel'),
        },
        HumanIntelligenceNav,
      ),
    );
  },
};
