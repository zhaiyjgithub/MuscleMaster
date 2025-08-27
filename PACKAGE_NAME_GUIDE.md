# Google Play Console 包名处理指南

## 重要声明

### ❌ 不能更改包名
- **包名一旦创建就不能更改**
- 这是 Google Play Console 的硬性限制
- 即使应用从未发布过，也无法更改包名

## 当前情况分析

### 您的应用包名：`com.musclemaster`

## 解决方案

### 方案1：使用现有包名（推荐）
如果 `com.musclemaster` 包名仍然可用：

1. **检查包名可用性**
   - 登录 Google Play Console
   - 尝试创建新应用
   - 输入包名 `com.musclemaster`
   - 如果系统接受，说明包名可用

2. **直接使用现有包名**
   - 不需要修改代码
   - 直接上传新生成的 AAB 文件
   - 重新提交审核

### 方案2：删除并重新创建应用
如果 `com.musclemaster` 包名已被占用：

1. **删除现有应用**
   - 登录 Google Play Console
   - 找到现有应用
   - 点击"删除应用"
   - 确认删除

2. **创建新应用**
   - 点击"创建应用"
   - 使用新的包名，例如：
     - `com.musclemaster.app`
     - `com.musclemaster.timer`
     - `com.musclemaster.fitness`
     - `io.musclemaster.app`

3. **修改代码中的包名**
   - 修改 `android/app/build.gradle`
   - 修改 `android/app/src/main/AndroidManifest.xml`
   - 更新 Java/Kotlin 文件结构

## 检查包名可用性的步骤

### 方法1：通过 Google Play Console
1. 登录 [Google Play Console](https://play.google.com/console)
2. 点击"创建应用"
3. 填写应用信息
4. 在包名字段输入 `com.musclemaster`
5. 如果显示错误，说明包名已被占用

### 方法2：通过 Google Play Store
1. 在 Google Play Store 搜索 `com.musclemaster`
2. 如果找到应用，说明包名已被使用
3. 如果没有找到，包名可能可用

## 建议的包名格式

### 标准格式
```
com.公司名.应用名
com.开发者名.应用名
io.公司名.应用名
```

### 针对您的应用的建议
- `com.musclemaster.app`
- `com.musclemaster.timer`
- `com.musclemaster.fitness`
- `com.musclemaster.workout`
- `io.musclemaster.app`
- `io.musclemaster.timer`

## 修改包名的代码步骤

### 1. 修改 build.gradle
```gradle
android {
    namespace "com.musclemaster.app"  // 新包名
    defaultConfig {
        applicationId "com.musclemaster.app"  // 新包名
        // ... 其他配置
    }
}
```

### 2. 修改 AndroidManifest.xml
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.musclemaster.app">  <!-- 新包名 -->
```

### 3. 更新 Java/Kotlin 文件
- 创建新的包名目录结构
- 移动现有文件到新目录
- 更新文件中的包名声明

## 重要提醒

### ⚠️ 包名限制
- 包名必须至少包含一个点号
- 每个段必须以字母开头
- 只能包含字母、数字和下划线
- 不能以数字开头
- 不能使用保留字

### ⚠️ 影响
- 更改包名会创建全新的应用
- 用户需要重新安装应用
- 应用数据不会迁移
- 应用评分和评论不会迁移

## 推荐操作流程

1. **首先尝试使用现有包名**
   - 检查 `com.musclemaster` 是否可用
   - 如果可用，直接使用

2. **如果包名不可用**
   - 删除现有应用条目
   - 创建新应用，使用新包名
   - 修改代码中的包名
   - 重新构建和上传

3. **备份重要信息**
   - 记录应用描述
   - 保存应用截图
   - 备份应用元数据
