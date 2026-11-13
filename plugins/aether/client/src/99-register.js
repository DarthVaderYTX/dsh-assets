    // ---------------------------------------------------------- 注册

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'aether: locale');
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'aether',
              order: 25,
              label: () => t('panel'),
            },
            (props) => h(NavIcon, { ...props }),
          ),
        );
        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: 'aether',
            },
            (props) => h(AetherPanel, { ...props, t }),
          ),
        );
      },
    };
  },
});
