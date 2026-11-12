    function ExperimentEditor({
      t,
      modules,
      environments,
      draft,
      onDraftChange,
      onSave,
      onBack,
      onOpenSubgraph,
      onDelete,
      saving,
      errors,
      subgraph,
    }) {
      const graph = draft.graph;
      const direction = graph.layout === 'horizontal' ? 'horizontal' : 'vertical';
      const moduleById = useMemo(() => new Map(modules.map((module) => [module.id, module])), [modules]);
      const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
      const sizes = useMemo(
        () =>
          new Map(
            graph.nodes.map((node) => [node.id, nodeSizeFor(moduleById.get(node.moduleId), direction)]),
          ),
        [graph.nodes, moduleById, direction],
      );
      const layoutPositions = useMemo(
        () => layoutNodes(graph, moduleById, direction, sizes),
        [graph, moduleById, direction, sizes],
      );
      const positions = useMemo(() => {
        const map = new Map();
        for (const node of graph.nodes) {
          const fallback = layoutPositions.get(node.id) || { x: 0, y: 0 };
          map.set(
            node.id,
            Number.isFinite(node.x) && Number.isFinite(node.y) ? { x: node.x, y: node.y } : { x: fallback.x, y: fallback.y },
          );
        }
        return map;
      }, [graph, layoutPositions]);

      const [view, setView] = useState({ x: 30, y: 24, zoom: 1 });
      const [selection, setSelection] = useState({ nodes: [], edges: [] });
      const [interaction, setInteraction] = useState(null);
      const [marquee, setMarquee] = useState(null);
      const [connecting, setConnecting] = useState(null);
      const [paletteQuery, setPaletteQuery] = useState('');
      const [paletteFilter, setPaletteFilter] = useState('all');
      const [dragOver, setDragOver] = useState(false);
      const [sidebarWidth, setSidebarWidth] = useState(() => {
        try {
          const value = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
          if (Number.isFinite(value) && value >= 260 && value <= 640) return value;
        } catch {
          // localStorage 不可用时使用默认值。
        }
        return 340;
      });
      const [paletteHeight, setPaletteHeight] = useState(() => {
        try {
          const value = Number(localStorage.getItem(PALETTE_HEIGHT_KEY));
          if (Number.isFinite(value) && value >= 140) return value;
        } catch {
          // 同上。
        }
        return 280;
      });
      const [cycleNotice, setCycleNotice] = useState('');
      const cycleTimer = useRef(null);

      const canvasRef = useRef(null);
      const inspectorRef = useRef(null);
      const editorRef = useRef(null);
      const sideRef = useRef(null);
      const draggingRef = useRef(false);
      const viewRef = useRef(view);
      viewRef.current = view;
      const graphRef = useRef(graph);
      graphRef.current = graph;
      const positionsRef = useRef(positions);
      positionsRef.current = positions;
      const sizesRef = useRef(sizes);
      sizesRef.current = sizes;
      const directionRef = useRef(direction);
      directionRef.current = direction;
      const moduleByIdRef = useRef(moduleById);
      moduleByIdRef.current = moduleById;
      const selectionRef = useRef(selection);
      selectionRef.current = selection;
      const draftRef = useRef(draft);
      draftRef.current = draft;

      const paletteItems = useMemo(() => {
        const query = paletteQuery.trim().toLowerCase();
        return modules
          .filter((module) => paletteFilter === 'all' || module.kind === paletteFilter)
          .filter((module) => {
            if (!query) return true;
            const ports = modulePorts(module);
            const haystack = [
              module.name,
              module.id,
              module.description,
              module.kind,
              t(`modules.kind.${module.kind}`),
              module.datasetUri || '',
              module.subgraphName || '',
              module.graphId || '',
              ...ports.inputs,
              ...ports.outputs,
            ]
              .join(' ')
              .toLowerCase();
            return haystack.includes(query);
          });
      }, [modules, paletteQuery, paletteFilter, t]);

      const portPoint = (nodeId, kind, portName) => {
        const node = nodeById.get(nodeId);
        const module = node ? moduleById.get(node.moduleId) : null;
        const position = positions.get(nodeId);
        const size = sizes.get(nodeId);
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
        for (const edge of graph.edges) {
          const fromNode = nodeById.get(edge.from);
          const toNode = nodeById.get(edge.to);
          if (!fromNode || !toNode) continue;
          const fromModule = moduleById.get(fromNode.moduleId);
          const toModule = moduleById.get(toNode.moduleId);
          const fromPort = edge.fromPort || modulePorts(fromModule).outputs[0] || '';
          const toPort = edge.toPort || modulePorts(toModule).inputs[0] || '';
          const start = portPoint(edge.from, 'output', fromPort);
          const end = portPoint(edge.to, 'input', toPort);
          if (!start || !end) continue;
          const curve = edgeCurve(start, end, direction);
          list.push({ ...edge, start, end, d: curve.d, mid: curve.mid });
        }
        return list;
      }, [graph.edges, nodeById, moduleById, positions, sizes, direction]);

      const fitTo = useCallback((positionMap, sizeMap, dir, maxZoom = 1.15) => {
        const element = canvasRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const bounds = canvasBounds(graphRef.current, positionMap, moduleByIdRef.current, dir, sizeMap);
        const padding = 54;
        const zoom = clampZoom(
          Math.min((rect.width - padding * 2) / bounds.width, (rect.height - padding * 2) / bounds.height, maxZoom),
        );
        setView({
          zoom,
          x: (rect.width - bounds.width * zoom) / 2 - bounds.minX * zoom,
          y: (rect.height - bounds.height * zoom) / 2 - bounds.minY * zoom,
        });
      }, []);

      useEffect(() => {
        setSelection({ nodes: [], edges: [] });
        setInteraction(null);
        setMarquee(null);
        setConnecting(null);
        const frame = requestAnimationFrame(() =>
          fitTo(positionsRef.current, sizesRef.current, directionRef.current),
        );
        return () => cancelAnimationFrame(frame);
      }, [draft.graph.id, fitTo]);

      useEffect(() => {
        try {
          localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(sidebarWidth)));
        } catch {
          // 记住分栏宽度是尽力而为。
        }
      }, [sidebarWidth]);

      useEffect(() => {
        try {
          localStorage.setItem(PALETTE_HEIGHT_KEY, String(Math.round(paletteHeight)));
        } catch {
          // 记住右侧栏高度占比是尽力而为。
        }
      }, [paletteHeight]);

      useEffect(
        () => () => {
          if (cycleTimer.current) window.clearTimeout(cycleTimer.current);
        },
        [],
      );

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

      const applyLayout = useCallback(
        (fit, clearSelection) => {
          const nextDirection = directionRef.current;
          const nextSizes = sizesRef.current;
          const layout = layoutNodes(graphRef.current, moduleByIdRef.current, nextDirection, nextSizes);
          const current = draftRef.current;
          onDraftChange({
            ...current,
            graph: {
              ...current.graph,
              nodes: current.graph.nodes.map((node) => {
                const position = layout.get(node.id);
                return position ? { ...node, x: position.x, y: position.y } : node;
              }),
            },
          });
          if (clearSelection) setSelection({ nodes: [], edges: [] });
          if (fit) requestAnimationFrame(() => fitTo(layout, nextSizes, nextDirection));
        },
        [fitTo, onDraftChange],
      );

      const setDirection = (nextDirection) => {
        if (nextDirection === direction) return;
        const current = draftRef.current;
        const nextSizes = new Map(
          current.graph.nodes.map((node) => [
            node.id,
            nodeSizeFor(moduleByIdRef.current.get(node.moduleId), nextDirection),
          ]),
        );
        const nextGraph = { ...current.graph, layout: nextDirection };
        const layout = layoutNodes(nextGraph, moduleByIdRef.current, nextDirection, nextSizes);
        onDraftChange({
          ...current,
          graph: {
            ...nextGraph,
            nodes: current.graph.nodes.map((node) => {
              const position = layout.get(node.id);
              return position ? { ...node, x: position.x, y: position.y } : node;
            }),
          },
        });
        setSelection({ nodes: [], edges: [] });
        requestAnimationFrame(() => fitTo(layout, nextSizes, nextDirection));
      };

      const deleteSelection = useCallback(() => {
        const current = draftRef.current;
        const selected = selectionRef.current;
        if (!selected.nodes.length && !selected.edges.length) return;
        const nodeIds = new Set(selected.nodes);
        const edgeIds = new Set(selected.edges);
        onDraftChange({
          ...current,
          graph: {
            ...current.graph,
            nodes: current.graph.nodes.filter((node) => !nodeIds.has(node.id)),
            edges: current.graph.edges.filter(
              (edge) => !edgeIds.has(edge.id) && !nodeIds.has(edge.from) && !nodeIds.has(edge.to),
            ),
          },
        });
        setSelection({ nodes: [], edges: [] });
      }, [onDraftChange]);

      useEffect(() => {
        const onKey = (event) => {
          const target = event.target;
          const tag = target && target.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable)) return;
          if (event.key === 'Escape') {
            setSelection({ nodes: [], edges: [] });
            setInteraction(null);
            setConnecting(null);
            setMarquee(null);
            return;
          }
          if ((event.key === 'Delete' || event.key === 'Backspace') && (selectionRef.current.nodes.length || selectionRef.current.edges.length)) {
            event.preventDefault();
            deleteSelection();
          }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [deleteSelection]);

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

      const notifyCycle = () => {
        setCycleNotice(t('graphs.cycleBlocked'));
        if (cycleTimer.current) window.clearTimeout(cycleTimer.current);
        cycleTimer.current = window.setTimeout(() => setCycleNotice(''), 3400);
      };

      const addEdge = (fromId, fromPort, toId, toPort) => {
        const current = draftRef.current;
        if (!fromPort || !toPort) return;
        if (current.graph.edges.some((edge) => edge.from === fromId && edge.to === toId && edge.fromPort === fromPort && edge.toPort === toPort)) {
          return;
        }
        const candidate = {
          ...current.graph,
          edges: [
            ...current.graph.edges,
            { id: '__cycle-check__', from: fromId, to: toId, fromPort, toPort },
          ],
        };
        if (!localLayers(candidate)) {
          notifyCycle();
          return;
        }
        const edgeId = `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
        setCycleNotice('');
        onDraftChange({
          ...current,
          graph: {
            ...current.graph,
            edges: [...current.graph.edges, { id: edgeId, from: fromId, to: toId, fromPort, toPort }],
          },
        });
        setSelection({ nodes: [], edges: [edgeId] });
      };

      useEffect(() => {
        if (!interaction) return undefined;
        const onMove = (event) => {
          if (interaction.type === 'resize-sidebar') {
            const element = editorRef.current;
            if (!element) return;
            const rect = element.getBoundingClientRect();
            const maximum = Math.max(280, Math.min(640, rect.width * 0.55, rect.width - 360));
            setSidebarWidth(Math.min(maximum, Math.max(260, rect.right - event.clientX)));
            return;
          }
          if (interaction.type === 'resize-palette') {
            const element = sideRef.current;
            if (!element) return;
            const rect = element.getBoundingClientRect();
            const maximum = Math.max(160, rect.height - 200);
            setPaletteHeight(Math.min(maximum, Math.max(140, event.clientY - rect.top)));
            return;
          }
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
            const dx = (event.clientX - interaction.startX) / zoom;
            const dy = (event.clientY - interaction.startY) / zoom;
            const current = draftRef.current;
            const origins = new Map(interaction.origins.map((item) => [item.id, item]));
            onDraftChange({
              ...current,
              graph: {
                ...current.graph,
                nodes: current.graph.nodes.map((node) =>
                  origins.has(node.id)
                    ? { ...node, x: origins.get(node.id).x + dx, y: origins.get(node.id).y + dy }
                    : node,
                ),
              },
            });
            return;
          }
          if (interaction.type === 'marquee') {
            const rect = interaction.rect;
            setMarquee({
              x1: interaction.startX,
              y1: interaction.startY,
              x2: event.clientX - rect.left,
              y2: event.clientY - rect.top,
            });
            return;
          }
          if (interaction.type === 'connect') {
            const element = canvasRef.current;
            if (!element) return;
            const rect = element.getBoundingClientRect();
            const zoom = viewRef.current.zoom;
            setConnecting((current) =>
              current
                ? {
                    ...current,
                    current: {
                      x: (event.clientX - rect.left - viewRef.current.x) / zoom,
                      y: (event.clientY - rect.top - viewRef.current.y) / zoom,
                    },
                  }
                : current,
            );
          }
        };

        const onUp = (event) => {
          if (interaction.type === 'marquee') {
            const rect = interaction.rect;
            const localX = event.clientX - rect.left;
            const localY = event.clientY - rect.top;
            const screen = {
              x1: Math.min(interaction.startX, localX),
              y1: Math.min(interaction.startY, localY),
              x2: Math.max(interaction.startX, localX),
              y2: Math.max(interaction.startY, localY),
            };
            const zoom = viewRef.current.zoom;
            const world = {
              x1: (screen.x1 - viewRef.current.x) / zoom,
              y1: (screen.y1 - viewRef.current.y) / zoom,
              x2: (screen.x2 - viewRef.current.x) / zoom,
              y2: (screen.y2 - viewRef.current.y) / zoom,
            };
            const nodes = [];
            for (const node of graphRef.current.nodes) {
              const position = positionsRef.current.get(node.id);
              const size = sizesRef.current.get(node.id);
              if (!position || !size) continue;
              if (
                position.x < world.x2 &&
                position.x + size.width > world.x1 &&
                position.y < world.y2 &&
                position.y + size.height > world.y1
              ) {
                nodes.push(node.id);
              }
            }
            const edges = [];
            for (const edge of graphRef.current.edges) {
              const fromNode = graphRef.current.nodes.find((node) => node.id === edge.from);
              const toNode = graphRef.current.nodes.find((node) => node.id === edge.to);
              if (!fromNode || !toNode) continue;
              const fromPort = edge.fromPort || modulePorts(moduleByIdRef.current.get(fromNode.moduleId)).outputs[0] || '';
              const toPort = edge.toPort || modulePorts(moduleByIdRef.current.get(toNode.moduleId)).inputs[0] || '';
              const start = portPoint(edge.from, 'output', fromPort);
              const end = portPoint(edge.to, 'input', toPort);
              if (!start || !end) continue;
              const mid = edgeCurve(start, end, directionRef.current).mid;
              if (mid.x >= world.x1 && mid.x <= world.x2 && mid.y >= world.y1 && mid.y <= world.y2) edges.push(edge.id);
            }
            setSelection({ nodes, edges });
            setMarquee(null);
            setInteraction(null);
            return;
          }
          if (interaction.type === 'connect') {
            const target = document.elementFromPoint(event.clientX, event.clientY);
            const portElement = target && target.closest ? target.closest('[data-port-node]') : null;
            if (portElement) {
              const nodeId = portElement.getAttribute('data-port-node');
              const portName = portElement.getAttribute('data-port-name');
              const portKind = portElement.getAttribute('data-port-kind');
              const from = interaction.from;
              if (portKind !== from.kind && nodeId !== from.nodeId) {
                const outputSide = from.kind === 'output' ? from : { nodeId, port: portName };
                const inputSide = from.kind === 'input' ? from : { nodeId, port: portName };
                addEdge(outputSide.nodeId, outputSide.port, inputSide.nodeId, inputSide.port);
              }
            }
            setConnecting(null);
            setInteraction(null);
            return;
          }
          setInteraction(null);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
        };
      }, [interaction, onDraftChange]);

      const addModule = (module, anchor) => {
        if (!module) return;
        const current = draftRef.current;
        const id = uniqueNodeId(current.graph, module.id);
        const size = nodeSizeFor(module, directionRef.current);
        const element = canvasRef.current;
        const rect = element ? element.getBoundingClientRect() : null;
        const zoom = viewRef.current.zoom;
        const centerX = anchor ? anchor.x : rect ? (rect.width / 2 - viewRef.current.x) / zoom : 120;
        const centerY = anchor ? anchor.y : rect ? (rect.height / 2 - viewRef.current.y) / zoom : 80;
        const offset = anchor ? 0 : (current.graph.nodes.length % 4) * 18;
        onDraftChange({
          ...current,
          graph: {
            ...current.graph,
            nodes: [
              ...current.graph.nodes,
              {
                id,
                moduleId: module.id,
                label: '',
                params: { ...(module.params || {}) },
                x: centerX - size.width / 2 + offset,
                y: centerY - size.height / 2 + offset,
              },
            ],
          },
        });
        setSelection({ nodes: [id], edges: [] });
      };

      const onCanvasDrop = (event) => {
        event.preventDefault();
        setDragOver(false);
        const moduleId =
          event.dataTransfer.getData('text/aether-module') || event.dataTransfer.getData('text/plain');
        const module = moduleByIdRef.current.get(moduleId);
        if (!module) return;
        const element = canvasRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const zoom = viewRef.current.zoom;
        addModule(module, {
          x: (event.clientX - rect.left - viewRef.current.x) / zoom,
          y: (event.clientY - rect.top - viewRef.current.y) / zoom,
        });
      };

      const startSidebarResize = (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        setInteraction({ type: 'resize-sidebar' });
      };

      const startPaletteResize = (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        setInteraction({ type: 'resize-palette' });
      };

      const onViewportPointerDown = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.button === 2) {
          if (!event.shiftKey) return;
          event.preventDefault();
          setSelection({ nodes: [], edges: [] });
          setMarquee({ x1: event.clientX - rect.left, y1: event.clientY - rect.top, x2: event.clientX - rect.left, y2: event.clientY - rect.top });
          setInteraction({
            type: 'marquee',
            startX: event.clientX - rect.left,
            startY: event.clientY - rect.top,
            rect,
          });
          return;
        }
        if (event.button !== 0 && event.button !== 1) return;
        if (event.button === 0) setSelection({ nodes: [], edges: [] });
        setInteraction({
          type: 'pan',
          startX: event.clientX,
          startY: event.clientY,
          origin: { ...viewRef.current },
        });
      };

      const onNodePointerDown = (event, node) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        const additive = event.shiftKey;
        let dragIds = [];
        if (additive) {
          dragIds = selectionRef.current.nodes.includes(node.id)
            ? selectionRef.current.nodes.filter((id) => id !== node.id)
            : [...selectionRef.current.nodes, node.id];
          setSelection({ nodes: dragIds, edges: [] });
        } else if (selectionRef.current.nodes.includes(node.id) && selectionRef.current.nodes.length > 0) {
          dragIds = selectionRef.current.nodes;
        } else {
          dragIds = [node.id];
          setSelection({ nodes: dragIds, edges: [] });
        }
        if (!dragIds.length) return;
        const origins = dragIds.map((id) => ({ id, ...(positionsRef.current.get(id) || { x: 0, y: 0 }) }));
        setInteraction({ type: 'node', startX: event.clientX, startY: event.clientY, origins });
      };

      const onPortPointerDown = (event, nodeId, kind, portName) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.preventDefault();
        const start = portPoint(nodeId, kind, portName);
        if (!start) return;
        setConnecting({ from: { nodeId, port: portName, kind }, start, current: start });
        setInteraction({ type: 'connect', from: { nodeId, port: portName, kind } });
      };

      const onEdgePointerDown = (event, edgeId) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        const additive = event.shiftKey;
        setSelection((previous) =>
          additive
            ? {
                nodes: previous.nodes,
                edges: previous.edges.includes(edgeId)
                  ? previous.edges.filter((id) => id !== edgeId)
                  : [...previous.edges, edgeId],
              }
            : { nodes: [], edges: [edgeId] },
        );
      };

      const changeNodeModule = (nodeId, moduleId) => {
        const module = moduleById.get(moduleId);
        if (!module) return;
        const current = draftRef.current;
        const outputs = modulePorts(module).outputs;
        const inputs = modulePorts(module).inputs;
        const nodes = current.graph.nodes.map((node) =>
          node.id === nodeId ? { ...node, moduleId, params: { ...(module.params || {}) } } : node,
        );
        const edges = current.graph.edges.filter((edge) => {
          if (edge.from === nodeId && edge.fromPort && !outputs.includes(edge.fromPort)) return false;
          if (edge.to === nodeId && edge.toPort && !inputs.includes(edge.toPort)) return false;
          return true;
        });
        onDraftChange({ ...current, graph: { ...current.graph, nodes, edges } });
      };

      const patchNode = (nodeId, patch) => {
        const current = draftRef.current;
        onDraftChange({
          ...current,
          graph: {
            ...current.graph,
            nodes: current.graph.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
          },
        });
      };

      const selectedNodes = selection.nodes.map((id) => nodeById.get(id)).filter(Boolean);
      const selectedEdges = selection.edges
        .map((id) => graph.edges.find((edge) => edge.id === id))
        .filter(Boolean);
      const singleNode = selectedNodes.length === 1 && selectedEdges.length === 0 ? selectedNodes[0] : null;
      const singleEdge = selectedEdges.length === 1 && selectedNodes.length === 0 ? selectedEdges[0] : null;
      const selectedCount = selectedNodes.length + selectedEdges.length;
      const singleNodeId = singleNode ? singleNode.id : '';
      useEffect(() => {
        if (inspectorRef.current) inspectorRef.current.scrollTop = 0;
      }, [singleNodeId]);
      const bounds = canvasBounds(graph, positions, moduleById, direction, sizes);
      const padding = 500;
      const svgLeft = bounds.minX - padding;
      const svgTop = bounds.minY - padding;
      const svgWidth = bounds.width + padding * 2;
      const svgHeight = bounds.height + padding * 2;
      const broken = !localLayers(graph);

      const edgeLabel = (edge) => {
        const fromNode = nodeById.get(edge.from);
        const toNode = nodeById.get(edge.to);
        return `${fromNode ? fromNode.label || fromNode.id : edge.from} · ${edge.fromPort || '—'} → ${
          toNode ? toNode.label || toNode.id : edge.to
        } · ${edge.toPort || '—'}`;
      };

      return h(
        'div',
        { className: 'ath-page ath-page-editor' },
        h(
          'div',
          { className: 'ath-editor-head' },
          h('h2', { className: 'ath-editor-title' }, graph.id ? t('graphEditor.edit') : t('graphEditor.new')),
          draft.isCopy ? h('span', { className: 'ath-badge' }, t('graphEditor.copy')) : null,
          subgraph ? h('span', { className: 'ath-badge' }, t('graphs.subgraph')) : null,
          h(
            'div',
            { className: 'ath-actions' },
            h('button', { type: 'button', className: 'ath-btn', onClick: onBack, disabled: saving }, t('action.back')),
            graph.id
              ? h(
                  'button',
                  { type: 'button', className: 'ath-btn ath-btn-ghost ath-btn-danger', onClick: onDelete, disabled: saving },
                  t('action.delete'),
                )
              : null,
            h(
              'button',
              {
                type: 'button',
                className: 'ath-btn ath-btn-primary',
                onClick: onSave,
                disabled: saving || modules.length === 0 || broken,
                title: broken ? t('graphs.cycle') : undefined,
              },
              saving ? t('graphs.saving') : t('graphs.save'),
            ),
          ),
        ),
        errors.length
          ? h(
              'div',
              { className: 'ath-editor-errors' },
              h('div', { className: 'ath-error', style: { fontWeight: 600, marginBottom: 4 } }, t('graphs.fixErrors')),
              errors.map((error, index) => h('div', { className: 'ath-error', key: index }, `· ${error}`)),
            )
          : null,
        draft.isCopy ? h('div', { className: 'ath-hint', style: { marginBottom: 8 } }, t('graphEditor.copyHint')) : null,
        subgraph
          ? h('div', { className: 'ath-hint', style: { marginBottom: 8 } }, t('graphs.subgraphRunHint'))
          : null,
        h(
          'div',
          { className: 'ath-editor-meta' },
          h('input', {
            className: 'ath-input',
            type: 'text',
            value: graph.name,
            placeholder: t('graphs.name'),
            maxLength: 120,
            onChange: (event) => {
              const current = draftRef.current;
              onDraftChange({ ...current, graph: { ...current.graph, name: event.target.value } });
            },
          }),
          h('input', {
            className: 'ath-input',
            type: 'text',
            value: graph.description,
            placeholder: t('graphs.desc'),
            maxLength: 300,
            onChange: (event) => {
              const current = draftRef.current;
              onDraftChange({ ...current, graph: { ...current.graph, description: event.target.value } });
            },
          }),
        ),
        h(
          'div',
          {
            className: 'ath-editor',
            ref: editorRef,
            style: { '--ath-sidebar-width': `${sidebarWidth}px` },
          },
          h(
            'div',
            { className: 'ath-editor-main' },
            h(
              'div',
              {
                className: 'ath-canvas-viewport',
                ref: canvasRef,
                onPointerDown: onViewportPointerDown,
                onContextMenu: (event) => event.preventDefault(),
                onDragEnter: (event) => {
                  event.preventDefault();
                  setDragOver(true);
                },
                onDragOver: (event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'copy';
                },
                onDragLeave: (event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setDragOver(false);
                },
                onDrop: onCanvasDrop,
                'data-panning': interaction && interaction.type === 'pan' ? 'true' : 'false',
                'data-connecting': connecting ? 'true' : 'false',
                'data-dragover': dragOver ? 'true' : 'false',
              },
              graph.nodes.length === 0
                ? h('div', { className: 'ath-canvas-empty' }, h('strong', null, t('graphs.canvasEmpty')))
                : null,
              h(
                'div',
                {
                  className: 'ath-canvas-layer',
                  style: { transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` },
                },
                graph.nodes.length
                  ? h(
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
                            id: 'ath-edge-arrow',
                            viewBox: '0 0 10 10',
                            refX: 8,
                            refY: 5,
                            markerWidth: 6,
                            markerHeight: 6,
                            orient: 'auto-start-reverse',
                          },
                          h('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--dsw-alias-border-l2)' }),
                        ),
                      ),
                      edgeGeometry.map((edge) =>
                        h(
                          'g',
                          { key: edge.id },
                          h('path', {
                            d: edge.d,
                            className: 'ath-edge',
                            markerEnd: 'url(#ath-edge-arrow)',
                            'data-selected': selection.edges.includes(edge.id) ? 'true' : 'false',
                          }),
                          h('path', {
                            d: edge.d,
                            className: 'ath-edge-hit',
                            onPointerDown: (event) => onEdgePointerDown(event, edge.id),
                          }),
                        ),
                      ),
                      connecting
                        ? h('path', {
                            d: edgeCurve(connecting.start, connecting.current, direction).d,
                            className: 'ath-edge-pending',
                          })
                        : null,
                    )
                  : null,
                graph.nodes.map((node) => {
                  const module = moduleById.get(node.moduleId);
                  const ports = modulePorts(module);
                  const position = positions.get(node.id) || { x: 0, y: 0 };
                  const size = sizes.get(node.id) || nodeSizeFor(module, direction);
                  const selected = selection.nodes.includes(node.id);
                  const rows = Math.max(ports.inputs.length, ports.outputs.length);
                  const requiredInputs = new Set(module && Array.isArray(module.requiredInputs) ? module.requiredInputs : []);
                  const effectiveParams = module ? { ...(module.params || {}), ...(node.params || {}) } : {};
                  const paramPairs = Object.entries(effectiveParams).map(([key, value]) => [
                    key,
                    String(value == null ? '' : value).replace(/\s+/g, ' '),
                  ]);
                  const paramShort = paramPairs
                    .slice(0, 2)
                    .map(([key, value]) => `${key}=${value}`)
                    .join(' · ');
                  const paramFull = paramPairs.map(([key, value]) => `${key}=${value}`).join('\n');
                  const moduleName = module ? module.name : node.moduleId;
                  const nodeSub = `${moduleName}${paramShort ? ` · ${paramShort}` : ''}${
                    paramPairs.length > 2 ? ` +${paramPairs.length - 2}` : ''
                  }`;
                  return h(
                    'div',
                    {
                      key: node.id,
                      className: 'ath-node-card',
                      'data-selected': selected ? 'true' : 'false',
                      'data-kind': module ? module.kind : 'command',
                      'data-direction': direction,
                      style: { left: position.x, top: position.y, width: size.width, height: size.height },
                      onPointerDown: (event) => onNodePointerDown(event, node),
                    },
                    h(
                      'div',
                      { className: 'ath-node-head' },
                      h('span', { className: 'ath-node-title' }, node.label || (module ? module.name : node.moduleId)),
                      module && module.kind !== 'command' ? h('span', { className: 'ath-node-tag' }, t(`modules.kind.${module.kind}`)) : null,
                      h(
                        'span',
                        { className: 'ath-node-sub', title: paramFull || undefined },
                        nodeSub,
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
                                      title: `${t('canvas.input')}: ${port}${requiredInputs.has(port) ? ` (${t('modules.requiredInput')})` : ''}`,
                                    },
                                    `${port}${requiredInputs.has(port) ? ' *' : ''}`,
                                  ),
                                )
                              : ports.outputs.length
                                ? null
                                : h('span', { className: 'ath-vport-empty' }, t('canvas.noPorts')),
                          ),
                          h(
                            'div',
                            { className: 'ath-node-vports-row ath-node-vports-bottom' },
                            ports.outputs.map((port) => h('span', { key: `out-${port}`, className: 'ath-vport-name' }, port)),
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
                                  },
                                  `${ports.inputs[row] || ''}${requiredInputs.has(ports.inputs[row]) ? ' *' : ''}`,
                                ),
                                h('span', { className: 'ath-port-name ath-port-out-name' }, ports.outputs[row] || ''),
                              ),
                            ),
                          )
                        : h('div', { className: 'ath-node-noports' }, t('canvas.noPorts')),
                    ports.inputs.map((port, index) =>
                      h('div', {
                        key: `in-${port}`,
                        className: `ath-port-dot ath-port-in${requiredInputs.has(port) ? ' ath-port-required' : ''}${direction === 'vertical' ? ' ath-port-top' : ''}`,
                        style:
                          direction === 'vertical'
                            ? { left: portX(index, ports.inputs.length, size.width) - 6, top: -6 }
                            : { top: portTop(index) - 6 },
                        'data-port-node': node.id,
                        'data-port-name': port,
                        'data-port-kind': 'input',
                        title: `${t('canvas.input')}: ${port}${requiredInputs.has(port) ? ` (${t('modules.requiredInput')})` : ''}`,
                        onPointerDown: (event) => onPortPointerDown(event, node.id, 'input', port),
                      }),
                    ),
                    ports.outputs.map((port, index) =>
                      h('div', {
                        key: `out-${port}`,
                        className: `ath-port-dot ath-port-out${direction === 'vertical' ? ' ath-port-bottom' : ''}`,
                        style:
                          direction === 'vertical'
                            ? { left: portX(index, ports.outputs.length, size.width) - 6, top: size.height - 6 }
                            : { top: portTop(index) - 6 },
                        'data-port-node': node.id,
                        'data-port-name': port,
                        'data-port-kind': 'output',
                        title: `${t('canvas.output')}: ${port}`,
                        onPointerDown: (event) => onPortPointerDown(event, node.id, 'output', port),
                      }),
                    ),
                  );
                }),
                connecting
                  ? h('div', {
                      className: 'ath-connect-origin',
                      style: { left: connecting.start.x - 4, top: connecting.start.y - 4 },
                    })
                  : null,
              ),
              marquee
                ? h('div', {
                    className: 'ath-marquee',
                    style: {
                      left: Math.min(marquee.x1, marquee.x2),
                      top: Math.min(marquee.y1, marquee.y2),
                      width: Math.abs(marquee.x2 - marquee.x1),
                      height: Math.abs(marquee.y2 - marquee.y1),
                    },
                  })
                : null,
              h(
                'div',
                {
                  className: 'ath-canvas-tools',
                  onPointerDown: (event) => event.stopPropagation(),
                },
                h(
                  'div',
                  { className: 'ath-segmented ath-layout-toggle' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'ath-seg-btn',
                      'data-active': direction === 'vertical' ? 'true' : 'false',
                      onClick: () => setDirection('vertical'),
                      title: t('canvas.vertical'),
                    },
                    t('canvas.vertical'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'ath-seg-btn',
                      'data-active': direction === 'horizontal' ? 'true' : 'false',
                      onClick: () => setDirection('horizontal'),
                      title: t('canvas.horizontal'),
                    },
                    t('canvas.horizontal'),
                  ),
                ),
                h('span', { className: 'ath-tool-sep' }),
                h('button', { type: 'button', className: 'ath-btn ath-btn-ghost', onClick: () => applyLayout(false, false) }, t('canvas.tidy')),
                h('button', { type: 'button', className: 'ath-btn ath-btn-ghost', onClick: () => applyLayout(true, true) }, t('canvas.reset')),
                selectedCount
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'ath-btn ath-btn-ghost ath-btn-danger',
                        onClick: deleteSelection,
                      },
                      `${t('canvas.deleteSelected')} (${selectedCount})`,
                    )
                  : null,
                h('span', { className: 'ath-tool-sep' }),
                h('button', { type: 'button', className: 'ath-icon-btn', onClick: () => zoomBy(1 / 1.2), title: t('canvas.zoomOut') }, '−'),
                h(
                  'button',
                  { type: 'button', className: 'ath-zoom-value', onClick: () => zoomTo(1), title: t('canvas.zoomReset') },
                  `${Math.round(view.zoom * 100)}%`,
                ),
                h('button', { type: 'button', className: 'ath-icon-btn', onClick: () => zoomBy(1.2), title: t('canvas.zoomIn') }, '+'),
              ),
              cycleNotice ? h('div', { className: 'ath-canvas-warning' }, cycleNotice) : null,
              h('div', { className: 'ath-canvas-hint' }, t('canvas.hint')),
            ),
          ),
          h('div', {
            className: 'ath-editor-resizer',
            role: 'separator',
            'aria-orientation': 'vertical',
            'aria-label': t('canvas.resizeSidebar'),
            title: t('canvas.resizeSidebar'),
            onPointerDown: startSidebarResize,
          }),
          h(
            'div',
            { className: 'ath-editor-side', ref: sideRef },
            h(
              'div',
              { className: 'ath-card ath-palette', style: { height: `${paletteHeight}px` } },
              h('div', { className: 'ath-palette-head' }, h('h4', { className: 'ath-section-title' }, t('canvas.paletteTitle'))),
              h('input', {
                className: 'ath-input',
                type: 'search',
                value: paletteQuery,
                placeholder: t('canvas.searchPlaceholder'),
                onChange: (event) => setPaletteQuery(event.target.value),
              }),
              h(
                'div',
                { className: 'ath-chips', style: { marginTop: 8 } },
                ['all', 'command', 'graph', 'dataset'].map((key) =>
                  h(
                    'button',
                    {
                      key,
                      type: 'button',
                      className: 'ath-chip',
                      'data-active': paletteFilter === key ? 'true' : 'false',
                      onClick: () => setPaletteFilter(key),
                    },
                    t(`canvas.filter.${key}`),
                  ),
                ),
              ),
              h(
                'div',
                { className: 'ath-palette-list' },
                paletteItems.length
                  ? paletteItems.map((module) => {
                      const ports = modulePorts(module);
                      return h(
                        'button',
                        {
                          key: module.id,
                          type: 'button',
                          className: 'ath-palette-item',
                          draggable: true,
                          onClick: () => {
                            if (draggingRef.current) return;
                            addModule(module);
                          },
                          onDragStart: (event) => {
                            draggingRef.current = true;
                            event.dataTransfer.setData('text/aether-module', module.id);
                            event.dataTransfer.setData('text/plain', module.id);
                            event.dataTransfer.effectAllowed = 'copy';
                          },
                          onDragEnd: () => {
                            setDragOver(false);
                            window.setTimeout(() => {
                              draggingRef.current = false;
                            }, 0);
                          },
                          title: t('canvas.paletteHint'),
                        },
                        h(
                          'span',
                          { className: 'ath-palette-row' },
                          h('span', { className: 'ath-palette-name' }, module.name),
                          h('span', { className: 'ath-badge', 'data-kind': module.kind }, t(`modules.kind.${module.kind}`)),
                        ),
                        h(
                          'span',
                          { className: 'ath-palette-meta' },
                          tr(t, 'canvas.portSummary', { inputs: ports.inputs.length, outputs: ports.outputs.length }),
                          (module.requiredInputs || []).length
                            ? ` · ${tr(t, 'modules.requiredCount', { n: module.requiredInputs.length })}`
                            : '',
                          ` · ${t('common.params')} ${Object.keys(module.params || {}).length}`,
                          ` · ${tr(t, 'modules.versionLabel', { version: module.version || 1 })}`,
                          module.environmentName ? ` · ${module.environmentName}` : '',
                        ),
                        h(
                          'span',
                          { className: 'ath-palette-desc' },
                          module.kind === 'dataset'
                            ? module.datasetUri || ''
                            : module.kind === 'graph'
                              ? module.subgraphName || module.graphId || ''
                              : module.description || '',
                        ),
                      );
                    })
                  : h('div', { className: 'ath-hint', style: { padding: '10px 0' } }, t('canvas.emptyPalette')),
              ),
            ),
            h('div', {
              className: 'ath-palette-resizer',
              role: 'separator',
              'aria-orientation': 'horizontal',
              'aria-label': t('canvas.resizePalette'),
              title: t('canvas.resizePalette'),
              onPointerDown: startPaletteResize,
            }),
            h(
              'div',
              { className: 'ath-card ath-inspector', ref: inspectorRef },
              h('h4', { className: 'ath-section-title' }, t('graphs.inspector')),
              singleNode
                ? h(
                    'div',
                    null,
                    (() => {
                      const module = moduleById.get(singleNode.moduleId);
                      const ports = modulePorts(module);
                      const entries = Object.entries(singleNode.params || {});
                      return h(
                        'div',
                        { className: 'ath-module-detail' },
                        h(
                          'div',
                          { className: 'ath-module-detail-head' },
                          h('strong', { className: 'ath-module-detail-name' }, module ? module.name : singleNode.moduleId),
                          module
                            ? h(
                                'span',
                                { className: 'ath-badge', 'data-kind': module.kind },
                                t(`modules.kind.${module.kind}`),
                              )
                            : null,
                          module
                            ? h(
                                'span',
                                { className: 'ath-badge' },
                                tr(t, 'modules.versionLabel', { version: module.version || 1 }),
                              )
                            : null,
                          module
                            ? h(
                                'span',
                                { className: 'ath-node-env' },
                                environmentName(t, environments, module.environmentId, module.environmentName),
                              )
                            : null,
                        ),
                        h(
                          'div',
                          { className: 'ath-hint' },
                          `${t('canvas.inputs')}: ${ports.inputs.length ? ports.inputs.join(', ') : t('canvas.none')} · ${t(
                            'canvas.outputs',
                          )}: ${ports.outputs.length ? ports.outputs.join(', ') : t('canvas.none')}`,
                        ),
                        h(
                          'div',
                          { className: 'ath-param-summary' },
                          entries.length
                            ? entries.map(([key, value]) =>
                                h('span', { className: 'ath-param-chip', key }, `${key}=${value}`),
                              )
                            : h('span', { className: 'ath-hint' }, t('common.noParams')),
                        ),
                        h('div', { className: 'ath-hint', style: { marginTop: 4 } }, t('canvas.nodeParamsHint')),
                      );
                    })(),
                    h(
                      'div',
                      { className: 'ath-field', style: { marginTop: 12 } },
                      h('label', { className: 'ath-label' }, t('graphs.nodeLabel')),
                      h('input', {
                        className: 'ath-input',
                        type: 'text',
                        value: singleNode.label,
                        placeholder: t('graphs.nodeLabelPlaceholder'),
                        maxLength: 120,
                        onChange: (event) => patchNode(singleNode.id, { label: event.target.value }),
                      }),
                    ),
                    h(
                      'div',
                      { className: 'ath-field' },
                      h('label', { className: 'ath-label' }, t('graphs.nodeModule')),
                      h(
                        'select',
                        {
                          className: 'ath-select',
                          value: singleNode.moduleId,
                          onChange: (event) => changeNodeModule(singleNode.id, event.target.value),
                        },
                        modules.map((module) => h('option', { key: module.id, value: module.id }, module.name)),
                      ),
                    ),
                    (() => {
                      const module = moduleById.get(singleNode.moduleId);
                      return module && module.kind === 'graph'
                        ? h(
                            'div',
                            { className: 'ath-subgraph-link' },
                            h('div', { className: 'ath-hint', style: { marginTop: 6 } }, tr(t, 'graphs.subgraphTip', { name: module.name })),
                            module.graphId
                              ? h(
                                  'button',
                                  {
                                    type: 'button',
                                    className: 'ath-btn ath-btn-ghost',
                                    onClick: () => onOpenSubgraph(module.graphId),
                                  },
                                  t('graphs.openSubgraph'),
                                )
                              : null,
                          )
                        : null;
                    })(),
                    h(
                      'div',
                      { className: 'ath-field', style: { marginTop: 12 } },
                      h('label', { className: 'ath-label' }, t('common.params')),
                      h(ParamsEditor, {
                        key: `${singleNode.id}:${singleNode.moduleId}`,
                        t,
                        value: singleNode.params,
                        onChange: (params) => patchNode(singleNode.id, { params }),
                      }),
                    ),
                    h(
                      'div',
                      { className: 'ath-field', style: { marginTop: 14 } },
                      h('label', { className: 'ath-label' }, t('graphs.nodeDeps')),
                      h(
                        'div',
                        { className: 'ath-dep-list' },
                        graph.edges
                          .filter((edge) => edge.to === singleNode.id || edge.from === singleNode.id)
                          .map((edge) =>
                            h(
                              'div',
                              { className: 'ath-dep-row', key: edge.id },
                              h('span', { className: 'ath-hint', style: { flex: 1, overflowWrap: 'anywhere' } }, edgeLabel(edge)),
                              h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'ath-icon-btn',
                                  title: t('graphs.removeEdge'),
                                  'aria-label': t('graphs.removeEdge'),
                                  onClick: () => {
                                    const current = draftRef.current;
                                    onDraftChange({
                                      ...current,
                                      graph: {
                                        ...current.graph,
                                        edges: current.graph.edges.filter((item) => item.id !== edge.id),
                                      },
                                    });
                                  },
                                },
                                '×',
                              ),
                            ),
                          ),
                        graph.edges.some((edge) => edge.to === singleNode.id || edge.from === singleNode.id)
                          ? null
                          : h('div', { className: 'ath-hint' }, t('graphs.noDeps')),
                      ),
                      h('div', { className: 'ath-hint', style: { marginTop: 8 } }, t('canvas.connectHint')),
                    ),
                    h(
                      'div',
                      { style: { marginTop: 14 } },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'ath-btn ath-btn-ghost ath-btn-danger',
                          onClick: () => {
                            const current = draftRef.current;
                            onDraftChange({
                              ...current,
                              graph: {
                                ...current.graph,
                                nodes: current.graph.nodes.filter((item) => item.id !== singleNode.id),
                                edges: current.graph.edges.filter(
                                  (edge) => edge.from !== singleNode.id && edge.to !== singleNode.id,
                                ),
                              },
                            });
                            setSelection({ nodes: [], edges: [] });
                          },
                        },
                        t('graphs.deleteNode'),
                      ),
                    ),
                  )
                : singleEdge
                  ? h(
                      'div',
                      { className: 'ath-detail', style: { gap: 10 } },
                      h('div', { className: 'ath-hint' }, t('canvas.edgeSelected')),
                      h('div', { className: 'ath-mono', style: { fontSize: 11.5, overflowWrap: 'anywhere' } }, edgeLabel(singleEdge)),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'ath-btn ath-btn-ghost ath-btn-danger',
                          onClick: () => {
                            const current = draftRef.current;
                            onDraftChange({
                              ...current,
                              graph: {
                                ...current.graph,
                                edges: current.graph.edges.filter((edge) => edge.id !== singleEdge.id),
                              },
                            });
                            setSelection({ nodes: [], edges: [] });
                          },
                        },
                        t('graphs.removeEdge'),
                      ),
                    )
                  : selectedCount
                    ? h(
                        'div',
                        { className: 'ath-detail', style: { gap: 10 } },
                        h(
                          'div',
                          { className: 'ath-hint' },
                          `${selectedNodes.length} ${t('common.nodes')} · ${selectedEdges.length} ${t('common.edges')}`,
                        ),
                        h(
                          'button',
                          { type: 'button', className: 'ath-btn ath-btn-ghost ath-btn-danger', onClick: deleteSelection },
                          t('canvas.deleteSelected'),
                        ),
                      )
                    : h('div', { className: 'ath-hint' }, t('graphs.selectNode')),
            ),
            broken ? h('div', { className: 'ath-error' }, t('graphs.cycle')) : null,
          ),
        ),
      );
    }
