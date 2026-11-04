# mailbox

内置侧边栏里的邮箱：多账号收发邮件，IMAP IDLE 实时收信并响铃提醒，读信、回信、加附件都不离开面板；**飞书和 Microsoft 365 / Outlook 支持手机扫码登录**，不用申请应用专用密码。

包名 `mailbox`，host 半（`index.js`）负责协议与凭据，client 半（`client.js`）只做界面。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.js` | host 半：账号增删、IMAP 收信、SMTP 发信、新邮件事件流、HTTP 路由 |
| `client.js` | client 半：`sidebar.panellist` 图标 + `main` 面板，含读信、写信、账号表单、提示音 |
| `lib/imap.js` | 自写 IMAP 客户端：LOGIN / LIST / SELECT / UID SEARCH / UID FETCH / UID STORE / IDLE |
| `lib/smtp.js` | 自写 SMTP 客户端：EHLO / STARTTLS / AUTH PLAIN·LOGIN / MAIL·RCPT·DATA |
| `lib/mime.js` | MIME 编解码：RFC 2047 主题、charset 转换、multipart、附件、`message/rfc822` |
| `lib/store.js` | 账号持久化到 `$DSH_HOME/mailbox/accounts.json`（0600） |
| `lib/providers.js` | 飞书 / QQ / 163 / Gmail / Outlook / 阿里云 / 自定义预设 |
| `lib/lark.js` | 飞书后端：调本机 `lark-cli`（设备码扫码登录、Open API 收发信、`+watch` 推送） |
| `lib/oauth.js` | 通用 OAuth 2.0 设备码登录（RFC 8628）+ XOAUTH2 payload，目前接 Microsoft 365 |
| `lib/feishu-runtime.js` | 飞书账号运行时，接口与 IMAP 账号一致，路由和前端不用区分 |
| `assets/qr-microsoft-device.png` | 微软固定验证页 `https://login.microsoft.com/device` 的二维码，一次生成后随包发布 |
| `test/` | 本地假 IMAP+SMTP 服务器、假 `lark-cli`、假 Microsoft 端点，以及 `node --test` 用例 |
| `cordis.patch.yml` | bundle patch，把 `mailbox` 插入 loader |
| `locale/*.json` | 插件元信息 |

依赖只有 Node 内置模块（`node:net`、`node:tls`、`node:buffer`、`node:child_process`），**没有任何第三方包**：dsh profile 由 Electron 应用托管，装不了 npm 依赖，所以协议栈自己写。

