/* render-charts runtime — ECharts hydration, toolbar, tables and exports.
 *
 * Options travel from the builder as JSON with `__fn` markers; this file turns
 * them into real formatter functions. The same file is loaded by Node (through
 * a vm sandbox) for server-side SVG rendering, so formatting has exactly one
 * implementation. It also owns the interactive table component. */
(function () {
  "use strict";

  var STYLE = {
    zh: { table: "数据", copy: "复制数据", csv: "CSV", png: "PNG", svg: "SVG", themeDark: "深色", themeLight: "浅色", search: "搜索…", rows: "行", page: "页", prev: "上一页", next: "下一页", empty: "没有匹配的行" },
    en: { table: "Data", copy: "Copy", csv: "CSV", png: "PNG", svg: "SVG", themeDark: "Dark", themeLight: "Light", search: "Search…", rows: "rows", page: "page", prev: "Prev", next: "Next", empty: "No matching rows" },
  };

  // ---------------------------------------------------------------- formatting

  var ZH_UNITS = [[1e8, "亿"], [1e4, "万"]];
  var EN_UNITS = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];

  function stripZeros(text) {
    if (text.indexOf(".") < 0) return text;
    return text.replace(/0+$/, "").replace(/\.$/, "") || "0";
  }

  function humanize(value, lang, decimals) {
    if (value === null || value === undefined || isNaN(value)) return "—";
    var sign = value < 0 ? "-" : "";
    var magnitude = Math.abs(value);
    var units = lang === "zh" ? ZH_UNITS : EN_UNITS;
    for (var i = 0; i < units.length; i += 1) {
      if (magnitude >= units[i][0]) {
        return sign + stripZeros((magnitude / units[i][0]).toFixed(decimals === undefined ? 1 : decimals)) + units[i][1];
      }
    }
    if (magnitude >= 1000) return sign + Math.round(magnitude).toLocaleString("en-US");
    return sign + stripZeros(magnitude.toFixed(Math.max(decimals === undefined ? 1 : decimals, 2)));
  }

  function formatValue(value, fmt, lang) {
    if (value === null || value === undefined || (typeof value === "number" && isNaN(value))) return "—";
    if (typeof value === "string") return value;
    var number = Number(value);
    if (!isFinite(number)) return "—";
    var spec = typeof fmt === "string" ? { style: fmt } : fmt || {};
    var style = String(spec.style || "number").toLowerCase();
    var decimals = spec.decimals;
    var text;
    if (style === "integer") text = Math.round(number).toLocaleString("en-US");
    else if (style === "compact") text = humanize(number, lang, decimals === undefined ? 1 : decimals);
    else if (style === "percent") text = stripZeros((number * 100).toFixed(decimals === undefined ? 1 : decimals)) + "%";
    else if (style === "currency") {
      var symbol = spec.symbol || "¥";
      text = symbol + Math.abs(number).toFixed(decimals === undefined ? 2 : decimals);
      if (number < 0) text = "-" + text;
    } else {
      var digits = decimals;
      if (digits === null || digits === undefined) digits = Math.abs(number) >= 1000 || Number.isInteger(number) ? 0 : 2;
      text = stripZeros(number.toFixed(digits));
      var parts = text.split(".");
      parts[0] = Number(parts[0]).toLocaleString("en-US");
      text = parts.join(".");
    }
    return (spec.prefix || "") + text + (spec.unit ? " " + spec.unit : "") + (spec.suffix || "");
  }

  function tickLabel(value, fmt, lang) {
    if (fmt) return formatValue(value, fmt, lang);
    return Math.abs(value) >= 10000 ? humanize(value, lang, 1) : formatValue(value, { style: "number" }, lang);
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function formatDate(date, pattern, days, lang) {
    if (typeof date === "number") date = new Date(date);
    var year = date.getUTCFullYear(), month = date.getUTCMonth() + 1, day = date.getUTCDate();
    if (pattern && pattern !== "auto") {
      return String(pattern)
        .replace(/%Y/g, String(year))
        .replace(/%m/g, pad(month))
        .replace(/%d/g, pad(day))
        .replace(/%H/g, pad(date.getUTCHours()))
        .replace(/%M/g, pad(date.getUTCMinutes()));
    }
    if (days === null || days === undefined) return year + "-" + pad(month) + "-" + pad(day);
    if (days <= 2) return pad(date.getUTCHours()) + ":" + pad(date.getUTCMinutes());
    if (days <= 180) {
      return lang === "zh" ? month + "月" + day + "日" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    }
    if (days <= 1000) return year + "-" + pad(month);
    return String(year);
  }

  function scalar(value) {
    if (Array.isArray(value)) return value[value.length - 1];
    if (value && typeof value === "object" && "value" in value) return scalar(value.value);
    return value;
  }

  // ----------------------------------------------------------------- hydration

  function buildFunction(marker) {
    switch (marker.__fn) {
      case "tick":
        return function (value) {
          return tickLabel(scalar(value), marker.fmt, marker.lang);
        };
      case "value":
        return function (value) {
          return formatValue(scalar(value), marker.fmt, marker.lang);
        };
      case "date":
        return function (value) {
          return formatDate(new Date(value), marker.pattern, marker.days, marker.lang);
        };
      case "pieTip":
        return function (params) {
          var percent = formatValue(params.percent / 100, { style: "percent", decimals: 1 }, marker.lang);
          return params.marker + params.name + "<br/><b>" + formatValue(params.value, marker.fmt, marker.lang) + marker.unit + "</b> · " + percent;
        };
      case "heatTip":
        return function (params) {
          return marker.rows[params.value[1]] + " · " + marker.cols[params.value[0]] + "<br/><b>" + formatValue(params.value[2], marker.fmt, marker.lang) + "</b>";
        };
      case "wfColor":
        return function (params) {
          if (marker.totals.indexOf(params.dataIndex) >= 0) return marker.total;
          var delta = params.data && params.data.delta !== undefined ? params.data.delta : params.value;
          return delta >= 0 ? marker.positive : marker.negative;
        };
      case "wfLabel":
        return function (params) {
          var delta = params.data && params.data.delta !== undefined ? params.data.delta : params.value;
          return formatValue(delta, marker.fmt, marker.lang);
        };
      case "bubble":
        return function (value) {
          var size = Array.isArray(value) ? value[2] : NaN;
          if (!isFinite(size)) return 8;
          var ratio = marker.high === marker.low ? 0.5 : (size - marker.low) / (marker.high - marker.low);
          return 8 + Math.sqrt(Math.max(ratio, 0)) * 26;
        };
      case "stagger":
        return function (index) {
          return Math.min(index * marker.step, marker.max);
        };
      default:
        return function () {
          return "";
        };
    }
  }

  function hydrate(node) {
    if (Array.isArray(node)) return node.map(hydrate);
    if (node && typeof node === "object") {
      if (typeof node.__fn === "string") return buildFunction(node);
      var out = {};
      for (var key in node) {
        if (Object.prototype.hasOwnProperty.call(node, key)) out[key] = hydrate(node[key]);
      }
      return out;
    }
    return node;
  }

  // ------------------------------------------------------------------- tables

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function cellNode(cell, column) {
    var td = document.createElement("td");
    td.className = "rc-td rc-" + (column.align || "left");
    if (column.numeric) td.classList.add("rc-num");
    if (cell.tone) {
      td.classList.add("rc-tone-" + cell.tone);
    }
    if (cell.bar !== undefined && cell.bar !== null) {
      var bar = el("span", "rc-cellbar");
      bar.style.width = Math.round(cell.bar * 100) + "%";
      td.appendChild(bar);
      var label = el("span", "rc-cellbar-label", cell.text);
      td.appendChild(label);
    } else {
      td.textContent = cell.text;
    }
    return td;
  }

  function Table(host, model, strings) {
    this.host = host;
    this.model = model;
    this.strings = strings;
    this.sortKey = null;
    this.sortDir = 0;
    this.search = "";
    this.page = 0;
    this.options = model.options || {};
    this.pageSize = this.options.pageSize === undefined ? 10 : this.options.pageSize;
    this.render();
  }

  Table.prototype.rows = function () {
    var model = this.model;
    var indexes = model.rows.map(function (_, index) {
      return index;
    });
    if (this.search) {
      var needle = this.search.toLowerCase();
      var columns = model.columns;
      indexes = indexes.filter(function (index) {
        return model.rows[index].some(function (cell, columnIndex) {
          return String(cell.text || "").toLowerCase().indexOf(needle) >= 0;
        });
      });
    }
    if (this.sortKey !== null && this.sortDir !== 0) {
      var direction = this.sortDir;
      indexes.sort(function (a, b) {
        var left = model.rows[a][this.sortKey];
        var right = model.rows[b][this.sortKey];
        var leftValue = left.value === null || left.value === undefined ? left.text : left.value;
        var rightValue = right.value === null || right.value === undefined ? right.text : right.value;
        if (typeof leftValue === "number" && typeof rightValue === "number") return direction * (leftValue - rightValue);
        return direction * String(leftValue).localeCompare(String(rightValue), "zh");
      }.bind(this));
    }
    return indexes;
  };

  Table.prototype.render = function () {
    var self = this;
    var model = this.model;
    var strings = this.strings;
    this.host.textContent = "";

    var tools = el("div", "rc-table-tools");
    if (this.options.search) {
      var input = el("input", "rc-search");
      input.type = "search";
      input.placeholder = strings.search;
      input.value = this.search;
      input.addEventListener("input", function () {
        self.search = input.value;
        self.page = 0;
        self.render();
        self.focusSearch();
      });
      tools.appendChild(input);
    }
    var count = el("span", "rc-count");
    tools.appendChild(count);
    var csvButton = el("button", "rc-tool", strings.csv);
    csvButton.type = "button";
    csvButton.addEventListener("click", function () {
      downloadCsv(self.model, (self.model.title || "table") + ".csv");
    });
    tools.appendChild(csvButton);
    this.host.appendChild(tools);

    var indexes = this.rows();
    var total = indexes.length;
    var pageSize = this.pageSize > 0 ? this.pageSize : total || 1;
    var pages = Math.max(1, Math.ceil(total / pageSize));
    if (this.page >= pages) this.page = pages - 1;
    var start = this.page * pageSize;
    var slice = indexes.slice(start, start + pageSize);

    count.textContent = total + " " + strings.rows;

    var scroll = el("div", "rc-table-scroll");
    var table = document.createElement("table");
    if (this.options.dense) table.classList.add("rc-dense");
    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    if (this.options.index) headRow.appendChild(el("th", "rc-th rc-left", "#"));
    model.columns.forEach(function (column, index) {
      var th = el("th", "rc-th rc-" + (column.align || "left"));
      if (column.numeric) th.classList.add("rc-num");
      if (column.width) th.style.width = column.width + "px";
      var button = el("button", "rc-sort", column.label);
      button.type = "button";
      if (self.options.sort) {
        button.addEventListener("click", function () {
          if (self.sortKey === index) {
            self.sortDir = self.sortDir === 1 ? -1 : self.sortDir === -1 ? 0 : 1;
            if (self.sortDir === 0) self.sortKey = null;
          } else {
            self.sortKey = index;
            self.sortDir = 1;
          }
          self.render();
        });
      }
      if (self.sortKey === index && self.sortDir !== 0) {
        button.appendChild(el("span", "rc-sort-mark", self.sortDir === 1 ? "▲" : "▼"));
      }
      th.appendChild(button);
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    if (!slice.length) {
      var emptyRow = document.createElement("tr");
      var emptyCell = el("td", "rc-empty", strings.empty);
      emptyCell.colSpan = model.columns.length + (this.options.index ? 1 : 0);
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
    }
    slice.forEach(function (rowIndex) {
      var row = document.createElement("tr");
      if (self.options.index) row.appendChild(el("td", "rc-td rc-idx", String(rowIndex + 1)));
      model.rows[rowIndex].forEach(function (cell, columnIndex) {
        row.appendChild(cellNode(cell, model.columns[columnIndex]));
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    if (model.totals && Object.keys(model.totals).length) {
      var tfoot = document.createElement("tfoot");
      var footRow = document.createElement("tr");
      if (this.options.index) footRow.appendChild(el("td", "rc-td"));
      model.columns.forEach(function (column, index) {
        var cell = { text: "" };
        var totalValue = null;
        Object.keys(model.totals).forEach(function (name) {
          if (name === column.key || name === String(index)) totalValue = model.totals[name];
        });
        if (index === 0) cell.text = "合计";
        else if (totalValue !== null) cell.text = formatValue(totalValue, column.format, model.lang || "zh");
        var td = el("td", "rc-td rc-" + (column.align || "left"), cell.text);
        if (column.numeric) td.classList.add("rc-num");
        footRow.appendChild(td);
      });
      tfoot.appendChild(footRow);
      table.appendChild(tfoot);
    }

    scroll.appendChild(table);
    this.host.appendChild(scroll);

    if (this.pageSize > 0 && pages > 1) {
      var pager = el("div", "rc-pager");
      var prev = el("button", "rc-tool", strings.prev);
      prev.type = "button";
      prev.disabled = this.page === 0;
      prev.addEventListener("click", function () {
        self.page = Math.max(0, self.page - 1);
        self.render();
      });
      var label = el("span", "rc-page-label", this.page + 1 + " / " + pages);
      var next = el("button", "rc-tool", strings.next);
      next.type = "button";
      next.disabled = this.page >= pages - 1;
      next.addEventListener("click", function () {
        self.page = Math.min(pages - 1, self.page + 1);
        self.render();
      });
      pager.appendChild(prev);
      pager.appendChild(label);
      pager.appendChild(next);
      this.host.appendChild(pager);
    }
  };

  Table.prototype.focusSearch = function () {
    var input = this.host.querySelector(".rc-search");
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  };

  function csvOf(model) {
    var lines = [model.columns.map(function (column) { return column.label; }).join(",")];
    model.rows.forEach(function (row) {
      lines.push(row.map(function (cell) {
        var text = String(cell.text === "—" ? "" : cell.text);
        return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
      }).join(","));
    });
    return lines.join("\n");
  }

  function downloadCsv(model, name) {
    download(new Blob(["\ufeff" + csvOf(model)], { type: "text/csv;charset=utf-8" }), name);
  }

  // ------------------------------------------------------------------- export

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function downloadDataUrl(url, name) {
    var link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function slug(text) {
    return String(text || "chart").replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 48) || "chart";
  }

  function themeOf(figure) {
    var explicit = figure.dataset.theme;
    if (explicit === "dark" || explicit === "light") return explicit;
    var root = document.documentElement.dataset.theme;
    if (root === "dark" || root === "light") return root;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function canvasColor(figure) {
    var styles = window.getComputedStyle(figure);
    return styles.backgroundColor || "#ffffff";
  }

  function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  // -------------------------------------------------------------------- mount

  function mount(config) {
    var figure = document.querySelector('.rc-figure[data-rc="' + config.id + '"]');
    if (!figure) return null;
    var strings = STYLE[config.lang === "en" ? "en" : "zh"];
    var meta = config.meta;
    var canvas = figure.querySelector(".rc-canvas");
    var tablePanel = figure.querySelector(".rc-table-panel");
    var chart = null;
    var tableInstance = null;

    function applyTheme(mode) {
      document.documentElement.dataset.theme = mode;
      var figures = document.querySelectorAll(".rc-figure");
      for (var i = 0; i < figures.length; i += 1) figures[i].dataset.theme = mode;
      document.querySelectorAll("[data-rc-action='theme']").forEach(function (button) {
        button.textContent = mode === "dark" ? strings.themeLight : strings.themeDark;
      });
      document.querySelectorAll(".rc-figure").forEach(function (node) {
        if (node.__rcRecolor) node.__rcRecolor();
      });
    }

    function wireToolbar() {
      figure.querySelectorAll("[data-rc-action]").forEach(function (button) {
        button.addEventListener("click", function (event) {
          var action = button.dataset.rcAction;
          if (action === "table") {
            var open = button.getAttribute("aria-pressed") === "true";
            button.setAttribute("aria-pressed", open ? "false" : "true");
            tablePanel.hidden = open;
            if (!open && !tableInstance) tableInstance = new Table(tablePanel, config.table, strings);
            return;
          }
          if (action === "theme") {
            applyTheme(themeOf(figure) === "dark" ? "light" : "dark");
            return;
          }
          if (action === "csv") {
            downloadCsv(config.table, slug(meta.title) + ".csv");
            return;
          }
          if (action === "copy") {
            var text = csvOf(config.table);
            var done = function () {
              var old = button.textContent;
              button.textContent = config.lang === "en" ? "Copied" : "已复制";
              setTimeout(function () {
                button.textContent = old;
              }, 1200);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
            return;
          }
          if (!chart) return;
          if (action === "png") {
            var url = chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: canvasColor(figure) });
            downloadDataUrl(url, slug(meta.title) + ".png");
            return;
          }
          if (action === "svg") {
            var holder = document.createElement("div");
            holder.style.cssText = "position:absolute;left:-9999px;top:0;";
            document.body.appendChild(holder);
            var width = canvas.clientWidth || meta.width;
            var exporter = echarts.init(holder, null, { renderer: "svg", width: width, height: meta.height });
            exporter.setOption(optionFor(themeOf(figure)), true);
            var source = exporter.renderToSVGString();
            exporter.dispose();
            holder.remove();
            download(new Blob([source], { type: "image/svg+xml;charset=utf-8" }), slug(meta.title) + ".svg");
            return;
          }
          event.preventDefault();
        });
      });
    }

    if (config.kind === "table") {
      tablePanel.hidden = false;
      tableInstance = new Table(tablePanel, config.table, strings);
      wireToolbar();
      return { table: tableInstance, setTheme: applyTheme };
    }

    function optionFor(mode) {
      return hydrate(config.option[mode] || config.option.light);
    }

    var width = canvas.clientWidth || meta.width;
    chart = echarts.init(canvas, null, { renderer: "canvas", width: width, height: meta.height });
    var initialOption = optionFor(themeOf(figure));
    if (prefersReducedMotion()) initialOption.animation = false;
    chart.setOption(initialOption, true);
    figure.__rcChart = chart;

    function recolor() {
      var next = optionFor(themeOf(figure));
      // Theme switching is a state change, not an entrance: never re-animate it.
      next.animation = false;
      chart.setOption(next, true);
    }
    figure.__rcRecolor = recolor;

    if (window.ResizeObserver) {
      var observer = new ResizeObserver(function () {
        var next = canvas.clientWidth;
        if (next > 0) chart.resize({ width: next, height: meta.height });
      });
      observer.observe(canvas);
    }

    // `data_table: true` puts the chart's data table into the page right away.
    if (config.dataTable && tablePanel) tableInstance = new Table(tablePanel, config.table, strings);

    wireToolbar();
    return { chart: chart, recolor: recolor, setTheme: applyTheme };
  }

  var api = {
    hydrate: hydrate,
    mount: mount,
    table: Table,
    format: { value: formatValue, tick: tickLabel, date: formatDate, humanize: humanize },
  };

  if (typeof window !== "undefined") window.RC = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined") {
    var boot = function () {
      var figures = document.querySelectorAll('figure.rc-figure[data-rc]');
      for (var i = 0; i < figures.length; i += 1) {
        var script = figures[i].querySelector("script.rc-model");
        if (!script) continue;
        try {
          mount(JSON.parse(script.textContent));
        } catch (error) {
          if (window.console) console.error("[render-charts]", error);
        }
      }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})();
