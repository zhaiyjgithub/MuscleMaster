#!/bin/bash

# 检查包名是否可用的脚本
# 使用方法: ./check-package-name.sh

echo "=== 包名可用性检查 ==="

PACKAGE_NAME="com.musclemaster"

echo "当前包名: $PACKAGE_NAME"
echo ""

echo "=== 检查方法 ==="
echo "1. 登录 Google Play Console"
echo "2. 点击 '创建应用'"
echo "3. 在 '应用名称' 字段输入应用名称"
echo "4. 在 '默认语言' 选择语言"
echo "5. 在 '应用或游戏' 选择类型"
echo "6. 在 '免费或付费' 选择类型"
echo "7. 点击 '创建'"
echo "8. 在 '应用详情' 页面，查看包名字段"
echo ""

echo "=== 包名规则 ==="
echo "✅ 包名必须至少包含一个点号"
echo "✅ 每个段必须以字母开头"
echo "✅ 只能包含字母、数字和下划线"
echo "✅ 不能以数字开头"
echo "✅ 不能使用保留字（如 'android', 'com', 'org' 等）"
echo ""

echo "=== 建议的包名格式 ==="
echo "com.公司名.应用名"
echo "com.开发者名.应用名"
echo "io.公司名.应用名"
echo ""

echo "=== 如果当前包名不可用，建议的替代包名 ==="
echo "com.musclemaster.app"
echo "com.musclemaster.timer"
echo "com.musclemaster.fitness"
echo "com.musclemaster.workout"
echo "io.musclemaster.app"
echo ""

echo "=== 修改包名的步骤 ==="
echo "1. 修改 android/app/build.gradle 中的 applicationId"
echo "2. 修改 android/app/src/main/AndroidManifest.xml 中的包名"
echo "3. 更新 Java/Kotlin 文件的包名"
echo "4. 重新构建应用"
echo ""

echo "=== 重要提醒 ==="
echo "⚠️ 包名一旦发布就不能更改"
echo "⚠️ 更改包名会创建全新的应用"
echo "⚠️ 用户需要重新安装应用"
echo "⚠️ 应用数据不会迁移"