飞书账号不直连 IMAP，而是复用本机已安装的 [`lark-cli`](https://github.com/larksuite/cli)：它负责 OAuth 扫码登录与 Open API 调用，插件只负责展示二维码、解析返回。没装 `lark-cli` 时插件照常工作，只是加不了飞书账号。

Outlook 走标准的 OAuth 设备码：扫固定二维码 → 在 `login.microsoft.com/device` 输一次性代码 → 拿到 `refresh_token` → IMAP/SMTP 用 XOAUTH2 认证。不需要回调地址，也不需要在本地开端口。

## 功能

- **多账号**：账号按生成的 id 区分，同一条邮箱地址可以加多份，用「标签」区分（工作 / 个人 / 测试……）。
- **三栏宽度可调**：账号/文件夹、邮件列表、读信区之间各有一根分隔条，拖动即可改宽度；双击分隔条复位，聚焦后按 ←/→ 微调（Shift 加速）。宽度存在 `localStorage`，面板变窄时自动收回，读信区保底 280px。
- **扫码登录**：添加账号弹窗里先选服务商，支持扫码的会多出「扫码登录」页签。
  - **飞书**：二维码由 `lark-cli auth qrcode` 动态生成，`auth login --device-code` 在后台等待确认；飞书账号不需要也不保存密码。
  - **Microsoft 365 / Outlook**：扫固定二维码后在 `login.microsoft.com/device` 输一次性代码，授权完成自动落库；之后用 `refresh_token` 换 `access_token` 走 XOAUTH2，租户禁用基本认证也能用。
  - 其余服务商量不出来：它们的「扫码」只发网页登录态，换不到 IMAP/SMTP 凭据，弹窗里会直接说明原因，仍然走应用专用密码。
- **实时收信**：每个账号一条 IDLE 长连接，服务器推送 `EXISTS` 就立刻拉新邮件摘要，推给面板并发提示音；连接断了按 3s → 60s 指数退避重连。服务商不支持 IDLE 时退化成 60 秒轮询。
- **提示**：WebAudio 双音「叮咚」，面板右下角弹 6 秒 toast，侧边栏图标带未读圆点；提示音可在标题栏关掉（存 `localStorage`）。
- **收发一体**：读信（纯文本或 HTML）、回复、转发、新建、多附件（合计 18MB 上限）都在面板内完成，附件下载直接走浏览器下载。
- **安全渲染**：HTML 邮件放进 `sandbox` iframe，CSP `default-src 'none'; img-src data:`，远程图片与外链脚本一律不加载。

## host 半

路由统一前缀 `/mailbox/api`，进入前用 `connection.requestRejection(req)` 复用宿主鉴权。

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/accounts` | 账号列表（不含密码）+ 服务商预设 |
| POST | `/accounts` | 新增并验证账号（先连一次 IMAP 列文件夹） |
| POST | `/accounts/test` | 只验证，不落盘 |
| POST | `/accounts/remove` | 登出并删除凭据 |
| GET | `/folders?account=` | 列文件夹 |
| GET | `/messages?account=&folder=&limit=` | 邮件摘要列表 |
| GET | `/message?account=&folder=&uid=` | 读信（默认标已读） |
| POST | `/flags` | 已读 / 未读 |
| POST | `/send` | 发信（收件人、抄送、主题、正文、附件 base64） |
| POST | `/login/start` | 按 `provider` 发起扫码登录（飞书走 lark-cli，Outlook 走设备码），返回会话 id + 二维码地址；不支持的服务商返回 400 和原因 |
| GET | `/login/qr?id=` | 动态二维码 PNG（飞书）；微软用静态资源 `/assets/qr-microsoft-device.png` |
| POST | `/login/poll` | 轮询扫码结果，成功后自动落库并开始收信 |
| POST | `/login/cancel` | 取消本次扫码 |
| GET | `/attachment?account=&folder=&uid=&index=` | 下载附件 |
| GET | `/events?after=&timeout=` | 新邮件长轮询，最长 60s |
| GET | `/status` | 总未读数 |
| POST | `/sync` | 强制刷新某账号的列表 |

`GET /events` 是长轮询而不是 SSE：client 半只要 `fetch`，不必处理 EventSource 的生命周期，断线重连逻辑也简单。

## client 半

- `sidebar.panellist` 注册 `id: mailbox`、`order: 20`，图标上带未读圆点。
- `main` 注册 `key: mailbox`，与侧边栏条目一一对应。
- `dsh.client` 声明 `platform: web` 且 `immediately: true`：页面加载就挂载，事件轮询与提示音不依赖「打开面板」，所以没打开面板也能听见新邮件提示。

## 安装

`desktop` profile 归 Electron 应用独占，`./install.sh plugin ... --profile desktop` 会被提前拦下（只允许 `list` / `doctor`）。实际安装走应用内「插件」页从本地目录安装，或：

```
plugin_manager install_bundle  target=link:<仓库绝对路径>/plugins/mailbox
```

（`plugin_manager` 是 dsh 自带的插件管理工具，agent 可以直接调用；也可以等价地手工改 `~/.dsh/profiles/desktop/package.json` 的 `dependencies` 与 `dsh.profile.bundles`，再用应用自带 pnpm 在 profile 目录跑 `install`。）

装完已经是热加载状态：host 半边注册的 `/mailbox/api/*` 立即可用，client 半边的侧边栏图标与面板也在第一次注册后出现；改了代码再重启 dsh 即可。

核对是否装上：

```bash
./install.sh list --profile desktop   # mailbox 应显示“已安装”
```

账号凭据位置：`$DSH_HOME/mailbox/accounts.json`（`DSH_HOME` 默认 `~/.dsh`）。

## 凭据与已知限制

- **密码以明文存**在 `$DSH_HOME/mailbox/accounts.json`，文件权限 `0600`、目录 `0700`。这是本机单用户桌面工具的取舍：把它当密码管理器用不安全，共享机器上不要登录邮箱。
- 只支持 **用户名 + 密码/应用专用密码** 的 IMAP/SMTP 基本认证，**不支持 OAuth**：Gmail、Outlook 这类强制 OAuth 的账号需要先用应用专用密码（若租户关闭了 basic auth 则无法登录）。
- 发信只走 SMTP，**不会自动 APPEND 到「已发送」**：多数服务商在 SMTP 投递后会自行保存副本，但行为不统一。
- 只做收件箱的实时提醒；其他文件夹靠手动刷新。
- **飞书账号的凭据不在本插件里**：它用的是 `lark-cli` 的登录态（本机 Keychain / 配置文件），所以一个 `lark-cli` 登录同一时间只对应一个飞书邮箱；要换账号得重新扫码，多开飞书邮箱暂不支持。
- 飞书账号的实时提醒优先用 `mail +watch` 的 WebSocket 推送；当前应用没订阅邮件事件时 `+watch` 会秒退，插件自动降级成 **60 秒轮询**，未读数上限 400。
- OAuth 账号的 `refresh_token` 和密码一样明文存在 `$DSH_HOME/mailbox/accounts.json`（0600），对外接口只暴露 `auth` 字段，不会把 token 回传前端。
- Microsoft 侧用的是公开的第一方客户端 ID（`d3590ed6-…`，Office 的公共客户端），因此不需要你注册应用；如果贵司租户通过条件访问策略禁用了设备码流，会在扫码阶段被拒，只能用应用专用密码。
- Gmail 没有接入扫码：Google 的设备码授权只对「电视与受限输入设备」开放，邮件类受限 scope 拿不到，硬做也只能要你自建 OAuth 客户端。
- **163 / 126 需要先发 ID 命令再 LOGIN**，客户端已经按这个顺序做；直接 LOGIN 会被回 `Unsafe Login`。
- 实测（2026-11-04，本机网络）：`imap.qq.com` / `imap.163.com` / `imap.gmail.com` 的 TLS 握手、CAPABILITY、LOGIN 拒绝路径均正常；Gmail 会回 `NO [AUTHENTICATIONFAILED]`（强制 OAuth，需要应用专用密码或改走 OAuth）；QQ 在认证失败时直接断开连接，客户端会把这种情形翻译成「服务端拒绝了这次登录」。`smtp.qq.com:465` 的 AUTH 拒绝路径同样正常。
- 附件走 HTTP 传输（单封上限 18MB），超大邮件直接拒绝下载并提示。

## 测试

```bash
cd dsh-assets/plugins/mailbox
node --test test/*.test.mjs
```

`test/mock-mail-server.mjs` 起一个本地假 IMAP + SMTP（默认账号 `demo@example.com` / `secret`），用例覆盖：MIME 中文主题与附件往返、GBK 正文、IMAP 值解析、登录 → 发信 → IDLE 收到新邮件 → 取正文 → 标已读、host 运行时的列信/事件/附件。测试会把 `DSH_HOME` 指到临时目录，不碰真实账号。
