# FootPrint

左侧栏里的 3D 旅行地球。输入城市、地标或地址，FootPrint 会用 CesiumJS 把地球转到那里，并从 Wikipedia 取回地点介绍和附近景点；默认按用户当地时间呈现昼夜与夜间灯光，放大时自动切换到 Esri World Imagery 的高层级卫星影像。网络不可用时，内置的 16 个目的地仍可检索、定位和浏览。

## 功能

- **左侧栏入口**：插件注册 `sidebar.panellist` 图标，点击后打开 `main` 面板。
- **CesiumJS 3D 地球**：本地随插件提供 CesiumJS 1.147.0 与 Natural Earth II 全球底图，不依赖 CDN、Cesium ion 或在线地形；支持拖动旋转、滚轮缩放、右键倾斜。
- **随缩放自动清晰**：相机高度低于约 9,000 km 时，Esri World Imagery 卫星细节层平滑淡入；Cesium 按屏幕误差自动选择瓦片层级，放大到城市、街区时会请求更高层级的卫星瓦片，而不是拉伸 Natural Earth II 的低分辨率纹理。缩回全球视角时细节层自动隐藏，回到 Natural Earth II 底图。画布按设备像素比渲染，并把 `maximumScreenSpaceError` 收紧到 1.1、瓦片缓存增加到 320，避免高分屏上发糊。
- **实时地区名与经纬度**：鼠标在球面上移动、拖拽地球或缩放时，右上角实时显示光标下的经纬度；停顿约 550 ms 后显示 Nominatim 反向地理编码得到的详细地区名（如“东城区 · 东华门街道”）。拖动过程中也会随相机变化重新采样，不是只在鼠标移动时更新。
- **当地时间与昼夜**：Cesium 时钟初始化为本机当前时间并按真实时间推进，`SunLight` 决定昼夜明暗；初始视角朝向本地时区经线。夜间叠加 NASA VIIRS 2012 城市灯光，白天自动隐藏；右上角顶栏显示本地时间、时区和太阳/月亮图标。
- **地点定位**：输入地点后先查 Nominatim，失败时回退 Photon；结果同时包含内置目的地。选中后相机飞往坐标，主地点以琥珀色标注，推荐景点以青色标注，可直接点击球面标记或在右侧卡片中点选。
- **介绍与景点推荐**：通过 Wikipedia 搜索条目、REST 摘要和 geosearch 附近条目，生成地点简介、缩略图、距离与 6 条附近推荐。
- **离线兜底**：内置北京、上海、西安、成都、杭州、桂林、拉萨、香港、东京、京都、巴黎、伦敦、罗马、纽约、伊斯坦布尔、巴塞罗那 16 个目的地。每城含简介与 4–5 个景点及坐标，按距离排序。
- **双语界面**：界面文案跟随 DSH 当前语言切换中文 / English；在线 Wikipedia 资料按当前语言取用。内置导览提供英文城市简介与英文景点名，景点说明在英文界面使用简要英文占位。
- **代理支持**：宿主侧读取 `HTTPS_PROXY` / `HTTP_PROXY`，在 Windows 上也会读取系统 Internet Settings 的 HTTP 代理，通过 CONNECT 隧道访问 Nominatim / Wikipedia，避免 Node 原生 fetch 忽略系统代理的问题。

## 使用

1. 在左侧栏点击 FootPrint。
2. 输入地点，按回车或点「定位」。
3. 地球飞抵后，左侧会出现地点卡：简介、坐标、来源与景点推荐。
4. 点击某个推荐景点，地球会再次飞近该景点；点击球面上的青色点也会选中对应卡片。

也可以直接点搜索框下方的「北京 / 东京 / 巴黎 / 纽约」，或在欢迎页点快速出发。

## 数据与网络

