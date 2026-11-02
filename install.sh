#!/usr/bin/env bash
#
# dsh-assets installer — 把本仓库的 skill / 插件装到本机 dsh。
#
#   ./install.sh list                     看看有什么、装没装
#   ./install.sh skill how-to-write-document
#   ./install.sh plugin dsh-perf-profiler --profile web
#   ./install.sh all
#   ./install.sh uninstall skill <name>
#
# 兼容 macOS 自带 bash 3.2，不依赖 jq / node / pnpm 之外的运行时。

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
SKILL_ROOT="$DSH_HOME/skills"
# 注意：不要读 $DSH_PROFILE —— dsh 会把它注入子进程（本机实测为保留的 desktop），
# 误用会往保留 profile 里装东西。默认 web，需要时用 --profile 显式指定。
PROFILE="web"
MODE="link"          # link | copy
FORCE=0
DRY_RUN=0
ALL=0
DSH_BIN="${DSH_BIN:-}"

# ---------------------------------------------------------------- 输出

if [ -t 1 ]; then
  C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
  C_OK=''; C_WARN=''; C_ERR=''; C_DIM=''; C_OFF=''
fi

ok()   { printf '%s✓%s %s\n' "$C_OK" "$C_OFF" "$*"; }
warn() { printf '%s!%s %s\n' "$C_WARN" "$C_OFF" "$*" >&2; }
die()  { printf '%s✗%s %s\n' "$C_ERR" "$C_OFF" "$*" >&2; exit 1; }
dim()  { printf '%s%s%s\n' "$C_DIM" "$*" "$C_OFF"; }

# dry-run 时打印计划并返回 0（调用方用 `dry "..." && return 0` 的写法）
dry() {
  [ "$DRY_RUN" -eq 1 ] || return 1
  printf '%s· 将执行:%s %s\n' "$C_DIM" "$C_OFF" "$*"
  return 0
}

usage() {
  cat <<'EOF'
用法: ./install.sh <命令> [参数] [选项]

命令:
  list                        列出仓库内的 skill / 插件及其安装状态
  skill <name...>             安装 skill（默认软链到 $DSH_HOME/skills）
  plugin <name...>            安装插件到 dsh profile（会调用 dsh plugin add）
  all                         安装全部 skill 与插件
  uninstall skill <name...>   移除本仓库创建的 skill 链接/副本
  uninstall plugin <name...>  从 profile 卸载插件
  uninstall skill --all       移除全部由本仓库安装的 skill
  uninstall plugin --all      卸载全部已安装的本仓库插件
  uninstall all               上面两项都做
  doctor                      检查 dsh CLI、profile、日志目录等前提

选项:
  --profile <name>   插件目标 profile（默认 web）
  --copy             skill 用复制而非软链，适合仓库会被移动/删除的场景
  --force            目标已存在时备份并覆盖
  --all              配合 uninstall 使用：处理全部已安装项
  --dry-run          只打印将要做什么，不做任何改动
  --dsh <path>       指定 dsh 可执行文件
  --dsh-home <path>  指定 DSH_HOME（默认 ~/.dsh）
  -h, --help         显示本帮助

说明:
  dsh 只扫描 $DSH_HOME/skills/<name>/SKILL.md（一层），所以软链即可生效；
  插件必须装进 profile 才会被加载，装完需重启 dsh。
EOF
}

# ---------------------------------------------------------------- 环境

resolve_dsh() {
  if [ -n "$DSH_BIN" ]; then
    [ -x "$DSH_BIN" ] || die "--dsh 指向的文件不可执行: $DSH_BIN"
    printf '%s' "$DSH_BIN"; return 0
  fi
  local candidate
  for candidate in \
    "$(command -v dsh 2>/dev/null || true)" \
    "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
    "$HOME/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
  do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      printf '%s' "$candidate"; return 0
    fi
  done
  return 1
}

require_dsh() {
  local found
  found="$(resolve_dsh)" || die "找不到 dsh 可执行文件；用 --dsh <path> 指定，或把 dsh 加入 PATH"
  printf '%s' "$found"
}

