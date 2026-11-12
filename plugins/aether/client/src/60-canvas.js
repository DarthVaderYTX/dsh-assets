    // ---------------------------------------------------------- 实验画布

    const NODE_WIDTH = 200;
    const NODE_HEADER = 38;
    const PORT_ROW = 22;
    const NODE_BOTTOM = 10;
    const VERTICAL_HEIGHT = 94;
    const CANVAS_ZOOM_MIN = 0.3;
    const CANVAS_ZOOM_MAX = 2.4;

    function modulePorts(module) {
      return {
        inputs: Array.isArray(module && module.inputs) ? module.inputs : [],
        outputs: Array.isArray(module && module.outputs) ? module.outputs : [],
      };
    }

    function nodeSizeFor(module, direction) {
      const ports = modulePorts(module);
      if (direction === 'vertical') {
        const columns = Math.max(1, ports.inputs.length, ports.outputs.length);
        return {
          width: Math.min(360, Math.max(NODE_WIDTH, 56 + columns * 64)),
          height: VERTICAL_HEIGHT,
        };
      }
      const rows = Math.max(1, ports.inputs.length, ports.outputs.length);
      return { width: NODE_WIDTH, height: NODE_HEADER + rows * PORT_ROW + NODE_BOTTOM + 2 };
    }

    function portTop(index) {
      return NODE_HEADER + index * PORT_ROW + PORT_ROW / 2;
    }

    function portX(index, count, width) {
      const total = Math.max(1, count);
      return ((index * 2 + 1) * width) / (2 * total);
    }

    function clampZoom(value) {
      return Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, value));
    }

    function layoutNodes(graph, moduleById, direction, sizes) {
      const layers = localLayers(graph);
      const columns = layers || [graph.nodes.map((node) => node.id)];
      const positions = new Map();
      const gapAcross = direction === 'vertical' ? 28 : 92;
      const gapAlong = direction === 'vertical' ? 76 : 26;

      const buildItems = (ids) =>
        ids.map((id) => {
          const node = graph.nodes.find((item) => item.id === id);
          const size = sizes.get(id) || nodeSizeFor(node ? moduleById.get(node.moduleId) : null, direction);
          return { id, size };
        });

      if (direction === 'vertical') {
        let y = 0;
        let widest = 0;
        const rows = columns.map((ids) => {
          const items = buildItems(ids);
          const width =
            items.reduce((sum, item) => sum + item.size.width, 0) + gapAcross * Math.max(0, items.length - 1);
          const height = items.reduce((max, item) => Math.max(max, item.size.height), 0);
          const row = { items, width, y };
          widest = Math.max(widest, width);
          y += height + gapAlong;
          return row;
        });
        rows.forEach((row) => {
          let x = (widest - row.width) / 2;
          row.items.forEach((item) => {
            positions.set(item.id, { x, y: row.y });
            x += item.size.width + gapAcross;
          });
        });
        return positions;
      }

      let x = 0;
      let tallest = 0;
      const cols = columns.map((ids) => {
        const items = buildItems(ids);
        const height =
          items.reduce((sum, item) => sum + item.size.height, 0) + gapAlong * Math.max(0, items.length - 1);
        const width = items.reduce((max, item) => Math.max(max, item.size.width), 0);
        const col = { items, height, x };
        tallest = Math.max(tallest, height);
        x += width + gapAcross;
        return col;
      });
      cols.forEach((col) => {
        let y = (tallest - col.height) / 2;
        col.items.forEach((item) => {
          positions.set(item.id, { x: col.x, y });
          y += item.size.height + gapAlong;
        });
      });
      return positions;
    }

    function canvasBounds(graph, positions, moduleById, direction, sizes) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const node of graph.nodes) {
        const position = positions.get(node.id);
        if (!position) continue;
        const size = sizes.get(node.id) || nodeSizeFor(moduleById.get(node.moduleId), direction);
        minX = Math.min(minX, position.x);
        minY = Math.min(minY, position.y);
        maxX = Math.max(maxX, position.x + size.width);
        maxY = Math.max(maxY, position.y + size.height);
      }
      if (!Number.isFinite(minX)) return { minX: 0, minY: 0, width: 320, height: 200 };
      return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
    }

    function edgeCurve(start, end, direction) {
      if (direction === 'vertical') {
        const dy = Math.max(36, Math.abs(end.y - start.y) * 0.5);
        const sign = end.y >= start.y ? 1 : -1;
        const c1 = { x: start.x, y: start.y + dy * sign };
        const c2 = { x: end.x, y: end.y - dy * sign };
        return {
          d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
          mid: {
            x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8,
            y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8,
          },
        };
      }
      const dx = Math.max(50, Math.abs(end.x - start.x) * 0.5);
      const sign = end.x >= start.x ? 1 : -1;
      const c1 = { x: start.x + dx * sign, y: start.y };
      const c2 = { x: end.x - dx * sign, y: end.y };
      return {
        d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
        mid: {
          x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8,
          y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8,
        },
      };
    }

    const RUN_STATUS_GROUP = {
      succeeded: 'succeeded',
      running: 'running',
      failed: 'failed',
      pending: 'pending',
      skipped: 'pending',
      cancelled: 'pending',
    };

    function runStatusLabel(t, status) {
      if (status === 'succeeded' || status === 'running' || status === 'failed' || status === 'pending') {
        return t(`runStatus.${status}`);
      }
      return t(`status.${status}`);
    }

    function deriveRunEdges(nodes) {
      const byPath = new Map(nodes.map((node) => [node.path, node]));
      const edges = [];
      const outCounts = new Map();
      const inCounts = new Map();
      const seen = new Set();
      for (const node of nodes) {
        for (const depPath of node.deps || []) {
          const source = byPath.get(depPath);
          if (!source) continue;
          const outputs = source.outputs || [];
          const inputs = node.inputs || [];
          const outIndex = outCounts.get(depPath) || 0;
          const inIndex = inCounts.get(node.path) || 0;
          const fromPort = outputs.length ? outputs[outIndex % outputs.length] : '';
          const toPort = inputs.length ? inputs[inIndex % inputs.length] : '';
          const key = `${depPath}>${node.path}>${fromPort}>${toPort}`;
          if (seen.has(key)) continue;
          seen.add(key);
          outCounts.set(depPath, outIndex + 1);
          inCounts.set(node.path, inIndex + 1);
          edges.push({ id: `e-${edges.length + 1}`, from: depPath, to: node.path, fromPort, toPort });
        }
      }
      return edges;
    }

    function RunDag({ t, experiment, onOpenLog, onViewOutput }) {
      const nodes = experiment.nodes || [];
      const direction = experiment.layout === 'horizontal' ? 'horizontal' : 'vertical';
      const nodeByPath = useMemo(() => new Map(nodes.map((node) => [node.path, node])), [nodes]);
      const modules = useMemo(
        () =>
          new Map(
            nodes.map((node) => [
              node.path,
              {
                name: node.moduleName,
                kind: node.kind,
                inputs: node.inputs || [],
                outputs: node.outputs || [],
                requiredInputs: node.requiredInputs || [],
              },
            ]),
          ),
        [nodes],
      );
      const edgesData = useMemo(
        () => (experiment.edges && experiment.edges.length ? experiment.edges : deriveRunEdges(nodes)),
        [experiment.edges, nodes],
      );
      const graphForLayout = useMemo(
        () => ({
          nodes: nodes.map((node) => ({ id: node.path, moduleId: node.path })),
          edges: edgesData,
        }),
        [nodes, edgesData],
      );
      const sizes = useMemo(
        () => new Map(nodes.map((node) => [node.path, nodeSizeFor(modules.get(node.path), direction)])),
        [nodes, modules, direction],
      );
      const basePositions = useMemo(
        () => layoutNodes(graphForLayout, modules, direction, sizes),
        [graphForLayout, modules, direction, sizes],
      );

      const [overrides, setOverrides] = useState({});
      const [view, setView] = useState({ x: 30, y: 24, zoom: 1 });
      const [selectedPath, setSelectedPath] = useState('');
      const [interaction, setInteraction] = useState(null);
      const [outputMenu, setOutputMenu] = useState(null);
      const canvasRef = useRef(null);

      useEffect(() => {
        setOutputMenu(null);
      }, [experiment.id]);

      useEffect(() => {
        if (!outputMenu) return undefined;
        const close = () => setOutputMenu(null);
        const onKey = (event) => {
          if (event.key === 'Escape') close();
        };
        window.addEventListener('pointerdown', close);
        window.addEventListener('keydown', onKey);
        return () => {
          window.removeEventListener('pointerdown', close);
          window.removeEventListener('keydown', onKey);
        };
      }, [outputMenu]);

      const openOutputMenu = (event, node, port) => {
        if (node.kind !== 'dataset' && node.status !== 'succeeded') return;
        event.preventDefault();
        event.stopPropagation();
        setSelectedPath(node.path);
        setOutputMenu({
          path: node.path,
          port,
          x: Math.min(event.clientX, Math.max(12, window.innerWidth - 210)),
          y: Math.min(event.clientY, Math.max(12, window.innerHeight - 120)),
        });
      };

      const downloadOutput = (pathName, port) => {
        const href = `${API}/experiments/artifact/download?run=${encodeURIComponent(experiment.id)}&node=${encodeURIComponent(
          pathName,
        )}&port=${encodeURIComponent(port)}`;
        const anchor = document.createElement('a');
        anchor.href = href;
        anchor.download = '';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      };

      const positions = useMemo(() => {
        const map = new Map();
        for (const node of nodes) {
          const base = basePositions.get(node.path) || { x: 0, y: 0 };
          const override = overrides[node.path];
          map.set(node.path, override ? { x: override.x, y: override.y } : { x: base.x, y: base.y });
        }
        return map;
      }, [nodes, basePositions, overrides]);

      const viewRef = useRef(view);
      viewRef.current = view;
      const positionsRef = useRef(positions);
      positionsRef.current = positions;
      const sizesRef = useRef(sizes);
      sizesRef.current = sizes;
      const modulesRef = useRef(modules);
      modulesRef.current = modules;
      const directionRef = useRef(direction);
      directionRef.current = direction;
      const nodesRef = useRef(nodes);
      nodesRef.current = nodes;
      const nodeByPathRef = useRef(nodeByPath);
      nodeByPathRef.current = nodeByPath;
      const selectedRef = useRef(selectedPath);
      selectedRef.current = selectedPath;

      const fitTo = useCallback((positionMap) => {
        const element = canvasRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const bounds = canvasBounds(
          { nodes: nodesRef.current },
          positionMap,
          modulesRef.current,
          directionRef.current,
          sizesRef.current,
        );
        const padding = 50;
        const zoom = clampZoom(
          Math.min((rect.width - padding * 2) / bounds.width, (rect.height - padding * 2) / bounds.height, 1.1),
        );
        setView({
          zoom,
          x: (rect.width - bounds.width * zoom) / 2 - bounds.minX * zoom,
          y: (rect.height - bounds.height * zoom) / 2 - bounds.minY * zoom,
        });
      }, []);

      useEffect(() => {
        setOverrides({});
        setSelectedPath('');
        setInteraction(null);
        const frame = requestAnimationFrame(() => fitTo(positionsRef.current));
        return () => cancelAnimationFrame(frame);
      }, [experiment.id, fitTo]);

      const zoomBy = useCallback((factor) => {
        setView((previous) => {
          const element = canvasRef.current;
          if (!element) return previous;
          const rect = element.getBoundingClientRect();
          const px = rect.width / 2;
          const py = rect.height / 2;
          const zoom = clampZoom(previous.zoom * factor);
          const worldX = (px - previous.x) / previous.zoom;
          const worldY = (py - previous.y) / previous.zoom;
          return { zoom, x: px - worldX * zoom, y: py - worldY * zoom };
        });
      }, []);

      const zoomTo = useCallback((targetZoom) => {
        const element = canvasRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const px = rect.width / 2;
        const py = rect.height / 2;
        setView((previous) => {
          const zoom = clampZoom(targetZoom);
          const worldX = (px - previous.x) / previous.zoom;
          const worldY = (py - previous.y) / previous.zoom;
          return { zoom, x: px - worldX * zoom, y: py - worldY * zoom };
        });
      }, []);

      useEffect(() => {
        const element = canvasRef.current;
        if (!element) return undefined;
        const onWheel = (event) => {
          event.preventDefault();
          const rect = element.getBoundingClientRect();
          const px = event.clientX - rect.left;
          const py = event.clientY - rect.top;
          setView((previous) => {
            const zoom = clampZoom(previous.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
            const worldX = (px - previous.x) / previous.zoom;
            const worldY = (py - previous.y) / previous.zoom;
            return { zoom, x: px - worldX * zoom, y: py - worldY * zoom };
          });
        };
        element.addEventListener('wheel', onWheel, { passive: false });
        return () => element.removeEventListener('wheel', onWheel);
      }, []);

      useEffect(() => {
        if (!interaction) return undefined;
        const onMove = (event) => {
          if (interaction.type === 'pan') {
            setView({
              ...interaction.origin,
              x: interaction.origin.x + event.clientX - interaction.startX,
              y: interaction.origin.y + event.clientY - interaction.startY,
            });
            return;
          }
          if (interaction.type === 'node') {
            const zoom = viewRef.current.zoom;
            const x = interaction.origin.x + (event.clientX - interaction.startX) / zoom;
            const y = interaction.origin.y + (event.clientY - interaction.startY) / zoom;
            setOverrides((previous) => ({ ...previous, [interaction.path]: { x, y } }));
          }
        };
        const onUp = () => setInteraction(null);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
        };
      }, [interaction]);

      const portPoint = (path, kind, portName) => {
        const node = nodeByPath.get(path);
        const module = modules.get(path);
        const position = positions.get(path);
        const size = sizes.get(path);
        if (!node || !position || !size) return null;
        const ports = kind === 'input' ? modulePorts(module).inputs : modulePorts(module).outputs;
        let index = ports.indexOf(portName);
        if (index < 0) index = 0;
        if (direction === 'vertical') {
          return {
            x: position.x + portX(index, ports.length, size.width),
            y: position.y + (kind === 'input' ? 0 : size.height),
          };
        }
        return {
          x: position.x + (kind === 'input' ? 0 : size.width),
          y: position.y + portTop(index),
        };
      };

      const edgeGeometry = useMemo(() => {
        const list = [];
        for (const edge of edgesData) {
          const fromNode = nodeByPath.get(edge.from);
          const toNode = nodeByPath.get(edge.to);
          if (!fromNode || !toNode) continue;
          const fromModule = modules.get(edge.from);
          const toModule = modules.get(edge.to);
          const fromPort = edge.fromPort || modulePorts(fromModule).outputs[0] || '';
          const toPort = edge.toPort || modulePorts(toModule).inputs[0] || '';
          const start = portPoint(edge.from, 'output', fromPort);
          const end = portPoint(edge.to, 'input', toPort);
          if (!start || !end) continue;
          list.push({ ...edge, d: edgeCurve(start, end, direction).d });
        }
        return list;
      }, [edgesData, nodeByPath, modules, positions, sizes, direction]);

      const bounds = canvasBounds({ nodes }, positions, modules, direction, sizes);
      const padding = 500;
      const svgLeft = bounds.minX - padding;
      const svgTop = bounds.minY - padding;
      const svgWidth = bounds.width + padding * 2;
      const svgHeight = bounds.height + padding * 2;
      const selectedNode = selectedPath ? nodeByPath.get(selectedPath) : null;

      return h(
        'div',
        { className: 'ath-run-canvas' },
        h(
          'div',
          {
            className: 'ath-canvas-viewport ath-run-viewport',
            ref: canvasRef,
            onPointerDown: (event) => {
              if (event.button !== 0) return;
              setSelectedPath('');
              setInteraction({
                type: 'pan',
                startX: event.clientX,
                startY: event.clientY,
                origin: { ...viewRef.current },
              });
            },
            onContextMenu: (event) => event.preventDefault(),
          },
          nodes.length
            ? h(
                'div',
                {
                  className: 'ath-canvas-layer',
                  style: { transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` },
                },
                h(
                  'svg',
                  {
                    className: 'ath-edges',
                    width: svgWidth,
                    height: svgHeight,
                    viewBox: `${svgLeft} ${svgTop} ${svgWidth} ${svgHeight}`,
                    style: { left: svgLeft, top: svgTop, position: 'absolute' },
                    'aria-hidden': 'true',
                  },
                  h(
                    'defs',
                    null,
                    h(
                      'marker',
                      {
                        id: 'ath-run-arrow',
                        viewBox: '0 0 10 10',
                        refX: 8,
                        refY: 5,
                        markerWidth: 6,
                        markerHeight: 6,
                        orient: 'auto-start-reverse',
                      },
                      h('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--ath-edge)' }),
                    ),
                  ),
                  edgeGeometry.map((edge) =>
                    h('path', {
                      key: edge.id,
                      d: edge.d,
                      className: 'ath-run-edge',
                      markerEnd: 'url(#ath-run-arrow)',
                    }),
                  ),
                ),
                nodes.map((node) => {
                  const module = modules.get(node.path);
                  const ports = modulePorts(module);
                  const position = positions.get(node.path) || { x: 0, y: 0 };
                  const size = sizes.get(node.path) || nodeSizeFor(module, direction);
                  const group = node.kind === 'dataset' ? 'dataset' : RUN_STATUS_GROUP[node.status] || 'pending';
                  const rows = Math.max(ports.inputs.length, ports.outputs.length);
                  const requiredInputs = new Set(module && Array.isArray(module.requiredInputs) ? module.requiredInputs : []);
                  const runParams = node.params || {};
                  const runParamPairs = Object.entries(runParams).map(([key, value]) => [
                    key,
                    String(value == null ? '' : value).replace(/\s+/g, ' '),
                  ]);
                  const runParamShort = runParamPairs
                    .slice(0, 1)
                    .map(([key, value]) => `${key}=${value}`)
                    .join(' · ');
                  const runParamTitle = runParamPairs.map(([key, value]) => `${key}=${value}`).join('\n');
                  return h(
                    'div',
                    {
                      key: node.path,
                      className: 'ath-node-card ath-run-node',
                      'data-selected': node.path === selectedPath ? 'true' : 'false',
                      'data-kind': node.kind || 'command',
                      'data-direction': direction,
                      'data-group': group,
                      title: runParamTitle || undefined,
                      style: { left: position.x, top: position.y, width: size.width, height: size.height },
                      onPointerDown: (event) => {
                        if (event.button !== 0) return;
                        event.stopPropagation();
                        setSelectedPath(node.path);
                        const origin = positionsRef.current.get(node.path) || { x: 0, y: 0 };
                        setInteraction({
                          type: 'node',
                          path: node.path,
                          startX: event.clientX,
                          startY: event.clientY,
                          origin,
                        });
                      },
                    },
                    h(
                      'div',
                      { className: 'ath-node-head' },
                      h('span', { className: 'ath-node-title' }, node.label || node.path),
                      group === 'running' ? h('span', { className: 'ath-run-pulse' }) : null,
                      h(
                        'span',
                        { className: 'ath-node-sub' },
                        `${
                          node.kind === 'dataset'
                            ? t('modules.kind.dataset')
                            : runStatusLabel(t, node.status)
                        } · ${node.moduleName || node.moduleId} · ${tr(t, 'modules.versionLabel', {
                          version: node.moduleVersion || 1,
                        })}${runParamShort ? ` · ${runParamShort}` : ''}`,
                      ),
                    ),
                    direction === 'vertical'
                      ? h(
                          'div',
                          { className: 'ath-node-vports' },
                          h(
                            'div',
                            { className: 'ath-node-vports-row ath-node-vports-top' },
                            ports.inputs.length
                              ? ports.inputs.map((port) =>
                                  h(
                                    'span',
                                    {
                                      key: `in-${port}`,
                                      className: 'ath-vport-name',
                                      'data-required': requiredInputs.has(port) ? 'true' : 'false',
                                      title: portTypeHint(
                                        t,
                                        port,
                                        node.inputTypes && node.inputTypes[port],
                                      ),
                                    },
                                    `${port}${requiredInputs.has(port) ? ' *' : ''}`,
                                  ),
                                )
                              : null,
                          ),
                          h(
                            'div',
                            { className: 'ath-node-vports-row ath-node-vports-bottom' },
                            ports.outputs.map((port) =>
                              h(
                                'span',
                                {
                                  key: `out-${port}`,
                                  className: 'ath-vport-name',
                                  title: portTypeHint(
                                    t,
                                    port,
                                    node.outputTypes && node.outputTypes[port],
                                  ),
                                  onClick: (event) => openOutputMenu(event, node, port),
                                  onPointerDown: (event) => event.stopPropagation(),
                                  onContextMenu: (event) => openOutputMenu(event, node, port),
                                },
                                port,
                              ),
                            ),
                          ),
                        )
                      : rows
                        ? h(
                            'div',
                            { className: 'ath-node-ports' },
                            Array.from({ length: rows }).map((_, row) =>
                              h(
                                'div',
                                { className: 'ath-port-row', key: row },
                                h(
                                  'span',
                                  {
                                    className: 'ath-port-name ath-port-in-name',
                                    'data-required': requiredInputs.has(ports.inputs[row]) ? 'true' : 'false',
                                    title: ports.inputs[row]
                                      ? portTypeHint(
                                          t,
                                          ports.inputs[row],
                                          node.inputTypes && node.inputTypes[ports.inputs[row]],
                                        )
                                      : undefined,
                                  },
                                  `${ports.inputs[row] || ''}${requiredInputs.has(ports.inputs[row]) ? ' *' : ''}`,
                                ),
                                h(
                                  'span',
                                  {
                                    className: 'ath-port-name ath-port-out-name',
                                    title: ports.outputs[row]
                                      ? portTypeHint(
                                          t,
                                          ports.outputs[row],
                                          node.outputTypes && node.outputTypes[ports.outputs[row]],
                                        )
                                      : undefined,
                                    onClick: ports.outputs[row]
                                      ? (event) => openOutputMenu(event, node, ports.outputs[row])
                                      : undefined,
                                    onPointerDown: ports.outputs[row]
                                      ? (event) => event.stopPropagation()
                                      : undefined,
                                    onContextMenu: ports.outputs[row]
                                      ? (event) => openOutputMenu(event, node, ports.outputs[row])
                                      : undefined,
                                  },
                                  ports.outputs[row] || '',
                                ),
                              ),
                            ),
                          )
                        : null,
                    ports.inputs.map((port, index) =>
                      h('div', {
                        key: `in-${port}`,
                        className: `ath-port-dot ath-run-port ath-port-in${requiredInputs.has(port) ? ' ath-port-required' : ''}${direction === 'vertical' ? ' ath-port-top' : ''}`,
                        title: portTypeHint(
                          t,
                          port,
                          node.inputTypes && node.inputTypes[port],
                        ),
                        style:
                          direction === 'vertical'
                            ? { left: portX(index, ports.inputs.length, size.width) - 5, top: -5 }
                            : { top: portTop(index) - 5 },
                      }),
                    ),
                    ports.outputs.map((port, index) =>
                      h('div', {
                        key: `out-${port}`,
                        className: `ath-port-dot ath-run-port ath-run-port-output ath-port-out${direction === 'vertical' ? ' ath-port-bottom' : ''}`,
                        title: portTypeHint(
                          t,
                          port,
                          node.outputTypes && node.outputTypes[port],
                        ),
                        onClick: (event) => openOutputMenu(event, node, port),
                        onPointerDown: (event) => event.stopPropagation(),
                        onContextMenu: (event) => openOutputMenu(event, node, port),
                        style:
                          direction === 'vertical'
                            ? { left: portX(index, ports.outputs.length, size.width) - 5, top: size.height - 5 }
                            : { top: portTop(index) - 5 },
                      }),
                    ),
                  );
                }),
              )
            : h('div', { className: 'ath-canvas-empty' }, h('strong', null, t('runs.noNodes'))),
          h(
            'div',
            { className: 'ath-run-legend', onPointerDown: (event) => event.stopPropagation() },
            ['succeeded', 'running', 'failed', 'pending'].map((group) =>
              h(
                'span',
                { className: 'ath-run-legend-item', key: group },
                h('i', { className: 'ath-run-legend-dot', 'data-group': group }),
                runStatusLabel(t, group),
              ),
            ),
          ),
          h(
            'div',
            { className: 'ath-canvas-tools', onPointerDown: (event) => event.stopPropagation() },
            h(
              'button',
              {
                type: 'button',
                className: 'ath-btn ath-btn-ghost',
                onClick: () => {
                  setOverrides({});
                  requestAnimationFrame(() => fitTo(basePositions));
                },
              },
              t('canvas.tidy'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'ath-btn ath-btn-ghost',
                onClick: () => {
                  setOverrides({});
                  setSelectedPath('');
                  requestAnimationFrame(() => fitTo(basePositions));
                },
              },
              t('canvas.reset'),
            ),
            h('span', { className: 'ath-tool-sep' }),
            h('button', { type: 'button', className: 'ath-icon-btn', onClick: () => zoomBy(1 / 1.2), title: t('canvas.zoomOut') }, '−'),
            h(
              'button',
              { type: 'button', className: 'ath-zoom-value', onClick: () => zoomTo(1), title: t('canvas.zoomReset') },
              `${Math.round(view.zoom * 100)}%`,
            ),
            h('button', { type: 'button', className: 'ath-icon-btn', onClick: () => zoomBy(1.2), title: t('canvas.zoomIn') }, '+'),
          ),
          selectedNode
            ? h(
                'div',
                { className: 'ath-run-nodebar', onPointerDown: (event) => event.stopPropagation() },
                h(
                  'div',
                  { className: 'ath-run-nodebar-main' },
                  selectedNode.kind === 'dataset'
                    ? h(
                        'span',
                        { className: 'ath-badge', 'data-kind': 'dataset' },
                        t('modules.kind.dataset'),
                      )
                    : h(
                        'span',
                        { className: 'ath-status', 'data-status': selectedNode.status },
                        runStatusLabel(t, selectedNode.status),
                      ),
                  h('strong', { className: 'ath-run-nodebar-title' }, selectedNode.label || selectedNode.path),
                  h('code', { className: 'ath-run-nodebar-path' }, selectedNode.path),
                  h(
                    'span',
                    { className: 'ath-run-nodebar-meta' },
                    tr(t, 'modules.versionLabel', { version: selectedNode.moduleVersion || 1 }),
                  ),
                  selectedNode.kind === 'dataset'
                    ? null
                    : h('span', { className: 'ath-run-nodebar-meta' }, formatDuration(selectedNode.startedAt, selectedNode.endedAt)),
                  selectedNode.kind !== 'dataset' &&
                  selectedNode.exitCode !== null &&
                  selectedNode.exitCode !== undefined
                    ? h('span', { className: 'ath-run-nodebar-meta' }, `${t('experiments.exitCode')} ${selectedNode.exitCode}`)
                    : null,
                ),
                selectedNode.error ? h('div', { className: 'ath-run-nodebar-error' }, selectedNode.error) : null,
                h(
                  'button',
                  { type: 'button', className: 'ath-btn', onClick: () => onOpenLog(experiment.id, selectedNode) },
                  t('experiments.log'),
                ),
              )
            : h('div', { className: 'ath-run-hint' }, t('canvas.runHint')),
          outputMenu
            ? h(
                'div',
                {
                  className: 'ath-output-menu',
                  style: { left: outputMenu.x, top: outputMenu.y },
                  onPointerDown: (event) => event.stopPropagation(),
                  onContextMenu: (event) => event.preventDefault(),
                },
                h(
                  'div',
                  { className: 'ath-output-menu-head' },
                  h('span', null, t('runs.outputMenu')),
                  h('code', null, `${outputMenu.path} · ${outputMenu.port}`),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => {
                      const node = nodeByPath.get(outputMenu.path);
                      const port = outputMenu.port;
                      setOutputMenu(null);
                      if (node) onViewOutput(experiment.id, node, port);
                    },
                  },
                  t('runs.viewOutput'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => {
                      downloadOutput(outputMenu.path, outputMenu.port);
                      setOutputMenu(null);
                    },
                  },
                  t('runs.downloadOutput'),
                ),
              )
            : null,
        ),
      );
    }
