import {NativeModules, Platform} from 'react-native';
const {BluetoothServiceModule} = NativeModules;
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
   * @param deviceId 设备 ID
   * @param timerValue 计时器初始值（秒）
   * @param interval 计时间隔（毫秒）
   */
  static async startBackgroundTimer(
    deviceId: string,
    timerValue: number,
    interval: number = 1000,
  ): Promise<boolean> {
    if (Platform.OS === 'android' && BluetoothServiceModule) {
      try {
        console.log(
          `启动设备 ${deviceId} 的后台计时器，初始值：${timerValue}秒，间隔：${interval}ms`,
        );

        // 验证参数
        if (!deviceId) {
          console.error('设备 ID 不能为空');
          return false;
        }

        if (typeof timerValue !== 'number' || timerValue <= 0) {
          console.error(`计时器值无效：${timerValue}`);
          return false;
        }

        // 调用原生模块启动计时器
        const result = await BluetoothServiceModule.startBackgroundTimer(
          deviceId,
          timerValue,
          interval,
        );

        // 验证计时器是否成功启动
        setTimeout(async () => {
          try {
            const currentValue =
              await BluetoothBackgroundService.getCurrentTimerValue(deviceId);
            console.log(
              `验证计时器启动：设备 ${deviceId} 当前值 = ${currentValue}`,
            );
          } catch (error) {
            console.error('验证计时器启动失败：', error);
          }
        }, 500);

        return result;
      } catch (error) {
        console.error(`启动后台计时器失败：${error}`);
        return false;
      }
    }
    return Promise.resolve(false);
  }

  /**
   * 停止后台计时器
   * @param deviceId 设备 ID
   */
  static async stopBackgroundTimer(deviceId: string): Promise<boolean> {
    if (Platform.OS === 'android' && BluetoothServiceModule) {
      if (typeof BluetoothServiceModule.stopBackgroundTimer === 'function') {
        try {
          console.log(`停止设备 ${deviceId} 的后台计时器`);
          return await BluetoothServiceModule.stopBackgroundTimer(deviceId);
        } catch (error) {
          console.error(`停止后台计时器失败：${error}`);
          return false;
        }
      }
    }
    return Promise.resolve(false);
  }

  /**
   * 同步计时器值到原生层
   * @param deviceId 设备 ID
   * @param timerValue 计时器值（秒）
   */
  static async syncTimerValue(
    deviceId: string,
    timerValue: number,
  ): Promise<boolean> {
    if (
      Platform.OS === 'android' &&
      BluetoothServiceModule &&
      typeof BluetoothServiceModule.syncTimerValue === 'function'
    ) {
      try {
        console.log(`同步设备 ${deviceId} 的计时器值到原生层：${timerValue}`);
        const result = await BluetoothServiceModule.syncTimerValue(
          deviceId,
          timerValue,
        );
        console.log(`同步计时器值成功：${result}`);
        return result;
      } catch (error) {
        console.error(`同步计时器值失败：${error}`);
        return false;
      }
    }
    return Promise.resolve(false);
  }

  /**
   * 获取当前原生层的计时器值
   * @param deviceId 设备 ID
   * @returns 计时器值（秒），如果获取失败则返回 0
   */
  static async getCurrentTimerValue(deviceId: string): Promise<number> {
    if (
      Platform.OS === 'android' &&
      BluetoothServiceModule &&
      typeof BluetoothServiceModule.getCurrentTimerValue === 'function'
    ) {
      try {
        const value = await BluetoothServiceModule.getCurrentTimerValue(
          deviceId,
        );
        console.log(`从原生层获取设备 ${deviceId} 的计时器值：${value}`);
        return typeof value === 'number' ? value : 0;
      } catch (error) {
        console.error(`获取原生计时器值失败：${error}`);
        return 0;
      }
    }
    return 0;
  }

  /**
   * 获取后台计时器是否正在运行
   * @param deviceId 设备 ID
   * @returns 如果计时器正在运行则为 true，否则为 false
   */
  static async isTimerRunning(deviceId: string): Promise<boolean> {
    try {
      const value = await BluetoothBackgroundService.getCurrentTimerValue(
        deviceId,
      );
      return value > 0;
    } catch (error) {
      console.error(`检查计时器状态失败：${error}`);
      return false;
    }
  }
}