repo_skills() {
  [ -d "$REPO_ROOT/skills" ] || return 0
  for dir in "$REPO_ROOT/skills"/*; do
    [ -f "$dir/SKILL.md" ] && basename "$dir"
  done
}

repo_plugins() {
  [ -d "$REPO_ROOT/plugins" ] || return 0
  for dir in "$REPO_ROOT/plugins"/*; do
    [ -f "$dir/package.json" ] && basename "$dir"
  done
}

skill_installed_at() { printf '%s/%s' "$SKILL_ROOT" "$1"; }

# 该 skill 是否已由本仓库提供（软链指向本仓库，或副本内容一致）
skill_state() {
  local name="$1" dst
  dst="$(skill_installed_at "$name")"
  if [ -L "$dst" ]; then
    if [ "$(readlink "$dst")" = "$REPO_ROOT/skills/$name" ]; then
      # 链接指向本仓库，但仓库里已经没有这个目录（改名或删除过）
      if [ -d "$REPO_ROOT/skills/$name" ]; then echo linked; else echo dangling; fi
    else
      echo foreign-link
    fi
  elif [ -d "$dst" ]; then
    echo present
  else
    echo absent
  fi
}

# 由本仓库"托管"的 skill 名字：指向本仓库的链接（含悬空），以及内容与仓库一致的副本。
managed_skill_names() {
  local path name
  [ -d "$SKILL_ROOT" ] || return 0
  for path in "$SKILL_ROOT"/*; do
    [ -e "$path" ] || [ -L "$path" ] || continue
    name="$(basename "$path")"
    if [ -L "$path" ]; then
      case "$(readlink "$path")" in
        "$REPO_ROOT"/skills/*) printf '%s\n' "$name" ;;
      esac
    elif [ -d "$path" ] && [ -d "$REPO_ROOT/skills/$name" ] \
      && diff -r --exclude='.DS_Store' "$REPO_ROOT/skills/$name" "$path" >/dev/null 2>&1; then
      printf '%s\n' "$name"
    fi
  done
}

# 当前 profile 里已安装的本仓库插件
installed_plugin_names() {
  local name
  for name in $(repo_plugins); do
    [ "$(plugin_state "$name")" = installed ] && printf '%s\n' "$name"
  done
}

# profile manifest 的 dsh.profile.bundles 里是否含某个包名。
# 只在 "bundles" 之后、数组闭合 ] 之前匹配，避免命中 dependencies 里的同名项。
bundles_has() {
  awk -v want="$2" '
    {
      rest = $0
      if (!inside) {
        at = index($0, "\"bundles\"")
        if (at > 0) { inside = 1; rest = substr($0, at + 9) }
      }
      if (inside) {
        if (index(rest, "\"" want "\"") > 0) found = 1
        if (index(rest, "]") > 0) inside = 0
      }
    }
    END { exit(found ? 0 : 1) }
  ' "$1"
}

plugin_state() {
  local name="$1" manifest="$DSH_HOME/profiles/$PROFILE/package.json"
  if [ ! -f "$manifest" ]; then echo no-profile; return; fi
  if grep -q "\"$name\"" "$manifest"; then echo installed; else echo absent; fi
}

# ---------------------------------------------------------------- skill

install_skill() {
  local name="$1" src dst state
  src="$REPO_ROOT/skills/$name"
  dst="$(skill_installed_at "$name")"
  [ -f "$src/SKILL.md" ] || die "skill 不存在或缺少 SKILL.md: $src"

  mkdir -p "$SKILL_ROOT"
  state="$(skill_state "$name")"

  case "$state" in
    linked)
      # 已是本仓库的链接：软链模式直接成功；复制模式则换成副本。
      if [ "$MODE" = "link" ]; then
        ok "skill $name 已安装（链接已就绪）"
        return 0
      fi
      rm -f "$dst"
      ;;
    foreign-link)
      [ "$FORCE" -eq 1 ] || die "$dst 已存在且指向别处（$(readlink "$dst")）；加 --force 覆盖"
      rm -f "$dst"
      ;;
    present)
      [ "$FORCE" -eq 1 ] || die "$dst 已存在且不是本仓库的链接；加 --force 备份后覆盖"
      mv "$dst" "$dst.bak.$(date +%Y%m%d%H%M%S)"
      warn "原有目录已备份为 $dst.bak.*"
      ;;
  esac

  if [ "$MODE" = "copy" ]; then
    rm -rf "$dst.tmp"
    cp -R "$src" "$dst.tmp"
    rm -rf "$dst"
    mv "$dst.tmp" "$dst"
    ok "skill $name 已复制到 $dst"
  else
    ln -s "$src" "$dst"
    ok "skill $name 已链接到 $dst"
  fi
}

uninstall_skill() {
  local name="$1" dst state
  dst="$(skill_installed_at "$name")"
  state="$(skill_state "$name")"
  case "$state" in
    linked|dangling)
      if dry "rm $dst"; then return 0; fi
      rm -f "$dst"
      ok "skill $name 链接已移除"
      ;;
    present)
      # 只删"和仓库完全一致"的副本；被改过就交给人工判断。
      case "$dst" in
        "$SKILL_ROOT"/*) ;;
        *) warn "$dst 不在 $SKILL_ROOT 下，拒绝删除"; return 0 ;;
      esac
      if [ -d "$REPO_ROOT/skills/$name" ] \
        && diff -r --exclude='.DS_Store' "$REPO_ROOT/skills/$name" "$dst" >/dev/null 2>&1; then
        if dry "rm -rf $dst"; then return 0; fi
        rm -rf "$dst"
        ok "skill $name 副本已移除"
      else
        warn "$dst 与仓库内容不一致（可能被改过），未删除；确认后手动 rm -rf"
      fi
      ;;
    foreign-link) warn "$dst 指向别处，未改动" ;;
    absent)  dim "skill $name 未安装，跳过" ;;
  esac
}

# ---------------------------------------------------------------- plugin

install_plugin() {
  local name="$1" src dsh manifest
  src="$REPO_ROOT/plugins/$name"
  [ -f "$src/package.json" ] || die "插件不存在: $src"
  [ -f "$src/cordis.patch.yml" ] || die "$name 缺少 cordis.patch.yml，不是合法的 dsh bundle"
  dsh="$(require_dsh)"

  # 已装且指向本仓库时，pnpm 会原地更新链接，无需 force。
  "$dsh" plugin --profile "$PROFILE" add "$src"
  manifest="$DSH_HOME/profiles/$PROFILE/package.json"
  if [ -f "$manifest" ] && grep -q "\"$name\"" "$manifest"; then
    if bundles_has "$manifest" "$name"; then
      ok "插件 $name 已装入 profile $PROFILE（已注册为 bundle 层）"
    else
      warn "插件 $name 已作为依赖安装，但未出现在 dsh.profile.bundles；检查它的 dsh.bundle 声明"
    fi
  else
    warn "插件 $name 安装命令已执行，但没在 profile $PROFILE 的 package.json 里找到它"
  fi
  dim "重启 dsh 后生效: dsh --profile $PROFILE"
}

uninstall_plugin() {
  local name="$1" dsh manifest
  dsh="$(require_dsh)"
  if dry "$dsh plugin --profile $PROFILE remove $name"; then return 0; fi
  "$dsh" plugin --profile "$PROFILE" remove "$name"
  manifest="$DSH_HOME/profiles/$PROFILE/package.json"
  if [ -f "$manifest" ] && grep -q "\"$name\"" "$manifest"; then
    warn "插件 $name 仍在 $manifest 里，卸载可能未完成"
  else
    ok "插件 $name 已从 profile $PROFILE 卸载"
  fi
}

# ---------------------------------------------------------------- list

cmd_list() {
  printf '\n%s\n' "skills  ($SKILL_ROOT)"
  local any=0 name state mark
  for name in $(repo_skills); do
    any=1
    state="$(skill_state "$name")"
    case "$state" in
      linked) mark="${C_OK}已链接${C_OFF}" ;;
      dangling) mark="${C_WARN}悬空链接（仓库已无此 skill）${C_OFF}" ;;
      present) mark="${C_WARN}存在同名目录${C_OFF}" ;;
      foreign-link) mark="${C_WARN}链接指向别处${C_OFF}" ;;
      *) mark="${C_DIM}未安装${C_OFF}" ;;
    esac
    printf '  %-28s %s\n' "$name" "$mark"
  done
  [ "$any" -eq 1 ] || dim "  （无）"

  # 本仓库装过、但仓库里已经没有的项（改名或删除后的残留）
  for name in $(managed_skill_names); do
    case " $(repo_skills) " in
      *" $name "*) ;;
      *) printf '  %-28s %s\n' "$name" "${C_WARN}仓库已无此 skill（残留，可卸载）${C_OFF}" ;;
    esac
  done

  printf '\n%s\n' "plugins  (profile: $PROFILE)"
  any=0
  for name in $(repo_plugins); do
    any=1
    state="$(plugin_state "$name")"
    case "$state" in
      installed) mark="${C_OK}已安装${C_OFF}" ;;
      no-profile) mark="${C_DIM}profile 未初始化${C_OFF}" ;;
      *) mark="${C_DIM}未安装${C_OFF}" ;;
    esac
    printf '  %-28s %s\n' "$name" "$mark"
  done
  [ "$any" -eq 1 ] || dim "  （无）"
  printf '\n'
}

# ---------------------------------------------------------------- doctor

cmd_doctor() {
  local dsh
  printf '仓库      %s\n' "$REPO_ROOT"
  printf 'DSH_HOME  %s\n' "$DSH_HOME"
  if dsh="$(resolve_dsh)"; then
    printf 'dsh       %s\n' "$dsh"
    printf '版本      %s\n' "$(version_of "$dsh")"
  else
    warn '没找到 dsh 可执行文件（安装插件时才会用到；skill 不需要）'
  fi
  if [ -f "$DSH_HOME/profiles/$PROFILE/package.json" ]; then
    printf 'profile   %s（已初始化）\n' "$PROFILE"
  else
    printf 'profile   %s（首次安装插件时会初始化）\n' "$PROFILE"
  fi
  if [ -d "$DSH_HOME/skills" ]; then
    printf 'skills    %s\n' "$DSH_HOME/skills"
  else
    printf 'skills    目录不存在，安装 skill 时会创建\n'
  fi
  printf 'skill 数  %s\n' "$(repo_skills | wc -l | tr -d ' ')"
  printf '插件数    %s\n' "$(repo_plugins | wc -l | tr -d ' ')"
}

version_of() {
  local out
  out="$("$1" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+[0-9A-Za-z.+-]*' | head -1 || true)"
  printf '%s' "${out:-未知}"
}

# ---------------------------------------------------------------- 入口

COMMAND="${1:-}"
[ -n "$COMMAND" ] || { usage; exit 1; }
shift || true

TARGETS=""
SUBCOMMAND=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --profile) PROFILE="${2:?--profile 需要一个值}"; shift 2 ;;
    --copy) MODE="copy"; shift ;;
    --force) FORCE=1; shift ;;
    --all) ALL=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --dsh) DSH_BIN="${2:?--dsh 需要一个路径}"; shift 2 ;;
    --dsh-home) DSH_HOME="$2"; SKILL_ROOT="$DSH_HOME/skills"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    -*) die "未知选项: $1（见 --help）" ;;
    *)
      if [ -z "$SUBCOMMAND" ] && { [ "$COMMAND" = "uninstall" ] || [ "$COMMAND" = "install" ]; }; then
        SUBCOMMAND="$1"
      else
        TARGETS="$TARGETS $1"
      fi
      shift
      ;;
  esac
done

# --dsh-home 可能出现在 --profile 之后，重新推导路径
SKILL_ROOT="$DSH_HOME/skills"

case "$COMMAND" in
  list) cmd_list ;;
  doctor) cmd_doctor ;;
  all)
    for name in $(repo_skills); do install_skill "$name"; done
    for name in $(repo_plugins); do install_plugin "$name"; done
    ;;
  skill)
    [ -n "$TARGETS" ] || die "用法: ./install.sh skill <name...>"
    for name in $TARGETS; do install_skill "$name"; done
    ;;
  plugin)
    [ -n "$TARGETS" ] || die "用法: ./install.sh plugin <name...>"
    for name in $TARGETS; do install_plugin "$name"; done
    ;;
  install)
    case "$SUBCOMMAND" in
      skill) for name in $TARGETS; do install_skill "$name"; done ;;
      plugin) for name in $TARGETS; do install_plugin "$name"; done ;;
      *) die "用法: ./install.sh install skill|plugin <name...>" ;;
    esac
    ;;
  uninstall|remove)
    if [ "$ALL" -eq 1 ] && [ -n "$TARGETS" ]; then
      die "--all 不能再跟具体名字"
    fi
    case "$SUBCOMMAND" in
      skill|plugin|all) ;;
      *) die "用法: ./install.sh uninstall skill|plugin|all [<name...>] [--all] [--dry-run]" ;;
    esac
    if [ "$SUBCOMMAND" = "skill" ] || [ "$SUBCOMMAND" = "all" ]; then
      if [ "$ALL" -eq 1 ] || [ "$SUBCOMMAND" = "all" ]; then
        TARGETS=" $(managed_skill_names | tr '\n' ' ') "
        [ -n "$(printf '%s' "$TARGETS" | tr -d ' ')" ] || dim "没有由本仓库安装的 skill"
      fi
      for name in $TARGETS; do uninstall_skill "$name"; done
    fi
    TARGETS=""
    if [ "$SUBCOMMAND" = "plugin" ] || [ "$SUBCOMMAND" = "all" ]; then
      if [ "$ALL" -eq 1 ] || [ "$SUBCOMMAND" = "all" ]; then
        TARGETS=" $(installed_plugin_names | tr '\n' ' ') "
        [ -n "$(printf '%s' "$TARGETS" | tr -d ' ')" ] || dim "profile $PROFILE 里没有本仓库的插件"
      fi
      for name in $TARGETS; do uninstall_plugin "$name"; done
    fi
    ;;
  -h|--help|help) usage ;;
  *) usage; die "未知命令: $COMMAND" ;;
esac
