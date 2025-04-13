package com.musclemaster

import android.app.job.JobParameters
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * 计时器任务服务 - 由JobScheduler调度运行
 */
class TimerJobService : JobService() {
  private val TAG = "TimerJobService"

  override fun onStartJob(params: JobParameters?): Boolean {
    Log.d(TAG, "===== 计时器任务开始执行 =====")

    params?.let {
      val extras = it.extras
      if (extras != null) {
        val deviceId = extras.getString("deviceId", "")
        val currentValue = extras.getInt("currentValue", 0)
        val interval = extras.getInt("interval", 1000)

        Log.d(TAG, "任务参数: deviceId=$deviceId, currentValue=$currentValue, interval=$interval")

        if (deviceId.isNotEmpty() && currentValue > 0) {
          // 获取BluetoothService
          val intent = Intent(this, BluetoothService::class.java)
          startService(intent)

          // 使用applicationContext绑定服务，这样无论Activity状态如何都能工作
          val connection = object : android.content.ServiceConnection {
            override fun onServiceConnected(name: ComponentName?, service: android.os.IBinder?) {
              if (service is BluetoothService.LocalBinder) {
                val bluetoothService = service.getService()
                Log.d(TAG, "TimerJob 已连接到 com.musclemaster.BluetoothService")

                // 更新计时器值 (减1)
                val newValue = currentValue - 1
                Log.d(TAG, "### 后台计时器递减：设备 $deviceId 计时器由 $currentValue 减少到 $newValue ###")
                bluetoothService.processTimerTick(deviceId, newValue, interval)

                // 一旦处理完成，解绑服务
                applicationContext.unbindService(this)
              }
            }

            override fun onServiceDisconnected(name: ComponentName?) {
              Log.d(TAG, "TimerJob 与 com.musclemaster.BluetoothService 断开连接")
            }
          }

          applicationContext.bindService(
            Intent(this, BluetoothService::class.java),
            connection,
            Context.BIND_AUTO_CREATE
          )
        } else {
          Log.e(TAG, "无效的任务参数: deviceId=$deviceId, currentValue=$currentValue")
        }
      }
    }

    // 返回false表示任务已完成
    jobFinished(params, false)
    return false
  }

  override fun onStopJob(params: JobParameters?): Boolean {
    Log.d(TAG, "计时器任务被系统中断")
    // 返回true表示任务应该重新调度
    return true
  }
} 