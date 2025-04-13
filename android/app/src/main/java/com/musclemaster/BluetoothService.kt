package com.musclemaster

import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.Arguments
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.os.PersistableBundle
import android.app.PendingIntent
import android.app.Notification
import android.os.HandlerThread
import android.content.Context
import android.os.PowerManager
import android.content.Intent
import android.content.ComponentName
import android.app.Service
import android.os.Handler
import android.os.IBinder
import android.os.Binder
import android.os.Looper
import android.os.Build
import android.util.Log


class BluetoothService : Service() {
  private val TAG = "com.musclemaster.BluetoothService"
  private val NOTIFICATION_ID = 1
  private val CHANNEL_ID = "BluetoothServiceChannel"
  private val WAKE_LOCK_TAG = "MuscleMaster:BluetoothServiceWakeLock"
  private val TIMER_JOB_ID_PREFIX = 10000 // 为每个设备的Job ID预留空间

  // 创建独立的后台线程和Handler处理计时器
  private lateinit var timerHandlerThread: HandlerThread
  private lateinit var timerHandler: Handler

  // JobScheduler
  private lateinit var jobScheduler: JobScheduler

  // 添加计时器管理相关属性
  private val deviceJobIds = mutableMapOf<String, Int>()
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
    Log.d(TAG, "===== com.musclemaster.BluetoothService 创建 =====")

    // 创建通知通道 - 对 Android 8.0+ 必须
    createNotificationChannel()

    // 初始化 JobScheduler
    jobScheduler = getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
    Log.d(TAG, "JobScheduler 已初始化")

    // 创建计时器专用线程和 Handler
    timerHandlerThread = HandlerThread("BluetoothTimerThread", Thread.MAX_PRIORITY)
    timerHandlerThread.start()
    timerHandler = Handler(timerHandlerThread.looper)
    Log.d(TAG, "计时器专用线程已创建和启动，优先级：${timerHandlerThread.priority}")

