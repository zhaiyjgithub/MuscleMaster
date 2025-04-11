import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.bridge.ReactMethod
import android.content.ServiceConnection
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import com.facebook.react.bridge.Promise

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
            Log.d(TAG, "Starting BluetoothService with hasActiveConnections: $hasActiveConnections")
            ensureServiceRunning()
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start service: ${e.message}")
            promise.reject("ERROR", "Failed to start service: ${e.message}")
        }
    }

    @ReactMethod
    fun startBackgroundTimer(deviceId: String, interval: Int = 1000) {
        Log.d(TAG, "开始后台计时器 deviceId=$deviceId, interval=$interval")
        // 确保服务已经启动和绑定
        ensureServiceRunning(true)

        // 委托服务启动计时器
        bluetoothService?.startTimer(deviceId, interval)
    }

    @ReactMethod
    fun stopBackgroundTimer(deviceId: String, promise: Promise) {
        Log.d(TAG, "停止后台计时器 deviceId=$deviceId")
        try {
            bluetoothService?.stopTimer(deviceId)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to stop timer: ${e.message}")
        }
    }
    
    @ReactMethod
    fun syncTimerValue(deviceId: String, timerValue: Int, promise: Promise) {
        Log.d(TAG, "同步计时器值 deviceId=$deviceId, value=$timerValue")
        try {
            bluetoothService?.syncTimerValue(deviceId, timerValue)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to sync timer value: ${e.message}")
        }
    }
    
    @ReactMethod
    fun getCurrentTimerValue(deviceId: String, promise: Promise) {
        try {
            val value = bluetoothService?.getCurrentTimerValue(deviceId) ?: 0
            Log.d(TAG, "获取设备 $deviceId 的计时器值：$value")
            promise.resolve(value)
        } catch (e: Exception) {
            Log.e(TAG, "获取计时器值失败：${e.message}")
            promise.reject("ERROR", "Failed to get timer value: ${e.message}")
        }
    }
    
    @ReactMethod
    fun updateConnectionState(hasConnections: Boolean, promise: Promise) {
        try {
            Log.d(TAG, "Updating connection state: hasConnections=$hasConnections")
            // Forward to service if bound
            bluetoothService?.updateConnectionState(hasConnections)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update connection state: ${e.message}")
            promise.reject("ERROR", "Failed to update connection state: ${e.message}")
        }
    }

    /**
     * 确保服务正在运行
     */
    private fun ensureServiceRunning(startTimer: Boolean = false, deviceId: String? = null, interval: Int = 1000) {
        if (!isBound) {
            bindService()
            
            // 给一点时间让服务连接
            Thread.sleep(100)
        }
        
        // 启动服务
        val serviceIntent = Intent(reactContext, BluetoothService::class.java).apply {
            putExtra("hasActiveConnections", true)
            putExtra("startTimer", startTimer)
            if (deviceId != null) {
                putExtra("deviceId", deviceId)
                putExtra("interval", interval)
            }
        }
        reactContext.startService(serviceIntent)
    }
    
    /**
     * 绑定到蓝牙服务
     */
    private fun bindService() {
        val intent = Intent(reactContext, BluetoothService::class.java)
        reactContext.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
    }
    
    /**
     * 解绑蓝牙服务
     */
    private fun unbindService() {
        if (isBound) {
            reactContext.unbindService(serviceConnection)
            isBound = false
        }
    }
}