#!/bin/bash

# 备份keystore文件的脚本
# 使用方法: ./backup-keystore.sh

echo "=== 备份Keystore文件 ==="

# 设置变量
KEYSTORE_FILE="android/app/my-release-key.keystore"
BACKUP_DIR="keystore-backup"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 检查keystore文件是否存在
if [ ! -f "$KEYSTORE_FILE" ]; then
    echo "错误: keystore文件不存在: $KEYSTORE_FILE"
    exit 1
fi

# 创建备份
BACKUP_FILE="$BACKUP_DIR/my-release-key.keystore.backup.$TIMESTAMP"
cp "$KEYSTORE_FILE" "$BACKUP_FILE"

# 验证备份
if [ -f "$BACKUP_FILE" ]; then
    echo "✅ 备份成功: $BACKUP_FILE"
    echo "📁 备份大小: $(du -h "$BACKUP_FILE" | cut -f1)"
    
    # 显示keystore信息
    echo ""
    echo "=== Keystore信息 ==="
    keytool -list -v -keystore "$KEYSTORE_FILE" -alias my-alias -storepass GuGeerEMS01 | head -20
    
    echo ""
    echo "⚠️  重要提醒:"
    echo "1. 请将备份文件存储在安全的地方"
    echo "2. 不要将keystore文件提交到版本控制系统"
    echo "3. 记录以下信息:"
    echo "   - 密钥库文件: my-release-key.keystore"
    echo "   - 密钥别名: my-alias"
    echo "   - 密钥库密码: GuGeerEMS01"
    echo "   - 密钥密码: GuGeerEMS01"
    
else
    echo "❌ 备份失败"
    exit 1
fi
