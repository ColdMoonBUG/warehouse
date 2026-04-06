#!/usr/bin/env bash
set -euo pipefail

PROJECT_PATH="${PROJECT_PATH:-/home/bug/CODE/ERP/warehouse/apps/mobile-app}"

find_hbx_dir() {
  if [[ -n "${HBX_DIR:-}" && -x "${HBX_DIR}/cli" ]]; then
    echo "$HBX_DIR"
    return 0
  fi

  local candidates=(
    "/home/bug/下载/HBuilderX.5.06.2026033105.linux_x64.full/HBuilderX"
    "/home/bug/下载/HBuilderX.5.06.2026033105.linux_x64 (2).full/HBuilderX"
  )

  local dir
  for dir in "${candidates[@]}"; do
    if [[ -x "$dir/cli" ]]; then
      echo "$dir"
      return 0
    fi
  done

  return 1
}

HBX_DIR="$(find_hbx_dir || true)"
if [[ -z "$HBX_DIR" ]]; then
  cat >&2 <<'EOF'
未找到 HBuilderX Linux 安装目录。
请先解压 HBuilderX，并确保以下任一目录存在：
- /home/bug/下载/HBuilderX.5.06.2026033105.linux_x64.full/HBuilderX
- /home/bug/下载/HBuilderX.5.06.2026033105.linux_x64 (2).full/HBuilderX
或者运行时手动指定：
HBX_DIR="/你的/HBuilderX目录" ./hx-mobile-debug.sh ...
EOF
  exit 1
fi

CLI="$HBX_DIR/cli"

usage() {
  cat <<EOF
用法:
  ./hx-mobile-debug.sh open
  ./hx-mobile-debug.sh devices
  ./hx-mobile-debug.sh launch [--device <deviceId>] [--custom] [--compile] [--clean] [--page <pagePath>] [--query <a=1&b=2>]
  ./hx-mobile-debug.sh logs [--device <deviceId>] [--mode full|lastBuild|prevBuild]
  ./hx-mobile-debug.sh doctor

说明:
  - 默认项目路径: $PROJECT_PATH
  - 默认 HBuilderX: $HBX_DIR
  - 默认命令是 launch
  - launch 默认开启 --native-log true，方便看原生日志

示例:
  ./hx-mobile-debug.sh devices
  ./hx-mobile-debug.sh launch
  ./hx-mobile-debug.sh launch --device 设备序列号 --custom
  ./hx-mobile-debug.sh launch --page pages/sales/detail --query id=123
  ./hx-mobile-debug.sh logs --mode full
EOF
}

ensure_hbx_started() {
  echo "[hx] 启动 HBuilderX..."
  "$CLI" open >/dev/null 2>&1 || true

  local i
  for i in $(seq 1 30); do
    if "$CLI" ver >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "[hx] HBuilderX 启动超时，请确认桌面会话正常。" >&2
  return 1
}

open_project() {
  echo "[hx] 导入项目: $PROJECT_PATH"
  "$CLI" project open --path "$PROJECT_PATH" >/dev/null 2>&1 || true
}

list_devices() {
  ensure_hbx_started
  echo "[hx] Android 设备列表"
  "$CLI" devices list --platform android
}

launch_android() {
  local device_id=""
  local playground="standard"
  local native_log="true"
  local clean_cache="false"
  local compile_only="false"
  local continue_on_error="false"
  local page_path=""
  local page_query=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --device)
        device_id="$2"
        shift 2
        ;;
      --custom)
        playground="custom"
        shift
        ;;
      --standard)
        playground="standard"
        shift
        ;;
      --native-log)
        native_log="$2"
        shift 2
        ;;
      --clean)
        clean_cache="true"
        shift
        ;;
      --compile)
        compile_only="true"
        shift
        ;;
      --continue-on-error)
        continue_on_error="true"
        shift
        ;;
      --page)
        page_path="$2"
        shift 2
        ;;
      --query)
        page_query="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "未知参数: $1" >&2
        usage
        exit 1
        ;;
    esac
  done

  ensure_hbx_started
  open_project

  local args=(
    launch app-android
    --project "$PROJECT_PATH"
    --playground "$playground"
    --native-log "$native_log"
    --cleanCache "$clean_cache"
    --compile "$compile_only"
    --continue-on-error "$continue_on_error"
  )

  if [[ -n "$device_id" ]]; then
    args+=(--deviceId "$device_id")
  fi
  if [[ -n "$page_path" ]]; then
    args+=(--pagePath "$page_path")
  fi
  if [[ -n "$page_query" ]]; then
    args+=(--pageQuery "$page_query")
  fi

  echo "[hx] 运行到 Android 真机..."
  "$CLI" "${args[@]}"
}

show_logs() {
  local device_id=""
  local mode="full"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --device)
        device_id="$2"
        shift 2
        ;;
      --mode)
        mode="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "未知参数: $1" >&2
        usage
        exit 1
        ;;
    esac
  done

  ensure_hbx_started
  open_project

  local args=(logcat app-android --project "$PROJECT_PATH" --mode "$mode")
  if [[ -n "$device_id" ]]; then
    args+=(--deviceId "$device_id")
  fi

  echo "[hx] 查看 Android 运行日志..."
  "$CLI" "${args[@]}"
}

doctor() {
  echo "[doctor] HBuilderX 目录: $HBX_DIR"
  echo "[doctor] CLI 路径: $CLI"
  echo "[doctor] 项目路径: $PROJECT_PATH"
  echo

  if command -v adb >/dev/null 2>&1; then
    echo "[doctor] adb 已安装: $(command -v adb)"
    adb devices || true
  else
    echo "[doctor] 未检测到 adb。建议先安装: sudo apt install adb"
  fi
  echo

  ensure_hbx_started
  open_project
  echo "[doctor] HBuilderX Android 设备列表:"
  "$CLI" devices list --platform android || true
}

main() {
  local cmd="${1:-launch}"
  if [[ $# -gt 0 ]]; then
    shift
  fi

  case "$cmd" in
    open)
      ensure_hbx_started
      open_project
      echo "[hx] 已启动并导入项目。"
      ;;
    devices)
      list_devices
      ;;
    launch)
      launch_android "$@"
      ;;
    logs)
      show_logs "$@"
      ;;
    doctor)
      doctor
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      echo "未知命令: $cmd" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
