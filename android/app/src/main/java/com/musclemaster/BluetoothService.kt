import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.Arguments
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Notification
import android.content.Context
import android.content.Intent
import android.app.Service
import android.os.Handler
import android.os.IBinder
import android.os.Binder
import android.os.Looper
import android.os.Build
import android.util.Log
import com.musclemaster.MainActivity
import com.musclemaster.R


class BluetoothService : Service() {
    private val TAG = "BluetoothService"
    private val NOTIFICATION_ID = 1
    private val CHANNEL_ID = "BluetoothServiceChannel"
    
    // Handler for delayed tasks
    private val handler = Handler(Looper.getMainLooper())
    
    // Binder given to clients
    private val binder = LocalBinder()
    
    // ReactContext for sending events back to JS
    private var reactContext: ReactContext? = null
    
    // 保存当前是否有活跃连接的标志
    private var hasActiveConnections = false
    
    /**
    * Class used for the client Binder.
    */
    inner class LocalBinder : Binder() {
        fun getService(): BluetoothService = this@BluetoothService
    }
    
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "BluetoothService created")
        createNotificationChannel()
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "BluetoothService started")
        
        // 从 intent 中获取额外信息
        intent?.let {
            hasActiveConnections = it.getBooleanExtra("hasActiveConnections", false)
        }
        
        // 启动前台服务
        startForeground(NOTIFICATION_ID, createNotification())
        
        // 更改为不立即停止服务
        if (!hasActiveConnections) {
            // 不要立即调用 stopSelf()
            // 而是设置一个延迟，给连接一个机会建立
            handler.postDelayed({ 
                if (!hasActiveConnections) stopSelf() 
            }, 60000) // 给 60 秒时间
        }
        
        // 如果服务被系统杀死，系统将尝试重新创建服务
        return START_STICKY
    }
    
    override fun onBind(intent: Intent): IBinder {
        return binder
    }
    
    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "BluetoothService destroyed")
    }
    
    /**
    * 为服务创建一个通知通道（Android 8.0 及以上需要）
    */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Bluetooth Service"
            val descriptionText = "Maintains Bluetooth connections in background"
            val importance = NotificationManager.IMPORTANCE_LOW
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
            }
            // 注册通道
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    /**
    * 创建前台服务所需的通知
    */
    private fun createNotification(): Notification {
        // 创建一个 PendingIntent，用户点击通知时返回应用
        val pendingIntent = PendingIntent.getActivity(
        this,
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
    * 设置 React 上下文，用于向 JavaScript 发送事件
    */
    fun setReactContext(context: ReactContext) {
        this.reactContext = context
    }
    
    /**
    * 向 JavaScript 发送设备连接状态变化事件
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
    * 发送事件到 JavaScript
    */
    private fun sendEvent(reactContext: ReactContext, eventName: String, params: WritableMap) {
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(eventName, params)
    }
}