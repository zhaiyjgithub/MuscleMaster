import BackgroundService from 'react-native-background-actions';
import {AppState, Platform} from 'react-native';

// 检查后台服务是否可用
const isBackgroundServiceAvailable = () => {
  return (
    Platform.OS === 'android' &&
      BackgroundService &&
      typeof BackgroundService.start === 'function'
  );
};

// 记录服务可用性
console.log(`后台服务可用: ${isBackgroundServiceAvailable()}`);

// 用于存储计时器信息的全局变量
let timers: Record<
  string,
  {
    value: number;
    startTime: number;
    isRunning: boolean;
  }
> = {};

// 后台任务配置
const options = {
  taskName: 'MuscleMaster Timer',
  taskTitle: 'Timer Running',
  taskDesc: 'Keeping your therapy timers running',
  taskIcon: {
    name: 'ic_launcher',
    type: 'mipmap',
  },
  color: '#ff0000',
  linkingURI: 'musclemaster://timer', // 可选：点击通知时打开的深度链接
  parameters: {
    delay: 1000,
  },
};

// 后台任务执行的函数
const backgroundTask = async (taskData: any) => {
  const { delay } = taskData;

  // 避免被系统终止
  await new Promise(async (resolve) => {
    const updateTimer = () => {
      const now = Date.now();

      // 更新所有正在运行的计时器
      Object.keys(timers).forEach(deviceId => {
        const timer = timers[deviceId];
        if (timer.isRunning && timer.value > 0) {
          // 计算已经过的时间（秒）
          const elapsedSeconds = Math.floor((now - timer.startTime) / 1000);
          const newValue = Math.max(0, timer.value - elapsedSeconds);

          // 只有当计时器值实际变化时才更新
          if (newValue !== timer.value) {
            console.log(`后台更新设备 ${deviceId} 计时器: ${timer.value} -> ${newValue}`);
            timer.value = newValue;

            // 如果计时完成，停止该计时器
            if (newValue === 0) {
              timer.isRunning = false;
              console.log(`设备 ${deviceId} 的计时器在后台完成`);
            }
          }
        }
      });
    };

    // 设置定期更新
    const intervalId = setInterval(updateTimer, delay);

    // 提供清理函数给BackgroundService
    return () => {
      console.log('后台服务停止');
      clearInterval(intervalId);
      resolve(undefined);
    };
  });
};

class BackgroundTimerService {
  /**
   * 启动后台服务
   */
  static async startBackgroundService() {
    if (BackgroundService.isRunning()) {
      console.log('后台服务已在运行中');
      return true;
    }

    try {
      await BackgroundService.start(backgroundTask, options);
      console.log('后台服务启动成功');
      return true;
    } catch (error) {
      console.error('启动后台服务失败:', error);
      return false;
    }
  }

  /**
   * 停止后台服务
   */
  static async stopBackgroundService() {
    try {
      // 先检查服务是否正在运行
      const isRunning = await this.isRunning();
      if (!isRunning) {
        console.log('后台服务未运行，无需停止');
        return true;
      }

      // 确保 BackgroundService 对象可用
      if (BackgroundService && typeof BackgroundService.stop === 'function') {
        await BackgroundService.stop();
        console.log('后台服务已停止');
        return true;
      } else {
        console.warn('BackgroundService 对象不可用，无法停止服务');
        return false;
      }
    } catch (error) {
      console.error('停止后台服务失败:', error);
      return false;
    }
  }

  /**
   * 添加或更新计时器
   * @param deviceId 设备ID
   * @param seconds 计时器秒数
   * @param isRunning 是否正在运行
   */
  static updateTimer(deviceId: string, seconds: number, isRunning: boolean) {
    timers[deviceId] = {
      value: seconds,
      startTime: Date.now(), // 记录开始时间点
      isRunning,
    };
    console.log(
      `更新后台计时器: 设备=${deviceId}, 值=${seconds}, 状态=${isRunning}`,
    );
  }

  /**
   * 获取特定设备的计时器当前值
   * @param deviceId 设备ID
   */
  static getTimerValue(deviceId: string): number {
    const timer = timers[deviceId];
    if (!timer) {
      return 0;
    }

    if (timer.isRunning) {
      // 如果计时器在运行，计算当前值
      const elapsedSeconds = Math.floor((Date.now() - timer.startTime) / 1000);
      return Math.max(0, timer.value - elapsedSeconds);
    }

    return timer.value;
  }

  /**
   * 获取所有计时器的当前状态
   */
  static getAllTimers() {
    const result: Record<string, {value: number; isRunning: boolean}> = {};

    Object.keys(timers).forEach(deviceId => {
      const value = this.getTimerValue(deviceId);
      result[deviceId] = {
        value,
        isRunning: timers[deviceId].isRunning && value > 0,
      };
    });

    return result;
  }

  /**
   * 停止特定设备的计时器
   * @param deviceId 设备ID
   */
  static stopTimer(deviceId: string) {
    if (timers[deviceId]) {
      timers[deviceId].isRunning = false;
      console.log(`停止设备 ${deviceId} 的后台计时器`);
    }
  }

  /**
   * 检查后台服务是否正在运行
   */
  static async isRunning() {
    try {
      if (BackgroundService && typeof BackgroundService.isRunning === 'function') {
        return await BackgroundService.isRunning();
      }
      return false;
    } catch (error) {
      console.error('检查服务运行状态失败:', error);
      return false;
    }
  }
}

export default BackgroundTimerService;
