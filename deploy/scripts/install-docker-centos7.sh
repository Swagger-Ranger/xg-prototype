#!/bin/bash
# ============================================================
# CentOS 7.9 Docker & Docker Compose 一键安装脚本
# ============================================================

set -e

echo "========================================"
echo "  Docker 安装脚本 for CentOS 7.9"
echo "========================================"

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then
    echo "错误: 请使用 root 用户运行此脚本"
    exit 1
fi

# 检查 CentOS 版本
cat /etc/redhat-release

# 1. 卸载旧版本 Docker
echo "[1/7] 卸载旧版本 Docker (如果有)..."
yum remove -y docker docker-client docker-client-latest docker-common \
    docker-latest docker-latest-logrotate docker-logrotate docker-engine 2>/dev/null || true

# 2. 安装依赖
echo "[2/7] 安装依赖..."
yum install -y yum-utils device-mapper-persistent-data lvm2 wget curl vim

# 3. 添加 Docker 源
echo "[3/7] 添加 Docker 官方源..."
yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo || {
    echo "使用阿里云镜像源..."
    yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
}

# 4. 安装 Docker
echo "[4/7] 安装 Docker CE..."
yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 5. 配置镜像加速
echo "[5/7] 配置 Docker 镜像加速..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json << 'EOF'
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com",
    "https://docker.mirrors.ustc.edu.cn"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF

# 6. 启动 Docker
echo "[6/7] 启动 Docker 服务..."
systemctl daemon-reload
systemctl start docker
systemctl enable docker

# 7. 验证安装
echo "[7/7] 验证安装..."
echo ""
echo "Docker 版本:"
docker --version
echo ""
echo "Docker Compose 版本:"
docker compose version
echo ""

# 检查 Docker 运行状态
if systemctl is-active --quiet docker; then
    echo "✓ Docker 服务运行正常"
else
    echo "✗ Docker 服务启动失败"
    exit 1
fi

echo ""
echo "========================================"
echo "  Docker 安装完成！"
echo "========================================"
echo ""
echo "常用命令:"
echo "  systemctl start docker    - 启动 Docker"
echo "  systemctl stop docker     - 停止 Docker"
echo "  systemctl status docker   - 查看状态"
echo "  docker ps                 - 查看运行容器"
echo "  docker compose version    - 查看 compose 版本"
echo ""
