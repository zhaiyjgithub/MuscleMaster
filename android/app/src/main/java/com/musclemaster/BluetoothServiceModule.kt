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
    fun startBackgroundTimer(deviceId: String, interval: Int = 1000) {
        Log.d(TAG, "开始后台计时器 deviceId=$deviceId, interval=$interval")
        // 确保服务已经启动和绑定
        ensureServiceRunning(true)
        
        // 如果服务已绑定，直接调用
        if (isBound && bluetoothService != null) {
            Log.d(TAG, "服务已绑定，直接启动计时器")
            // 首先同步最新计时器值
            val currentValue = getCurrentTimerValue(deviceId)
            if (currentValue > 0) {
                Log.d(TAG, "使用当前值启动计时器：$currentValue")
                bluetoothService?.startTimer(deviceId, interval)
            } else {
                Log.d(TAG, "计时器值为 0，不启动计时器")
            }
        } else {
            Log.d(TAG, "服务未绑定，使用 Intent 启动计时器")
            // 通过 Intent 启动服务，这将在服务启动后自动启动计时器
            val intent = Intent(reactContext, BluetoothService::class.java).apply {
                putExtra("hasActiveConnections", true)
                putExtra("startTimer", true)
                putExtra("deviceId", deviceId)
                putExtra("interval", interval)
            }
            
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                Log.d(TAG, "使用 startForegroundService 启动")
                reactContext.startForegroundService(intent)
            } else {
                Log.d(TAG, "使用 startService 启动")
                reactContext.startService(intent)
            }
            
            // 启动后尝试绑定
            bindService()
        }
    }
    
    /**
     * 确保服务正在运行
     */
    private fun ensureServiceRunning(hasActiveConnections: Boolean) {
        // 先尝试绑定服务
        bindService()
        
        // 然后启动前台服务
        val intent = Intent(reactContext, BluetoothService::class.java).apply {
            putExtra("hasActiveConnections", hasActiveConnections)
        }
        
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            Log.d(TAG, "使用 startForegroundService 启动服务")
            reactContext.startForegroundService(intent)
        } else {
            Log.d(TAG, "使用 startService 启动服务")
            reactContext.startService(intent)
        }
    }

    @ReactMethod
    fun stopBackgroundTimer(deviceId: String) {
        Log.d(TAG, "停止后台计时器 deviceId=$deviceId")
        bluetoothService?.stopTimer(deviceId)
    }

    @ReactMethod
    fun startService(hasActiveConnections: Boolean) {
        Log.d(TAG, "启动服务 hasActiveConnections=$hasActiveConnections")
        ensureServiceRunning(hasActiveConnections)
    }
    
    @ReactMethod
    fun stopService() {
        Log.d(TAG, "停止服务")
        unbindService()
        reactContext.stopService(Intent(reactContext, BluetoothService::class.java))
    }

    @ReactMethod
    fun updateConnectionState(hasConnections: Boolean) {
        Log.d(TAG, "更新连接状态 hasConnections=$hasConnections")
        bluetoothService?.updateConnectionState(hasConnections)
    }

    /**
     * 同步 JavaScript 的计时器值到原生层
     * @param deviceId 设备 ID
     * @param timerValue 计时器值（秒）
     */
    @ReactMethod
    fun syncTimerValue(deviceId: String, timerValue: Int) {
        Log.d(TAG, "同步计时器值 deviceId=$deviceId, value=$timerValue")
        bluetoothService?.syncTimerValue(deviceId, timerValue)
    }
    
    /**
     * 获取设备当前计时器值
     * @param deviceId 设备 ID
     * @return 计时器值（秒），如果不存在则返回 0
     */
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getCurrentTimerValue(deviceId: String): Int {
        val value = bluetoothService?.getCurrentTimerValue(deviceId) ?: 0
        Log.d(TAG, "获取计时器值 deviceId=$deviceId, value=$value")
        return value
    }

    private fun bindService() {
        if (!isBound) {
            val intent = Intent(reactContext, BluetoothService::class.java)
            reactContext.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
            Log.d(TAG, "绑定服务")
        } else {
            Log.d(TAG, "服务已绑定，无需重复绑定")
        }
    }

    private fun unbindService() {
        if (isBound) {
            reactContext.unbindService(serviceConnection)
            isBound = false
            Log.d(TAG, "解绑服务")
        } else {
            Log.d(TAG, "服务未绑定，无需解绑")
        }
    }
}
