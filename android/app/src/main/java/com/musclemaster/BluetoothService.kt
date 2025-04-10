import { NativeModules, Platform } from 'react-native';

const { BluetoothServiceModule } = NativeModules;

/**
 * 蓝牙后台服务控制器
 * 仅在 Android 上有效，iOS 通过 Info.plist 的 UIBackgroundModes 配置自动处理
 */
export class BluetoothBackgroundService {
  /**
   * 启动蓝牙后台服务
   * @param hasActiveConnections 是否有活跃的蓝牙连接
   */
  static startService(hasActiveConnections: boolean = true): void {
    if (Platform.OS === 'android' && BluetoothServiceModule) {
      BluetoothServiceModule.startService(hasActiveConnections);
    }
  }

  /**
   * 停止蓝牙后台服务
   */
  static stopService(): void {
    if (Platform.OS === 'android' && BluetoothServiceModule) {
      BluetoothServiceModule.stopService();
    }
  }

  /**
   * 更新连接状态
   * @param hasConnections 是否有活跃的蓝牙连接
   */
  static updateConnectionState(hasConnections: boolean): void {
    if (Platform.OS === 'android' && BluetoothServiceModule) {
      BluetoothServiceModule.updateConnectionState(hasConnections);
    }
  }
}           Log.d(TAG, "BluetoothService disconnected")
        }
    }

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        // 应用启动时绑定服务
        bindService()
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        // 解绑服务
        unbindService()
    }

    @ReactMethod
    fun startService(hasActiveConnections: Boolean) {
        Log.d(TAG, "Starting BluetoothService")
        val intent = Intent(reactContext, BluetoothService::class.java).apply {
            putExtra("hasActiveConnections", hasActiveConnections)
        }
        
        // 在 Android 8.0+ 上，前台服务必须在几秒钟内调用 startForeground
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            reactContext.startForegroundService(intent)
        } else {
            reactContext.startService(intent)
        }
        
        bindService()
    }

    @ReactMethod
    fun stopService() {
        Log.d(TAG, "Stopping BluetoothService")
        unbindService()
        reactContext.stopService(Intent(reactContext, BluetoothService::class.java))
    }

    @ReactMethod
    fun updateConnectionState(hasConnections: Boolean) {
        Log.d(TAG, "Updating connection state: $hasConnections")
        bluetoothService?.updateConnectionState(hasConnections)
    }

    private fun bindService() {
        if (!isBound) {
            val intent = Intent(reactContext, BluetoothService::class.java)
            reactContext.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
        }
    }

    private fun unbindService() {
        if (isBound) {
            reactContext.unbindService(serviceConnection)
            isBound = false
        }
    }
}           this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        // 构建通知
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Bluetooth Active")
            .setContentText("Maintaining connection to your devices")
            .setSmallIcon(R.mipmap.ic_launcher) // 使用应用图标
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pendingIntent)
            .build()
    }

    /**
     * 更新服务的状态，如果有活跃连接则保持运行，否则停止
     */
    fun updateConnectionState(hasConnections: Boolean) {
        this.hasActiveConnections = hasConnections
        
        if (hasConnections) {
            // 有连接时更新通知
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.notify(NOTIFICATION_ID, createNotification())
        } else {
            // 没有连接时停止服务
            stopSelf()
        }
    }

    /**
     * 设置React上下文，用于向JavaScript发送事件
     */
    fun setReactContext(context: ReactContext) {
        this.reactContext = context
    }

    /**
     * 向JavaScript发送设备连接状态变化事件
     */
    fun sendDeviceEvent(deviceId: String, isConnected: Boolean) {
        reactContext?.let { context ->
            val params = Arguments.createMap().apply {
                putString("deviceId", deviceId)
                putBoolean("connected", isConnected)
            }
            sendEvent(context, "onBluetoothDeviceConnectionChange", params)
        }
    }

    /**
     * 发送事件到JavaScript
     */
    private fun sendEvent(reactContext: ReactContext, eventName: String, params: WritableMap) {
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
} 