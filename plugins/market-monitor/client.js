/*
 * Market Monitor client half.
 *
 * Claims the left-sidebar entry and the matching main panel, then renders the
 * watchlist, chart, analysis, alerts, and portfolio from the plugin host route.
 * All financial data comes from the Python engine through `/market-monitor/api`;
 * this module only presents and decorates it.
 */
window.__ModuleLoader__.load({
  id: 'market-monitor',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState } = React;

    const NS = 'market-monitor';
    const API = '/market-monitor/api';
    const RANGES = ['1D', '5D', '1M', '3M', '6M', '1Y'];
    const PROVIDERS = ['auto', 'yahoo'];
    const ALERT_KINDS = [
      'price_above',
      'price_below',
      'change_pct_above',
      'change_pct_below',
      'rsi_above',
      'rsi_below',
      'ma_cross',
      'volume_spike',
    ];
    const PRESETS = ['gainers', 'losers', 'momentum', 'oversold', 'overbought', 'volatile'];

    const EN = {
      panel: 'MarketMonitor',
      title: 'MarketMonitor',
      'status.live': 'Live',
      'status.simulated': 'Simulator',
      'status.degraded': 'Fallback',
      'status.offline': 'Engine offline',
      'status.retrying': 'The engine is not answering. Retrying…',
      'status.updated': 'Updated',
      'status.auto': 'Auto-refresh',
      'status.engine': 'Engine',
      'status.cadence': 'every',
      'status.seconds': 's',
      'status.stale': 'cached',
      'status.degradedHint': 'The live provider failed, so simulated or cached data is shown.',
      refresh: 'Refresh',
      'refresh.title': 'Refresh quotes and evaluate alerts',
      settings: 'Settings',
      'settings.title': 'Engine settings',
      'settings.provider': 'Quote provider',
      'settings.provider.auto': 'Auto',
      'settings.provider.auto.hint': 'Probe for live data, fall back to the simulator',
      'settings.provider.synthetic': 'Simulator',
      'settings.provider.synthetic.hint': 'Deterministic offline data for tests and demos',
      'settings.provider.yahoo': 'Yahoo Finance',
      'settings.provider.yahoo.hint': 'Live data; needs internet access',
      'settings.poll': 'Monitoring interval (seconds)',
      'settings.pollHint': 'Between 5 and 3600 seconds. The engine refreshes quotes and checks alerts on this cadence.',
      'settings.benchmark': 'Benchmark symbol',
      'settings.save': 'Save settings',
      'settings.saved': 'Settings saved.',
      'settings.engine': 'Engine details',
      'settings.dataDir': 'Data directory',
      'settings.python': 'Python',
      'settings.runtime': 'Snapshot',
      'settings.restart': 'Restart engine',
      'settings.restarted': 'The engine restarted.',
      'settings.cancel': 'Cancel',
      'settings.yahooNote': 'Yahoo Finance needs outbound network access. Without it the engine falls back and reports a degraded state.',
      watchlist: 'Watchlist',
      'watchlist.empty': 'No symbols yet',
      'watchlist.emptyHint': 'Add a symbol to start collecting quotes.',
      'watchlist.add': 'Add symbol',
      'watchlist.remove': 'Remove from watchlist',
      'watchlist.watch': 'Follow symbol',
      'watchlist.unwatch': 'Unfollow symbol',
      'watchlist.search': 'Search symbols or type one',
      'watchlist.searchHint': 'Try AAPL, NVDA, BTC-USD, ^GSPC, or EURUSD=X',
      'watchlist.noResults': 'No catalog match. Press Enter to follow the typed symbol.',
      'watchlist.addTyped': 'Follow',
      'watchlist.added': 'is now followed.',
      'watchlist.removed': 'was removed from the watchlist.',
      add: 'Add',
      cancel: 'Cancel',
      close: 'Close',
      chart: 'Price chart',
      'chart.range': 'Range',
      'chart.window': 'Window',
      'chart.points': 'points',
      'period.5m': '5 min/point',
      'period.30m': '30 min/point',
      'period.1d': '1 day/point',
      'chart.style': 'Chart style',
      'chart.area': 'Area',
      'chart.candles': 'Candles',
      'chart.sma20': 'SMA 20',
      'chart.sma50': 'SMA 50',
      'chart.bollinger': 'Bollinger',
      'chart.rsi': 'RSI',
      'chart.volume': 'Volume',
      'chart.loading': 'Loading chart…',
      'chart.empty': 'No bars for this range.',
      'chart.error': 'The chart could not load.',
      'chart.retry': 'Retry',
      'chart.open': 'Open',
      'chart.high': 'High',
      'chart.low': 'Low',
      'chart.close': 'Close',
      'chart.asOf': 'as of',
      analysis: 'Analysis',
      'analysis.empty': 'Select a symbol to see analysis.',
      'analysis.loading': 'Analyzing one year of daily bars…',
      'analysis.error': 'The analysis could not load.',
      'analysis.signal': 'Signal',
      'analysis.score': 'Score',
      'analysis.confidence': 'Confidence',
      'confidence.low': 'Low',
      'confidence.medium': 'Medium',
      'confidence.high': 'High',
      'analysis.indicators': 'Indicators',
      'analysis.statistics': 'Statistics (1 year)',
      'analysis.signals': 'Signals',
      'analysis.levels': 'Levels',
      'analysis.support': 'Support',
      'analysis.resistance': 'Resistance',
      'analysis.correlation': 'Correlation with',
      'analysis.window': 'days',
      'analysis.refresh': 'Recomputed at',
      'analysis.trend': 'Trend',
      'analysis.momentum': 'Momentum',
      'analysis.volatility': 'Volatility',
      'analysis.periodReturn': 'Period return',
      'analysis.vol': 'Annualized volatility',
      'analysis.drawdown': 'Max drawdown',
      'analysis.sharpe': 'Sharpe (rf 0)',
      'analysis.winRate': 'Win rate',
      'analysis.range52': '52-week range',
      'analysis.fromHigh': 'From 52-week high',
      'analysis.avgVolume': 'Average volume (20d)',
      'analysis.atr': 'ATR (14)',
      'analysis.macd': 'MACD',
      'analysis.bollinger': 'Bollinger',
      'analysis.sma': 'SMA 20 / 50 / 200',
      'analysis.ema': 'EMA 12 / 26',
      'analysis.rsi': 'RSI (14)',
      alerts: 'Alerts',
      'alerts.empty': 'No alert rules',
      'alerts.emptyHint': 'Create a rule to be notified about price, momentum, or volume conditions.',
      'alerts.create': 'New alert',
      'alerts.rule': 'Rule',
      'alerts.events': 'Recent events',
      'alerts.noEvents': 'No events yet',
      'alerts.noEventsHint': 'Triggered alerts appear here and in a toast.',
      'alerts.ackAll': 'Acknowledge all',
      'alerts.ack': 'Acknowledge',
      'alerts.acked': 'Alert acknowledged.',
      'alerts.ackedAll': 'All alert events acknowledged.',
      'alerts.enabled': 'Armed',
      'alerts.paused': 'Paused',
      'alerts.cooldown': 'Cooling down',
      'alerts.last': 'Last',
      'alerts.delete': 'Delete alert',
      'alerts.deleteConfirm': 'Delete this alert rule?',
      'alerts.newTitle': 'Create alert',
      'alerts.kind': 'Condition',
      'alerts.threshold': 'Threshold',
      'alerts.direction': 'Direction',
      'alerts.golden': 'Golden cross (fast above slow)',
      'alerts.death': 'Death cross (fast below slow)',
      'alerts.note': 'Note (optional)',
      'alerts.createAction': 'Create alert',
      'alerts.created': 'Alert created.',
      'alerts.deleted': 'Alert deleted.',
      'alert.price_above': 'Price above',
      'alert.price_below': 'Price below',
      'alert.change_pct_above': 'Day change above',
      'alert.change_pct_below': 'Day change below',
      'alert.rsi_above': 'RSI above',
      'alert.rsi_below': 'RSI below',
      'alert.ma_cross': 'Moving-average cross',
      'alert.volume_spike': 'Volume spike (multiple)',
      'alert.hint.price': 'Price level, for example 250',
      'alert.hint.pct': 'Percent, for example 2.5 or -2.5',
      'alert.hint.rsi': 'RSI level from 0 to 100',
      'alert.hint.volume': 'Multiple of the 20-day average, for example 2',
      portfolio: 'Portfolio',
      'portfolio.empty': 'No positions',
      'portfolio.emptyHint': 'Record holdings to track market value and P&L.',
      'portfolio.value': 'Market value',
      'portfolio.cost': 'Cost basis',
      'portfolio.pnl': 'Unrealized P&L',
      'portfolio.day': 'Today',
      'portfolio.qty': 'Quantity',
      'portfolio.avgCost': 'Average cost',
      'portfolio.price': 'Price',
      'portfolio.weight': 'Weight',
      'portfolio.add': 'Add or update position',
      'portfolio.symbol': 'Symbol',
      'portfolio.remove': 'Remove position',
      'portfolio.removeConfirm': 'Remove this position?',
      'portfolio.saved': 'Position saved.',
      'portfolio.removed': 'Position removed.',
      'portfolio.invalid': 'Enter a positive quantity and a valid average cost.',
      screener: 'Scan',
      'screener.preset': 'Preset',
      'screener.scope': 'Monitored universe',
      'screener.empty': 'No symbol matched this preset.',
      'screener.symbol': 'Symbol',
      'screener.price': 'Price',
      'screener.change': 'Change',
      'screener.rsi': 'RSI',
      'screener.trend': 'Trend',
      'screener.score': 'Score',
      'screener.loading': 'Scanning the monitored universe…',
      'preset.gainers': 'Gainers',
      'preset.losers': 'Losers',
      'preset.momentum': 'Momentum',
      'preset.oversold': 'Oversold',
      'preset.overbought': 'Overbought',
      'preset.volatile': 'Volatile',
      'data.tab': 'Data',
      'data.coverage': 'Coverage',
      'data.reference': 'Reference',
      'data.market': 'Market data',
      'data.news': 'News',
      'data.exchanges': 'Exchanges',
      'data.instruments': 'Instruments',
      'data.indices': 'Indices',
      'data.commodities': 'Commodity roots',
      'data.bars': 'Stored bars',
      'data.quotes': 'Latest quotes',
      'data.articles': 'Articles',
      'data.newsLinks': 'Entity links',
      'data.tracked': 'Tracked series',
      'data.trackedLive': 'live',
      'data.trackedEod': 'EOD',
      'data.refresh': 'Collect now',
      'data.requested': 'Collection cycle requested. New data appears as jobs finish.',
      'data.ingestFailed': 'Collection request failed.',
      'data.empty': 'No data collected yet',
      'data.emptyHint': 'Collection jobs start in the background with the plugin. Use Collect now to request a cycle.',
      'data.sources': 'Source health',
      'data.jobs': 'Job schedule',
      'data.lastRun': 'Last run',
      'data.nextDue': 'Next due',
      'data.due': 'Due',
      'data.budget': 'Today',
      'data.circuit': 'Cooling down',
      'data.relatedNews': 'Related news',
      'data.relatedEmpty': 'No linked articles yet',
      'data.noNews': 'No articles collected yet',
      'data.relatedHint': 'RSS collection runs every 15 minutes and links articles by ticker and company name.',
      'data.openArticle': 'Open article',
      'data.notFollowed': 'is not in the watchlist',
      'data.loading': 'Loading collection status…',
      'data.noSources': 'No sources registered.',
      'data.noJobs': 'No collection jobs are registered.',
      'data.explainer': 'Reference data, market series, and linked news are collected in the background.',
      'data.latestBar': 'Latest bar',
      'data.latestArticle': 'Latest article',
      'data.updated': 'Updated',
      'data.loadFailed': 'Collection status could not load',
      'data.retryFailed': 'Could not refresh collection status.',
      'data.state': 'State',
      'data.job': 'Job',
      'data.ok': 'ok',
      'data.collectHint': 'Requests due jobs only; the cycle runs in the background.',
      'data.storage': 'Local storage',
      'data.lastCycle': 'Last cycle',
      'data.disabled': 'Data collection is disabled in the plugin configuration.',
      'data.budgetSpent': 'Budget spent',
      'data.cooling': 'Cooling down',
      'data.blocked': 'Blocked',
      'data.errorState': 'Error',
      'data.relatedError': 'Related news could not load.',
      'data.sourceList': 'Remote sources and today’s request budget',
      'data.jobList': 'Collection jobs and schedule',
      'data.companyIndex': 'Company index',
      'data.indexRebuild': 'Rebuild',
      'data.indexActive': 'Active companies',
      'data.indexTotal': 'Tracked entries',
      'data.indexPending': 'Pending profiles',
      'data.indexDelisted': 'Delisted',
      'data.indexRevision': 'Revision',
      'data.indexLastRefresh': 'Last refresh',
      'data.indexMarkets': 'Markets',
      'data.indexChanges': 'Recent index changes',
      'data.indexNoChanges': 'No index changes recorded yet.',
      'data.indexEmpty': 'The company index has not been built yet. Rebuild it from the official listing files and the curated seed.',
      'data.change.added': 'added',
      'data.change.updated': 'updated',
      'data.change.removed': 'removed',
      'data.change.delisted': 'delisted',
      'data.change.restored': 'restored',
      'data.chinaMarket': 'China market',
      'data.chinaStocks': 'A-share stocks',
      'data.chinaFunds': 'ETFs / funds',
      'data.chinaCommodities': 'Commodity futures',
      'data.chinaTopStocks': 'Largest stocks',
      'data.chinaTopCommodities': 'Commodity front contracts',
      'data.chinaEmpty': 'The China indexes have not been built yet. Rebuild them from the public China market lists.',
      'boot.title': 'Market monitor',
      'boot.starting': 'Starting the market engine…',
      'boot.failed': 'The market engine could not start',
      'boot.failedHint': 'The panel needs the bundled Python engine. Details are below; check the plugin configuration or install Python 3.9+.',
      'boot.retry': 'Retry',
      'boot.restart': 'Restart engine',
      'boot.details': 'Diagnostics',
      'boot.python': 'Python interpreter',
      'boot.data': 'Data directory',
      'boot.host': 'Host status',
      'toast.synced': 'Quotes refreshed.',
      'stat.open': 'Open',
      'stat.high': 'High',
      'stat.low': 'Low',
      'stat.prevClose': 'Prev close',
      'stat.volume': 'Volume',
      'stat.market': 'Market',
      'stat.source': 'Source',
      'trend.uptrend': 'Uptrend',
      'trend.downtrend': 'Downtrend',
      'trend.sideways': 'Sideways',
      'signal.bullish': 'Bullish',
      'signal.neutral': 'Neutral',
      'signal.bearish': 'Bearish',
      'volatility.low': 'Low',
      'volatility.moderate': 'Moderate',
      'volatility.high': 'High',
      'momentum.positive': 'Positive',
      'momentum.negative': 'Negative',
      'momentum.flat': 'Flat',
      'state.open': 'Open',
      'state.closed': 'Closed',
      'state.simulated': 'Simulated',
      'state.pre': 'Pre-market',
      'state.post': 'After hours',
      'table.symbol': 'Symbol',
      'empty.noSelection': 'Select a symbol from the watchlist',
      'empty.noSelectionHint': 'Its chart, analysis, and alerts will appear here.',
      confirm: 'Confirm',
      loading: 'Loading…',
    };

    const ZH = {
      panel: 'MarketMonitor',
      title: 'MarketMonitor',
      'status.live': '实时',
      'status.simulated': '模拟器',
      'status.degraded': '已降级',
      'status.offline': '引擎离线',
      'status.retrying': '引擎未响应，正在重试…',
      'status.updated': '更新于',
      'status.auto': '自动刷新',
      'status.engine': '引擎',
      'status.cadence': '每',
      'status.seconds': '秒',
      'status.stale': '缓存',
      'status.degradedHint': '实时数据源失败，当前显示模拟或缓存数据。',
      refresh: '刷新',
      'refresh.title': '刷新行情并评估预警',
      settings: '设置',
      'settings.title': '引擎设置',
      'settings.provider': '行情数据源',
      'settings.provider.auto': '自动',
      'settings.provider.auto.hint': '探测实时数据，失败时回退到模拟器',
      'settings.provider.synthetic': '模拟器',
      'settings.provider.synthetic.hint': '确定性的离线数据，适合测试与演示',
      'settings.provider.yahoo': 'Yahoo Finance',
      'settings.provider.yahoo.hint': '实时数据，需要联网',
      'settings.poll': '监控间隔（秒）',
      'settings.pollHint': '范围 5 到 3600 秒。引擎按此频率刷新行情并检查预警。',
      'settings.benchmark': '基准指数',
      'settings.save': '保存设置',
      'settings.saved': '设置已保存。',
      'settings.engine': '引擎详情',
      'settings.dataDir': '数据目录',
      'settings.python': 'Python',
      'settings.runtime': '运行快照',
      'settings.restart': '重启引擎',
      'settings.restarted': '引擎已重启。',
      'settings.cancel': '取消',
      'settings.yahooNote': 'Yahoo Finance 需要访问外网。无法联网时引擎会回退并标记为降级状态。',
      watchlist: '自选列表',
      'watchlist.empty': '还没有自选标的',
      'watchlist.emptyHint': '添加一个标的即可开始收集行情。',
      'watchlist.add': '添加标的',
      'watchlist.remove': '从自选列表移除',
      'watchlist.watch': '关注标的',
      'watchlist.unwatch': '取消关注',
      'watchlist.search': '搜索或输入标的代码',
      'watchlist.searchHint': '例如 AAPL、NVDA、BTC-USD、^GSPC、EURUSD=X',
      'watchlist.noResults': '目录中没有匹配项。按回车直接关注输入的标的。',
      'watchlist.addTyped': '关注',
      'watchlist.added': '已加入自选。',
      'watchlist.removed': '已从自选列表移除。',
      add: '添加',
      cancel: '取消',
      close: '关闭',
      chart: '价格图',
      'chart.range': '周期',
      'chart.window': '时间窗口',
      'chart.points': '个点',
      'period.5m': '每点 5 分钟',
      'period.30m': '每点 30 分钟',
      'period.1d': '每点 1 天',
      'chart.style': '图表样式',
      'chart.area': '面积',
      'chart.candles': 'K 线',
      'chart.sma20': 'SMA 20',
      'chart.sma50': 'SMA 50',
      'chart.bollinger': '布林带',
      'chart.rsi': 'RSI',
      'chart.volume': '成交量',
      'chart.loading': '正在加载图表…',
      'chart.empty': '该周期没有数据。',
      'chart.error': '图表加载失败。',
      'chart.retry': '重试',
      'chart.open': '开盘',
      'chart.high': '最高',
      'chart.low': '最低',
      'chart.close': '收盘',
      'chart.asOf': '截至',
      analysis: '分析',
      'analysis.empty': '选择一个标的查看分析。',
      'analysis.loading': '正在分析一年日线数据…',
      'analysis.error': '分析加载失败。',
      'analysis.signal': '信号',
      'analysis.score': '评分',
      'analysis.confidence': '置信度',
      'confidence.low': '低',
      'confidence.medium': '中',
      'confidence.high': '高',
      'analysis.indicators': '指标',
      'analysis.statistics': '统计（一年）',
      'analysis.signals': '信号明细',
      'analysis.levels': '关键价位',
      'analysis.support': '支撑',
      'analysis.resistance': '阻力',
      'analysis.correlation': '相关性基准',
      'analysis.window': '天',
      'analysis.refresh': '重算于',
      'analysis.trend': '趋势',
      'analysis.momentum': '动量',
      'analysis.volatility': '波动',
      'analysis.periodReturn': '区间收益',
      'analysis.vol': '年化波动率',
      'analysis.drawdown': '最大回撤',
      'analysis.sharpe': '夏普比率（无风险 0）',
      'analysis.winRate': '胜率',
      'analysis.range52': '52 周区间',
      'analysis.fromHigh': '距 52 周高点',
      'analysis.avgVolume': '20 日均量',
      'analysis.atr': 'ATR (14)',
      'analysis.macd': 'MACD',
      'analysis.bollinger': '布林带',
      'analysis.sma': 'SMA 20 / 50 / 200',
      'analysis.ema': 'EMA 12 / 26',
      'analysis.rsi': 'RSI (14)',
      alerts: '预警',
      'alerts.empty': '还没有预警规则',
      'alerts.emptyHint': '创建规则，在价格、动量或成交量满足条件时收到提醒。',
      'alerts.create': '新建预警',
      'alerts.rule': '规则',
      'alerts.events': '最近事件',
      'alerts.noEvents': '暂无事件',
      'alerts.noEventsHint': '触发的预警会显示在这里，并弹出提示。',
      'alerts.ackAll': '全部确认',
      'alerts.ack': '确认',
      'alerts.acked': '预警已确认。',
      'alerts.ackedAll': '已确认全部预警事件。',
      'alerts.enabled': '已启用',
      'alerts.paused': '已暂停',
      'alerts.cooldown': '冷却中',
      'alerts.last': '最近',
      'alerts.delete': '删除预警',
      'alerts.deleteConfirm': '删除这条预警规则？',
      'alerts.newTitle': '创建预警',
      'alerts.kind': '条件',
      'alerts.threshold': '阈值',
      'alerts.direction': '方向',
      'alerts.golden': '金叉（快线高于慢线）',
      'alerts.death': '死叉（快线低于慢线）',
      'alerts.note': '备注（可选）',
      'alerts.createAction': '创建预警',
      'alerts.created': '预警已创建。',
      'alerts.deleted': '预警已删除。',
      'alert.price_above': '价格高于',
      'alert.price_below': '价格低于',
      'alert.change_pct_above': '日涨幅高于',
      'alert.change_pct_below': '日跌幅低于',
      'alert.rsi_above': 'RSI 高于',
      'alert.rsi_below': 'RSI 低于',
      'alert.ma_cross': '均线交叉',
      'alert.volume_spike': '放量（倍数）',
      'alert.hint.price': '价格，例如 250',
      'alert.hint.pct': '百分比，例如 2.5 或 -2.5',
      'alert.hint.rsi': '0 到 100 的 RSI 数值',
      'alert.hint.volume': '20 日均量的倍数，例如 2',
      portfolio: '持仓',
      'portfolio.empty': '还没有持仓',
      'portfolio.emptyHint': '记录持仓即可跟踪市值与盈亏。',
      'portfolio.value': '市值',
      'portfolio.cost': '成本',
      'portfolio.pnl': '浮动盈亏',
      'portfolio.day': '今日',
      'portfolio.qty': '数量',
      'portfolio.avgCost': '均价',
      'portfolio.price': '现价',
      'portfolio.weight': '占比',
      'portfolio.add': '添加或更新持仓',
      'portfolio.symbol': '标的',
      'portfolio.remove': '移除持仓',
      'portfolio.removeConfirm': '移除这条持仓？',
      'portfolio.saved': '持仓已保存。',
      'portfolio.removed': '持仓已移除。',
      'portfolio.invalid': '请输入正数数量与有效均价。',
      screener: '扫描',
      'screener.preset': '预设',
      'screener.scope': '监控范围',
      'screener.empty': '没有标的符合该预设。',
      'screener.symbol': '标的',
      'screener.price': '价格',
      'screener.change': '涨跌',
      'screener.rsi': 'RSI',
      'screener.trend': '趋势',
      'screener.score': '评分',
      'screener.loading': '正在扫描监控范围…',
      'preset.gainers': '涨幅榜',
      'preset.losers': '跌幅榜',
      'preset.momentum': '动量',
      'preset.oversold': '超卖',
      'preset.overbought': '超买',
      'preset.volatile': '高波动',
      'data.tab': '数据',
      'data.coverage': '覆盖情况',
      'data.reference': '参考数据',
      'data.market': '行情数据',
      'data.news': '新闻',
      'data.exchanges': '交易所',
      'data.instruments': '上市标的',
      'data.indices': '指数',
      'data.commodities': '商品品种',
      'data.bars': '已存 K 线',
      'data.quotes': '最新报价',
      'data.articles': '文章',
      'data.newsLinks': '实体关联',
      'data.tracked': '跟踪序列',
      'data.trackedLive': '实时',
      'data.trackedEod': '日线',
      'data.refresh': '立即采集',
      'data.requested': '已请求采集周期，任务完成后会显示新数据。',
      'data.ingestFailed': '采集请求失败。',
      'data.empty': '还没有采集到数据',
      'data.emptyHint': '插件启动后采集任务会在后台运行；也可以点击“立即采集”请求一个周期。',
      'data.sources': '数据源健康',
      'data.jobs': '任务计划',
      'data.lastRun': '上次运行',
      'data.nextDue': '下次到期',
      'data.due': '待运行',
      'data.budget': '今日',
      'data.circuit': '冷却中',
      'data.relatedNews': '相关新闻',
      'data.relatedEmpty': '暂时没有关联文章',
      'data.noNews': '还没有采集到新闻文章',
      'data.relatedHint': 'RSS 采集每 15 分钟运行一次，并按代码与公司名关联文章。',
      'data.openArticle': '打开文章',
      'data.notFollowed': '不在自选列表中',
      'data.loading': '正在加载采集状态…',
      'data.noSources': '还没有注册数据源。',
      'data.noJobs': '还没有注册采集任务。',
      'data.explainer': '参考数据、行情序列与关联新闻在后台采集。',
      'data.latestBar': '最新 K 线',
      'data.latestArticle': '最新文章',
      'data.updated': '更新于',
      'data.loadFailed': '无法加载采集状态',
      'data.retryFailed': '刷新采集状态失败。',
      'data.state': '状态',
      'data.job': '任务',
      'data.ok': '正常',
      'data.collectHint': '只触发到期任务；采集周期在后台运行。',
      'data.storage': '本地存储',
      'data.lastCycle': '上次周期',
      'data.disabled': '插件配置已禁用数据采集。',
      'data.budgetSpent': '预算用尽',
      'data.cooling': '冷却中',
      'data.blocked': '已阻止',
      'data.errorState': '错误',
      'data.relatedError': '相关新闻加载失败。',
      'data.sourceList': '远程数据源与今日请求预算',
      'data.jobList': '采集任务与计划',
      'data.companyIndex': '公司索引',
      'data.indexRebuild': '重建索引',
      'data.indexActive': '活跃公司',
      'data.indexTotal': '索引条目',
      'data.indexPending': '待补全资料',
      'data.indexDelisted': '已退市',
      'data.indexRevision': '版本',
      'data.indexLastRefresh': '上次更新',
      'data.indexMarkets': '市场',
      'data.indexChanges': '最近索引变化',
      'data.indexNoChanges': '还没有记录索引变化。',
      'data.indexEmpty': '公司索引尚未建立，可从官方上市文件与精选种子重建。',
      'data.change.added': '新增',
      'data.change.updated': '更新',
      'data.change.removed': '移除',
      'data.change.delisted': '退市',
      'data.change.restored': '恢复',
      'data.chinaMarket': '中国市场',
      'data.chinaStocks': 'A 股股票',
      'data.chinaFunds': 'ETF / 基金',
      'data.chinaCommodities': '商品期货',
      'data.chinaTopStocks': '市值前列股票',
      'data.chinaTopCommodities': '商品主力连续',
      'data.chinaEmpty': '中国指数尚未建立，可从中国市场公开列表重建。',
      'boot.title': '市场监控',
      'boot.starting': '正在启动行情引擎…',
      'boot.failed': '行情引擎启动失败',
      'boot.failedHint': '面板依赖内置的 Python 引擎。下方是诊断信息；请检查插件配置或安装 Python 3.9+。',
      'boot.retry': '重试',
      'boot.restart': '重启引擎',
      'boot.details': '诊断信息',
      'boot.python': 'Python 解释器',
      'boot.data': '数据目录',
      'boot.host': '宿主状态',
      'toast.synced': '行情已刷新。',
      'stat.open': '开盘',
      'stat.high': '最高',
      'stat.low': '最低',
      'stat.prevClose': '昨收',
      'stat.volume': '成交量',
      'stat.market': '市场',
      'stat.source': '数据源',
      'trend.uptrend': '上升趋势',
      'trend.downtrend': '下降趋势',
      'trend.sideways': '横盘',
      'signal.bullish': '看涨',
      'signal.neutral': '中性',
      'signal.bearish': '看跌',
      'volatility.low': '低',
      'volatility.moderate': '中等',
      'volatility.high': '高',
      'momentum.positive': '正向',
      'momentum.negative': '负向',
      'momentum.flat': '持平',
      'state.open': '交易中',
      'state.closed': '已收盘',
      'state.simulated': '模拟',
      'state.pre': '盘前',
      'state.post': '盘后',
      'table.symbol': '标的',
      'empty.noSelection': '从左侧自选列表选择标的',
      'empty.noSelectionHint': '图表、分析与预警会显示在这里。',
      confirm: '确认',
      loading: '加载中…',
    };

    const CSS = `
.mm-root {
  --mm-radius: 12px;
  --mm-gap: 14px;
  --mm-rail: 268px;
  --mm-side: 352px;
  width: 100%;
  height: 100%;
  min-height: 520px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
}
.mm-root *, .mm-root *::before, .mm-root *::after { box-sizing: border-box; }
.mm-root button, .mm-root input, .mm-root select, .mm-root textarea { font-family: inherit; line-height: inherit; color: inherit; }
.mm-root button { cursor: pointer; }
.mm-root h2, .mm-root h3, .mm-root h4, .mm-root p { margin: 0; }
.mm-root svg { display: block; }
.mm-topbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.mm-brand { display: flex; align-items: center; gap: 9px; min-width: 0; }
.mm-brand-mark { color: var(--dsw-alias-brand-primary); flex: 0 0 auto; }
.mm-brand-copy { display: flex; flex-direction: column; min-width: 0; }
.mm-brand-copy strong { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; }
.mm-brand-copy span { font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mm-topbar-mid { display: flex; align-items: center; gap: 10px; margin-left: 6px; min-width: 0; flex-wrap: wrap; }
.mm-topbar-actions { margin-left: auto; display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
.mm-chip {
  display: inline-flex; align-items: center; gap: 6px;
  height: 24px; padding: 0 9px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: nowrap;
}
.mm-chip.is-ok { color: var(--dsw-alias-state-success-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 34%, var(--dsw-alias-border-l1)); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 9%, var(--dsw-alias-bg-layer-1)); }
.mm-chip.is-warn { color: var(--dsw-alias-state-warn-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 34%, var(--dsw-alias-border-l1)); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 9%, var(--dsw-alias-bg-layer-1)); }
.mm-chip.is-error { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 34%, var(--dsw-alias-border-l1)); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, var(--dsw-alias-bg-layer-1)); }
.mm-banner {
  flex: 0 0 auto; display: flex; align-items: center; gap: 8px;
  padding: 6px 16px; font-size: 11.5px;
  color: var(--dsw-alias-state-warn-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, var(--dsw-alias-bg-layer-1));
  border-bottom: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 26%, var(--dsw-alias-border-l1));
}
.mm-banner-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mm-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex: 0 0 auto; }
.mm-dot.is-ok { background: var(--dsw-alias-state-success-primary); }
.mm-dot.is-warn { background: var(--dsw-alias-state-warn-primary); }
.mm-dot.is-error { background: var(--dsw-alias-state-error-primary); }
.mm-dot.is-idle { background: var(--dsw-alias-state-idle-primary); }
.mm-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 28px; padding: 0 10px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-size: 12px; white-space: nowrap;
  transition: background 120ms ease, border-color 120ms ease;
}
.mm-btn:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, var(--dsw-alias-bg-layer-2)); }
.mm-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.mm-btn:disabled { opacity: .55; cursor: default; }
.mm-btn.is-primary { color: var(--dsw-alias-brand-primary); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 42%, var(--dsw-alias-border-l1)); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, var(--dsw-alias-bg-layer-1)); }
.mm-btn.is-ghost { border-color: transparent; background: transparent; color: var(--dsw-alias-label-secondary); }
.mm-btn.is-ghost:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); color: var(--dsw-alias-label-primary); }
.mm-btn.is-icon { width: 28px; padding: 0; }
.mm-btn.is-danger { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, var(--dsw-alias-border-l1)); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, var(--dsw-alias-bg-layer-1)); }
.mm-body {
  flex: 1 1 auto; min-height: 0;
  display: grid; grid-template-columns: var(--mm-rail) minmax(0, 1fr) var(--mm-side);
  grid-template-areas: "watch detail side";
}
.mm-col { min-width: 0; min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--dsw-alias-border-l2) transparent; }
.mm-col::-webkit-scrollbar { width: 8px; height: 8px; }
.mm-col::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l2); border-radius: 8px; }
.mm-watch { grid-area: watch; border-right: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); display: flex; flex-direction: column; }
.mm-detail { grid-area: detail; padding: 16px 18px 22px; display: flex; flex-direction: column; gap: var(--mm-gap); }
.mm-side { grid-area: side; border-left: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); display: flex; flex-direction: column; }
.mm-watch-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px 8px; }
.mm-watch-head h3 { font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.mm-watch-head .mm-count { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.mm-watch-head .mm-btn { margin-left: auto; }
.mm-watch-list { flex: 1 1 auto; overflow-y: auto; padding: 2px 8px 12px; scrollbar-width: thin; }
.mm-watch-row {
  display: flex; align-items: center; gap: 4px; width: 100%;
  padding: 6px 6px 6px 8px; border-radius: 9px; border: 1px solid transparent;
  background: transparent; text-align: left;
}
.mm-watch-row:hover { background: var(--dsw-alias-bg-layer-2); }
.mm-watch-row.is-active { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 11%, var(--dsw-alias-bg-layer-1)); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 26%, var(--dsw-alias-border-l1)); }
.mm-watch-select { display: flex; align-items: center; gap: 9px; flex: 1 1 auto; min-width: 0; padding: 2px; border: 0; background: transparent; text-align: left; color: inherit; border-radius: 6px; }
.mm-watch-select:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.mm-watch-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.mm-watch-symbol { font-weight: 600; font-size: 13px; letter-spacing: .01em; }
.mm-watch-name { font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mm-watch-quote { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; flex: 0 0 auto; }
.mm-watch-price { font-size: 12.5px; font-variant-numeric: tabular-nums; }
.mm-watch-change { font-size: 11px; font-variant-numeric: tabular-nums; }
.mm-watch-row .mm-spark { opacity: .85; }
.mm-up { color: var(--dsw-alias-state-success-primary); }
.mm-down { color: var(--dsw-alias-state-error-primary); }
.mm-flat { color: var(--dsw-alias-label-secondary); }
.mm-inst-head { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.mm-inst-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.mm-inst-title h2 { font-size: 22px; line-height: 1.15; letter-spacing: -0.02em; }
.mm-inst-name { font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 360px; }
.mm-inst-price { display: flex; align-items: baseline; gap: 8px; margin-left: auto; }
.mm-inst-price strong { font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.mm-inst-delta { font-size: 13px; font-variant-numeric: tabular-nums; }
.mm-inst-actions { display: flex; gap: 6px; align-items: center; }
.mm-quote-meta { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 9px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.mm-quote-meta div { display: flex; gap: 5px; align-items: baseline; font-size: 11.5px; }
.mm-quote-meta dt { color: var(--dsw-alias-label-secondary); }
.mm-quote-meta dd { margin: 0; font-variant-numeric: tabular-nums; }
.mm-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--mm-radius); background: var(--dsw-alias-bg-layer-1); }
.mm-card-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); flex-wrap: wrap; }
.mm-card-head h3 { font-size: 12px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.mm-card-head .mm-spacer { margin-left: auto; }
.mm-card-body { padding: 12px; }
.mm-segmented { display: inline-flex; padding: 2px; gap: 2px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); }
.mm-seg { height: 22px; padding: 0 8px; border-radius: 6px; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 11px; white-space: nowrap; }
.mm-seg:hover { color: var(--dsw-alias-label-primary); }
.mm-seg.is-active { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); box-shadow: 0 1px 2px rgba(0,0,0,.12); }
.mm-seg:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.mm-chips { display: inline-flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.mm-toggle-chip { height: 24px; padding: 0 8px; border-radius: 999px; font-size: 11px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
.mm-toggle-chip.is-on { color: var(--dsw-alias-brand-primary); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 38%, var(--dsw-alias-border-l1)); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, var(--dsw-alias-bg-layer-1)); }
.mm-chart-wrap { position: relative; width: 100%; }
.mm-chart svg { overflow: visible; }
.mm-grid-line { stroke: var(--dsw-alias-border-l1); stroke-width: 1; }
.mm-axis-label { fill: var(--dsw-alias-label-secondary); font-size: 9.5px; font-variant-numeric: tabular-nums; }
.mm-price-line { fill: none; stroke: var(--dsw-alias-brand-primary); stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }
.mm-price-area { fill: url(#mm-area-fill); }
.mm-sma-a { fill: none; stroke: var(--dsw-alias-state-warn-primary); stroke-width: 1.1; stroke-dasharray: 4 3; opacity: .95; }
.mm-sma-b { fill: none; stroke: var(--dsw-alias-label-secondary); stroke-width: 1.1; stroke-dasharray: 5 3; opacity: .85; }
.mm-boll-area { fill: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent); stroke: none; }
.mm-boll-line { fill: none; stroke: var(--dsw-alias-label-secondary); stroke-width: .8; stroke-dasharray: 2 3; opacity: .55; }
.mm-candle-up { fill: var(--dsw-alias-state-success-primary); stroke: var(--dsw-alias-state-success-primary); }
.mm-candle-down { fill: var(--dsw-alias-state-error-primary); stroke: var(--dsw-alias-state-error-primary); }
.mm-vol-up { fill: color-mix(in srgb, var(--dsw-alias-state-success-primary) 42%, transparent); }
.mm-vol-down { fill: color-mix(in srgb, var(--dsw-alias-state-error-primary) 42%, transparent); }
.mm-crosshair { stroke: var(--dsw-alias-label-secondary); stroke-width: .8; stroke-dasharray: 2 2; opacity: .7; }
.mm-rsi-line { fill: none; stroke: var(--dsw-alias-brand-primary); stroke-width: 1.2; }
.mm-rsi-band { stroke: var(--dsw-alias-border-l2); stroke-width: .8; stroke-dasharray: 3 3; }
.mm-chart-tip {
  position: absolute; z-index: 3; min-width: 128px; max-width: 210px;
  padding: 7px 9px; border-radius: 8px; font-size: 11px;
  background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l2);
  box-shadow: 0 6px 18px rgba(0,0,0,.18); pointer-events: none;
}
.mm-chart-tip b { font-weight: 600; }
.mm-chart-tip div { display: flex; justify-content: space-between; gap: 10px; font-variant-numeric: tabular-nums; }
.mm-chart-tip .mm-tip-date { color: var(--dsw-alias-label-secondary); margin-bottom: 3px; }
.mm-legend { display: flex; flex-wrap: wrap; gap: 10px; padding: 6px 12px 2px; font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.mm-legend span { display: inline-flex; align-items: center; gap: 5px; }
.mm-legend i { width: 14px; height: 0; border-top-width: 2px; border-top-style: solid; display: inline-block; }
.mm-dash-brand { border-color: var(--dsw-alias-brand-primary); }
.mm-dash-warn { border-color: var(--dsw-alias-state-warn-primary); }
.mm-dash-idle { border-color: var(--dsw-alias-label-secondary); }
.mm-chart-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 220px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.mm-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)); gap: 8px; }
.mm-stat { padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-layer-1); display: flex; flex-direction: column; gap: 2px; }
.mm-stat span { font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.mm-stat strong { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
.mm-side-tabs { display: flex; gap: 3px; padding: 10px 8px 0; overflow-x: auto; scrollbar-width: none; }
.mm-side-tabs::-webkit-scrollbar { display: none; }
.mm-tab { flex: 1 0 auto; min-width: 46px; height: 30px; padding: 0 6px; border-radius: 8px 8px 0 0; border: 1px solid transparent; border-bottom: 0; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 11px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; white-space: nowrap; }
.mm-tab svg { flex: 0 0 auto; }
.mm-tab:hover { color: var(--dsw-alias-label-primary); }
.mm-tab.is-active { background: var(--dsw-alias-bg-base); border-color: var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); font-weight: 600; }
.mm-tab-badge { min-width: 17px; height: 17px; padding: 0 4px; border-radius: 999px; font-size: 10px; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 18%, transparent); color: var(--dsw-alias-state-error-primary); }
.mm-side-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; scrollbar-width: thin; display: flex; flex-direction: column; gap: 12px; }
.mm-section-title { display: flex; align-items: center; gap: 8px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.mm-section-title .mm-spacer { margin-left: auto; }
.mm-signal-badge { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 9px; border-radius: 999px; font-size: 11px; font-weight: 600; border: 1px solid currentColor; }
.mm-signal-badge.is-bullish { color: var(--dsw-alias-state-success-primary); }
.mm-signal-badge.is-bearish { color: var(--dsw-alias-state-error-primary); }
.mm-signal-badge.is-neutral { color: var(--dsw-alias-state-warn-primary); }
.mm-scorebar { position: relative; height: 6px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; flex: 1 1 auto; }
.mm-scorebar i { position: absolute; top: 0; bottom: 0; left: 50%; background: var(--dsw-alias-brand-primary); border-radius: 999px; }
.mm-headline { font-size: 12.5px; line-height: 1.5; }
.mm-narrative { font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary); }
.mm-kv { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 5px 12px; font-size: 11.5px; }
.mm-kv dt { color: var(--dsw-alias-label-secondary); }
.mm-kv dd { margin: 0; font-variant-numeric: tabular-nums; text-align: right; }
.mm-signals { display: flex; flex-direction: column; gap: 7px; }
.mm-signal { display: flex; gap: 8px; align-items: flex-start; }
.mm-signal .mm-dot { margin-top: 5px; }
.mm-signal strong { font-size: 11.5px; font-weight: 600; display: block; }
.mm-signal span { font-size: 10.5px; color: var(--dsw-alias-label-secondary); display: block; }
.mm-levels { display: flex; flex-direction: column; gap: 6px; font-size: 11.5px; }
.mm-levels div { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.mm-levels em { font-style: normal; color: var(--dsw-alias-label-secondary); min-width: 68px; }
.mm-level-chip { font-variant-numeric: tabular-nums; padding: 1px 7px; border-radius: 6px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); font-size: 11px; }
.mm-alert-rule { display: flex; gap: 8px; align-items: flex-start; padding: 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-base); }
.mm-alert-rule-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.mm-alert-rule-main strong { font-size: 12px; font-weight: 600; }
.mm-alert-rule-main span { font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.mm-alert-rule-actions { display: flex; align-items: center; gap: 2px; }
.mm-switch { position: relative; width: 30px; height: 17px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); padding: 0; transition: background 120ms ease; }
.mm-switch[aria-checked="true"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 70%, var(--dsw-alias-bg-layer-2)); border-color: var(--dsw-alias-brand-primary); }
.mm-switch i { position: absolute; top: 2px; left: 2px; width: 11px; height: 11px; border-radius: 50%; background: var(--dsw-alias-bg-base); transition: transform 120ms ease; }
.mm-switch[aria-checked="true"] i { transform: translateX(13px); }
.mm-switch:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.mm-event { display: flex; gap: 8px; padding: 7px 8px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); align-items: flex-start; }
.mm-event.is-new { border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 34%, var(--dsw-alias-border-l1)); }
.mm-event-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.mm-event-main span { font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.mm-event-main strong { font-size: 11.5px; font-weight: 500; line-height: 1.35; }
.mm-severity { width: 6px; height: 6px; border-radius: 50%; margin-top: 5px; flex: 0 0 auto; }
.mm-severity.is-critical { background: var(--dsw-alias-state-error-primary); }
.mm-severity.is-warning { background: var(--dsw-alias-state-warn-primary); }
.mm-severity.is-info { background: var(--dsw-alias-state-idle-primary); }
.mm-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 26px 14px; text-align: center; color: var(--dsw-alias-label-secondary); }
.mm-empty strong { font-size: 12.5px; color: var(--dsw-alias-label-primary); font-weight: 600; }
.mm-empty span { font-size: 11.5px; max-width: 240px; }
.mm-portfolio-totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)); gap: 8px; }
.mm-portfolio-totals .mm-stat strong { font-size: 12.5px; }
.mm-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.mm-table th { text-align: right; font-weight: 500; color: var(--dsw-alias-label-secondary); font-size: 10.5px; padding: 5px 6px; border-bottom: 1px solid var(--dsw-alias-border-l1); white-space: nowrap; }
.mm-table td { text-align: right; padding: 6px; border-bottom: 1px solid var(--dsw-alias-border-l1); font-variant-numeric: tabular-nums; white-space: nowrap; }
.mm-table th:first-child, .mm-table td:first-child { text-align: left; }
.mm-table tbody tr:hover td { background: var(--dsw-alias-bg-layer-2); }
.mm-table .mm-row-tools { display: flex; justify-content: flex-end; }
.mm-table-scroll { overflow-x: auto; scrollbar-width: thin; scrollbar-color: var(--dsw-alias-border-l2) transparent; }
.mm-table-scroll::-webkit-scrollbar { height: 7px; }
.mm-table-scroll::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l2); border-radius: 8px; }
.mm-table-wide { min-width: 520px; }
.mm-table-scan { min-width: 392px; }
.mm-data-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.mm-data-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-base); padding: 9px 10px; display: flex; flex-direction: column; gap: 6px; }
.mm-data-card h4 { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.mm-data-card dl { margin: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 10px; font-size: 11px; }
.mm-data-card dt { color: var(--dsw-alias-label-secondary); }
.mm-data-card dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
.mm-news-item { display: flex; flex-direction: column; gap: 4px; padding: 8px 9px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-base); }
.mm-news-item + .mm-news-item { margin-top: 6px; }
.mm-news-meta { display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.mm-news-meta .mm-spacer { margin-left: auto; }
.mm-news-item strong { font-size: 12px; font-weight: 600; line-height: 1.35; }
.mm-news-summary { margin: 0; font-size: 10.5px; line-height: 1.45; color: var(--dsw-alias-label-secondary); }
.mm-news-link { border: 0; background: none; padding: 0; font-size: 10.5px; color: var(--dsw-alias-label-secondary); text-decoration: underline; }
.mm-news-link:hover { color: var(--dsw-alias-brand-primary); }
.mm-entity-row { display: flex; flex-wrap: wrap; gap: 4px; }
.mm-entity-chip { font-size: 10.5px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
.mm-entity-chip:hover { color: var(--dsw-alias-brand-primary); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 38%, var(--dsw-alias-border-l1)); }
.mm-entity-chip.is-static { cursor: default; }
.mm-entity-chip.is-static:hover { color: var(--dsw-alias-label-secondary); border-color: var(--dsw-alias-border-l1); }
.mm-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.mm-data-updated { display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.mm-data-updated .mm-spacer { margin-left: auto; }
.mm-data-scroll { max-height: 210px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--dsw-alias-border-l2) transparent; }
.mm-data-scroll::-webkit-scrollbar { width: 7px; }
.mm-data-scroll::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l2); border-radius: 8px; }
.mm-index-change { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 10.5px; min-width: 0; }
.mm-index-change-type { flex: 0 0 auto; padding: 1px 5px; border-radius: 5px; font-size: 9.5px; font-weight: 600; color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-secondary) 12%, transparent); }
.mm-index-change-type.is-up { color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent); }
.mm-index-change-type.is-down { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent); }
.mm-index-change-entity { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mm-data-error { display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 8px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 32%, var(--dsw-alias-border-l1)); color: var(--dsw-alias-state-error-primary); font-size: 11.5px; }
.mm-data-error span { flex: 1 1 auto; min-width: 0; }
.mm-form { display: flex; flex-direction: column; gap: 10px; }
.mm-form-row { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
.mm-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1 1 120px; }
.mm-field > span { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.mm-input, .mm-select {
  height: 30px; padding: 0 9px; border-radius: 8px; min-width: 0;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary); font-size: 12px;
}
.mm-input:focus, .mm-select:focus { outline: none; border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent); }
.mm-hint { font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.mm-error-text { font-size: 11.5px; color: var(--dsw-alias-state-error-primary); }
.mm-statusbar { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 6px 16px; border-top: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); font-size: 10.5px; color: var(--dsw-alias-label-secondary); flex-wrap: wrap; }
.mm-statusbar .mm-spacer { margin-left: auto; }
.mm-statusbar .mm-inline { display: inline-flex; align-items: center; gap: 5px; }
.mm-modal-backdrop { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(8, 12, 20, .42); backdrop-filter: blur(1px); }
.mm-modal { width: min(560px, 100%); max-height: min(84vh, 760px); display: flex; flex-direction: column; border-radius: 14px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-overlay); box-shadow: 0 18px 48px rgba(0,0,0,.3); overflow: hidden; }
.mm-modal.is-wide { width: min(680px, 100%); }
.mm-modal-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.mm-modal-head h3 { font-size: 14px; font-weight: 600; }
.mm-modal-head .mm-btn { margin-left: auto; }
.mm-modal-body { padding: 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.mm-modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.mm-radio-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.mm-radio-card { display: flex; gap: 8px; padding: 9px 10px; border-radius: 9px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); text-align: left; align-items: flex-start; }
.mm-radio-card.is-active { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, var(--dsw-alias-bg-base)); }
.mm-radio-card i { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--dsw-alias-border-l2); margin-top: 2px; flex: 0 0 auto; }
.mm-radio-card.is-active i { border: 4px solid var(--dsw-alias-brand-primary); }
.mm-radio-card div { display: flex; flex-direction: column; gap: 1px; }
.mm-radio-card strong { font-size: 12px; font-weight: 600; }
.mm-radio-card span { font-size: 10.5px; color: var(--dsw-alias-label-secondary); }
.mm-search-results { display: flex; flex-direction: column; gap: 3px; max-height: 260px; overflow-y: auto; }
.mm-search-row { display: flex; align-items: center; gap: 9px; width: 100%; padding: 7px 9px; border-radius: 8px; border: 1px solid transparent; background: transparent; text-align: left; }
.mm-search-row:hover { background: var(--dsw-alias-bg-layer-2); }
.mm-search-row strong { font-size: 12px; min-width: 76px; }
.mm-search-row span { font-size: 11px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mm-search-row em { margin-left: auto; font-style: normal; font-size: 10px; color: var(--dsw-alias-label-secondary); }
.mm-toasts { position: fixed; z-index: 80; right: 18px; bottom: 18px; display: flex; flex-direction: column; gap: 8px; max-width: 340px; }
.mm-toast { display: flex; gap: 8px; align-items: flex-start; padding: 9px 11px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-overlay); box-shadow: 0 8px 24px rgba(0,0,0,.2); font-size: 12px; animation: mm-toast-in 160ms ease; }
.mm-toast.is-error { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 38%, var(--dsw-alias-border-l2)); }
.mm-toast.is-info { border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, var(--dsw-alias-border-l2)); }
@keyframes mm-toast-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
.mm-spin { animation: mm-spin 900ms linear infinite; }
@keyframes mm-spin { to { transform: rotate(360deg); } }
.mm-boot { flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 28px; text-align: center; }
.mm-boot h2 { font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
.mm-boot p { font-size: 12px; color: var(--dsw-alias-label-secondary); max-width: 480px; }
.mm-boot .mm-boot-actions { display: flex; gap: 8px; }
.mm-diag { width: min(640px, 100%); text-align: left; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); padding: 10px 12px; font-size: 11px; }
.mm-diag summary { cursor: pointer; color: var(--dsw-alias-label-secondary); }
.mm-diag pre { margin: 8px 0 0; padding: 8px; max-height: 180px; overflow: auto; border-radius: 7px; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--dsw-alias-label-secondary); }
.mm-skeleton { border-radius: 8px; background: linear-gradient(90deg, var(--dsw-alias-bg-layer-2) 25%, var(--dsw-alias-bg-layer-1) 45%, var(--dsw-alias-bg-layer-2) 65%); background-size: 300% 100%; animation: mm-shimmer 1.4s ease infinite; }
@keyframes mm-shimmer { 0% { background-position: 120% 0; } 100% { background-position: -40% 0; } }
.mm-loading-row { display: flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-secondary); font-size: 12px; padding: 8px 0; }
@media (max-width: 1320px) {
  .mm-body { grid-template-columns: 240px minmax(0, 1fr) 310px; }
  .mm-inst-name { max-width: 260px; }
  .mm-tab svg { display: none; }
  .mm-tab { padding: 0 5px; }
}
@media (max-width: 1120px) {
  .mm-body { grid-template-columns: 232px minmax(0, 1fr); grid-template-areas: "watch detail" "side side"; grid-template-rows: minmax(0, 1fr) auto; }
  .mm-side { border-left: 0; border-top: 1px solid var(--dsw-alias-border-l1); max-height: 46vh; }
  .mm-side-body { padding-bottom: 18px; }
}
@media (max-width: 860px) {
  .mm-root { overflow-y: auto; height: auto; min-height: 100%; }
  .mm-body { display: flex; flex-direction: column; }
  .mm-col { overflow: visible; }
  .mm-watch { border-right: 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
  .mm-watch-list { max-height: 300px; overflow-y: auto; }
  .mm-side { max-height: none; }
  .mm-topbar { flex-wrap: wrap; }
  .mm-topbar-mid { order: 3; width: 100%; margin-left: 0; }
  .mm-inst-price { margin-left: 0; }
  .mm-inst-head { gap: 10px; }
  .mm-inst-actions { margin-left: auto; }
  .mm-detail { padding: 14px 12px 18px; }
}
`;

    /* ------------------------------------------------------------- transport */

    class ApiError extends Error {
      constructor(message, status, code) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
      }
    }

    /**
     * Call the plugin host route.
     * @param {string} path path below `/market-monitor/api`.
     * @param {{ method?: string, body?: unknown }} [options] request options.
     * @returns {Promise<any>} parsed JSON payload.
     */
    async function request(path, options = {}) {
      const init = {
        method: options.method ?? 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      };
      if (options.body !== undefined) {
        init.headers['content-type'] = 'application/json';
        init.body = JSON.stringify(options.body);
      }
      let response;
      try {
        response = await fetch(`${API}${path}`, init);
      } catch {
        throw new ApiError('Cannot reach the market engine.', 0, 'network_error');
      }
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        const detail = payload && typeof payload === 'object' && payload.error ? payload.error : {};
        throw new ApiError(
          typeof detail.message === 'string' ? detail.message : `The market engine answered ${response.status}.`,
          response.status,
          typeof detail.code === 'string' ? detail.code : 'request_failed',
        );
      }
      return payload ?? {};
    }

    const api = {
      host: () => request('/host'),
      restartHost: () => request('/host/restart', { method: 'POST', body: {} }),
      health: () => request('/health'),
      meta: () => request('/v1/meta'),
      settings: () => request('/v1/settings'),
      watchlist: () => request('/v1/watchlist'),
      catalog: (q) => request(`/v1/catalog?q=${encodeURIComponent(q)}&limit=24`),
      snapshot: (symbols) => request(`/v1/snapshot${symbols && symbols.length > 0 ? `?symbols=${encodeURIComponent(symbols.join(','))}` : ''}`),
      history: (symbol, range) => request(`/v1/history/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&overlays=1`),
      analysis: (symbol) => request(`/v1/analysis/${encodeURIComponent(symbol)}`),
      screener: (preset, limit) => request(`/v1/screener?preset=${encodeURIComponent(preset)}&limit=${limit}`),
      alerts: () => request('/v1/alerts'),
      events: (limit) => request(`/v1/alerts/events?limit=${limit}`),
      ack: (body) => request('/v1/alerts/events/ack', { method: 'POST', body }),
      createAlert: (body) => request('/v1/alerts', { method: 'POST', body }),
      updateAlert: (id, body) => request(`/v1/alerts/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
      deleteAlert: (id) => request(`/v1/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      portfolio: () => request('/v1/portfolio'),
      setPosition: (body) => request('/v1/portfolio/positions', { method: 'PUT', body }),
      deletePosition: (symbol) => request(`/v1/portfolio/positions/${encodeURIComponent(symbol)}`, { method: 'DELETE' }),
      updateSettings: (body) => request('/v1/settings', { method: 'PATCH', body }),
      dataCoverage: () => request('/v1/data/coverage'),
      dataStatus: () => request('/v1/data/status'),
      dataIngest: (body) => request('/v1/data/ingest', { method: 'POST', body }),
      dataNews: (params) => request(`/v1/news?${new URLSearchParams(params).toString()}`),
      indexOverview: () => request('/v1/index'),
      indexChanges: (indexId, limit) => request(`/v1/index/${encodeURIComponent(indexId)}/changes?limit=${limit ?? 10}`),
      indexRefresh: (indexId) => request(`/v1/index/${encodeURIComponent(indexId)}/refresh`, { method: 'POST', body: {} }),
      chinaOverview: () => request('/v1/china/overview'),
      addWatch: (symbol) => request('/v1/watchlist', { method: 'POST', body: { symbol } }),
      removeWatch: (symbol) => request(`/v1/watchlist/${encodeURIComponent(symbol)}`, { method: 'DELETE' }),
      sync: () => request('/v1/sync', { method: 'POST', body: {} }),
    };

    /* ------------------------------------------------------------- formatting */

    const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', HKD: 'HK$' };

    function fmtNum(value, digits = 2) {
      return Number.isFinite(value) ? Number(value).toFixed(digits) : '—';
    }

    function fmtMoney(value, currency = 'USD', digits = 2) {
      if (!Number.isFinite(value)) return '—';
      const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
      const number = Number(value);
      return `${number < 0 ? '-' : ''}${symbol}${Math.abs(number).toLocaleString('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}`;
    }

    function fmtSignedMoney(value, currency = 'USD') {
      if (!Number.isFinite(value)) return '—';
      return `${Number(value) > 0 ? '+' : Number(value) < 0 ? '-' : ''}${fmtMoney(Math.abs(Number(value)), currency)}`;
    }

    function fmtPct(value, signed = true) {
      if (!Number.isFinite(value)) return '—';
      const number = Number(value);
      return `${signed && number > 0 ? '+' : ''}${number.toFixed(2)}%`;
    }

    function fmtCompact(value) {
      if (!Number.isFinite(value)) return '—';
      const number = Number(value);
      const abs = Math.abs(number);
      if (abs >= 1e12) return `${(number / 1e12).toFixed(2)}T`;
      if (abs >= 1e9) return `${(number / 1e9).toFixed(2)}B`;
      if (abs >= 1e6) return `${(number / 1e6).toFixed(2)}M`;
      if (abs >= 1e3) return `${(number / 1e3).toFixed(1)}K`;
      return number.toFixed(0);
    }

    function fmtClock(iso) {
      if (typeof iso !== 'string' || iso === '') return '—';
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return '—';
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    }

    /**
     * Date-aware timestamp for schedules, bars and news: keeps the clock time
     * for today's values and adds the date for anything older or future.
     */
    function fmtWhen(iso) {
      if (typeof iso !== 'string' || iso === '') return '—';
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return iso;
      const now = new Date();
      const sameDay = date.getFullYear() === now.getFullYear()
        && date.getMonth() === now.getMonth()
        && date.getDate() === now.getDate();
      const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
      if (sameDay) return time;
      const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return date.getFullYear() === now.getFullYear() ? `${day} ${time}` : `${date.getFullYear()}-${day} ${time}`;
    }

    function fmtDateShort(iso, interval) {
      if (typeof iso !== 'string' || iso === '') return '';
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return iso;
      if (interval === '5m' || interval === '30m' || interval === '1m') {
        return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
      }
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    function fmtBarDate(bar) {
      if (!bar || typeof bar.t !== 'string') return '—';
      if (bar.t.length === 10) return bar.t;
      const date = new Date(bar.t);
      return Number.isNaN(date.getTime()) ? bar.t : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    }

    /**
     * Compact chart x-axis tick. The 5D range has thirty-minute bars across
     * five days, so it needs the calendar day in addition to the time.
     * @param {string} iso bar timestamp.
     * @param {string} interval bar interval.
     * @returns {string} compact tick label.
     */
    function fmtChartTick(iso, interval) {
      if (typeof iso !== 'string' || iso === '') return '';
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return iso;
      const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
      if (interval === '30m') {
        const day = date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
        return `${day} ${time}`;
      }
      if (interval === '5m' || interval === '1m') return time;
      const day = date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
      if (interval === '1y') return String(date.getFullYear());
      if (interval === '6mo' || interval === '3mo' || interval === '1mo') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }
      if (interval === '5d') {
        return `${day}/${String(date.getFullYear()).slice(2)}`;
      }
      return day;
    }

    function signClass(value) {
      if (!Number.isFinite(value) || Number(value) === 0) return 'mm-flat';
      return Number(value) > 0 ? 'mm-up' : 'mm-down';
    }

    function fmtRelative(iso) {
      if (typeof iso !== 'string' || iso === '') return '—';
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return '—';
      const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
      if (seconds < 60) return `${seconds}s`;
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
      return `${Math.floor(seconds / 86400)}d`;
    }

    function alertKindLabel(t, kind) {
      return t(`alert.${kind}`);
    }

    function alertKindHint(t, kind) {
      if (kind === 'price_above' || kind === 'price_below') return t('alert.hint.price');
      if (kind === 'change_pct_above' || kind === 'change_pct_below') return t('alert.hint.pct');
      if (kind === 'rsi_above' || kind === 'rsi_below') return t('alert.hint.rsi');
      if (kind === 'volume_spike') return t('alert.hint.volume');
      return '';
    }

    function alertKindUnit(kind) {
      if (kind === 'change_pct_above' || kind === 'change_pct_below') return '%';
      if (kind === 'volume_spike') return 'x';
      return '';
    }

    /* ------------------------------------------------------------------ hooks */

    function useLocaleSubscription(subscribe) {
      const [, setTick] = useState(0);
      useEffect(() => {
        if (typeof subscribe !== 'function') return undefined;
        return subscribe(() => setTick((value) => value + 1));
      }, [subscribe]);
    }

    function useElementWidth() {
      const ref = useRef(null);
      const [width, setWidth] = useState(0);
      useEffect(() => {
        const element = ref.current;
        if (!element || typeof ResizeObserver === 'undefined') {
          if (element) setWidth(element.clientWidth);
          return undefined;
        }
        const observer = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const next = Math.floor(entry.contentRect.width);
            setWidth((current) => (Math.abs(current - next) > 1 ? next : current));
          }
        });
        observer.observe(element);
        setWidth(Math.floor(element.clientWidth));
        return () => observer.disconnect();
      }, []);
      return [ref, width];
    }

    function useToasts() {
      const [toasts, setToasts] = useState([]);
      const timers = useRef(new Map());
      const pushToast = useCallback((message, kind = 'success') => {
        const text = typeof message === 'string' ? message.trim() : '';
        if (text === '') return;
        const id = `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
        setToasts((current) => [...current.slice(-3), { id, message: text, kind }]);
        const timer = window.setTimeout(() => {
          timers.current.delete(id);
          setToasts((current) => current.filter((toast) => toast.id !== id));
        }, 4200);
        timers.current.set(id, timer);
      }, []);
      useEffect(() => () => {
        for (const timer of timers.current.values()) window.clearTimeout(timer);
      }, []);
      return [toasts, pushToast];
    }

    /* ------------------------------------------------------------------ icons */

    function Icon({ name, size = 16, className = '' }) {
      const common = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        className,
      };
      switch (name) {
        case 'refresh':
          return h('svg', common, h('path', { d: 'M20 11a8 8 0 1 0-2.34 5.66' }), h('path', { d: 'M20 4v7h-7' }));
        case 'plus':
          return h('svg', common, h('path', { d: 'M12 5v14M5 12h14' }));
        case 'settings':
          return h('svg', common, h('path', { d: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z' }), h('path', { d: 'M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.54h.09A1.7 1.7 0 0 0 10.12 3V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.16.63.72 1.03 1.37 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z' }));
        case 'search':
          return h('svg', common, h('circle', { cx: 11, cy: 11, r: 6.5 }), h('path', { d: 'm16 16 4 4' }));
        case 'close':
          return h('svg', common, h('path', { d: 'M6 6l12 12M18 6 6 18' }));
        case 'trash':
          return h('svg', common, h('path', { d: 'M4 7h16' }), h('path', { d: 'M9 7V5h6v2' }), h('path', { d: 'M6 7l1 13h10l1-13' }), h('path', { d: 'M10 11v5M14 11v5' }));
        case 'bell':
          return h('svg', common, h('path', { d: 'M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6' }), h('path', { d: 'M10.3 20a2 2 0 0 0 3.4 0' }));
        case 'check':
          return h('svg', common, h('path', { d: 'm5 12.5 4.5 4.5L19 7.5' }));
        case 'arrow-up':
          return h('svg', common, h('path', { d: 'M12 19V5M6 11l6-6 6 6' }));
        case 'arrow-down':
          return h('svg', common, h('path', { d: 'M12 5v14M6 13l6 6 6-6' }));
        case 'chart':
          return h('svg', common, h('path', { d: 'M4 19V5' }), h('path', { d: 'M4 19h16' }), h('path', { d: 'm7 15 4-4 3 2.5L20 7' }));
        case 'wallet':
          return h('svg', common, h('rect', { x: 3, y: 6, width: 18, height: 13, rx: 2.5 }), h('path', { d: 'M3 10h18' }), h('circle', { cx: 17, cy: 14.5, r: 1 }));
        case 'database':
          return h('svg', common,
            h('ellipse', { cx: 12, cy: 5.5, rx: 7, ry: 2.8 }),
            h('path', { d: 'M5 5.5v6c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8v-6' }),
            h('path', { d: 'M5 11.5v6c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8v-6' }));
        default:
          return h('svg', common, h('circle', { cx: 12, cy: 12, r: 8 }));
      }
    }

    function BrandMark({ size = 22 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': 'true',
        },
        h('path', {
          d: 'M3 17.4h18',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          opacity: 0.35,
        }),
        h('path', {
          d: 'M3.6 16.2 8 10.6l3.2 2.9 4.6-6 2.3 2.2 2.3-3.4',
          stroke: 'currentColor',
          strokeWidth: 1.9,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('circle', { cx: 20.4, cy: 6.3, r: 1.8, fill: 'currentColor', stroke: 'none' }),
        h('path', { d: 'M6 20.4v-2.1M10 20.4v-3.1M14 20.4v-2.4', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', opacity: 0.6 }),
      );
    }

    /* -------------------------------------------------------------- primitives */

    function Spinner({ size = 14 }) {
      return h(Icon, { name: 'refresh', size, className: 'mm-spin' });
    }

    function StatusDot({ tone = 'idle' }) {
      return h('span', { className: `mm-dot is-${tone}`, 'aria-hidden': 'true' });
    }

    function EmptyState({ title, hint, action }) {
      return h(
        'div',
        { className: 'mm-empty' },
        h('strong', null, title),
        hint ? h('span', null, hint) : null,
        action ?? null,
      );
    }

    function Toggle({ checked, onChange, label }) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': checked ? 'true' : 'false',
          'aria-label': label,
          className: 'mm-switch',
          onClick: () => onChange(!checked),
        },
        h('i', null),
      );
    }

    function Modal({ title, onClose, children, footer, wide = false, t }) {
      const panelRef = useRef(null);
      const onCloseRef = useRef(onClose);
      onCloseRef.current = onClose;
      useEffect(() => {
        const panel = panelRef.current;
        const focusableSelector = 'button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const previousFocus = document.activeElement;
        if (panel && !panel.contains(document.activeElement)) {
          const preferred = panel.querySelector('[data-autofocus]')
            ?? panel.querySelector('input, select, textarea')
            ?? panel.querySelector(focusableSelector);
          if (preferred && typeof preferred.focus === 'function') {
            try {
              preferred.focus();
            } catch {
              // Focus is best effort.
            }
          }
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onCloseRef.current();
            return;
          }
          if (event.key !== 'Tab' || !panel) return;
          const items = Array.from(panel.querySelectorAll(focusableSelector))
            .filter((item) => !item.disabled && item.offsetParent !== null);
          if (items.length === 0) return;
          const first = items[0];
          const last = items[items.length - 1];
          if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          } else if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
          document.removeEventListener('keydown', onKeyDown, true);
          if (previousFocus && typeof previousFocus.focus === 'function') {
            try {
              previousFocus.focus();
            } catch {
              // The trigger may have unmounted.
            }
          }
        };
      }, []);
      return h(
        'div',
        {
          className: 'mm-modal-backdrop',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          {
            ref: panelRef,
            className: `mm-modal${wide ? ' is-wide' : ''}`,
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': title,
          },
          h('div', { className: 'mm-modal-head' }, h('h3', null, title), h('button', {
            type: 'button',
            className: 'mm-btn is-ghost is-icon',
            'aria-label': typeof t === 'function' ? t('close') : 'Close',
            onClick: onClose,
          }, h(Icon, { name: 'close', size: 15 }))),
          h('div', { className: 'mm-modal-body' }, children),
          footer ? h('div', { className: 'mm-modal-foot' }, footer) : null,
        ),
      );
    }

    /* ----------------------------------------------------------------- charts */

    function Sparkline({ values, width = 68, height = 22, up }) {
      const path = useMemo(() => {
        if (!Array.isArray(values) || values.length < 2) return '';
        const finite = values.filter((value) => Number.isFinite(value));
        if (finite.length < 2) return '';
        const min = Math.min(...finite);
        const max = Math.max(...finite);
        const span = max - min || 1;
        return finite.map((value, index) => {
          const x = 1 + (index / (finite.length - 1)) * (width - 2);
          const y = 1 + (height - 2) * (1 - (value - min) / span);
          return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
        }).join(' ');
      }, [values, width, height]);
      if (path === '') return h('span', { className: 'mm-skeleton', style: { width, height, display: 'inline-block' } });
      return h(
        'svg',
        { width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true', className: 'mm-spark' },
        h('path', {
          d: path,
          fill: 'none',
          stroke: up ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)',
          strokeWidth: 1.4,
          strokeLinejoin: 'round',
          strokeLinecap: 'round',
        }),
      );
    }

    function PriceChart({ bars, overlays, chartStyle, width, showSma20, showSma50, showBoll, interval, t }) {
      const [hover, setHover] = useState(null);
      const height = 262;      const volumeHeight = 46;
      const gap = 10;
      const totalHeight = height + gap + volumeHeight;
      const pad = { top: 10, right: 56, bottom: 18, left: 8 };
      const plotWidth = Math.max(40, width - pad.left - pad.right);
      const plotHeight = height - pad.top - pad.bottom;

      const geometry = useMemo(() => {
        if (!Array.isArray(bars) || bars.length === 0) return null;
        const values = [];
        for (const bar of bars) {
          if (Number.isFinite(bar.l)) values.push(bar.l);
          if (Number.isFinite(bar.h)) values.push(bar.h);
        }
        const overlaySeries = [];
        if (overlays && showSma20 && Array.isArray(overlays.sma20)) overlaySeries.push(overlays.sma20);
        if (overlays && showSma50 && Array.isArray(overlays.sma50)) overlaySeries.push(overlays.sma50);
        if (overlays && showBoll) {
          const boll = overlays.bollinger ?? {};
          if (Array.isArray(boll.upper)) overlaySeries.push(boll.upper);
          if (Array.isArray(boll.lower)) overlaySeries.push(boll.lower);
        }
        for (const series of overlaySeries) {
          for (const value of series) if (Number.isFinite(value)) values.push(value);
        }
        const min = Math.min(...values);
        const max = Math.max(...values);
        const span = max - min || Math.max(1, Math.abs(max) * 0.01);
        const x = (index) => pad.left + (bars.length === 1 ? plotWidth / 2 : (index / (bars.length - 1)) * plotWidth);
        const y = (value) => pad.top + plotHeight * (1 - (value - min) / span);
        const linePath = (series, closePath) => {
          let path = '';
          let started = false;
          for (let index = 0; index < series.length; index += 1) {
            const value = series[index];
            if (!Number.isFinite(value)) {
              started = false;
              continue;
            }
            path += `${started ? 'L' : 'M'}${x(index).toFixed(2)} ${y(value).toFixed(2)} `;
            started = true;
          }
          return closePath && path !== '' ? `${path}Z` : path.trim();
        };
        const closeLine = linePath(bars.map((bar) => bar.c), false);
        const closeArea = closeLine === '' ? '' : `${closeLine} L${x(bars.length - 1).toFixed(2)} ${(pad.top + plotHeight).toFixed(2)} L${x(0).toFixed(2)} ${(pad.top + plotHeight).toFixed(2)} Z`;
        const maxVolume = Math.max(...bars.map((bar) => (Number.isFinite(bar.v) ? bar.v : 0)), 1);
        const yTicks = 4;
        const ticks = Array.from({ length: yTicks + 1 }, (_unused, index) => {
          const value = min + (span * index) / yTicks;
          return { value, y: y(value) };
        });
        const labelCount = interval === '30m' ? 3 : Math.min(4, bars.length);
        const intraday = typeof bars[0]?.t === 'string' && bars[0].t.length > 10;
        const xTicks = Array.from({ length: labelCount }, (_unused, index) => {
          const barIndex = labelCount === 1 ? 0 : Math.round((index / (labelCount - 1)) * (bars.length - 1));
          return {
            index: barIndex,
            x: x(barIndex),
            label: fmtChartTick(bars[barIndex].t, interval ?? (intraday ? '5m' : '1d')),
          };
        });
        return {
          min, max, span, x, y, closeLine, closeArea, ticks, xTicks, maxVolume,
          sma20: overlays && Array.isArray(overlays.sma20) ? linePath(overlays.sma20, false) : '',
          sma50: overlays && Array.isArray(overlays.sma50) ? linePath(overlays.sma50, false) : '',
          boll: overlays && overlays.bollinger
            ? {
              upper: Array.isArray(overlays.bollinger.upper) ? linePath(overlays.bollinger.upper, false) : '',
              lower: Array.isArray(overlays.bollinger.lower) ? linePath(overlays.bollinger.lower, false) : '',
              area: Array.isArray(overlays.bollinger.upper) && Array.isArray(overlays.bollinger.lower)
                ? `${linePath(overlays.bollinger.upper, false)} ${overlays.bollinger.lower.map((value, index) => (Number.isFinite(value) ? `L${x(index).toFixed(2)} ${y(value).toFixed(2)} ` : '')).join('')}Z`
                : '',
            }
            : null,
        };
      }, [bars, overlays, plotWidth, plotHeight, pad.left, pad.top, showSma20, showSma50, showBoll]);

      const volumeGeometry = useMemo(() => {
        if (!Array.isArray(bars) || bars.length === 0) return null;
        const maxVolume = Math.max(...bars.map((bar) => (Number.isFinite(bar.v) ? bar.v : 0)), 1);
        const barWidth = Math.max(1, Math.min(8, (plotWidth / Math.max(1, bars.length)) * 0.66));
        return { maxVolume, barWidth };
      }, [bars, plotWidth]);

      if (!geometry) return null;

      const onPointerMove = (event) => {
        const svg = event.currentTarget.ownerSVGElement;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const ratio = Math.min(1, Math.max(0, (px - pad.left) / Math.max(1, plotWidth)));
        const index = Math.round(ratio * (bars.length - 1));
        setHover({ index, x: px, y: py });
      };

      const hoveredBar = hover !== null && bars[hover.index] ? bars[hover.index] : null;
      const hoverX = hover !== null && bars[hover.index] ? geometry.x(hover.index) : 0;
      const tipWidth = 196;
      const tipHeight = 118;
      const tipLeft = hover === null
        ? 0
        : (hover.x + 16 + tipWidth <= width - 8
          ? hover.x + 16
          : Math.max(8, hover.x - tipWidth - 16));
      const tipTop = hover === null
        ? 0
        : (hover.y - tipHeight - 14 >= 8
          ? hover.y - tipHeight - 14
          : Math.min(totalHeight - tipHeight - 8, hover.y + 16));
      const showSmaLegend = Boolean(overlays && (showSma20 || showSma50));
      const showBollLegend = Boolean(overlays && showBoll);

      return h(
        'div',
        { className: 'mm-chart-wrap' },
        h(
          'svg',
          {
            width,
            height: totalHeight,
            viewBox: `0 0 ${width} ${totalHeight}`,
            role: 'img',
            'aria-label': `${t('chart')} ${bars.length}`,
            className: 'mm-chart',
            onPointerLeave: () => setHover(null),
          },
          h('defs', null,
            h('linearGradient', { id: 'mm-area-fill', x1: 0, y1: 0, x2: 0, y2: 1 },
              h('stop', { offset: '0%', stopColor: 'var(--dsw-alias-brand-primary)', stopOpacity: 0.18 }),
              h('stop', { offset: '100%', stopColor: 'var(--dsw-alias-brand-primary)', stopOpacity: 0 }))),
          geometry.ticks.map((tick) => h('g', { key: `t${tick.value.toFixed(4)}` },
            h('line', { x1: pad.left, x2: pad.left + plotWidth, y1: tick.y, y2: tick.y, className: 'mm-grid-line' }),
            h('text', { x: pad.left + plotWidth + 6, y: tick.y + 3.2, className: 'mm-axis-label' }, fmtNum(tick.value, tick.value >= 1000 ? 0 : 2)))),
          geometry.xTicks.map((tick) => h('text', {
            key: `x${tick.index}`,
            x: Math.min(Math.max(tick.x, pad.left + 8), pad.left + plotWidth - 8),
            y: height - 4,
            className: 'mm-axis-label',
            textAnchor: 'middle',
          }, tick.label)),
          showBollLegend && geometry.boll && geometry.boll.area
            ? h('path', { d: geometry.boll.area, className: 'mm-boll-area' })
            : null,
          showBollLegend && geometry.boll && geometry.boll.upper
            ? h('path', { d: geometry.boll.upper, className: 'mm-boll-line' })
            : null,
          showBollLegend && geometry.boll && geometry.boll.lower
            ? h('path', { d: geometry.boll.lower, className: 'mm-boll-line' })
            : null,
          chartStyle === 'candles'
            ? h('g', null, bars.map((bar, index) => {
              const x = geometry.x(index);
              const bodyWidth = Math.max(1.6, Math.min(7, (plotWidth / Math.max(1, bars.length)) * 0.6));
              const up = Number(bar.c) >= Number(bar.o);
              const top = Math.min(geometry.y(bar.o), geometry.y(bar.c));
              const bottom = Math.max(geometry.y(bar.o), geometry.y(bar.c));
              return h('g', { key: `c${index}`, className: up ? 'mm-candle-up' : 'mm-candle-down' },
                h('line', { x1: x, x2: x, y1: geometry.y(bar.h), y2: geometry.y(bar.l), strokeWidth: 1 }),
                h('rect', { x: x - bodyWidth / 2, y: top, width: bodyWidth, height: Math.max(1, bottom - top) }));
            }))
            : h('g', null,
              h('path', { d: geometry.closeArea, className: 'mm-price-area' }),
              h('path', { d: geometry.closeLine, className: 'mm-price-line' })),
          showSma20 && geometry.sma20 ? h('path', { d: geometry.sma20, className: 'mm-sma-a' }) : null,
          showSma50 && geometry.sma50 ? h('path', { d: geometry.sma50, className: 'mm-sma-b' }) : null,
          hoveredBar
            ? h('g', null,
              h('line', { x1: hoverX, x2: hoverX, y1: pad.top, y2: pad.top + plotHeight, className: 'mm-crosshair' }),
              h('circle', { cx: hoverX, cy: geometry.y(hoveredBar.c), r: 3, fill: 'var(--dsw-alias-brand-primary)' }))
            : null,
          h('rect', {
            x: pad.left,
            y: pad.top,
            width: plotWidth,
            height: plotHeight,
            fill: 'transparent',
            onPointerMove,
            onPointerLeave: () => setHover(null),
          }),
          h('g', { transform: `translate(0 ${height + gap})` },
            Array.isArray(bars) && bars.length > 0 && volumeGeometry
              ? bars.map((bar, index) => {
                const x = geometry.x(index);
                const barHeight = Math.max(1, (Math.max(0, Number.isFinite(bar.v) ? bar.v : 0) / volumeGeometry.maxVolume) * volumeHeight);
                const up = Number(bar.c) >= Number(bar.o);
                return h('rect', {
                  key: `v${index}`,
                  x: x - volumeGeometry.barWidth / 2,
                  y: volumeHeight - barHeight,
                  width: volumeGeometry.barWidth,
                  height: barHeight,
                  className: up ? 'mm-vol-up' : 'mm-vol-down',
                });
              })
              : null)),
        hoveredBar
          ? h('div', { className: 'mm-chart-tip', style: { left: tipLeft, top: tipTop } },
            h('div', { className: 'mm-tip-date' }, fmtBarDate(hoveredBar)),
            h('div', null, h('span', null, t('chart.open')), h('b', null, fmtNum(hoveredBar.o))),
            h('div', null, h('span', null, t('chart.high')), h('b', null, fmtNum(hoveredBar.h))),
            h('div', null, h('span', null, t('chart.low')), h('b', null, fmtNum(hoveredBar.l))),
            h('div', null, h('span', null, t('chart.close')), h('b', null, fmtNum(hoveredBar.c))),
            h('div', null, h('span', null, t('chart.volume')), h('b', null, fmtCompact(hoveredBar.v))))
          : null,
        h('div', { className: 'mm-legend' },
          h('span', null, h('i', { className: 'mm-dash-brand' }), t('chart')),
          showBollLegend ? h('span', null, h('i', { className: 'mm-dash-idle' }), t('chart.bollinger')) : null,
          showSma20 ? h('span', null, h('i', { className: 'mm-dash-warn' }), t('chart.sma20')) : null,
          showSma50 ? h('span', null, h('i', { className: 'mm-dash-idle' }), t('chart.sma50')) : null),
      );
    }

    function RsiStrip({ values, width, t }) {
      const height = 54;
      const pad = { top: 6, right: 56, bottom: 4, left: 8 };
      const plotWidth = Math.max(40, width - pad.left - pad.right);
      const plotHeight = height - pad.top - pad.bottom;
      const path = useMemo(() => {
        if (!Array.isArray(values) || values.length === 0) return '';
        let pathText = '';
        let started = false;
        for (let index = 0; index < values.length; index += 1) {
          const value = values[index];
          if (!Number.isFinite(value)) {
            started = false;
            continue;
          }
          const x = pad.left + (values.length === 1 ? plotWidth / 2 : (index / (values.length - 1)) * plotWidth);
          const y = pad.top + plotHeight * (1 - Math.min(100, Math.max(0, value)) / 100);
          pathText += `${started ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)} `;
          started = true;
        }
        return pathText.trim();
      }, [values, plotWidth, plotHeight, pad.left, pad.top]);
      const yFor = (value) => pad.top + plotHeight * (1 - value / 100);
      if (path === '') return null;
      return h(
        'div',
        { className: 'mm-chart-wrap' },
        h('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': t('chart.rsi') },
          [30, 70].map((level) => h('g', { key: level },
            h('line', { x1: pad.left, x2: pad.left + plotWidth, y1: yFor(level), y2: yFor(level), className: 'mm-rsi-band' }),
            h('text', { x: pad.left + plotWidth + 6, y: yFor(level) + 3, className: 'mm-axis-label' }, String(level)))),
          h('path', { d: path, className: 'mm-rsi-line' })),
      );
    }

    /* -------------------------------------------------------------- components */

    function WatchlistColumn({ t, items, quoteBySymbol, selected, onSelect, onAdd, onRemove }) {
      return h(
        'aside',
        { className: 'mm-watch', 'aria-label': t('watchlist') },
        h('div', { className: 'mm-watch-head' },
          h('h3', null, t('watchlist')),
          h('span', { className: 'mm-count' }, String(items.length)),
          h('button', {
            type: 'button',
            className: 'mm-btn is-ghost is-icon',
            'aria-label': t('watchlist.add'),
            title: t('watchlist.add'),
            onClick: onAdd,
          }, h(Icon, { name: 'plus', size: 15 }))),
        h('div', { className: 'mm-watch-list' },
          items.length === 0
            ? h(EmptyState, {
              title: t('watchlist.empty'),
              hint: t('watchlist.emptyHint'),
              action: h('button', { type: 'button', className: 'mm-btn is-primary', onClick: onAdd }, h(Icon, { name: 'plus', size: 14 }), t('watchlist.add')),
            })
            : items.map((item) => {
              const quote = quoteBySymbol.get(item.symbol);
              const change = quote ? quote.change_pct : null;
              return h(
                'div',
                {
                  key: item.symbol,
                  className: `mm-watch-row${selected === item.symbol ? ' is-active' : ''}`,
                  title: item.name ? `${item.name}${item.note ? ` — ${item.note}` : ''}` : item.symbol,
                },
                h('button', {
                  type: 'button',
                  className: 'mm-watch-select',
                  'aria-pressed': selected === item.symbol ? 'true' : 'false',
                  onClick: () => onSelect(item.symbol),
                },
                h('div', { className: 'mm-watch-main' },
                  h('span', { className: 'mm-watch-symbol' }, item.symbol),
                  h('span', { className: 'mm-watch-name' }, item.name ?? '—')),
                quote ? h(Sparkline, { values: quote.spark, up: Number(quote.change_pct) >= 0 }) : null,
                h('div', { className: 'mm-watch-quote' },
                  h('span', { className: 'mm-watch-price' }, quote ? fmtMoney(quote.price, quote.currency) : h('span', { className: 'mm-skeleton', style: { width: 52, height: 11, display: 'inline-block' } })),
                  h('span', { className: `mm-watch-change ${signClass(change)}` }, quote ? fmtPct(change) : '—'))),
                onRemove
                  ? h('button', {
                    type: 'button',
                    className: 'mm-btn is-ghost is-icon',
                    'aria-label': `${t('watchlist.remove')} ${item.symbol}`,
                    title: t('watchlist.remove'),
                    onClick: () => onRemove(item.symbol),
                  }, h(Icon, { name: 'close', size: 12 }))
                  : null,
              );
            })),
      );
    }

    function InstrumentHeader({ t, quote, watched, onToggleWatch, onCreateAlert }) {
      const change = quote ? quote.change_pct : null;
      return h(
        'div',
        { className: 'mm-inst-head' },
        h('div', { className: 'mm-inst-title' },
          h('h2', null, quote?.symbol ?? ''),
          h('span', { className: 'mm-inst-name' }, [quote?.name, quote?.exchange].filter(Boolean).join(' · ') || '—')),
        h('div', { className: 'mm-inst-price' },
          h('strong', null, quote ? fmtMoney(quote.price, quote.currency) : '—'),
          h('span', { className: `mm-inst-delta ${signClass(change)}` },
            quote ? `${fmtSignedMoney(quote.change, quote.currency)} (${fmtPct(change)})` : '—')),
        h('div', { className: 'mm-inst-actions' },
          h('button', { type: 'button', className: 'mm-btn', onClick: onCreateAlert }, h(Icon, { name: 'bell', size: 14 }), t('alerts.create')),
          h('button', {
            type: 'button',
            className: watched ? 'mm-btn' : 'mm-btn is-primary',
            onClick: onToggleWatch,
          }, h(Icon, { name: watched ? 'close' : 'plus', size: 14 }), watched ? t('watchlist.unwatch') : t('watchlist.watch'))),
      );
    }

    function ChartCard({ t, history, range, onRange, chartStyle, onChartStyle, overlays, onToggleOverlay, analysis }) {
      const [containerRef, width] = useElementWidth();
      const bars = history?.data?.bars ?? [];
      const overlayData = history?.data?.overlays ?? null;
      const loading = history?.phase === 'loading';
      const error = history?.phase === 'error';
      const interval = history?.data?.interval ?? '';
      const windowLabel = bars.length > 0
        ? `${history?.data?.range ?? range} · ${fmtBarDate(bars[0])} → ${fmtBarDate(bars[bars.length - 1])} · ${bars.length} ${t('chart.points')} · ${t(`period.${interval}`)}`
        : '';
      return h(
        'section',
        { className: 'mm-card' },
        h('div', { className: 'mm-card-head' },
          h('h3', null, t('chart')),
          h('span', { className: 'mm-spacer' }),
          h('div', { className: 'mm-segmented', role: 'group', 'aria-label': t('chart.style') },
            h('button', { type: 'button', 'aria-pressed': chartStyle === 'area' ? 'true' : 'false', className: `mm-seg${chartStyle === 'area' ? ' is-active' : ''}`, onClick: () => onChartStyle('area') }, t('chart.area')),
            h('button', { type: 'button', 'aria-pressed': chartStyle === 'candles' ? 'true' : 'false', className: `mm-seg${chartStyle === 'candles' ? ' is-active' : ''}`, onClick: () => onChartStyle('candles') }, t('chart.candles'))),
          h('div', { className: 'mm-segmented', role: 'group', 'aria-label': t('chart.range') },
            RANGES.map((item) => h('button', {
              key: item,
              type: 'button',
              className: `mm-seg${range === item ? ' is-active' : ''}`,
              'aria-pressed': range === item ? 'true' : 'false',
              onClick: () => onRange(item),
            }, item)))),
        h('div', { className: 'mm-card-head', style: { borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: '7px', paddingBottom: '7px' } },
          h('div', { className: 'mm-chips' },
            h('button', { type: 'button', className: `mm-toggle-chip${overlays.sma20 ? ' is-on' : ''}`, 'aria-pressed': overlays.sma20 ? 'true' : 'false', onClick: () => onToggleOverlay('sma20') }, t('chart.sma20')),
            h('button', { type: 'button', className: `mm-toggle-chip${overlays.sma50 ? ' is-on' : ''}`, 'aria-pressed': overlays.sma50 ? 'true' : 'false', onClick: () => onToggleOverlay('sma50') }, t('chart.sma50')),
            h('button', { type: 'button', className: `mm-toggle-chip${overlays.bollinger ? ' is-on' : ''}`, 'aria-pressed': overlays.bollinger ? 'true' : 'false', onClick: () => onToggleOverlay('bollinger') }, t('chart.bollinger')),
            h('button', { type: 'button', className: `mm-toggle-chip${overlays.rsi ? ' is-on' : ''}`, 'aria-pressed': overlays.rsi ? 'true' : 'false', onClick: () => onToggleOverlay('rsi') }, t('chart.rsi'))),
          h('span', { className: 'mm-spacer' }),
          h('span', { className: 'mm-hint' }, history?.data ? `${history.data.provider ?? ''}${history.data.stale ? ` · ${t('status.stale')}` : ''}` : '')),
        windowLabel ? h('div', { className: 'mm-hint', style: { padding: '0 14px 6px' } }, `${t('chart.window')}: ${windowLabel}`) : null,
        h('div', { ref: containerRef, className: 'mm-card-body', style: { paddingTop: 10, paddingBottom: 8 } },
          error
            ? h('div', { className: 'mm-chart-state' },
              h('span', null, t('chart.error')),
              h('button', { type: 'button', className: 'mm-btn', onClick: () => onRange(range) }, t('chart.retry')))
            : loading || width === 0
              ? h('div', { className: 'mm-chart-state' }, h(Spinner, { size: 16 }), h('span', null, t('chart.loading')))
              : bars.length === 0
                ? h('div', { className: 'mm-chart-state' }, h(Icon, { name: 'chart', size: 22 }), h('span', null, t('chart.empty')))
                : h(React.Fragment, null,
                  h(PriceChart, {
                    bars,
                    overlays: overlayData,
                    chartStyle,
                    width,
                    showSma20: overlays.sma20,
                    showSma50: overlays.sma50,
                    showBoll: overlays.bollinger,
                    interval: history.data?.interval,
                    t,
                  }),
                  overlays.rsi && overlayData && Array.isArray(overlayData.rsi14)
                    ? h(RsiStrip, { values: overlayData.rsi14, width, t })
                    : null)),
        analysis?.data ? h('div', { className: 'mm-card-body', style: { borderTop: '1px solid var(--dsw-alias-border-l1)' } },
          h('div', { className: 'mm-stats' },
            h(StatBox, { label: t('analysis.rsi'), value: fmtNum(analysis.data.indicators?.rsi14, 1) }),
            h(StatBox, { label: t('analysis.trend'), value: t(`trend.${analysis.data.summary?.trend ?? 'sideways'}`) }),
            h(StatBox, { label: t('analysis.vol'), value: fmtPct(analysis.data.stats?.annualized_volatility_pct, false) }),
            h(StatBox, { label: t('analysis.atr'), value: fmtNum(analysis.data.indicators?.atr14) }),
            h(StatBox, { label: t('analysis.range52'), value: `${fmtNum(analysis.data.stats?.low_52w)} – ${fmtNum(analysis.data.stats?.high_52w)}` }),
            h(StatBox, { label: t('analysis.periodReturn'), value: fmtPct(analysis.data.stats?.period_return_pct), tone: signClass(analysis.data.stats?.period_return_pct) }))) : null,
      );
    }

    function StatBox({ label, value, tone }) {
      return h('div', { className: 'mm-stat' },
        h('span', null, label),
        h('strong', { className: tone ?? '' }, value ?? '—'));
    }

    function QuoteMeta({ t, quote }) {
      if (!quote) return null;
      const cell = (label, value, tone) => h('div', null, h('dt', null, label), h('dd', { className: tone ?? '' }, value));
      return h('dl', { className: 'mm-quote-meta', style: { margin: 0 } },
        cell(t('stat.open'), fmtNum(quote.open)),
        cell(t('stat.high'), fmtNum(quote.high)),
        cell(t('stat.low'), fmtNum(quote.low)),
        cell(t('stat.prevClose'), fmtNum(quote.prev_close)),
        cell(t('stat.volume'), fmtCompact(quote.volume)),
        cell(t('stat.market'), t(`state.${quote.market_state ?? 'closed'}`)),
        cell(t('chart.asOf'), fmtClock(quote.as_of)),
        cell(t('stat.source'), quote.source ?? '—'));
    }

    function Tabs({ t, tab, onChange, unacked }) {
      const items = [
        { id: 'analysis', label: t('analysis'), icon: 'chart' },
        { id: 'scan', label: t('screener'), icon: 'search' },
        { id: 'alerts', label: t('alerts'), icon: 'bell', badge: unacked },
        { id: 'portfolio', label: t('portfolio'), icon: 'wallet' },
        { id: 'data', label: t('data.tab'), icon: 'database' },
      ];
      const focusTab = (nextId) => {
        window.requestAnimationFrame(() => {
          const element = document.getElementById(`mm-tab-${nextId}`);
          if (element) element.focus();
        });
      };
      const step = (direction) => {
        const index = items.findIndex((item) => item.id === tab);
        const next = items[(index + direction + items.length) % items.length];
        onChange(next.id);
        focusTab(next.id);
      };
      return h('div', { className: 'mm-side-tabs', role: 'tablist', 'aria-label': t('title') },
        items.map((item) => h('button', {
          key: item.id,
          id: `mm-tab-${item.id}`,
          type: 'button',
          role: 'tab',
          'aria-selected': tab === item.id ? 'true' : 'false',
          'aria-controls': `mm-panel-${item.id}`,
          tabIndex: tab === item.id ? 0 : -1,
          className: `mm-tab${tab === item.id ? ' is-active' : ''}`,
          onClick: () => onChange(item.id),
          onKeyDown: (event) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              step(1);
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              step(-1);
            } else if (event.key === 'Home') {
              event.preventDefault();
              onChange(items[0].id);
              focusTab(items[0].id);
            } else if (event.key === 'End') {
              event.preventDefault();
              const last = items[items.length - 1];
              onChange(last.id);
              focusTab(last.id);
            }
          },
        },
        h(Icon, { name: item.icon, size: 14 }),
        h('span', null, item.label),
        item.badge ? h('span', { className: 'mm-tab-badge' }, item.badge > 99 ? '99+' : String(item.badge)) : null)));
    }

    function AnalysisPanel({ t, analysis, quote, onRetry, relatedNews, onRetryRelated, onOpenEntity }) {
      const data = analysis?.data;
      const relatedCard = h('div', { className: 'mm-card' },
        h('div', { className: 'mm-card-head' },
          h('h3', null, t('data.relatedNews')),
          relatedNews.phase === 'loading' ? h('span', { className: 'mm-spacer' }) : null,
          relatedNews.phase === 'loading' ? h(Spinner, { size: 12 }) : null),
        h('div', { className: 'mm-card-body' },
          relatedNews.phase === 'error'
            ? h('div', { className: 'mm-data-error' },
              h('span', null, t('data.relatedError')),
              h('button', { type: 'button', className: 'mm-btn is-ghost', onClick: onRetryRelated }, t('chart.retry')))
            : relatedNews.articles.length === 0
              ? h('div', { className: 'mm-hint' }, `${t('data.relatedEmpty')} · ${t('data.relatedHint')}`)
              : h('div', relatedNews.phase === 'loading' ? { style: { opacity: 0.6 } } : null,
                relatedNews.articles.slice(0, 4).map((article) => h(NewsItem, {
                  key: article.article_id,
                  t,
                  article,
                  onOpenEntity,
                })))));
      if (analysis?.phase === 'loading' && !data) {
        return h(React.Fragment, null,
          h('div', { className: 'mm-loading-row' }, h(Spinner, { size: 14 }), h('span', null, t('analysis.loading'))),
          relatedCard);
      }
      if (analysis?.phase === 'error') {
        return h(React.Fragment, null,
          h(EmptyState, {
            title: t('analysis.error'),
            hint: analysis.error,
            action: h('button', { type: 'button', className: 'mm-btn', onClick: onRetry }, t('chart.retry')),
          }),
          relatedCard);
      }
      if (!data) {
        return h(React.Fragment, null, h(EmptyState, { title: t('analysis.empty') }), relatedCard);
      }
      const summary = data.summary ?? {};
      const indicators = data.indicators ?? {};
      const stats = data.stats ?? {};
      const signals = Array.isArray(data.signals) ? data.signals : [];
      const levels = data.levels ?? {};
      const score = Number.isFinite(summary.score) ? Math.max(-1, Math.min(1, summary.score)) : 0;
      const widthPct = Math.abs(score) * 50;
      return h(React.Fragment, null,
        h('div', { className: 'mm-card' },
          h('div', { className: 'mm-card-body', style: { display: 'flex', flexDirection: 'column', gap: 10 } },
            h('div', { className: 'mm-section-title' },
              h('span', null, t('analysis.signal')),
              h('span', { className: 'mm-spacer' }),
              h('span', { className: `mm-signal-badge is-${summary.signal ?? 'neutral'}` }, t(`signal.${summary.signal ?? 'neutral'}`))),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 9 } },
              h('span', { className: 'mm-hint', style: { minWidth: 34 } }, t('analysis.score')),
              h('div', { className: 'mm-scorebar', role: 'img', 'aria-label': `${t('analysis.score')} ${fmtNum(summary.score)}` },
                h('i', {
                  style: score >= 0
                    ? { left: '50%', width: `${widthPct}%`, background: 'var(--dsw-alias-state-success-primary)' }
                    : { left: `${50 - widthPct}%`, width: `${widthPct}%`, background: 'var(--dsw-alias-state-error-primary)' },
                })),
              h('span', { className: `mm-hint ${signClass(score)}` }, fmtNum(score))),
            h('div', { className: 'mm-kv' },
              h('dt', null, t('analysis.confidence')),
              h('dd', null, summary.confidence ? t(`confidence.${summary.confidence}`) : '—'),
              h('dt', null, t('analysis.trend')),
              h('dd', null, t(`trend.${summary.trend ?? 'sideways'}`)),
              h('dt', null, t('analysis.momentum')),
              h('dd', null, t(`momentum.${summary.momentum ?? 'flat'}`)),
              h('dt', null, t('analysis.volatility')),
              h('dd', null, t(`volatility.${summary.volatility ?? 'moderate'}`))),
            data.narrative ? h('p', { className: 'mm-narrative' }, data.narrative) : null)),
        relatedCard,
        h('div', { className: 'mm-card' },
          h('div', { className: 'mm-card-head' }, h('h3', null, t('analysis.indicators'))),
          h('div', { className: 'mm-card-body' },
            h('dl', { className: 'mm-kv', style: { margin: 0 } },
              h('dt', null, t('analysis.sma')),
              h('dd', null, `${fmtNum(indicators.sma20)} / ${fmtNum(indicators.sma50)} / ${fmtNum(indicators.sma200)}`),
              h('dt', null, t('analysis.ema')),
              h('dd', null, `${fmtNum(indicators.ema12)} / ${fmtNum(indicators.ema26)}`),
              h('dt', null, t('analysis.rsi')),
              h('dd', null, fmtNum(indicators.rsi14, 1)),
              h('dt', null, t('analysis.macd')),
              h('dd', null, `${fmtNum(indicators.macd?.line, 3)} / ${fmtNum(indicators.macd?.signal, 3)} / ${fmtNum(indicators.macd?.histogram, 3)}`),
              h('dt', null, t('analysis.bollinger')),
              h('dd', null, `${fmtNum(indicators.bollinger?.upper)} / ${fmtNum(indicators.bollinger?.middle)} / ${fmtNum(indicators.bollinger?.lower)}`),
              h('dt', null, t('analysis.atr')),
              h('dd', null, fmtNum(indicators.atr14))))),
        h('div', { className: 'mm-card' },
          h('div', { className: 'mm-card-head' }, h('h3', null, t('analysis.statistics'))),
          h('div', { className: 'mm-card-body' },
            h('dl', { className: 'mm-kv', style: { margin: 0 } },
              h('dt', null, t('analysis.periodReturn')),
              h('dd', { className: signClass(stats.period_return_pct) }, fmtPct(stats.period_return_pct)),
              h('dt', null, t('analysis.vol')),
              h('dd', null, fmtPct(stats.annualized_volatility_pct, false)),
              h('dt', null, t('analysis.drawdown')),
              h('dd', { className: signClass(stats.max_drawdown_pct) }, fmtPct(stats.max_drawdown_pct)),
              h('dt', null, t('analysis.sharpe')),
              h('dd', null, fmtNum(stats.sharpe)),
              h('dt', null, t('analysis.winRate')),
              h('dd', null, fmtPct(stats.win_rate_pct, false)),
              h('dt', null, t('analysis.range52')),
              h('dd', null, `${fmtNum(stats.low_52w)} – ${fmtNum(stats.high_52w)}`),
              h('dt', null, t('analysis.fromHigh')),
              h('dd', { className: signClass(stats.distance_from_52w_high_pct) }, fmtPct(stats.distance_from_52w_high_pct)),
              h('dt', null, t('analysis.avgVolume')),
              h('dd', null, fmtCompact(stats.avg_volume_20d))))),
        signals.length > 0
          ? h('div', { className: 'mm-card' },
            h('div', { className: 'mm-card-head' }, h('h3', null, t('analysis.signals'))),
            h('div', { className: 'mm-card-body mm-signals' }, signals.map((signal) => h('div', { key: signal.id, className: 'mm-signal' },
              h('span', { className: `mm-dot ${signal.direction === 'bullish' ? 'is-ok' : signal.direction === 'bearish' ? 'is-error' : 'is-warn'}` }),
              h('div', null,
                h('strong', null, signal.label),
                signal.detail ? h('span', null, signal.detail) : null)))))
          : null,
        h('div', { className: 'mm-card' },
          h('div', { className: 'mm-card-head' }, h('h3', null, t('analysis.levels'))),
          h('div', { className: 'mm-card-body mm-levels' },
            h('div', null, h('em', null, t('analysis.support')), (levels.support ?? []).length === 0
              ? h('span', { className: 'mm-hint' }, '—')
              : levels.support.map((value) => h('span', { key: `s${value}`, className: 'mm-level-chip' }, fmtNum(value)))),
            h('div', null, h('em', null, t('analysis.resistance')), (levels.resistance ?? []).length === 0
              ? h('span', { className: 'mm-hint' }, '—')
              : levels.resistance.map((value) => h('span', { key: `r${value}`, className: 'mm-level-chip' }, fmtNum(value)))),
            data.correlation && Number.isFinite(data.correlation.value)
              ? h('div', null, h('em', null, t('analysis.correlation')), h('span', { className: 'mm-level-chip' }, `${data.correlation.benchmark} ${fmtNum(data.correlation.value)}`), h('span', { className: 'mm-hint' }, `${data.correlation.window_days ?? '—'} ${t('analysis.window')}`))
              : null)),
        h('div', { className: 'mm-hint', style: { textAlign: 'right' } }, `${t('analysis.refresh')} ${fmtClock(data.as_of)}`));
    }

    function AlertRuleRow({ t, rule, onToggle, onDelete }) {
      const state = !rule.enabled ? t('alerts.paused') : rule.armed ? t('alerts.enabled') : t('alerts.cooldown');
      const thresholdText = rule.kind === 'ma_cross'
        ? (rule.params?.direction === 'death' ? t('alerts.death') : t('alerts.golden'))
        : `${fmtNum(rule.threshold)}${alertKindUnit(rule.kind)}`;
      return h('div', { className: 'mm-alert-rule' },
        h('div', { className: 'mm-alert-rule-main' },
          h('strong', null, `${rule.symbol} · ${alertKindLabel(t, rule.kind)}`),
          h('span', null, `${thresholdText} · ${state}${rule.last_triggered_at ? ` · ${t('alerts.last')} ${fmtRelative(rule.last_triggered_at)}` : ''}`),
          rule.note ? h('span', null, rule.note) : null),
        h('div', { className: 'mm-alert-rule-actions' },
          h(Toggle, { checked: Boolean(rule.enabled), onChange: (next) => onToggle(rule, next), label: `${t('alerts.rule')} ${rule.symbol}` }),
          h('button', {
            type: 'button',
            className: 'mm-btn is-ghost is-icon',
            'aria-label': t('alerts.delete'),
            title: t('alerts.delete'),
            onClick: () => onDelete(rule),
          }, h(Icon, { name: 'trash', size: 13 }))));
    }

    function AlertsPanel({ t, rules, events, onToggle, onDelete, onCreate, onAck, onAckAll }) {
      const unacked = events.filter((event) => !event.acknowledged);
      return h(React.Fragment, null,
        h('div', { className: 'mm-section-title' },
          h(Icon, { name: 'bell', size: 13 }),
          h('span', null, t('alerts.rule')),
          h('span', { className: 'mm-spacer' }),
          h('button', { type: 'button', className: 'mm-btn is-primary', onClick: onCreate }, h(Icon, { name: 'plus', size: 13 }), t('alerts.create'))),
        rules.length === 0
          ? h(EmptyState, { title: t('alerts.empty'), hint: t('alerts.emptyHint') })
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } }, rules.map((rule) => h(AlertRuleRow, {
            key: rule.id,
            t,
            rule,
            onToggle,
            onDelete,
          }))),
        h('div', { className: 'mm-section-title' },
          h('span', null, t('alerts.events')),
          h('span', { className: 'mm-spacer' }),
          unacked.length > 0
            ? h('button', { type: 'button', className: 'mm-btn is-ghost', onClick: onAckAll }, h(Icon, { name: 'check', size: 13 }), t('alerts.ackAll'))
            : null),
        events.length === 0
          ? h(EmptyState, { title: t('alerts.noEvents'), hint: t('alerts.noEventsHint') })
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } }, events.map((event) => h('div', {
            key: event.id,
            className: `mm-event${event.acknowledged ? '' : ' is-new'}`,
          },
          h('span', { className: `mm-severity is-${event.severity ?? 'info'}` }),
          h('div', { className: 'mm-event-main' },
            h('strong', null, event.message),
            h('span', null, `${fmtClock(event.ts)} · ${event.symbol}`)),
          event.acknowledged
            ? h(Icon, { name: 'check', size: 13, className: 'mm-flat' })
            : h('button', {
              type: 'button',
              className: 'mm-btn is-ghost is-icon',
              'aria-label': t('alerts.ack'),
              title: t('alerts.ack'),
              onClick: () => onAck(event),
            }, h(Icon, { name: 'check', size: 13 }))))),
      );
    }

    function PortfolioPanel({ t, portfolio, onSetPosition, onDelete, symbolSuggestions }) {
      const [symbol, setSymbol] = useState('');
      const [quantity, setQuantity] = useState('');
      const [avgCost, setAvgCost] = useState('');
      const [error, setError] = useState('');
      const [saving, setSaving] = useState(false);
      const positions = portfolio?.positions ?? [];
      const totals = portfolio?.totals ?? {};
      const currency = portfolio?.currency ?? 'USD';
      const submit = async (event) => {
        event.preventDefault();
        const qty = Number(quantity);
        const cost = Number(avgCost);
        if (!(qty > 0) || !Number.isFinite(cost) || cost <= 0 || symbol.trim() === '') {
          setError(t('portfolio.invalid'));
          return;
        }
        setError('');
        setSaving(true);
        try {
          await onSetPosition({ symbol: symbol.trim().toUpperCase(), quantity: qty, avg_cost: cost });
          setSymbol('');
          setQuantity('');
          setAvgCost('');
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
        } finally {
          setSaving(false);
        }
      };
      return h(React.Fragment, null,
        h('div', { className: 'mm-portfolio-totals' },
          h(StatBox, { label: t('portfolio.value'), value: fmtMoney(totals.market_value, currency) }),
          h(StatBox, { label: t('portfolio.cost'), value: fmtMoney(totals.cost_basis, currency) }),
          h(StatBox, {
            label: t('portfolio.pnl'),
            value: `${fmtSignedMoney(totals.unrealized_pnl, currency)} (${fmtPct(totals.unrealized_pnl_pct)})`,
            tone: signClass(totals.unrealized_pnl),
          }),
          h(StatBox, {
            label: t('portfolio.day'),
            value: `${fmtSignedMoney(totals.day_change, currency)} (${fmtPct(totals.day_change_pct)})`,
            tone: signClass(totals.day_change),
          })),
        positions.length === 0
          ? h(EmptyState, { title: t('portfolio.empty'), hint: t('portfolio.emptyHint') })
          : h('div', { className: 'mm-card mm-table-scroll' },
            h('table', { className: 'mm-table mm-table-wide' },
              h('thead', null, h('tr', null,
                h('th', null, t('table.symbol')),
                h('th', null, t('portfolio.qty')),
                h('th', null, t('portfolio.avgCost')),
                h('th', null, t('portfolio.price')),
                h('th', null, t('portfolio.value')),
                h('th', null, t('portfolio.pnl')),
                h('th', null, t('portfolio.weight')),
                h('th', null, ''))),
              h('tbody', null, positions.map((position) => h('tr', { key: position.symbol },
                h('td', null, h('strong', null, position.symbol)),
                h('td', null, fmtNum(position.quantity, 4)),
                h('td', null, fmtNum(position.avg_cost)),
                h('td', null, fmtNum(position.price)),
                h('td', null, fmtNum(position.market_value)),
                h('td', { className: signClass(position.unrealized_pnl) }, `${fmtSignedMoney(position.unrealized_pnl, currency)} (${fmtPct(position.unrealized_pnl_pct)})`),
                h('td', null, fmtPct(position.weight_pct, false)),
                h('td', null, h('button', {
                  type: 'button',
                  className: 'mm-btn is-ghost is-icon',
                  'aria-label': t('portfolio.remove'),
                  title: t('portfolio.remove'),
                  onClick: () => onDelete(position),
                }, h(Icon, { name: 'trash', size: 13 })))))))),
        h('form', { className: 'mm-card mm-card-body mm-form', onSubmit: submit },
          h('div', { className: 'mm-section-title' }, h(Icon, { name: 'wallet', size: 13 }), h('span', null, t('portfolio.add'))),
          h('div', { className: 'mm-form-row' },
            h('label', { className: 'mm-field' },
              h('span', null, t('portfolio.symbol')),
              h('input', {
                className: 'mm-input',
                value: symbol,
                list: 'mm-symbols',
                placeholder: 'AAPL',
                onChange: (event) => setSymbol(event.target.value.toUpperCase()),
              })),
            h('label', { className: 'mm-field', style: { flexBasis: 90 } },
              h('span', null, t('portfolio.qty')),
              h('input', { className: 'mm-input', value: quantity, inputMode: 'decimal', placeholder: '10', onChange: (event) => setQuantity(event.target.value) })),
            h('label', { className: 'mm-field', style: { flexBasis: 110 } },
              h('span', null, t('portfolio.avgCost')),
              h('input', { className: 'mm-input', value: avgCost, inputMode: 'decimal', placeholder: '180.5', onChange: (event) => setAvgCost(event.target.value) })),
            h('button', { type: 'submit', className: 'mm-btn is-primary', disabled: saving },
              saving ? h(Spinner, { size: 13 }) : h(Icon, { name: 'plus', size: 13 }), t('add'))),
          h('datalist', { id: 'mm-symbols' }, symbolSuggestions.map((item) => h('option', { key: item.symbol, value: item.symbol }))),
          error ? h('span', { className: 'mm-error-text' }, error) : null));
    }

    function ScreenerPanel({ t, scan, onPreset, onRetry }) {
      const rows = Array.isArray(scan.data?.rows) ? scan.data.rows : [];
      return h(React.Fragment, null,
        h('div', { className: 'mm-section-title' },
          h(Icon, { name: 'search', size: 13 }),
          h('span', null, t('screener')),
          h('span', { className: 'mm-spacer' }),
          scan.data?.as_of ? h('span', { className: 'mm-hint' }, `${t('status.updated')} ${fmtClock(scan.data.as_of)}`) : null),
        h('div', { className: 'mm-chips', role: 'group', 'aria-label': t('screener.preset') },
          PRESETS.map((preset) => h('button', {
            key: preset,
            type: 'button',
            className: `mm-toggle-chip${scan.preset === preset ? ' is-on' : ''}`,
            'aria-pressed': scan.preset === preset ? 'true' : 'false',
            onClick: () => onPreset(preset),
          }, t(`preset.${preset}`)))),
        scan.phase === 'loading'
          ? h('div', { className: 'mm-loading-row' }, h(Spinner, { size: 14 }), h('span', null, t('screener.loading')))
          : scan.phase === 'error'
            ? h(EmptyState, {
              title: t('analysis.error'),
              hint: scan.error,
              action: h('button', { type: 'button', className: 'mm-btn', onClick: onRetry }, t('chart.retry')),
            })
            : rows.length === 0
              ? h(EmptyState, { title: t('screener.empty'), hint: t('screener.scope') })
              : h('div', { className: 'mm-card mm-table-scroll' },
                h('table', { className: 'mm-table mm-table-scan' },
                  h('thead', null, h('tr', null,
                    h('th', null, '#'),
                    h('th', null, t('screener.symbol')),
                    h('th', null, t('screener.price')),
                    h('th', null, t('screener.change')),
                    h('th', null, t('screener.rsi')),
                    h('th', null, t('screener.trend')),
                    h('th', null, t('screener.score')))),
                  h('tbody', null, rows.map((row, index) => h('tr', { key: row.symbol },
                    h('td', null, String(index + 1)),
                    h('td', null, h('strong', null, row.symbol)),
                    h('td', null, fmtNum(row.price)),
                    h('td', { className: signClass(row.change_pct) }, fmtPct(row.change_pct)),
                    h('td', null, fmtNum(row.rsi14, 1)),
                    h('td', null, t(`trend.${row.trend ?? 'sideways'}`)),
                    h('td', { className: signClass(row.score) }, fmtNum(row.score))))))),
        scan.data?.scope ? h('div', { className: 'mm-hint' }, `${t('screener.scope')}: ${scan.data.scope}`) : null);
    }

    function NewsEntityChips({ t, entities, onOpenEntity }) {
      const links = Array.isArray(entities) ? entities : [];
      if (links.length === 0) return null;
      return h('div', { className: 'mm-entity-row' }, links.slice(0, 8).map((entity) => {
        const label = entity.symbol || entity.entity_id;
        if (!entity.symbol) {
          return h('span', {
            key: `${entity.entity_type}:${entity.entity_id}`,
            className: 'mm-entity-chip is-static',
            title: `${entity.label || entity.entity_id} · ${t('data.notFollowed')}`,
          }, label);
        }
        return h('button', {
          key: `${entity.entity_type}:${entity.entity_id}`,
          type: 'button',
          className: 'mm-entity-chip',
          title: entity.label ? `${entity.label} (${entity.symbol})` : entity.symbol,
          'aria-label': entity.label ? `${entity.label} (${entity.symbol})` : entity.symbol,
          onClick: () => onOpenEntity(entity),
        }, label);
      }));
    }

    function NewsItem({ t, article, onOpenEntity }) {
      const articleUrl = typeof article.url === 'string' && /^https?:\/\//i.test(article.url) ? article.url : '';
      const preview = typeof article.content === 'string'
        ? article.content.replace(/\s+/g, ' ').trim()
        : '';
      return h('article', { className: 'mm-news-item' },
        h('div', { className: 'mm-news-meta' },
          h('span', null, `${fmtWhen(article.published_at)} · ${article.source_id ?? ''}`),
          h('span', { className: 'mm-spacer' }),
          articleUrl
            ? h('a', {
              className: 'mm-news-link',
              href: articleUrl,
              target: '_blank',
              rel: 'noopener noreferrer',
              'aria-label': `${t('data.openArticle')}: ${article.title ?? ''}`,
            }, t('data.openArticle'))
            : null),
        h('strong', null, article.title ?? '—'),
        preview ? h('p', { className: 'mm-news-summary' }, preview.length > 240 ? `${preview.slice(0, 240)}…` : preview) : null,
        h(NewsEntityChips, { t, entities: article.entities, onOpenEntity }));
    }

    function sourceStateLabel(t, source) {
      if (Number(source.circuit_open_in_s ?? 0) > 0) return { label: t('data.cooling'), className: 'mm-down' };
      if (Number(source.remaining_day ?? 1) === 0) return { label: t('data.budgetSpent'), className: 'mm-down' };
      if (source.last_error) return { label: t('data.blocked'), className: 'mm-down' };
      return { label: t('data.ok'), className: 'mm-flat' };
    }

    function DataPanel({ t, coverage, status, news, indexOverview, indexChanges, china, phase, error, busy, indexBusy, updatedAt, onCollect, onIndexRefresh, onChinaRefresh, onOpenEntity, onRetry }) {
      const domains = coverage?.domains ?? {};
      const reference = domains.reference ?? {};
      const market = domains.market ?? {};
      const newsDomain = domains.news ?? {};
      const tracked = coverage?.tracked ?? status?.tracked ?? {};
      const sources = Array.isArray(status?.sources) ? status.sources : [];
      const jobs = Array.isArray(status?.jobs) ? status.jobs : [];
      const articles = Array.isArray(news) ? news : [];
      const enabled = status?.enabled !== false;
      const empty = (reference.instruments ?? 0) === 0
        && (market.bars ?? 0) === 0
        && (newsDomain.articles ?? 0) === 0;
      const lastCycle = status?.last_cycle?.at ? status.last_cycle.at : '';
      const cycleJobs = Array.isArray(status?.last_cycle?.jobs) ? status.last_cycle.jobs.length : 0;
      const indices = Array.isArray(indexOverview?.indices) ? indexOverview.indices : [];
      const companyIndex = indices.find((index) => index.index_id === 'company:master') ?? indices[0] ?? null;
      const indexStats = companyIndex?.stats ?? {};
      const indexMarkets = Object.entries(indexStats.by_market ?? {}).slice(0, 8);
      const changes = Array.isArray(indexChanges) ? indexChanges.slice(0, 5) : [];
      const chinaSecurities = china?.securities?.stats ?? {};
      const chinaCommodities = china?.commodities?.stats ?? {};
      const chinaStocks = Number(chinaSecurities.by_type?.stock ?? 0);
      const chinaFunds = Number(chinaSecurities.by_type?.etf ?? 0);
      const chinaTopStocks = Array.isArray(china?.top_stocks) ? china.top_stocks.slice(0, 5) : [];
      const chinaTopCommodities = Array.isArray(china?.top_commodities) ? china.top_commodities.slice(0, 5) : [];

      if ((phase === 'loading' || phase === 'idle') && !coverage) {
        return h('div', { className: 'mm-loading-row' }, h(Spinner, { size: 14 }), h('span', null, t('data.loading')));
      }

      return h(React.Fragment, null,
        h('div', { className: 'mm-section-title' },
          h(Icon, { name: 'database', size: 13 }),
          h('span', null, t('data.coverage')),
          h('span', { className: 'mm-spacer' }),
          h('button', {
            type: 'button',
            className: 'mm-btn is-primary',
            disabled: busy || !enabled,
            onClick: onCollect,
          }, busy ? h(Spinner, { size: 13 }) : h(Icon, { name: 'refresh', size: 13 }), t('data.refresh'))),
        h('div', { className: 'mm-data-updated', 'aria-live': 'polite' },
          h('span', null, `${t('data.updated')} ${fmtWhen(updatedAt)}`),
          h('span', { className: 'mm-spacer' }),
          lastCycle
            ? h('span', null, `${t('data.lastCycle')} ${fmtWhen(lastCycle)} · ${cycleJobs}`)
            : null),
        h('div', { className: 'mm-hint' }, t('data.collectHint')),
        status?.storage?.paths?.data_dir
          ? h('div', { className: 'mm-hint' },
            `${t('data.storage')}: ${status.storage.platform} · ${status.storage.paths.data_dir}`)
          : null,
        !enabled ? h('div', { className: 'mm-hint mm-down' }, t('data.disabled')) : null,
        phase === 'error'
          ? h('div', { className: 'mm-data-error' },
            h(Icon, { name: 'close', size: 13 }),
            h('span', null, error || t('data.retryFailed')),
            h('button', { type: 'button', className: 'mm-btn is-ghost', onClick: onRetry }, t('chart.retry')))
          : null,
        empty
          ? h(EmptyState, { title: t('data.empty'), hint: t('data.emptyHint') })
          : h(React.Fragment, null,
            h('div', { className: 'mm-hint' }, t('data.explainer')),
            h('div', { className: 'mm-data-grid' },
              h('div', { className: 'mm-data-card' },
                h('h4', null, t('data.reference')),
                h('dl', null,
                  h('dt', null, t('data.instruments')),
                  h('dd', null, fmtCompact(reference.instruments ?? 0)),
                  h('dt', null, t('data.exchanges')),
                  h('dd', null, fmtCompact(reference.exchanges ?? 0)),
                  h('dt', null, t('data.indices')),
                  h('dd', null, fmtCompact(reference.indices ?? 0)),
                  h('dt', null, t('data.commodities')),
                  h('dd', null, fmtCompact(reference.commodity_roots ?? 0)))),
              h('div', { className: 'mm-data-card' },
                h('h4', null, t('data.market')),
                h('dl', null,
                  h('dt', null, t('data.bars')),
                  h('dd', null, fmtCompact(market.bars ?? 0)),
                  h('dt', null, t('data.quotes')),
                  h('dd', null, fmtCompact(market.series ?? 0)),
                  h('dt', null, t('data.latestBar')),
                  h('dd', null, fmtWhen(market.latest_bar_ts)))),
              h('div', { className: 'mm-data-card' },
                h('h4', null, t('data.news')),
                h('dl', null,
                  h('dt', null, t('data.articles')),
                  h('dd', null, fmtCompact(newsDomain.articles ?? 0)),
                  h('dt', null, t('data.newsLinks')),
                  h('dd', null, fmtCompact(newsDomain.entity_links ?? 0)),
                  h('dt', null, t('data.latestArticle')),
                  h('dd', null, fmtWhen(newsDomain.latest_published_at))))),
            ),
            h(React.Fragment, null,
            h('div', { className: 'mm-hint' },
              `${t('data.tracked')}: ${t('data.trackedLive')} ${tracked.live ?? 0} · ${t('data.trackedEod')} ${tracked.eod ?? 0}`),
            h('div', { className: 'mm-card' },
              h('div', { className: 'mm-card-head' },
                h('h3', null, t('data.companyIndex')),
                h('span', { className: 'mm-spacer' }),
                h('button', {
                  type: 'button',
                  className: 'mm-btn is-ghost',
                  disabled: indexBusy || !enabled,
                  onClick: onIndexRefresh,
                }, indexBusy ? h(Spinner, { size: 12 }) : h(Icon, { name: 'refresh', size: 12 }), t('data.indexRebuild'))),
              companyIndex
                ? h('div', { className: 'mm-card-body' },
                  h('dl', { className: 'mm-kv', style: { margin: 0 } },
                    h('dt', null, t('data.indexActive')),
                    h('dd', null, fmtCompact(indexStats.active ?? 0)),
                    h('dt', null, t('data.indexTotal')),
                    h('dd', null, fmtCompact(indexStats.total ?? 0)),
                    h('dt', null, t('data.indexPending')),
                    h('dd', null, fmtCompact(indexStats.pending_profiles ?? 0)),
                    h('dt', null, t('data.indexDelisted')),
                    h('dd', null, fmtCompact(indexStats.delisted ?? 0)),
                    h('dt', null, t('data.indexRevision')),
                    h('dd', null, String(companyIndex.revision ?? 0)),
                    h('dt', null, t('data.indexLastRefresh')),
                    h('dd', null, fmtWhen(companyIndex.last_refresh_at))),
                  indexMarkets.length > 0
                    ? h('div', { className: 'mm-hint' },
                      `${t('data.indexMarkets')}: ${indexMarkets.map(([mic, count]) => `${mic} ${fmtCompact(count)}`).join(' · ')}`)
                    : null,
                  h('div', { className: 'mm-section-title', style: { marginTop: 8 } },
                    h('span', null, t('data.indexChanges'))),
                  changes.length === 0
                    ? h('div', { className: 'mm-hint' }, t('data.indexNoChanges'))
                    : h('div', null, changes.map((change) => h('div', { key: `${change.change_id}-${change.entry_key}`, className: 'mm-index-change' },
                      h('span', { className: `mm-index-change-type${change.change_type === 'removed' || change.change_type === 'delisted' ? ' is-down' : change.change_type === 'added' || change.change_type === 'restored' ? ' is-up' : ''}` },
                        t(`data.change.${change.change_type}`)),
                      h('span', { className: 'mm-index-change-entity', title: change.entity_id ?? change.entry_key }, change.entity_id ?? change.entry_key),
                      h('span', { className: 'mm-spacer' }),
                      h('span', { className: 'mm-hint' }, fmtWhen(change.observed_at))))))
                : h('div', { className: 'mm-card-body mm-hint' }, t('data.indexEmpty'))),
            h('div', { className: 'mm-card' },
              h('div', { className: 'mm-card-head' },
                h('h3', null, t('data.chinaMarket')),
                h('span', { className: 'mm-spacer' }),
                h('button', {
                  type: 'button',
                  className: 'mm-btn is-ghost',
                  disabled: indexBusy || !enabled,
                  onClick: onChinaRefresh,
                }, indexBusy ? h(Spinner, { size: 12 }) : h(Icon, { name: 'refresh', size: 12 }), t('data.indexRebuild'))),
              china?.securities?.ready || china?.commodities?.ready
                ? h('div', { className: 'mm-card-body' },
                  h('dl', { className: 'mm-kv', style: { margin: 0 } },
                    h('dt', null, t('data.chinaStocks')),
                    h('dd', null, fmtCompact(chinaStocks)),
                    h('dt', null, t('data.chinaFunds')),
                    h('dd', null, fmtCompact(chinaFunds)),
                    h('dt', null, t('data.chinaCommodities')),
                    h('dd', null, fmtCompact(chinaCommodities.active ?? 0))),
                  chinaTopStocks.length > 0
                    ? h('div', { className: 'mm-section-title', style: { marginTop: 8 } },
                      h('span', null, t('data.chinaTopStocks')))
                    : null,
                  chinaTopStocks.map((row) => h('div', { key: row.entity_id, className: 'mm-index-change' },
                    h('span', { className: 'mm-index-change-entity' }, `${row.symbol ?? ''} · ${row.name ?? ''}`),
                    h('span', { className: 'mm-spacer' }),
                    h('span', { className: signClass(row.change_pct) }, fmtPct(row.change_pct)))),
                  chinaTopCommodities.length > 0
                    ? h('div', { className: 'mm-section-title', style: { marginTop: 8 } },
                      h('span', null, t('data.chinaTopCommodities')))
                    : null,
                  chinaTopCommodities.map((row) => h('div', { key: row.root_id, className: 'mm-index-change' },
                    h('span', { className: 'mm-index-change-entity' }, `${row.symbol ?? ''} · ${row.name ?? ''}`),
                    h('span', { className: 'mm-spacer' }),
                    h('span', { className: signClass(row.change_pct) }, fmtPct(row.change_pct)))))
                : h('div', { className: 'mm-card-body mm-hint' }, t('data.chinaEmpty'))),
            h('div', { className: 'mm-card' },
              h('div', { className: 'mm-card-head' },
                h('h3', null, t('data.sources')),
                h('span', { className: 'mm-spacer' }),
                h('span', { className: 'mm-hint' }, String(sources.length))),
              sources.length === 0
                ? h('div', { className: 'mm-card-body mm-hint' }, t('data.noSources'))
                : h('div', { className: 'mm-data-scroll' },
                  h('table', { className: 'mm-table', 'aria-label': t('data.sourceList') },
                    h('thead', null, h('tr', null,
                      h('th', { scope: 'col' }, 'ID'),
                      h('th', { scope: 'col' }, t('data.budget')),
                      h('th', { scope: 'col' }, t('data.state')))),
                    h('tbody', null, sources.map((source) => {
                      const state = sourceStateLabel(t, source);
                      return h('tr', { key: source.source_id, title: source.last_error || source.source_id },
                        h('td', null, source.name || source.source_id),
                        h('td', null, `${source.used_day ?? 0}/${source.max_per_day ?? 0}`),
                        h('td', { className: state.className }, state.label));
                    }))))),
            h('div', { className: 'mm-card' },
              h('div', { className: 'mm-card-head' },
                h('h3', null, t('data.jobs')),
                h('span', { className: 'mm-spacer' }),
                h('span', { className: 'mm-hint' }, String(jobs.length))),
              jobs.length === 0
                ? h('div', { className: 'mm-card-body mm-hint' }, t('data.noJobs'))
                : h('div', { className: 'mm-data-scroll' },
                  h('table', { className: 'mm-table', 'aria-label': t('data.jobList') },
                    h('thead', null, h('tr', null,
                      h('th', { scope: 'col' }, t('data.job')),
                      h('th', { scope: 'col' }, t('data.lastRun')),
                      h('th', { scope: 'col' }, t('data.nextDue')),
                      h('th', { scope: 'col' }, t('data.state')))),
                    h('tbody', null, jobs.map((job) => h('tr', { key: job.job_id, title: job.description || job.job_id },
                      h('td', null, job.job_id),
                      h('td', null, job.last_run_at ? fmtWhen(job.last_run_at) : '—'),
                      h('td', null, job.next_due_at ? fmtWhen(job.next_due_at) : '—'),
                      h('td', { className: job.last_status === 'partial' || job.last_status === 'error' ? 'mm-down' : 'mm-flat' },
                        job.last_status || (job.due ? t('data.due') : '—')))))))),
            h('div', { className: 'mm-section-title' },
              h('span', null, t('data.news')),
              h('span', { className: 'mm-spacer' }),
              h('span', { className: 'mm-hint' }, fmtCompact(newsDomain.articles ?? 0)))),
        articles.length === 0
          ? h(EmptyState, { title: t('data.noNews'), hint: t('data.relatedHint') })
          : h('div', null, articles.slice(0, 12).map((article) => h(NewsItem, {
            key: article.article_id,
            t,
            article,
            onOpenEntity,
          }))));
    }
    function SettingsModal({ t, initial, hostInfo, meta, onClose, onSave, onRestart }) {
      const [provider, setProvider] = useState(initial?.provider ?? 'auto');
      const [poll, setPoll] = useState(String(initial?.poll_seconds ?? 15));
      const [benchmark, setBenchmark] = useState(initial?.benchmark ?? '^GSPC');
      const [saving, setSaving] = useState(false);
      const [restarting, setRestarting] = useState(false);
      const [error, setError] = useState('');
      const status = hostInfo?.status ?? {};
      const submit = async () => {
        const pollSeconds = Number(poll);
        if (!Number.isFinite(pollSeconds) || pollSeconds < 5 || pollSeconds > 3600) {
          setError(`${t('settings.poll')}: 5–3600`);
          return;
        }
        setSaving(true);
        setError('');
        try {
          await onSave({
            provider,
            poll_seconds: Math.round(pollSeconds),
            benchmark: benchmark.trim().toUpperCase() || '^GSPC',
          });
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
        } finally {
          setSaving(false);
        }
      };
      return h(Modal, {
        title: t('settings.title'),
        onClose,
        t,
        wide: true,
        footer: h(React.Fragment, null,
          h('button', { type: 'button', className: 'mm-btn', onClick: onClose }, t('settings.cancel')),
          h('button', { type: 'button', className: 'mm-btn is-primary', disabled: saving, onClick: submit }, saving ? h(Spinner, { size: 13 }) : null, t('settings.save'))),
      },
      h('div', { className: 'mm-section-title' }, h('span', null, t('settings.provider'))),
      h('div', { className: 'mm-radio-cards', role: 'radiogroup', 'aria-label': t('settings.provider') },
        PROVIDERS.map((item) => h('button', {
          key: item,
          type: 'button',
          role: 'radio',
          'aria-checked': provider === item ? 'true' : 'false',
          className: `mm-radio-card${provider === item ? ' is-active' : ''}`,
          onClick: () => setProvider(item),
        },
        h('i', null),
        h('div', null,
          h('strong', null, t(`settings.provider.${item}`)),
          h('span', null, t(`settings.provider.${item}.hint`)))))),
      provider === 'yahoo' ? h('p', { className: 'mm-hint' }, t('settings.yahooNote')) : null,
      h('label', { className: 'mm-field' },
        h('span', null, t('settings.poll')),
        h('input', { className: 'mm-input', value: poll, inputMode: 'numeric', onChange: (event) => setPoll(event.target.value.replace(/[^0-9]/g, '')) })),
      h('p', { className: 'mm-hint' }, t('settings.pollHint')),
      h('label', { className: 'mm-field' },
        h('span', null, t('settings.benchmark')),
        h('input', { className: 'mm-input', value: benchmark, onChange: (event) => setBenchmark(event.target.value.toUpperCase()) })),
      error ? h('span', { className: 'mm-error-text' }, error) : null,
      h('div', { className: 'mm-section-title' }, h('span', null, t('settings.engine'))),
      h('dl', { className: 'mm-kv', style: { margin: 0 } },
        h('dt', null, t('status.engine')),
        h('dd', null, `v${meta?.version ?? '—'} · ${status.pythonVersion ? `Python ${status.pythonVersion}` : '—'}`),
        h('dt', null, t('settings.python')),
        h('dd', { style: { wordBreak: 'break-all', textAlign: 'right', maxWidth: 340 } }, status.python || '—'),
        h('dt', null, t('settings.dataDir')),
        h('dd', { style: { wordBreak: 'break-all', textAlign: 'right', maxWidth: 340 } }, status.dataDir || '—'),
        h('dt', null, t('settings.runtime')),
        h('dd', null, status.state === 'ready' ? `127.0.0.1:${status.port}` : status.state || '—')),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', {
          type: 'button',
          className: 'mm-btn',
          disabled: restarting,
          onClick: async () => {
            setRestarting(true);
            try {
              await onRestart();
            } catch (failure) {
              setError(failure instanceof Error ? failure.message : String(failure));
            } finally {
              setRestarting(false);
            }
          },
        }, restarting ? h(Spinner, { size: 13 }) : h(Icon, { name: 'refresh', size: 13 }), t('settings.restart'))));
    }

    function AddSymbolModal({ t, onClose, onAdd, initialQuery = '' }) {
      const [query, setQuery] = useState(initialQuery);
      const [results, setResults] = useState([]);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState('');
      const [adding, setAdding] = useState('');
      useEffect(() => {
        const text = query.trim();
        if (text === '') {
          setResults([]);
          setLoading(false);
          return undefined;
        }
        let cancelled = false;
        setLoading(true);
        const timer = window.setTimeout(() => {
          api.catalog(text)
            .then((payload) => {
              if (!cancelled) setResults(Array.isArray(payload.items) ? payload.items : []);
            })
            .catch((failure) => {
              if (!cancelled) setError(failure instanceof Error ? failure.message : String(failure));
            })
            .finally(() => {
              if (!cancelled) setLoading(false);
            });
        }, 220);
        return () => {
          cancelled = true;
          window.clearTimeout(timer);
        };
      }, [query]);
      const add = async (symbol) => {
        if (adding !== '') return;
        setAdding(symbol);
        setError('');
        try {
          await onAdd(symbol);
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
          setAdding('');
        }
      };
      return h(Modal, {
        title: t('watchlist.add'),
        onClose,
        t,
        footer: h('button', { type: 'button', className: 'mm-btn', onClick: onClose }, t('close')),
      },
      h('label', { className: 'mm-field' },
        h('span', null, t('watchlist.search')),
        h('input', {
          className: 'mm-input',
          value: query,
          'data-autofocus': 'true',
          placeholder: t('watchlist.searchHint'),
          onChange: (event) => setQuery(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter' && query.trim() !== '') {
              event.preventDefault();
              void add(query.trim().toUpperCase());
            }
          },
        })),
      error ? h('span', { className: 'mm-error-text' }, error) : null,
      loading ? h('div', { className: 'mm-loading-row' }, h(Spinner, { size: 13 }), t('loading')) : null,
      h('div', { className: 'mm-search-results' },
        results.map((item) => h('button', {
          key: item.symbol,
          type: 'button',
          className: 'mm-search-row',
          onClick: () => void add(item.symbol),
        },
        h('strong', null, item.symbol),
        h('span', null, `${item.name ?? ''} ${item.exchange ? `· ${item.exchange}` : ''}`),
        h('em', null, item.type ?? ''))),
        query.trim() !== '' && !loading && results.length === 0
          ? h('button', { type: 'button', className: 'mm-search-row', onClick: () => void add(query.trim().toUpperCase()) },
            h('strong', null, query.trim().toUpperCase()),
            h('span', null, t('watchlist.noResults')),
            h('em', null, t('watchlist.addTyped')))
          : null));
    }

    function AlertCreateModal({ t, initialSymbol, suggestions, onClose, onCreate }) {
      const [symbol, setSymbol] = useState(initialSymbol ?? '');
      const [kind, setKind] = useState('price_above');
      const [threshold, setThreshold] = useState('');
      const [direction, setDirection] = useState('golden');
      const [note, setNote] = useState('');
      const [error, setError] = useState('');
      const [saving, setSaving] = useState(false);
      const submit = async () => {
        const value = kind === 'ma_cross' ? 0 : Number(threshold);
        if (symbol.trim() === '') {
          setError(t('portfolio.symbol'));
          return;
        }
        if (kind !== 'ma_cross' && !Number.isFinite(value)) {
          setError(alertKindHint(t, kind) || t('alerts.threshold'));
          return;
        }
        setSaving(true);
        setError('');
        try {
          await onCreate({
            symbol: symbol.trim().toUpperCase(),
            kind,
            threshold: value,
            ...(kind === 'ma_cross' ? { params: { direction, fast: 20, slow: 50 } } : {}),
            ...(note.trim() !== '' ? { note: note.trim() } : {}),
          });
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
          setSaving(false);
        }
      };
      return h(Modal, {
        title: t('alerts.newTitle'),
        onClose,
        t,
        footer: h(React.Fragment, null,
          h('button', { type: 'button', className: 'mm-btn', onClick: onClose }, t('cancel')),
          h('button', { type: 'button', className: 'mm-btn is-primary', disabled: saving, onClick: submit }, saving ? h(Spinner, { size: 13 }) : null, t('alerts.createAction'))),
      },
      h('div', { className: 'mm-form-row' },
        h('label', { className: 'mm-field' },
          h('span', null, t('portfolio.symbol')),
          h('input', { className: 'mm-input', value: symbol, list: 'mm-alert-symbols', onChange: (event) => setSymbol(event.target.value.toUpperCase()) })),
        h('label', { className: 'mm-field' },
          h('span', null, t('alerts.kind')),
          h('select', { className: 'mm-select', value: kind, onChange: (event) => setKind(event.target.value) },
            ALERT_KINDS.map((item) => h('option', { key: item, value: item }, alertKindLabel(t, item)))))),
      kind === 'ma_cross'
        ? h('label', { className: 'mm-field' },
          h('span', null, t('alerts.direction')),
          h('select', { className: 'mm-select', value: direction, onChange: (event) => setDirection(event.target.value) },
            h('option', { value: 'golden' }, t('alerts.golden')),
            h('option', { value: 'death' }, t('alerts.death'))))
        : h('label', { className: 'mm-field' },
          h('span', null, t('alerts.threshold')),
          h('input', { className: 'mm-input', value: threshold, inputMode: 'decimal', placeholder: alertKindHint(t, kind), onChange: (event) => setThreshold(event.target.value) })),
      h('label', { className: 'mm-field' },
        h('span', null, t('alerts.note')),
        h('input', { className: 'mm-input', value: note, onChange: (event) => setNote(event.target.value) })),
      h('datalist', { id: 'mm-alert-symbols' }, suggestions.map((item) => h('option', { key: item.symbol, value: item.symbol }))),
      error ? h('span', { className: 'mm-error-text' }, error) : null);
    }

    function ConfirmDialog({ t, title, message, onCancel, onConfirm, danger = true }) {
      return h(Modal, {
        title,
        onClose: onCancel,
        t,
        footer: h(React.Fragment, null,
          h('button', { type: 'button', className: 'mm-btn', onClick: onCancel }, t('cancel')),
          h('button', { type: 'button', className: danger ? 'mm-btn is-danger' : 'mm-btn is-primary', onClick: onConfirm }, t('confirm'))),
      }, h('p', { className: 'mm-headline' }, message));
    }

    /* ------------------------------------------------------------------ panel */

    function MarketPage(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const [phase, setPhase] = useState('loading');
      const [bootError, setBootError] = useState('');
      const [hostInfo, setHostInfo] = useState(null);
      const [meta, setMeta] = useState(null);
      const [settings, setSettings] = useState(null);
      const [watchItems, setWatchItems] = useState([]);
      const [snapshot, setSnapshot] = useState(null);
      const [selected, setSelected] = useState(null);
      const [range, setRange] = useState('1D');
      const [chartStyle, setChartStyle] = useState('area');
      const [overlays, setOverlays] = useState({ sma20: true, sma50: true, bollinger: false, rsi: false });
      const [history, setHistory] = useState({ phase: 'loading', data: null, error: '' });
      const [analysis, setAnalysis] = useState({ phase: 'loading', data: null, error: '' });
      const [rules, setRules] = useState([]);
      const [events, setEvents] = useState([]);
      const [portfolio, setPortfolio] = useState(null);
      const [tab, setTab] = useState('analysis');
      const [autoRefresh, setAutoRefresh] = useState(true);
      const [engineOnline, setEngineOnline] = useState(true);
      const [lastSync, setLastSync] = useState(null);
      const [busy, setBusy] = useState('');
      const [modal, setModal] = useState(null);
      const [confirm, setConfirm] = useState(null);
      const [scan, setScan] = useState({ preset: 'gainers', phase: 'loading', data: null, error: '' });
      const [noticeDismissed, setNoticeDismissed] = useState(false);
      const [dataCoverage, setDataCoverage] = useState(null);
      const [dataStatus, setDataStatus] = useState(null);
      const [dataNews, setDataNews] = useState([]);
      const [dataIndexOverview, setDataIndexOverview] = useState(null);
      const [dataIndexChanges, setDataIndexChanges] = useState([]);
      const [dataChina, setDataChina] = useState(null);
      const [dataPhase, setDataPhase] = useState('idle');
      const [dataUpdatedAt, setDataUpdatedAt] = useState(null);
      const [dataError, setDataError] = useState('');
      const [relatedNews, setRelatedNews] = useState({ phase: 'idle', articles: [] });
      const [toasts, pushToast] = useToasts();
      const knownEventIds = useRef(new Set());
      const eventsInitialized = useRef(false);
      const polling = useRef(false);
      const historySeq = useRef(0);
      const dataTimersRef = useRef([]);
      const analysisSeq = useRef(0);
      const selectedRef = useRef(null);
      const rangeRef = useRef(range);
      selectedRef.current = selected;
      rangeRef.current = range;

      useLocaleSubscription(props.subscribeLocale);

      const quoteBySymbol = useMemo(() => {
        const map = new Map();
        for (const quote of snapshot?.quotes ?? []) map.set(quote.symbol, quote);
        return map;
      }, [snapshot]);
      const activeQuote = selected ? quoteBySymbol.get(selected) ?? null : null;
      const unacked = useMemo(() => events.filter((event) => !event.acknowledged).length, [events]);
      const suggestions = useMemo(() => {
        const items = watchItems.map((item) => ({ symbol: item.symbol, name: item.name ?? '' }));
        for (const quote of snapshot?.quotes ?? []) {
          if (!items.some((item) => item.symbol === quote.symbol)) items.push({ symbol: quote.symbol, name: quote.name ?? '' });
        }
        return items;
      }, [watchItems, snapshot]);

      const setHistoryPhase = useCallback((value) => setHistory(value), []);

      const loadHistory = useCallback(async (symbol, nextRange) => {
        if (!symbol) return;
        const seq = historySeq.current + 1;
        historySeq.current = seq;
        setHistoryPhase({ phase: 'loading', data: null, error: '' });
        try {
          const data = await api.history(symbol, nextRange);
          if (seq === historySeq.current) setHistoryPhase({ phase: 'ready', data, error: '' });
        } catch (failure) {
          if (seq === historySeq.current) {
            setHistoryPhase({ phase: 'error', data: null, error: failure instanceof Error ? failure.message : String(failure) });
          }
        }
      }, [setHistoryPhase]);

      const loadAnalysis = useCallback(async (symbol) => {
        if (!symbol) return;
        const seq = analysisSeq.current + 1;
        analysisSeq.current = seq;
        setAnalysis({ phase: 'loading', data: null, error: '' });
        try {
          const data = await api.analysis(symbol);
          if (seq === analysisSeq.current) setAnalysis({ phase: 'ready', data, error: '' });
        } catch (failure) {
          if (seq === analysisSeq.current) {
            setAnalysis({ phase: 'error', data: null, error: failure instanceof Error ? failure.message : String(failure) });
          }
        }
      }, []);

      const loadBoot = useCallback(async () => {
        setPhase('loading');
        setBootError('');
        let lastError = null;
        try {
          for (let attempt = 0; attempt < 24; attempt += 1) {
            try {
              await api.health();
              lastError = null;
              break;
            } catch (failure) {
              lastError = failure;
              await new Promise((resolve) => window.setTimeout(resolve, 1000));
            }
          }
          if (lastError) throw lastError;
          const [metaPayload, settingsPayload, watchPayload, snapshotPayload, alertsPayload, eventsPayload, portfolioPayload, hostPayload] = await Promise.all([
            api.meta(),
            api.settings(),
            api.watchlist(),
            api.snapshot(),
            api.alerts(),
            api.events(20),
            api.portfolio(),
            api.host(),
          ]);
          setMeta(metaPayload);
          setSettings(settingsPayload);
          setWatchItems(Array.isArray(watchPayload.items) ? watchPayload.items : []);
          setSnapshot(snapshotPayload);
          setRules(Array.isArray(alertsPayload.rules) ? alertsPayload.rules : []);
          setEvents(Array.isArray(eventsPayload.events) ? eventsPayload.events : []);
          setPortfolio(portfolioPayload);
          setHostInfo(hostPayload);
          knownEventIds.current = new Set((eventsPayload.events ?? []).map((event) => event.id));
          eventsInitialized.current = true;
          setLastSync(snapshotPayload?.as_of ?? null);
          const first = snapshotPayload?.quotes?.[0]?.symbol ?? watchPayload.items?.[0]?.symbol ?? null;
          setSelected((current) => current ?? first);
          setEngineOnline(true);
          setPhase('ready');
        } catch (failure) {
          let hostPayload = null;
          try {
            hostPayload = await api.host();
          } catch {
            hostPayload = null;
          }
          setHostInfo(hostPayload);
          setBootError(failure instanceof Error ? failure.message : String(failure));
          setPhase('error');
        }
      }, []);

      useEffect(() => {
        void loadBoot();
      }, [loadBoot]);

      const reloadWatchlist = useCallback(async () => {
        const [watchPayload, snapshotPayload] = await Promise.all([api.watchlist(), api.snapshot()]);
        setWatchItems(Array.isArray(watchPayload.items) ? watchPayload.items : []);
        setSnapshot(snapshotPayload);
        setLastSync(snapshotPayload?.as_of ?? null);
        return watchPayload;
      }, []);

      const reloadAlerts = useCallback(async () => {
        const [alertsPayload, eventsPayload] = await Promise.all([api.alerts(), api.events(20)]);
        setRules(Array.isArray(alertsPayload.rules) ? alertsPayload.rules : []);
        const nextEvents = Array.isArray(eventsPayload.events) ? eventsPayload.events : [];
        for (const event of nextEvents) knownEventIds.current.add(event.id);
        eventsInitialized.current = true;
        setEvents(nextEvents);
      }, []);

      const refreshLive = useCallback(async () => {
        if (polling.current) return;
        polling.current = true;
        try {
          const [snapshotPayload, eventsPayload, metaPayload] = await Promise.all([
            api.snapshot(),
            api.events(20),
            api.meta(),
          ]);
          setSnapshot(snapshotPayload);
          setLastSync(snapshotPayload?.as_of ?? null);
          setMeta(metaPayload);
          setEngineOnline(true);
          const nextEvents = Array.isArray(eventsPayload.events) ? eventsPayload.events : [];
          const fresh = nextEvents.filter((event) => !knownEventIds.current.has(event.id));
          for (const event of nextEvents) knownEventIds.current.add(event.id);
          setEvents(nextEvents);
          if (eventsInitialized.current && fresh.length > 0) {
            for (const event of fresh.slice(0, 3)) pushToast(`${event.symbol}: ${event.message}`, event.severity === 'critical' ? 'error' : 'info');
          }
          eventsInitialized.current = true;
        } catch {
          setEngineOnline(false);
        } finally {
          polling.current = false;
        }
      }, [pushToast]);

      useEffect(() => {
        if (phase !== 'ready' || !autoRefresh) return undefined;
        const delay = Math.max(5000, (settings?.poll_seconds ?? 15) * 1000);
        const timer = window.setInterval(() => {
          if (typeof document !== 'undefined' && document.hidden) return;
          void refreshLive();
        }, delay);
        const onVisible = () => {
          if (typeof document !== 'undefined' && !document.hidden) void refreshLive();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
          window.clearInterval(timer);
          document.removeEventListener('visibilitychange', onVisible);
        };
      }, [phase, autoRefresh, settings?.poll_seconds, refreshLive]);

      useEffect(() => {
        if (phase !== 'ready' || !selected) {
          setHistory({ phase: 'loading', data: null, error: '' });
          setAnalysis({ phase: 'loading', data: null, error: '' });
          return;
        }
        void loadAnalysis(selected);
      }, [phase, selected, loadAnalysis]);

      useEffect(() => {
        if (phase !== 'ready' || !selected) return;
        void loadHistory(selected, range);
      }, [range, phase, selected, loadHistory]);

      const loadScan = useCallback(async (preset) => {
        setScan({ preset, phase: 'loading', data: null, error: '' });
        try {
          const data = await api.screener(preset, 12);
          setScan({ preset, phase: 'ready', data, error: '' });
        } catch (failure) {
          setScan({ preset, phase: 'error', data: null, error: failure instanceof Error ? failure.message : String(failure) });
        }
      }, []);

      useEffect(() => {
        if (tab !== 'scan') return;
        void loadScan(scan.preset);
      }, [tab, scan.preset, loadScan]);

      const loadDataTab = useCallback(async (showSpinner = true) => {
        if (showSpinner) setDataPhase('loading');
        const results = await Promise.allSettled([
          api.dataCoverage(),
          api.dataStatus(),
          api.dataNews({ limit: '12' }),
          api.indexOverview(),
          api.indexChanges('company:master', 5),
          api.chinaOverview(),
        ]);
        const [coverageResult, statusResult, newsResult, indexResult, changesResult, chinaResult] = results;
        let failure = '';
        if (coverageResult.status === 'fulfilled') {
          setDataCoverage(coverageResult.value);
        } else {
          failure = coverageResult.reason instanceof Error ? coverageResult.reason.message : String(coverageResult.reason);
        }
        if (statusResult.status === 'fulfilled') setDataStatus(statusResult.value);
        if (newsResult.status === 'fulfilled') {
          setDataNews(Array.isArray(newsResult.value.articles) ? newsResult.value.articles : []);
        }
        if (indexResult.status === 'fulfilled') {
          setDataIndexOverview(indexResult.value);
        }
        if (changesResult.status === 'fulfilled') {
          setDataIndexChanges(Array.isArray(changesResult.value.changes) ? changesResult.value.changes : []);
        }
        if (chinaResult.status === 'fulfilled') setDataChina(chinaResult.value);
        if (failure !== '') {
          setDataError(failure);
          setDataPhase('error');
        } else {
          setDataError('');
          setDataPhase('ready');
          setDataUpdatedAt(Date.now());
        }
      }, []);

      const loadRelatedNews = useCallback(async (symbol) => {
        if (!symbol) {
          setRelatedNews({ phase: 'idle', articles: [] });
          return;
        }
        setRelatedNews((current) => ({ phase: 'loading', articles: current.articles ?? [] }));
        try {
          const payload = await api.dataNews({ symbol, limit: '4' });
          setRelatedNews({
            phase: 'ready',
            articles: Array.isArray(payload.articles) ? payload.articles : [],
          });
        } catch {
          setRelatedNews((current) => ({ phase: 'error', articles: current.articles ?? [] }));
        }
      }, []);

      useEffect(() => {
        if (tab !== 'data') return;
        void loadDataTab(true);
      }, [tab, loadDataTab]);

      useEffect(() => {
        void loadRelatedNews(selected);
      }, [selected, loadRelatedNews]);

      useEffect(() => () => {
        for (const timer of dataTimersRef.current) window.clearTimeout(timer);
      }, []);

      const onDataCollect = useCallback(async () => {
        setBusy('data');
        try {
          const result = await api.dataIngest({});
          if (result?.enabled === false) {
            pushToast(t('data.disabled'), 'error');
            return;
          }
          if (!result?.accepted) {
            pushToast(t('data.ingestFailed'), 'error');
            return;
          }
          pushToast(t('data.requested'));
          for (const delay of [2500, 8000]) {
            const timer = window.setTimeout(() => {
              void loadDataTab(false);
              if (selectedRef.current) void loadRelatedNews(selectedRef.current);
            }, delay);
            dataTimersRef.current.push(timer);
          }
        } catch (failure) {
          pushToast(failure instanceof Error ? failure.message : String(failure), 'error');
        } finally {
          setBusy('');
        }
      }, [loadDataTab, loadRelatedNews, pushToast, t]);

      const onIndexRefresh = useCallback(async () => {
        setBusy('index');
        try {
          const result = await api.indexRefresh('company:master');
          const details = result?.result?.details ?? {};
          const added = Number(details.added ?? 0);
          const updated = Number(details.updated ?? 0);
          pushToast(`${t('data.indexRebuild')} · ${t('data.change.added')} ${added} · ${t('data.change.updated')} ${updated}`);
          await loadDataTab(false);
        } catch (failure) {
          pushToast(failure instanceof Error ? failure.message : String(failure), 'error');
        } finally {
          setBusy('');
        }
      }, [loadDataTab, pushToast, t]);

      const onChinaRefresh = useCallback(async () => {
        setBusy('index');
        try {
          const result = await api.indexRefresh('china:securities');
          const details = result?.result?.details ?? {};
          pushToast(`${t('data.chinaMarket')} · ${t('data.indexRebuild')} · ${details.indices?.length ?? 0}`);
          await loadDataTab(false);
        } catch (failure) {
          pushToast(failure instanceof Error ? failure.message : String(failure), 'error');
        } finally {
          setBusy('');
        }
      }, [loadDataTab, pushToast, t]);

      const onOpenEntity = useCallback((entity) => {
        const symbol = String(entity?.symbol ?? '').trim().toUpperCase();
        if (symbol === '') {
          pushToast(t('data.notFollowed'), 'info');
          return;
        }
        const known = watchItems.some((item) => item.symbol === symbol) || quoteBySymbol.has(symbol);
        if (known) {
          setSelected(symbol);
          setTab('analysis');
        } else {
          setModal({ type: 'add', query: symbol });
        }
      }, [watchItems, quoteBySymbol, pushToast, t]);

      const onSelect = useCallback((symbol) => {
        setSelected(symbol);
      }, []);

      const onRemoveWatch = useCallback(async (symbol) => {
        try {
          await api.removeWatch(symbol);
          const payload = await reloadWatchlist();
          if (selectedRef.current === symbol) {
            const next = (payload.items ?? [])[0]?.symbol ?? null;
            setSelected(next);
          }
          pushToast(`${symbol} ${t('watchlist.removed')}`);
        } catch (failure) {
          pushToast(failure instanceof Error ? failure.message : String(failure), 'error');
        }
      }, [reloadWatchlist, pushToast, t]);

      const onToggleWatch = useCallback(async () => {
        if (!selected) return;
        const watched = watchItems.some((item) => item.symbol === selected);
        try {
          if (watched) {
            await api.removeWatch(selected);
          } else {
            await api.addWatch(selected);
          }
          await reloadWatchlist();
          pushToast(`${selected} ${watched ? t('watchlist.removed') : t('watchlist.added')}`);
        } catch (failure) {
          pushToast(failure instanceof Error ? failure.message : String(failure), 'error');
        }
      }, [selected, watchItems, reloadWatchlist, pushToast, t]);

      const onRefresh = useCallback(async () => {
        setBusy('refresh');
        try {
          const result = await api.sync();
          await reloadWatchlist();
          if (selectedRef.current) {
            await Promise.all([loadHistory(selectedRef.current, rangeRef.current), loadAnalysis(selectedRef.current)]);
          }
          const eventsPayload = await api.events(20);
          const nextEvents = Array.isArray(eventsPayload.events) ? eventsPayload.events : [];
          for (const event of nextEvents) knownEventIds.current.add(event.id);
          eventsInitialized.current = true;
          setEvents(nextEvents);
          for (const event of result.triggered ?? []) {
            pushToast(`${event.symbol}: ${event.message}`, event.severity === 'critical' ? 'error' : 'info');
          }
          pushToast(t('toast.synced'));
          setEngineOnline(true);
        } catch (failure) {
          pushToast(failure instanceof Error ? failure.message : String(failure), 'error');
          setEngineOnline(false);
        } finally {
          setBusy('');
        }
      }, [reloadWatchlist, loadHistory, loadAnalysis, pushToast, t]);

      const onCreateAlert = useCallback(async (payload) => {
        await api.createAlert(payload);
        await reloadAlerts();
        setModal(null);
        pushToast(t('alerts.created'));
      }, [reloadAlerts, pushToast, t]);

      const onToggleAlert = useCallback(async (rule, enabled) => {
        try {
          await api.updateAlert(rule.id, { enabled });
          await reloadAlerts();
        } catch (failure) {
          pushToast(failure instanceof Error ? failure.message : String(failure), 'error');
        }
      }, [reloadAlerts, pushToast]);

      const onDeleteAlert = useCallback((rule) => {
        setConfirm({
          title: t('alerts.delete'),
          message: `${rule.symbol} · ${alertKindLabel(t, rule.kind)} — ${t('alerts.deleteConfirm')}`,
          onConfirm: async () => {
            setConfirm(null);
            try {
              await api.deleteAlert(rule.id);
              await reloadAlerts();
              pushToast(t('alerts.deleted'));
            } catch (failure) {
              pushToast(failure instanceof Error ? failure.message : String(failure), 'error');
            }
          },
        });
      }, [reloadAlerts, pushToast, t]);

      const onAck = useCallback(async (event) => {
        try {
          await api.ack({ ids: [event.id] });
          await reloadAlerts();
          pushToast(t('alerts.acked'));
        } catch (failure) {
          pushToast(failure instanceof Error ? failure.message : String(failure), 'error');
        }
      }, [reloadAlerts, pushToast, t]);

      const onAckAll = useCallback(async () => {
        try {
          await api.ack({ all: true });
          await reloadAlerts();
          pushToast(t('alerts.ackedAll'));
        } catch (failure) {
          pushToast(failure instanceof Error ? failure.message : String(failure), 'error');
        }
      }, [reloadAlerts, pushToast, t]);

      const onSetPosition = useCallback(async (payload) => {
        try {
          await api.setPosition(payload);
          const portfolioPayload = await api.portfolio();
          setPortfolio(portfolioPayload);
          pushToast(t('portfolio.saved'));
        } catch (failure) {
          pushToast(failure instanceof Error ? failure.message : String(failure), 'error');
          throw failure;
        }
      }, [pushToast, t]);

      const onDeletePosition = useCallback((position) => {
        setConfirm({
          title: t('portfolio.remove'),
          message: `${position.symbol} — ${t('portfolio.removeConfirm')}`,
          onConfirm: async () => {
            setConfirm(null);
            try {
              await api.deletePosition(position.symbol);
              setPortfolio(await api.portfolio());
              pushToast(t('portfolio.removed'));
            } catch (failure) {
              pushToast(failure instanceof Error ? failure.message : String(failure), 'error');
            }
          },
        });
      }, [pushToast, t]);

      const onSaveSettings = useCallback(async (payload) => {
        const result = await api.updateSettings(payload);
        setSettings(result);
        setModal(null);
        pushToast(t('settings.saved'));
        try {
          const [metaPayload, hostPayload] = await Promise.all([api.meta(), api.host()]);
          setMeta(metaPayload);
          setHostInfo(hostPayload);
          await refreshLive();
        } catch {
          // The settings are saved even when a follow-up refresh fails.
        }
      }, [refreshLive, pushToast, t]);

      const onRestartEngine = useCallback(async () => {
        await api.restartHost();
        pushToast(t('settings.restarted'));
        await loadBoot();
      }, [loadBoot, pushToast, t]);

      const statusTone = !engineOnline
        ? 'error'
        : meta?.provider?.degraded
          ? 'warn'
          : meta?.provider?.live
            ? 'ok'
            : 'idle';
      const statusLabel = !engineOnline
        ? t('status.offline')
        : meta?.provider?.degraded
          ? t('status.degraded')
          : meta?.provider?.live
            ? t('status.live')
            : t('status.simulated');
      const provider = meta?.provider;
      const providerNotice = !provider
        ? ''
        : provider.degraded
          ? `${t('status.degradedHint')}${provider.last_error ? ` ${provider.last_error}` : ''}`
          : provider.mode === 'auto' && provider.active && provider.active !== 'yahoo' && provider.last_error
            ? `${t('status.degradedHint')} ${provider.last_error}`
            : '';

      if (phase === 'loading' || phase === 'error') {
        const status = hostInfo?.status ?? {};
        return h('div', { className: 'mm-root' },
          h('style', null, CSS),
          h('div', { className: 'mm-boot' },
            h('span', { className: 'mm-brand-mark' }, h(BrandMark, { size: 40 })),
            h('h2', null, t('boot.title')),
            phase === 'loading'
              ? h('div', { className: 'mm-loading-row' }, h(Spinner, { size: 16 }), h('span', null, t('boot.starting')))
              : h(React.Fragment, null,
                h('p', null, t('boot.failedHint')),
                h('p', { className: 'mm-error-text' }, bootError || t('boot.failed')),
                h('div', { className: 'mm-boot-actions' },
                  h('button', { type: 'button', className: 'mm-btn is-primary', onClick: () => void loadBoot() }, h(Icon, { name: 'refresh', size: 14 }), t('boot.retry')),
                  h('button', { type: 'button', className: 'mm-btn', onClick: () => void onRestartEngine() }, t('boot.restart'))),
                h('details', { className: 'mm-diag' },
                  h('summary', null, t('boot.details')),
                  h('dl', { className: 'mm-kv', style: { marginTop: 8 } },
                    h('dt', null, t('boot.python')),
                    h('dd', null, status.python || '—'),
                    h('dt', null, t('boot.data')),
                    h('dd', null, status.dataDir || '—'),
                    h('dt', null, t('boot.host')),
                    h('dd', null, status.state || '—')),
                  status.error ? h('pre', null, status.error) : null,
                  Array.isArray(status.stderrTail) && status.stderrTail.length > 0
                    ? h('pre', null, status.stderrTail.join('\n'))
                    : null))));
      }

      return h('div', { className: 'mm-root' },
        h('style', null, CSS),
        h('header', { className: 'mm-topbar' },
          h('div', { className: 'mm-brand' },
            h('span', { className: 'mm-brand-mark' }, h(BrandMark, { size: 22 })),
            h('div', { className: 'mm-brand-copy' },
              h('strong', null, t('title')),
              h('span', null, `${t('status.engine')} v${meta?.version ?? '—'} · ${meta?.provider?.active ?? '—'}`))),
          h('div', { className: 'mm-topbar-mid' },
            h('span', { className: `mm-chip is-${statusTone}` },
              h(StatusDot, { tone: statusTone }),
              statusLabel),
            lastSync ? h('span', { className: 'mm-chip' }, h(Icon, { name: 'refresh', size: 11 }), `${t('status.updated')} ${fmtClock(lastSync)}`) : null),
          h('div', { className: 'mm-topbar-actions' },
            h('button', {
              type: 'button',
              className: `mm-btn${autoRefresh ? ' is-primary' : ''}`,
              'aria-pressed': autoRefresh ? 'true' : 'false',
              title: t('status.auto'),
              onClick: () => setAutoRefresh((value) => !value),
            }, h(Icon, { name: 'refresh', size: 13 }), `${t('status.auto')} ${autoRefresh ? `${settings?.poll_seconds ?? 15}s` : ''}`.trim()),
            h('button', {
              type: 'button',
              className: 'mm-btn is-icon',
              'aria-label': t('refresh'),
              title: t('refresh.title'),
              disabled: busy === 'refresh',
              onClick: () => void onRefresh(),
            }, busy === 'refresh' ? h(Spinner, { size: 14 }) : h(Icon, { name: 'refresh', size: 15 })),
            h('button', {
              type: 'button',
              className: 'mm-btn is-icon',
              'aria-label': t('settings'),
              title: t('settings'),
              onClick: () => setModal({ type: 'settings' }),
            }, h(Icon, { name: 'settings', size: 15 })))),
        providerNotice !== '' && !noticeDismissed
          ? h('div', { className: 'mm-banner', role: 'status' },
            h(Icon, { name: 'bell', size: 13 }),
            h('span', { className: 'mm-banner-text', title: providerNotice }, providerNotice),
            h('button', {
              type: 'button',
              className: 'mm-btn is-ghost is-icon',
              'aria-label': t('close'),
              onClick: () => setNoticeDismissed(true),
            }, h(Icon, { name: 'close', size: 12 })))
          : null,
        h('div', { className: 'mm-body' },
          h(WatchlistColumn, {
            t,
            items: watchItems,
            quoteBySymbol,
            selected,
            onSelect,
            onAdd: () => setModal({ type: 'add' }),
            onRemove: onRemoveWatch,
          }),
          h('main', { className: 'mm-detail', style: { minWidth: 0 } },
            selected
              ? h(React.Fragment, null,
                h(InstrumentHeader, {
                  t,
                  quote: activeQuote,
                  watched: watchItems.some((item) => item.symbol === selected),
                  onToggleWatch,
                  onCreateAlert: () => setModal({ type: 'alert', symbol: selected }),
                }),
                h(QuoteMeta, { t, quote: activeQuote }),
                h(ChartCard, {
                  t,
                  history,
                  range,
                  onRange: (next) => setRange(next),
                  chartStyle,
                  onChartStyle: setChartStyle,
                  overlays,
                  onToggleOverlay: (key) => setOverlays((current) => ({ ...current, [key]: !current[key] })),
                  analysis,
                }))
              : h('div', { className: 'mm-card', style: { flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
                h(EmptyState, {
                  title: t('empty.noSelection'),
                  hint: t('empty.noSelectionHint'),
                  action: h('button', { type: 'button', className: 'mm-btn is-primary', onClick: () => setModal({ type: 'add' }) }, h(Icon, { name: 'plus', size: 14 }), t('watchlist.add')),
                }))),
          h('aside', {
            className: 'mm-side',
            'aria-label': tab === 'analysis'
              ? t('analysis')
              : tab === 'scan'
                ? t('screener')
                : tab === 'alerts'
                  ? t('alerts')
                  : tab === 'portfolio'
                    ? t('portfolio')
                    : t('data.tab'),
          },
            h(Tabs, { t, tab, onChange: setTab, unacked }),
            h('div', {
              className: 'mm-side-body',
              role: 'tabpanel',
              id: `mm-panel-${tab}`,
              'aria-labelledby': `mm-tab-${tab}`,
              tabIndex: 0,
            },
              tab === 'analysis'
                ? h(AnalysisPanel, {
                  t,
                  analysis,
                  quote: activeQuote,
                  onRetry: () => selected && void loadAnalysis(selected),
                  relatedNews,
                  onRetryRelated: () => selected && void loadRelatedNews(selected),
                  onOpenEntity,
                })
                : tab === 'scan'
                  ? h(ScreenerPanel, {
                    t,
                    scan,
                    onPreset: (preset) => setScan((current) => ({ ...current, preset })),
                    onRetry: () => void loadScan(scan.preset),
                  })
                  : tab === 'alerts'
                    ? h(AlertsPanel, {
                      t,
                      rules,
                      events,
                      onToggle: onToggleAlert,
                      onDelete: onDeleteAlert,
                      onCreate: () => setModal({ type: 'alert', symbol: selected }),
                      onAck,
                      onAckAll,
                    })
                    : tab === 'portfolio'
                      ? h(PortfolioPanel, {
                        t,
                        portfolio,
                        onSetPosition,
                        onDelete: onDeletePosition,
                        symbolSuggestions: suggestions,
                      })
                      : h(DataPanel, {
                        t,
                        coverage: dataCoverage,
                        status: dataStatus,
                        news: dataNews,
                        indexOverview: dataIndexOverview,
                        indexChanges: dataIndexChanges,
                        china: dataChina,
                        phase: dataPhase,
                        error: dataError,
                        updatedAt: dataUpdatedAt,
                        busy: busy === 'data',
                        indexBusy: busy === 'index',
                        onCollect: onDataCollect,
                        onIndexRefresh,
                        onChinaRefresh,
                        onOpenEntity,
                        onRetry: () => void loadDataTab(true),
                      })))),
        h('footer', { className: 'mm-statusbar' },
          h('span', { className: 'mm-inline' },
            h(StatusDot, { tone: engineOnline ? 'ok' : 'error' }),
            engineOnline ? `${t('status.engine')} ${meta?.sidecar?.port ? `· 127.0.0.1:${meta.sidecar.port}` : ''}` : t('status.retrying')),
          h('span', { className: 'mm-inline' }, `${t('status.cadence')} ${settings?.poll_seconds ?? 15} ${t('status.seconds')}`),
          h('span', { className: 'mm-spacer' }),
          h('span', { className: 'mm-inline' }, `${t('stat.source')} · ${meta?.provider?.active ?? '—'}${meta?.provider?.degraded ? ` · ${t('status.degraded')}` : ''}`)),
        modal?.type === 'add'
          ? h(AddSymbolModal, {
            t,
            initialQuery: modal.query ?? '',
            onClose: () => setModal(null),
            onAdd: async (symbol) => {
              try {
                await api.addWatch(symbol);
                await reloadWatchlist();
                setModal(null);
                setSelected(symbol);
                pushToast(`${symbol} ${t('watchlist.added')}`);
              } catch (failure) {
                throw failure;
              }
            },
          })
          : null,
        modal?.type === 'alert'
          ? h(AlertCreateModal, {
            t,
            initialSymbol: modal.symbol ?? selected ?? '',
            suggestions,
            onClose: () => setModal(null),
            onCreate: onCreateAlert,
          })
          : null,
        modal?.type === 'settings'
          ? h(SettingsModal, {
            t,
            initial: settings,
            hostInfo,
            meta,
            onClose: () => setModal(null),
            onSave: onSaveSettings,
            onRestart: onRestartEngine,
          })
          : null,
        confirm
          ? h(ConfirmDialog, {
            t,
            title: confirm.title,
            message: confirm.message,
            onCancel: () => setConfirm(null),
            onConfirm: confirm.onConfirm,
          })
          : null,
        h('div', { className: 'mm-toasts', 'aria-live': 'polite' },
          toasts.map((toast) => h('div', { key: toast.id, className: `mm-toast${toast.kind === 'error' ? ' is-error' : toast.kind === 'info' ? ' is-info' : ''}` },
            h(Icon, { name: toast.kind === 'error' ? 'close' : 'check', size: 13 }),
            h('span', null, toast.message)))));
    }

    function NavIcon(props) {
      const size = props.size ?? 20;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        h('path', { d: 'M3.5 18.5h17' }),
        h('path', { d: 'M4 16 8.4 10.4l3.2 2.9 4.6-6 2.2 2.1 2.2-3.2' }),
        h('circle', { cx: 20.2, cy: 6.2, r: 1.6, fill: 'currentColor', stroke: 'none' }),
        h('path', { d: 'M6.2 20.6v-1.4M10.2 20.6v-2.1M14.2 20.6v-1.2' }),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'market-monitor: dictionaries');
        const t = ctx.locale.bind(NS);
        ctx.slots.inject('main', () => ctx.slots.register(
          {
            name: 'main',
            key: 'market-monitor',
            locale: NS,
            inject: () => ({
              t,
              subscribeLocale: ctx.locale.subscribe.bind(ctx.locale),
            }),
          },
          MarketPage,
        ));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: 'market-monitor',
            order: 35,
            locale: NS,
            label: () => t('panel'),
          },
          NavIcon,
        ));
      },
    };
  },
});
