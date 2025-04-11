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
    fun startService(hasActiveConnections: Boolean) {
        Log.d(TAG, "Starting BluetoothService with active connections: $hasActiveConnections")
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
}
