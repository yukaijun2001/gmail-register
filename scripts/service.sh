#!/usr/bin/env bash

set -Eeuo pipefail

# Resolve the Compose project from this script's own location. The deployment
# directory can be anywhere; no machine-specific absolute path is required.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."

usage() {
  cat <<'EOF'
Gmail Registration Manager Docker service helper

Usage:
  ./scripts/service.sh --start    Build images and start all services
  ./scripts/service.sh --stop     Stop services and remove containers and database volume
  ./scripts/service.sh --restart  Stop, rebuild, and start all services
  ./scripts/service.sh --status   Show service/container status
  ./scripts/service.sh --logs     Follow API and admin service logs
  ./scripts/service.sh --help     Show this help

Notes:
  --stop removes containers, networks, and the PostgreSQL volume.
  The full Docker stack is exposed at http://localhost:1001.
EOF
}

die() {
  printf '错误：%s\n' "$*" >&2
  exit 1
}

if ! command -v docker >/dev/null 2>&1; then
  die '未找到 Docker，请先安装并启动 Docker Desktop/Colima。'
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  die '未找到 Docker Compose（docker compose 或 docker-compose）。'
fi

if ! docker info >/dev/null 2>&1; then
  die 'Docker daemon 未运行，请先启动 Docker Desktop/Colima。'
fi

cd "${PROJECT_DIR}"

compose() {
  "${COMPOSE[@]}" "$@"
}

start_services() {
  printf '构建并启动 Docker 服务...\n'
  compose up -d --build --remove-orphans
  printf '\n服务状态：\n'
  compose ps
  printf '\n后台入口：http://localhost:1001\n'
}

stop_services() {
  printf '停止并删除 Docker 容器和 PostgreSQL 数据卷...\n'
  compose down --volumes --remove-orphans
  printf '容器、网络和 PostgreSQL 数据卷已删除。\n'
}

case "${1:---help}" in
  --start|start)
    start_services
    ;;
  --stop|stop)
    stop_services
    ;;
  --restart|restart)
    stop_services
    printf '\n'
    start_services
    ;;
  --status|status)
    compose ps
    ;;
  --logs|logs)
    compose logs -f api-server admin-web
    ;;
  --help|-h|help)
    usage
    ;;
  *)
    printf '未知参数：%s\n\n' "$1" >&2
    usage >&2
    exit 2
    ;;
esac