    // 创建 WakeLock - 使用 PARTIAL_WAKE_LOCK 可在屏幕关闭时保持 CPU 运行
    val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = powerManager.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      WAKE_LOCK_TAG
    )
    wakeLock?.setReferenceCounted(false)
    Log.d(TAG, "WakeLock 已配置，类型：PARTIAL_WAKE_LOCK")

    // 尝试从 SharedPreferences 恢复计时器值
    try {
      val sharedPrefs = getSharedPreferences("BluetoothTimerPrefs", Context.MODE_PRIVATE)
      val allPrefs = sharedPrefs.all

      for ((key, value) in allPrefs) {
        if (key.startsWith("timer_") && value is Int && value > 0) {
          val deviceId = key.substring(6) // 去掉"timer_"前缀
          deviceTimerValues[deviceId] = value
          Log.d(TAG, "从 SharedPreferences 恢复设备 $deviceId 的计时器值：$value")

          // 恢复计时器
          startTimer(deviceId, 1000)
        }
      }
    } catch (e: Exception) {
      Log.e(TAG, "从 SharedPreferences 恢复计时器值失败：${e.message}")
    }

    // 立即启动前台服务，避免系统杀死后台服务
    startForeground(NOTIFICATION_ID, createNotification())
    Log.d(TAG, "已启动前台服务，通知 ID：$NOTIFICATION_ID")
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    Log.d(TAG, "com.musclemaster.BluetoothService started")

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

  // 使用JobScheduler调度下一次计时器任务
  private fun scheduleTimerJob(deviceId: String, currentValue: Int, interval: Int) {
    if (currentValue <= 0) {
      Log.d(TAG, "不调度计时器任务，因为当前值 <= 0")
      return
    }

    Log.d(TAG, "=== 调度下一次计时器任务 ===")
    Log.d(TAG, "设备ID: $deviceId, 当前值: $currentValue, 间隔: ${interval}ms")

    try {
      // 为此设备生成唯一任务ID
      val jobId = TIMER_JOB_ID_PREFIX + deviceId.hashCode()
      deviceJobIds[deviceId] = jobId

      // 保存计时器参数
      val extras = PersistableBundle().apply {
        putString("deviceId", deviceId)
        putInt("currentValue", currentValue)
        putInt("interval", interval)
      }

      // 创建任务
      val componentName = ComponentName(this, TimerJobService::class.java)
      val jobInfo = JobInfo.Builder(jobId, componentName)
        .setExtras(extras)
        .setMinimumLatency(interval.toLong()) // 最小延迟时间（以毫秒为单位）
        .setOverrideDeadline((interval * 1.1).toLong()) // 最大延迟时间（增加10%容差）
        .setRequiresDeviceIdle(false) // 设备不必处于空闲状态
        .setRequiresCharging(false) // 设备不必充电
        .setPersisted(true) // 设备重启后仍然有效
        .build()

      // 调度任务
      val result = jobScheduler.schedule(jobInfo)
      if (result == JobScheduler.RESULT_SUCCESS) {
        Log.d(TAG, "成功调度设备 $deviceId 的计时器任务，JobID：$jobId")
      } else {
        Log.e(TAG, "调度设备 $deviceId 的计时器任务失败，错误码：$result")
      }
    } catch (e: Exception) {
      Log.e(TAG, "调度计时器任务异常：${e.message}", e)
    }
  }

  // 处理计时器滴答 - 由TimerJobService调用
  fun processTimerTick(deviceId: String, newValue: Int, interval: Int) {
    Log.d(TAG, "处理计时器滴答：deviceId=$deviceId, newValue=$newValue")

    // 更新存储的计时器值
    deviceTimerValues[deviceId] = newValue

    // 更新SharedPreferences
    try {
      val sharedPrefs = getSharedPreferences("BluetoothTimerPrefs", Context.MODE_PRIVATE)
      sharedPrefs.edit().putInt("timer_$deviceId", newValue).apply()
    } catch (e: Exception) {
      Log.e(TAG, "保存计时器值到SharedPreferences失败：${e.message}")
    }

    // 更新通知
    updateNotification()

    // 发送事件到JavaScript
    reactContext?.let { context ->
      val params = Arguments.createMap().apply {
        putString("deviceId", deviceId)
        putInt("timerValue", newValue)
      }
      try {
        sendEvent(context, "onTimerTick", params)
        Log.d(TAG, "发送onTimerTick事件到JS，设备 $deviceId 值：$newValue")
      } catch (e: Exception) {
        Log.e(TAG, "发送事件到JS失败：${e.message}")
      }
    } ?: Log.e(TAG, "reactContext为空，无法发送事件")

    // 如果计时器值仍然大于0，调度下一个任务
    if (newValue > 0) {
      scheduleTimerJob(deviceId, newValue, interval)
    } else {
      // 计时完成，通知JavaScript
      reactContext?.let { context ->
        val params = Arguments.createMap().apply {
          putString("deviceId", deviceId)
          putInt("timerValue", 0)
          putBoolean("timerCompleted", true)
        }
        try {
          sendEvent(context, "onTimerComplete", params)
          Log.d(TAG, "发送onTimerComplete事件到JS，设备 $deviceId")
        } catch (e: Exception) {
          Log.e(TAG, "发送事件到JS失败：${e.message}")
        }
      }
    }
  }

  // 启动设备计时器
  fun startTimer(deviceId: String, interval: Int = 1000) {
    Log.d(TAG, "===== 启动设备计时器 =====")
    Log.d(TAG, "设备ID: $deviceId, 间隔：$interval ms, 线程：${Thread.currentThread().name}")

    // 获取 WakeLock，确保计时器能在后台运行
    try {
      if (wakeLock?.isHeld != true) {
        // 使用 PARTIAL_WAKE_LOCK 确保后台处理
        wakeLock?.acquire(30*60*1000L) // 30 分钟，避免永久持有
        Log.d(TAG, "成功获取 WakeLock 用于后台计时器")

        // 确保服务为前台服务，因为从 Android 8.0 开始，后台服务受到更严格限制
        startForeground(NOTIFICATION_ID, createNotification())
        Log.d(TAG, "已启动/更新前台服务")
      } else {
        Log.d(TAG, "WakeLock 已经被持有，继续使用")
      }
    } catch (e: Exception) {
      Log.e(TAG, "获取 WakeLock 失败：${e.message}")
    }

    // 停止已存在的计时器
    stopTimer(deviceId)

    // 确保设备计时器值已初始化
    if (!deviceTimerValues.containsKey(deviceId)) {
      // 如果没有初始值，默认设为 0
      deviceTimerValues[deviceId] = 0
      Log.d(TAG, "初始化设备 $deviceId 计时器值为 0")
    }

    // 获取当前计时器值
    val initialValue = deviceTimerValues[deviceId] ?: 0
    Log.d(TAG, "设备 $deviceId 计时器初始值：$initialValue 秒")

    // 只有当有正值时才启动计时器
    if (initialValue <= 0) {
      Log.e(TAG, "计时器值为 0 或负值，不启动设备 $deviceId 的计时器")
      return
    }

    // 保存当前的计时器值到 SharedPreferences 以防服务被终止
    try {
      val sharedPrefs = getSharedPreferences("BluetoothTimerPrefs", Context.MODE_PRIVATE)
      sharedPrefs.edit().putInt("timer_$deviceId", initialValue).apply()
      Log.d(TAG, "已将计时器值 $initialValue 保存到 SharedPreferences")
    } catch (e: Exception) {
      Log.e(TAG, "保存计时器值到 SharedPreferences 失败：${e.message}")
    }

    // 立即调度计时器任务
    scheduleTimerJob(deviceId, initialValue, interval)
    Log.d(TAG, "===> 启动了设备 $deviceId 的计时器，初始值：$initialValue <===")

    // 更新通知以显示计时器状态
    mainHandler.post {
      updateNotification()
    }
  }

  // 停止设备计时器
  fun stopTimer(deviceId: String) {
    Log.d(TAG, "正在停止设备 $deviceId 的计时器")

    // 取消JobScheduler中的任务
    try {
      val jobId = deviceJobIds[deviceId]
      if (jobId != null) {
        jobScheduler.cancel(jobId)
        deviceJobIds.remove(deviceId)
        Log.d(TAG, "已取消设备 $deviceId 的计时器任务，JobID：$jobId")
      }

      // 从SharedPreferences中移除
      val sharedPrefs = getSharedPreferences("BluetoothTimerPrefs", Context.MODE_PRIVATE)
      sharedPrefs.edit().remove("timer_$deviceId").apply()
      Log.d(TAG, "已从SharedPreferences中移除设备 $deviceId 的计时器值")

      // 发送最终状态到 JS
      reactContext?.let { context ->
        val params = Arguments.createMap().apply {
          putString("deviceId", deviceId)
          putInt("timerValue", 0)
          putBoolean("timerCompleted", true)
        }
        sendEvent(context, "onTimerComplete", params)
        Log.d(TAG, "发送 onTimerComplete 事件到 JS，设备 $deviceId")
      }
    } catch (e: Exception) {
      Log.e(TAG, "停止计时器时出错：${e.message}", e)
    }

    // 如果没有活跃的计时器，释放 WakeLock
    if (deviceJobIds.isEmpty() && wakeLock?.isHeld == true) {
      try {
        wakeLock?.release()
        Log.d(TAG, "释放 WakeLock，没有活跃的计时器")
      } catch (e: Exception) {
        Log.e(TAG, "释放 WakeLock 时出错：${e.message}", e)
      }
    } else {
      Log.d(TAG, "保持 WakeLock，还有 ${deviceJobIds.size} 个活跃计时器")
    }

    // 更新通知
    mainHandler.post {
      updateNotification()
    }
  }

  override fun onBind(intent: Intent): IBinder {
    return binder
  }

  override fun onDestroy() {
    super.onDestroy()

    // 停止所有计时器
    deviceJobIds.keys.toList().forEach { deviceId ->
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

    Log.d(TAG, "com.musclemaster.BluetoothService destroyed")
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
   * @param deviceId 设备 ID
   * @param timerValue 计时器值（秒）
   */
  fun syncTimerValue(deviceId: String, timerValue: Int) {
    Log.d(TAG, "同步计时器值：设备 $deviceId: $timerValue 秒")
    deviceTimerValues[deviceId] = timerValue

    // 更新通知以显示新的计时器值
    updateNotification()
  }

  /**
   * 获取设备当前计时器值
   * @param deviceId 设备 ID
   * @return 计时器值（秒），如果不存在则返回 0
   */
  fun getCurrentTimerValue(deviceId: String): Int {
    val value = deviceTimerValues[deviceId] ?: 0
    Log.d(TAG, "获取计时器值：设备 $deviceId: $value 秒")
    return value
  }

  /**
   * 设置 React 上下文，用于向 JavaScript 发送事件
   */
  fun setReactContext(context: ReactContext) {
    this.reactContext = context
    Log.d(TAG, "已设置 ReactContext")
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