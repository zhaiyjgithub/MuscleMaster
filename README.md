This is a new [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

>**Note**: Make sure you have completed the [React Native - Environment Setup](https://reactnative.dev/docs/environment-setup) instructions till "Creating a new application" step, before proceeding.

## Step 1: Start the Metro Server

First, you will need to start **Metro**, the JavaScript _bundler_ that ships _with_ React Native.

To start Metro, run the following command from the _root_ of your React Native project:

```bash
# using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Start your Application

Let Metro Bundler run in its _own_ terminal. Open a _new_ terminal from the _root_ of your React Native project. Run the following command to start your _Android_ or _iOS_ app:

### For Android

```bash
# using npm
npm run android

# OR using Yarn
yarn android
```

### For iOS

```bash
# using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up _correctly_, you should see your new app running in your _Android Emulator_ or _iOS Simulator_ shortly provided you have set up your emulator/simulator correctly.

This is one way to run your app — you can also run it directly from within Android Studio and Xcode respectively.

## Step 3: Modifying your App

Now that you have successfully run the app, let's modify it.

1. Open `App.tsx` in your text editor of choice and edit some lines.
2. For **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Developer Menu** (<kbd>Ctrl</kbd> + <kbd>M</kbd> (on Window and Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (on macOS)) to see your changes!

   For **iOS**: Hit <kbd>Cmd ⌘</kbd> + <kbd>R</kbd> in your iOS Simulator to reload the app and see your changes!

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [Introduction to React Native](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you can't get this to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.

# MuscleMaster

## Android 打包说明

### 生成 Google Play Store AAB 文件

我们提供了几个npm脚本来帮助您生成用于Google Play Store的AAB（Android App Bundle）文件：

#### 可用脚本：

1. **`npm run build-aab`** - 基础AAB构建
   ```bash
   npm run build-aab
   ```

2. **`npm run clean-android`** - 清理Android构建缓存
   ```bash
   npm run clean-android
   ```

3. **`npm run build-aab-upload`** - 清理后构建AAB（推荐用于上传）
   ```bash
   npm run build-aab-upload
   ```

4. **`npm run prepare-playstore`** - 完整的Play Store准备流程
   ```bash
   npm run prepare-playstore
   ```

#### 构建步骤：

1. 确保您的签名密钥配置正确（在 `android/gradle.properties` 中）
2. 运行构建命令：
   ```bash
   npm run prepare-playstore
   ```
3. 生成的AAB文件位置：
   ```
   android/app/build/outputs/bundle/release/app-release.aab
   ```

#### 签名配置：

确保以下文件存在并配置正确：
- `android/app/my-release-key.keystore` - 您的签名密钥文件
- `android/gradle.properties` - 包含签名配置的属性

#### 上传到Google Play Console：

1. 登录 [Google Play Console](https://play.google.com/console)
2. 选择您的应用
3. 转到 "Release" > "Production"
4. 点击 "Create new release"
5. 上传生成的 `app-release.aab` 文件

#### 注意事项：

- 首次上传时，确保版本号（versionCode）是递增的
- AAB文件包含所有架构，Google Play会为用户设备生成优化的APK
- 构建前建议运行 `npm run clean-android` 清理缓存


## ios 打包说明

### 执行依赖安装

1. **`yarn install`**

## 执行 pod 依赖安装

1. **`cd ios`**
2. **`pod install`**

## 执行 iOS 打包流程
1. 打开 **MuscleMaster.xcworkspace** 进行打包