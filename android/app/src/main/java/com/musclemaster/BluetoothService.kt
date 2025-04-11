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
import android.os.PowerManager
import android.os.HandlerThread
import android.util.Log
import com.musclemaster.MainActivity
import com.musclemaster.R


class BluetoothService : Service() {
    private val TAG = "BluetoothService"
    private val NOTIFICATION_ID = 1
    private val CHANNEL_ID = "BluetoothServiceChannel"
    private val WAKE_LOCK_TAG = "MuscleMaster:BluetoothServiceWakeLock"

    // 创建独立的后台线程和Handler处理计时器
    private lateinit var timerHandlerThread: HandlerThread
    private lateinit var timerHandler: Handler
    
    // 添加计时器管理相关属性
    private val deviceTimers = mutableMapOf<String, Handler>()
    private val timerRunnables = mutableMapOf<String, Runnable>()
    private val deviceTimerValues = mutableMapOf<String, Int>()
    
    // Handler for delayed tasks on main thread
    private val mainHandler = Handler(Looper.getMainLooper())
    
    // Binder given to clients
    private val binder = LocalBinder()
    
    // ReactContext for sending events back to JS
    private var reactContext: ReactContext? = null
    
    // 保存当前是否有活跃连接的标志
    private var hasActiveConnections = false
    
    // WakeLock to keep the CPU running for timer
    private var wakeLock: PowerManager.WakeLock? = null
    
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
        
        // 创建计时器专用线程和Handler
        timerHandlerThread = HandlerThread("BluetoothTimerThread")
        timerHandlerThread.start()
        timerHandler = Handler(timerHandlerThread.looper)
        
