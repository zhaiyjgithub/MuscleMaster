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
  static startService(hasActiveConnections: boolean = true): Promise<boolean> {
    if (Platform.OS === 'android' && BluetoothServiceModule) {
      return BluetoothServiceModule.startService(hasActiveConnections);
    }
    return Promise.resolve(false);
  }

  /**
   * 停止蓝牙后台服务
   */
  static stopService(): Promise<boolean> {
    if (Platform.OS === 'android' && BluetoothServiceModule) {
      if (typeof BluetoothServiceModule.stopService === 'function') {
        return BluetoothServiceModule.stopService();
      }
    }
    return Promise.resolve(false);
  }

  /**
   * 更新连接状态
   * @param hasConnections 是否有活跃的蓝牙连接
   */
  static updateConnectionState(hasConnections: boolean): Promise<boolean> {
    if (Platform.OS === 'android' && BluetoothServiceModule) {
      if (typeof BluetoothServiceModule.updateConnectionState === 'function') {
        return BluetoothServiceModule.updateConnectionState(hasConnections);
      }
    }
    return Promise.resolve(false);
  }

  /**
   * 启动后台计时器
   * @param deviceId 设备ID
   * @param interval 计时间隔（毫秒）
   */
  static startBackgroundTimer(deviceId: string, interval: number = 1000): Promise<boolean> {
    if (Platform.OS === 'android' && BluetoothServiceModule) {
      // 首先同步最新的计时器值
      console.log(`启动设备 ${deviceId} 的后台计时器`);
      return BluetoothServiceModule.startBackgroundTimer(deviceId, interval);
    }
    return Promise.resolve(false);
  }

  /**
   * 停止后台计时器
   * @param deviceId 设备ID
   */
  static stopBackgroundTimer(deviceId: string): Promise<boolean> {
    if (Platform.OS === 'android' && BluetoothServiceModule) {
      if (typeof BluetoothServiceModule.stopBackgroundTimer === 'function') {
        return BluetoothServiceModule.stopBackgroundTimer(deviceId);
      }
    }
    return Promise.resolve(false);
  }

  /**
   * 同步计时器值到原生层
   * @param deviceId 设备ID
   * @param timerValue 计时器值（秒）
   */
  static syncTimerValue(deviceId: string, timerValue: number): Promise<boolean> {
    if (Platform.OS === 'android' && BluetoothServiceModule && 
        typeof BluetoothServiceModule.syncTimerValue === 'function') {
      return BluetoothServiceModule.syncTimerValue(deviceId, timerValue);
    }
    return Promise.resolve(false);
  }

  /**
   * 获取当前原生层的计时器值
   * @param deviceId 设备ID
   * @returns 计时器值（秒），如果获取失败则返回0
   */
  static async getCurrentTimerValue(deviceId: string): Promise<number> {
    if (Platform.OS === 'android' && BluetoothServiceModule && 
        typeof BluetoothServiceModule.getCurrentTimerValue === 'function') {
      try {
        const value = await BluetoothServiceModule.getCurrentTimerValue(deviceId);
        console.log(`原生层返回设备 ${deviceId} 的计时器值: ${value}`);
        return typeof value === 'number' ? value : 0;
      } catch (error) {
        console.error('获取原生计时器值时出错:', error);
        return 0;
      }
    }
    return 0;
  }
}