| 能力 | 来源 | 说明 |
| --- | --- | --- |
| 地名检索 | [Nominatim](https://nominatim.openstreetmap.org/)（主）/ [Photon](https://photon.komoot.io/)（备） | 宿主转发请求并设置 User-Agent；结果缓存 10 分钟 |
| 地点简介 | Wikipedia REST `page/summary` | 中文界面用 `zh.wikipedia.org`，英文界面用 `en.wikipedia.org` |
| 附近景点 | Wikipedia `generator=geosearch` | 10 公里半径，按类型、缩略图与距离排序，取 6 条 |
| 离线导览 | 本插件 `data/places.js` | 16 个城市的内置原创中文导览 |
| 全球底图 | Natural Earth II（随 CesiumJS 分发） | 无 Cesium ion token，地形使用椭球体 |
| 缩放细节 | [Esri World Imagery](https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer) | 低高度自动淡入，Cesium 按缩放层级取 0–19 级卫星瓦片；不依赖 Referer，离线或加载失败时回退到 Natural Earth II |
| 实时地区名 | [Nominatim reverse](https://nominatim.openstreetmap.org/) | 光标经纬度反向地理编码；客户端 550 ms 防抖 + 宿主 1 秒串行限速 + 24 小时缓存 |
| 昼夜光照 | Cesium `SunLight` + [NASA GIBS VIIRS CityLights_2012](https://gibs.earthdata.nasa.gov/) | 时钟取本机当前时间；夜间灯光层 `dayAlpha=0`、`nightAlpha=0.9`，只在暗面显示 |

Wikipedia 文本与图片遵循 CC BY-SA 4.0；界面内向条目链接与许可信息。卫星影像 © Esri, Maxar, Earthstar Geographics, and the GIS User Community；地名数据 © OpenStreetMap contributors，遵循 ODbL。CesiumJS 以 Apache-2.0 分发，声明见 `vendor/cesium/LICENSE.md` 与 `vendor/cesium/VENDOR.md`。

> 细节层没有使用 OSM 公共瓦片：OSM 会对没有合规 Referer 的嵌入应用返回 “418 Access blocked” 占位图（HTTP 状态有时仍是 200，并带 `x-blocked` 头），在 Cesium 里表现为地图发灰、出现 Access blocked 图片。Esri World Imagery 在无 Referer 时仍返回正常卫星瓦片，因此选它作为缩放细节层。

## 实现结构

```
plugins/footprint/
  package.json           bundle 清单 + dsh.client
  cordis.patch.yml       插入 footprint 行
  index.js               宿主：/footprint-api、/footprint-vendor 与检索/资料逻辑
  http.js                支持系统代理的 HTTPS JSON 客户端
  client.js              浏览器：左侧栏图标、主面板、Cesium 生命周期
  data/places.js         16 个内置目的地与本地检索/距离计算
  vendor/cesium/         CesiumJS 1.147.0 运行时（约 13 MB）
  locale/                meta.title / meta.description
  icon.svg               插件图标
```

宿主注册两条前缀路由：

- `/footprint-vendor/*`：只读静态文件，带路径穿越防护与 MIME 类型，`CESIUM_BASE_URL` 指向这里。
- `/footprint-api/health`、`/footprint-api/search`、`/footprint-api/place`、`/footprint-api/reverse`：JSON 接口。

客户端只在第一次打开面板时加载 `Cesium.js`，卸载面板时销毁 Viewer、事件处理器与 ResizeObserver；切换地点时只清理并重建实体。底图采用双层结构：Natural Earth II 始终在底层兜底，Esri 卫星细节层根据相机高度调整透明度，瓦片层级完全交给 Cesium 的屏幕误差算法。

## 安装

在 dsh-assets 仓库根目录：

```bash
./install.sh plugin footprint
```

`desktop` profile 由应用独占，不能通过 CLI 安装；请在应用内「插件」页从本地目录安装 `plugins/footprint`，或使用本会话的 Plugin Manager 安装。

## 已知限制

- 夜间灯光使用 NASA VIIRS 2012 快照，最高 8 级，城市尺度会放大显示；它用于氛围和方位感，不是实时灯光数据。
- 未使用 Cesium ion，因此没有全球地形起伏；全球底图是 Natural Earth II，放大后改用 Esri 卫星影像。
- 放大后的城市/街区细节来自 Esri World Imagery，需要网络；离线时仍能旋转、定位和查看内置导览，但放大后只有 Natural Earth II 的低分辨率纹理。
- 实时地区名依赖 Nominatim 反向地理编码；不可用时仍显示经纬度，并回退到 80 km 内最近的内置城市名。
- 在线检索受网络与代理状态影响；失败时只显示内置目的地，不会假装已经拿到在线资料。
- 维基摘要与景点由条目内容决定，冷门地点的可读性会低于内置导览。
- 12 万级人口以下的地点，Wikipedia geosearch 可能只返回少量甚至没有景点，面板会显示空状态。