        // 创建WakeLock
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            WAKE_LOCK_TAG
        )
        wakeLock?.setReferenceCounted(false)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "BluetoothService started")

        // 从 intent 中获取额外信息
        intent?.let {
            hasActiveConnections = it.getBooleanExtra("hasActiveConnections", false)

            // 检查是否需要启动计时器
            if (it.getBooleanExtra("startTimer", false)) {
                val deviceId = it.getStringExtra("deviceId")
                val interval = it.getIntExtra("interval", 1000)
                if (deviceId != null) {
                    startTimer(deviceId, interval)
                }
            }
        }

        // 启动前台服务
        startForeground(NOTIFICATION_ID, createNotification())

        // 更改为不立即停止服务
        if (!hasActiveConnections) {
            // 不要立即调用 stopSelf()
            // 而是设置一个延迟，给连接一个机会建立
            mainHandler.postDelayed({
                if (!hasActiveConnections) stopSelf()
            }, 60000) // 给 60 秒时间
        }

        // 如果服务被系统杀死，系统将尝试重新创建服务
        return START_STICKY
    }

    // 启动设备计时器
    fun startTimer(deviceId: String, interval: Int = 1000) {
        // 获取 WakeLock，确保计时器能在后台运行
        if (wakeLock?.isHeld != true) {
            wakeLock?.acquire(30*60*1000L) // 30分钟，避免永久持有
            Log.d(TAG, "Acquired wake lock for background timer")
        }
        
        // 停止已存在的计时器
        stopTimer(deviceId)

        // 确保设备计时器值已初始化
        if (!deviceTimerValues.containsKey(deviceId)) {
            // 如果没有初始值，默认设为0
            deviceTimerValues[deviceId] = 0
            Log.d(TAG, "Initialized timer value for device $deviceId to 0")
        }

        // 获取当前计时器值
        val initialValue = deviceTimerValues[deviceId] ?: 0
        Log.d(TAG, "Starting timer for device $deviceId with initial value: $initialValue seconds")

        // 只有当有正值时才启动计时器
        if (initialValue <= 0) {
            Log.d(TAG, "Timer value is 0 or negative, not starting timer for device $deviceId")
            return
        }

        // 创建计时器任务 - 执行倒计时而不是增加时间
        val timerRunnable = object : Runnable {
            override fun run() {
                // 获取当前计时器值
                val currentValue = deviceTimerValues[deviceId] ?: 0
                
                // 记录运行时间点
                val timestamp = System.currentTimeMillis()
                Log.d(TAG, "Timer running at $timestamp, current value: $currentValue for device $deviceId")
                
                // 如果计时器值小于等于0，停止计时器
                if (currentValue <= 0) {
                    Log.d(TAG, "Timer for device $deviceId reached 0, stopping")
                    stopTimer(deviceId)
                    return
                }
                
                // 减少计时器值（倒计时）
                val newValue = currentValue - 1
                deviceTimerValues[deviceId] = newValue
                Log.d(TAG, "Timer for device $deviceId decremented: $currentValue -> $newValue")
                
                // 在主线程上更新通知
                mainHandler.post {
                    updateNotification()
                }
                
                // 发送事件到 JavaScript (需要在主线程执行)
                mainHandler.post {
                    reactContext?.let { context ->
                        val params = Arguments.createMap().apply {
                            putString("deviceId", deviceId)
                            putInt("timerValue", newValue)
                        }
                        sendEvent(context, "onTimerTick", params)
                    }
                }

                // 继续执行 - 在后台线程上
                timerHandler.postDelayed(this, interval.toLong())
            }
        }

        // 保存引用
        timerRunnables[deviceId] = timerRunnable
        deviceTimers[deviceId] = timerHandler

        // 启动计时器 - 在后台线程上
        timerHandler.post(timerRunnable)
        Log.d(TAG, "Started timer for device $deviceId with value: $initialValue")
    }

    // 停止设备计时器
    fun stopTimer(deviceId: String) {
        val runnable = timerRunnables[deviceId]
        val timer = deviceTimers[deviceId]

        if (runnable != null && timer != null) {
            timer.removeCallbacks(runnable)
            timerRunnables.remove(deviceId)
            deviceTimers.remove(deviceId)
            Log.d(TAG, "Stopped timer for device $deviceId")
        }
        
        // 如果没有活跃的计时器，释放 WakeLock
        if (timerRunnables.isEmpty() && wakeLock?.isHeld == true) {
            wakeLock?.release()
            Log.d(TAG, "Released wake lock, no active timers")
        }
    }
    
    override fun onBind(intent: Intent): IBinder {
        return binder
    }

    override fun onDestroy() {
        super.onDestroy()

        // 停止所有计时器
        timerRunnables.keys.toList().forEach { deviceId ->
            stopTimer(deviceId)
        }
        
        // 释放 WakeLock
        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
            Log.d(TAG, "Released wake lock on service destroy")
        }
        
        // 停止计时器线程
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
            timerHandlerThread.quitSafely()
        } else {
            timerHandlerThread.quit()
        }

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
        
        // 构建基础通知
        val notificationBuilder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MuscleMaster Active")
            .setSmallIcon(R.mipmap.ic_launcher) // 使用应用图标
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pendingIntent)
            
        // 检查是否有活跃的计时器
        if (deviceTimerValues.isEmpty()) {
            notificationBuilder.setContentText("Maintaining connection to your devices")
        } else {
            // 找出最小的计时器值（剩余时间最少的）
            val activeTimers = deviceTimerValues.filter { it.value > 0 }
            if (activeTimers.isNotEmpty()) {
                val minTimeDevice = activeTimers.minByOrNull { it.value }
                val minutes = minTimeDevice?.value?.div(60) ?: 0
                val seconds = minTimeDevice?.value?.rem(60) ?: 0
                val formattedTime = String.format("%02d:%02d", minutes, seconds)
                
                notificationBuilder.setContentText("Timer running: $formattedTime remaining")
                    .setOngoing(true)
                    .setUsesChronometer(true)
            } else {
                notificationBuilder.setContentText("Maintaining connection to your devices")
            }
        }
        
        return notificationBuilder.build()
    }
    
    /**
     * 更新通知
     */
    private fun updateNotification() {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, createNotification())
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
     * 同步 JavaScript 的计时器值到原生层
     * @param deviceId 设备ID
     * @param timerValue 计时器值（秒）
     */
    fun syncTimerValue(deviceId: String, timerValue: Int) {
        Log.d(TAG, "Syncing timer value for device $deviceId: $timerValue seconds")
        deviceTimerValues[deviceId] = timerValue
    }
    
    /**
     * 获取设备当前计时器值
     * @param deviceId 设备ID
     * @return 计时器值（秒），如果不存在则返回0
     */
    fun getCurrentTimerValue(deviceId: String): Int {
        val value = deviceTimerValues[deviceId] ?: 0
        Log.d(TAG, "Getting timer value for device $deviceId: $value seconds")
        return value
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