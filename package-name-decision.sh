#!/bin/bash

# 包名处理决策脚本
# 使用方法: ./package-name-decision.sh

echo "=== Google Play Console 包名处理决策指南 ==="
echo ""

echo "❌ 重要提醒：包名一旦创建就不能更改！"
echo ""

echo "=== 当前应用信息 ==="
echo "包名: com.musclemaster"
echo "应用名: MuscleMaster"
echo ""

echo "=== 请回答以下问题 ==="
echo ""

echo "1. 您的应用是否已经在 Google Play Console 中创建？"
echo "   a) 是，已经创建"
echo "   b) 否，还没有创建"
echo "   c) 不确定"
echo ""

echo "2. 如果已创建，应用是否已经发布？"
echo "   a) 是，已经发布"
echo "   b) 否，从未发布过"
echo "   c) 不适用"
echo ""

echo "3. 您是否希望保持现有的包名 'com.musclemaster'？"
echo "   a) 是，希望保持"
echo "   b) 否，希望使用新包名"
echo "   c) 无所谓"
echo ""

echo "=== 推荐方案 ==="
echo ""

echo "📋 方案A：使用现有包名（推荐）"
echo "   适用情况："
echo "   - 应用从未发布过"
echo "   - 包名 com.musclemaster 仍然可用"
echo "   操作步骤："
echo "   1. 登录 Google Play Console"
echo "   2. 尝试创建新应用，使用包名 com.musclemaster"
echo "   3. 如果成功，直接上传 AAB 文件"
echo "   4. 如果失败，说明包名已被占用"
echo ""

echo "📋 方案B：删除并重新创建"
echo "   适用情况："
echo "   - 包名已被占用"
echo "   - 应用从未发布过"
echo "   操作步骤："
echo "   1. 删除现有应用条目"
echo "   2. 创建新应用，使用新包名"
echo "   3. 修改代码中的包名"
echo "   4. 重新构建和上传"
echo ""

echo "📋 方案C：联系 Google 支持"
echo "   适用情况："
echo "   - 应用从未发布过"
echo "   - 包名被意外占用"
echo "   操作步骤："
echo "   1. 联系 Google Play 开发者支持"
echo "   2. 说明情况并提供应用 ID"
echo "   3. 请求重置应用签名或允许重新上传"
echo ""

echo "=== 建议的包名备选方案 ==="
echo "com.musclemaster.app"
echo "com.musclemaster.timer"
echo "com.musclemaster.fitness"
echo "com.musclemaster.workout"
echo "io.musclemaster.app"
echo "io.musclemaster.timer"
echo ""

echo "=== 下一步操作 ==="
echo "1. 首先尝试在 Google Play Console 中创建应用"
echo "2. 如果包名可用，直接使用现有包名"
echo "3. 如果包名不可用，选择方案B或C"
echo "4. 上传新生成的 AAB 文件：android/app/build/outputs/bundle/release/app-release.aab"
echo ""

echo "⚠️ 重要提醒："
echo "- 包名一旦发布就不能更改"
echo "- 更改包名会创建全新的应用"
echo "- 用户需要重新安装应用"
echo "- 应用数据不会迁移"
