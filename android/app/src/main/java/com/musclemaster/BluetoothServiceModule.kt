import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.bridge.ReactMethod
import android.content.ServiceConnection
import com.facebook.react.bridge.Promise
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log

@ReactModule(name = BluetoothServiceModule.NAME)
class BluetoothServiceModule(private val reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule() {
    
    companion object {
        const val NAME = "BluetoothServiceModule"
    }
    
    private val TAG = "BluetoothServiceModule"
    private var bluetoothService: BluetoothService? = null
    private var isBound = false
    
    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(className: ComponentName, service: IBinder) {
            val binder = service as BluetoothService.LocalBinder
            bluetoothService = binder.getService()
            bluetoothService?.setReactContext(reactContext)
            isBound = true
            Log.d(TAG, "BluetoothService connected")
        }

        override fun onServiceDisconnected(className: ComponentName) {
            bluetoothService = null
            isBound = false
            Log.d(TAG, "BluetoothService disconnected")
        }
    }

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        // 应用启动时绑定服务
        bindService()
    }

    override fun invalidate() {
        super.invalidate()
        // 解绑服务
        unbindService()
    }

    @ReactMethod
    fun startService(hasActiveConnections: Boolean, promise: Promise) {
        try {
            Log.d(TAG, "启动BluetoothService，hasActiveConnections: $hasActiveConnections")
            ensureServiceRunning()
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "启动服务失败: ${e.message}")
            promise.reject("ERROR", "启动服务失败: ${e.message}")
        }
    }

    @ReactMethod
    fun startBackgroundTimer(deviceId: String, timerValue: Int, interval: Int = 1000, promise: Promise) {
        Log.d(TAG, "启动设备 $deviceId 的后台计时器，初始值：$timerValue, 间隔：$interval")
        
        try {
            // 确保服务已经启动和绑定
            ensureServiceRunning()
            
            // 首先同步计时器值
            bluetoothService?.syncTimerValue(deviceId, timerValue)
            Log.d(TAG, "已同步计时器值到原生层：$timerValue")
            
            // 委托服务启动计时器
            bluetoothService?.startTimer(deviceId, interval)
            
            // 验证计时器已经启动
            val startedValue = bluetoothService?.getCurrentTimerValue(deviceId) ?: 0
            Log.d(TAG, "验证启动后的计时器值：$startedValue")
            
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "启动后台计时器失败：${e.message}", e)
            promise.reject("ERROR", "启动后台计时器失败：${e.message}")
        }
    }

    @ReactMethod
    fun stopBackgroundTimer(deviceId: String, promise: Promise) {
        Log.d(TAG, "停止后台计时器 deviceId=$deviceId")
        try {
            ensureServiceRunning()
            bluetoothService?.stopTimer(deviceId)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "停止计时器失败：${e.message}", e)
            promise.reject("ERROR", "Failed to stop timer: ${e.message}")
        }
    }
    
    @ReactMethod
    fun syncTimerValue(deviceId: String, timerValue: Int, promise: Promise) {
        Log.d(TAG, "同步计时器值 deviceId=$deviceId, value=$timerValue")
        try {
            ensureServiceRunning()
            bluetoothService?.syncTimerValue(deviceId, timerValue)
            
            // 验证同步是否成功
            val verifiedValue = bluetoothService?.getCurrentTimerValue(deviceId) ?: 0
            Log.d(TAG, "验证同步后的计时器值：$verifiedValue, 预期值：$timerValue")
            
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "同步计时器值失败：${e.message}", e)
            promise.reject("ERROR", "同步计时器值失败：${e.message}")
        }
    }
    
    @ReactMethod
    fun getCurrentTimerValue(deviceId: String, promise: Promise) {
        try {
            ensureServiceRunning()
            val value = bluetoothService?.getCurrentTimerValue(deviceId) ?: 0
            Log.d(TAG, "获取设备 $deviceId 的计时器值：$value")
            promise.resolve(value)
        } catch (e: Exception) {
            Log.e(TAG, "获取计时器值失败：${e.message}", e)
            promise.reject("ERROR", "获取计时器值失败：${e.message}")
        }
    }
    
    @ReactMethod
    fun updateConnectionState(hasConnections: Boolean, promise: Promise) {
        try {
            Log.d(TAG, "更新连接状态: hasConnections=$hasConnections")
            ensureServiceRunning()
            bluetoothService?.updateConnectionState(hasConnections)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "更新连接状态失败：${e.message}")
            promise.reject("ERROR", "更新连接状态失败：${e.message}")
        }
    }

    /**
     * 确保服务正在运行
     */
    private fun ensureServiceRunning() {
        // 如果服务未绑定，先绑定服务
        if (!isBound) {
            Log.d(TAG, "服务未绑定，尝试绑定...")
            bindService()
            
            // 给一点时间让服务连接
            var waitCount = 0
            while (!isBound && waitCount < 10) {
                try {
                    Thread.sleep(50)
                    waitCount++
                } catch (e: InterruptedException) {
                    break
                }
            }
            
            if (isBound) {
                Log.d(TAG, "服务绑定成功")
            } else {
                Log.e(TAG, "服务绑定超时")
            }
        }
        
        // 启动服务
        val serviceIntent = Intent(reactContext, BluetoothService::class.java).apply {
            putExtra("hasActiveConnections", true)
        }
        reactContext.startService(serviceIntent)
    }
    
    /**
     * 绑定到蓝牙服务
     */
    private fun bindService() {
        try {
            val intent = Intent(reactContext, BluetoothService::class.java)
            reactContext.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
            Log.d(TAG, "服务绑定请求已发送")
        } catch (e: Exception) {
            Log.e(TAG, "绑定服务失败：${e.message}", e)
        }
    }
    
    /**
     * 解绑蓝牙服务
     */
    private fun unbindService() {
        if (isBound) {
            try {
                reactContext.unbindService(serviceConnection)
                isBound = false
                Log.d(TAG, "服务已解绑")
            } catch (e: Exception) {
                Log.e(TAG, "解绑服务失败：${e.message}", e)
            }
        }
    }
}