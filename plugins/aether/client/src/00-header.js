window.__ModuleLoader__.load({
  id: 'aether',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } = React;

    const NS = 'aether';
    const API = '/aether-api';
    const TAB_KEY = 'aether:active-tab-v2';
    const SIDEBAR_WIDTH_KEY = 'aether:sidebar-width';
    const PALETTE_HEIGHT_KEY = 'aether:palette-height';
    const LANGUAGE_KEY = 'aether:language';

    // 术语：UI 的「实验」= 内部 graph（DAG 定义）；UI 的「运行」= 内部 experiment（一次提交）。
