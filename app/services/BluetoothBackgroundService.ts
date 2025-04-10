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
}