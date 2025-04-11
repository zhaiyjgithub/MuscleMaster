import { NativeModules, Platform } from 'react-native';

const { BluetoothServiceModule } = NativeModules;

/**
 * 蓝牙后台服务控制器
 * 仅在Android上有效，iOS通过Info.plist的UIBackgroundModes配置自动处理
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

    /**
   * 启动后台计时器
   * @param deviceId 设备ID
   * @param interval 计时间隔（毫秒）
   */
  static startBackgroundTimer(deviceId: string, interval: number = 1000): void {
    if (Platform.OS === 'android' && BluetoothServiceModule) {
      BluetoothServiceModule.startBackgroundTimer(deviceId, interval);
    }
  }

  /**
   * 停止后台计时器
   * @param deviceId 设备ID
   */
  static stopBackgroundTimer(deviceId: string): void {
    if (Platform.OS === 'android' && BluetoothServiceModule) {
      BluetoothServiceModule.stopBackgroundTimer(deviceId);
    }
  }

  /**
   * 同步计时器值到原生层
   * @param deviceId 设备ID
   * @param timerValue 计时器值（秒）
   */
  static syncTimerValue(deviceId: string, timerValue: number): void {
    if (Platform.OS === 'android' && BluetoothServiceModule && 
        typeof BluetoothServiceModule.syncTimerValue === 'function') {
      BluetoothServiceModule.syncTimerValue(deviceId, timerValue);
    } else {
      console.log('原生层不支持syncTimerValue方法');
    }
  }

  /**
   * 获取当前原生层的计时器值
   * @param deviceId 设备ID
   * @returns 计时器值（秒），如果获取失败则返回0
   */
  static getCurrentTimerValue(deviceId: string): number {
    if (Platform.OS === 'android' && BluetoothServiceModule && 
        typeof BluetoothServiceModule.getCurrentTimerValue === 'function') {
      try {
        return BluetoothServiceModule.getCurrentTimerValue(deviceId) || 0;
      } catch (error) {
        console.error('获取原生计时器值时出错:', error);
        return 0;
      }
    }
    return 0;
  }
}