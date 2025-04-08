/**
 * 蓝牙通信协议
 * 基于蓝牙透传协议文档 v3
 */

// React Native 环境中需要专门引入Buffer库
import {Buffer} from 'buffer';

// 数据方向枚举
export enum DataDirection {
  // APP到设备
  APP_TO_DEVICE = 0x01,
  // 设备到APP
  DEVICE_TO_APP = 0x02,
}

// 设备型号枚举
export enum DeviceChannel {
  // 1路设备
  CHANEL_1 = 0x01,
  // 2路设备
  CHANEL_2 = 0x02,
  // 4路设备
  CHANEL_4 = 0x04,
}

// 命令类型枚举
export enum CommandType {
  // 设备控制命令
  POWER_ON = 0x01,
  POWER_OFF = 0x02,
  SET_INTENSITY = 0x05,
  GET_INTENSITY = 0x05,
  SET_MODE = 0x06,
  GET_MODE = 0x06,
  DEVICE_STATUS = 0x02,
  DEVICE_STATUS_START = 0x01,
  DEVICE_STATUS_STOP = 0x02,
  DEVICE_STATUS_CANCEL = 0x00,
  START_THERAPY = 0x02,
  STOP_THERAPY = 0x02,
  GET_BATTERY = 0x0A,
  GET_VERSION = 0x01,
  SET_WORK_TIME = 0x03,
  GET_WORK_TIME = 0x03,
  GET_DEVICE_INFO = 0x09,
  SET_CLIMBING_TIME = 0x04,
  SET_PEEK_TIME = 0x07,
  SET_STOP_TIME = 0x08,
  UNKNOWN = 0xff,
  // 可以根据协议文档添加更多命令...
}

export const CommandValue = {
  GET_VERSION: [0x00],
  SET_START: (channel: DeviceChannel) => {
    return [channel, 0x01];
  },
  SET_STOP: (channel: DeviceChannel) => {
    return [channel, 0x02];
  },
  SET_INTENSITY: (intensity: number) => {
    return [0x01, intensity];
  },
  SET_MODE: (mode: DeviceMode) => {
    return [mode];
  },
  SET_CLIMBING_TIME: (value:number) => {
    return [value];
  },
  SET_PEEK_TIME: (value:number) => {
    return [value];
  },
  SET_STOP_TIME: (value:number) => {
    return [value];
  },
  // 5A 01 01 03 03 01 00 05 68
  //BYTE5:参数长度3，BYTE6:要控制的通道01，BYTE7+8:组成16位（1-65536）表示开机时长（分钟），目前先设置1-99
  //BYTE9:校验和
  SET_WORK_TIME: (channel: DeviceChannel = 0x01, time: number) => {
    // 当前默认
    const highByte = (time >> 8) & 0xff;
    const lowByte = time & 0xff;
    return [channel, highByte, lowByte];
  },
  GET_DEVICE_INFO: () => {
    return [0x00];
  },

  // reply 剩余时间
  REPLY_WORK_TIME: (time: number) => {
    const highByte = (time >> 8) & 0xff;
    const lowByte = time & 0xff;
    return [CommandType.SET_WORK_TIME, highByte, lowByte];
  },
};

// 工作模式枚举
export enum DeviceMode {
  FITNESS = 0x01,
  WARM_UP = 0x02,
  CARDIO = 0x03,
  RELAX = 0x04,
  DERMAL = 0x05,
  DRAINAGE = 0x06,
  CELLULITE = 0x07,
  METABOLIC = 0x08,
  SLIM = 0x09,
  RESISTANCE = 0x0a,
  CONTRACTURES = 0x0b,
  CAPILLARY = 0x0c,
  VIP = 0x0d,
}

// 蓝牙UUID常量 - 使用标准格式
export const BLE_UUID = {
  // 服务UUID (16位UUID转128位)
  SERVICE: '0000FFE0-0000-1000-8000-00805F9B34FB',
  // 读特性UUID
  CHARACTERISTIC_READ: '0000FFE1-0000-1000-8000-00805F9B34FB',
  // 写特性UUID
  CHARACTERISTIC_WRITE: '0000FFE1-0000-1000-8000-00805F9B34FB', //0000FFE2-0000-1000-8000-00805F9B34FB
};

// 也提供简短形式，某些BLE库可能接受这种格式
export const BLE_UUID_SHORT = {
  SERVICE: 'FFE0',
  CHARACTERISTIC_READ: 'FFE1',
  CHARACTERISTIC_WRITE: 'FFE1', // FFE2
};

// 协议帧格式定义
const FRAME_HEADER = 0x5a; // 根据协议，包头固定为0x5A
const DEFAULT_CHANNEL = DeviceChannel.CHANEL_1; // 默认使用1路设备
const MIN_FRAME_LENGTH = 6; // 包头+数据方向+型号+命令+数据长度+校验和(最小6字节)

/**
 * 创建命令帧
 * @param command 命令类型
 * @param data 命令数据(可选)
 * @param channel 设备型号(默认1路)
 * @returns 命令字符串，可直接发送给BLEManager
 */
export function createCommand(
  command: CommandType,
  data: number[] = [],
  channel: DeviceChannel = DEFAULT_CHANNEL,
): string {
  try {
    // 创建包含包头、数据方向、型号、命令、数据长度的基础帧
    const frameBuffer = Buffer.alloc(5 + data.length + 1); // +1 for checksum

    // 包头
    frameBuffer[0] = FRAME_HEADER;
    // 数据方向(APP到设备)
    frameBuffer[1] = DataDirection.APP_TO_DEVICE;
    // 型号
    frameBuffer[2] = command === CommandType.GET_VERSION ? 0x00 : channel;
    // 命令
    frameBuffer[3] = command;
    // 数据长度
    frameBuffer[4] = data.length;

    // 添加数据
    for (let i = 0; i < data.length; i++) {
      frameBuffer[5 + i] = data[i];
    }

    // 计算校验和(所有字节的和的低8位)
    let checksum = 0;
    for (let i = 0; i < frameBuffer.length - 1; i++) {
      checksum += frameBuffer[i];
    }
    // 取低8位
    checksum = checksum & 0xff;

    // 添加校验和
    frameBuffer[frameBuffer.length - 1] = checksum;

    // 不需要转base64，直接返回Buffer
    console.log('Command created:', frameBuffer.toString('hex'));
    return frameBuffer.toString('base64');
  } catch (error) {
    console.error('Error creating command:', error);
    throw new Error('Failed to create command');
  }
}

/**
 * 创建命令帧 - 使用字节数组，不依赖Buffer
 * 适用于某些无法正确支持Buffer的环境
 * @param command 命令类型
 * @param data 命令数据(可选)
 * @param model 设备型号(默认1路)
 * @returns 命令字符串
 */
export function createCommandAlt(
  command: CommandType,
  data: number[] = [],
  model: DeviceChannel = DEFAULT_CHANNEL,
): string {
  try {
    // 创建包含包头、数据方向、型号、命令、数据长度的基础帧
    const frame = [
      FRAME_HEADER,
      DataDirection.APP_TO_DEVICE,
      model,
      command,
      data.length,
      ...data,
    ];

    // 计算校验和(所有字节的和的低8位)
    let checksum = 0;
    for (const byte of frame) {
      checksum += byte;
    }
    // 取低8位
    checksum = checksum & 0xff;

    // 添加校验和
    frame.push(checksum);

    // 转换为Uint8Array
    const frameUint8 = new Uint8Array(frame);

    // 使用base64编码
    const binary = String.fromCharCode.apply(null, Array.from(frameUint8));
    return btoa(binary);
  } catch (error) {
    console.error('Error creating command (alternative method):', error);
    throw new Error('Failed to create command with alternative method');
  }
}

/**
 * 解析设备响应
 * @param responseBase64 设备返回的base64编码响应
 * @returns 解析后的对象，包含命令类型和数据
 */
export function parseResponse(responseBase64: string): {
  dataDirection: DataDirection;
  model: DeviceChannel;
  command: CommandType;
  data: number[];
  isValid: boolean;
} {
  try {
    // 将base64解码为Buffer
    const responseBuffer = Buffer.from(responseBase64, 'base64');

    console.log('Response buffer:', responseBuffer);
    // 检查最小长度
    if (responseBuffer.length < MIN_FRAME_LENGTH) {
      console.warn('Response too short:', responseBuffer.length);
      return {
        dataDirection: DataDirection.DEVICE_TO_APP,
        model: DEFAULT_CHANNEL,
        command: CommandType.UNKNOWN,
        data: [],
        isValid: false,
      };
    }

    // 检查包头
    if (responseBuffer[0] !== FRAME_HEADER) {
      console.warn('Invalid frame header:', responseBuffer[0]);
      return {
        dataDirection: DataDirection.DEVICE_TO_APP,
        model: DEFAULT_CHANNEL,
        command: CommandType.UNKNOWN,
        data: [],
        isValid: false,
      };
    }

    // 提取数据方向
    const dataDirection = responseBuffer[1] as DataDirection;

    // 提取型号
    const model = responseBuffer[2] as DeviceChannel;

    // 提取命令
    const command = responseBuffer[3] as CommandType;

    // 提取数据长度
    const dataLength = responseBuffer[4];

    // 检查帧长度是否符合预期
    if (responseBuffer.length !== 5 + dataLength + 1) {
      console.warn(
        'Invalid frame length. Expected:',
        5 + dataLength + 1,
        'Got:',
        responseBuffer.length,
      );
      return {
        dataDirection,
        model,
        command: CommandType.UNKNOWN,
        data: [],
        isValid: false,
      };
    }

    // 提取数据
    const data: number[] = [];
    for (let i = 0; i < dataLength; i++) {
      data.push(responseBuffer[5 + i]);
    }

    // 校验和验证(所有字节的和的低8位)
    let checksum = 0;
    for (let i = 0; i < responseBuffer.length - 1; i++) {
      checksum += responseBuffer[i];
    }
    // 取低8位
    checksum = checksum & 0xff;

    const isValid = checksum === responseBuffer[responseBuffer.length - 1];
    if (!isValid) {
      console.warn(
        'Checksum validation failed. Expected:',
        responseBuffer[responseBuffer.length - 1],
        'Calculated:',
        checksum,
      );
    }

    return {dataDirection, model, command, data, isValid};
  } catch (error) {
    console.error('Error parsing response:', error);
    return {
      dataDirection: DataDirection.DEVICE_TO_APP,
      model: DEFAULT_CHANNEL,
      command: CommandType.UNKNOWN,
      data: [],
      isValid: false,
    };
  }
}

// 命令构建辅助函数
export const BLECommands = {
  /**
   * 设置强度等级
   * @param level 强度等级(例如1-100)
   * @param channel
   */
  setIntensity(
    level: number,
    channel: DeviceChannel = DEFAULT_CHANNEL,
  ): string {
    return createCommand(CommandType.SET_INTENSITY, [channel, level], channel);
  },

  /**
   * 获取当前强度等级
   */
  getIntensity(model: DeviceChannel = DEFAULT_CHANNEL): string {
    return createCommand(CommandType.GET_INTENSITY, [], model);
  },

  /**
   * 设置工作模式
   * @param mode 工作模式
   */
  setMode(mode: DeviceMode, channel: DeviceChannel = DEFAULT_CHANNEL): string {
    return createCommand(
      CommandType.SET_MODE,
      CommandValue.SET_MODE(mode),
      channel,
    );
  },

  /**
   * 获取当前工作模式
   */
  getMode(model: DeviceChannel = DEFAULT_CHANNEL): string {
    return createCommand(CommandType.GET_MODE, [], model);
  },

  /**
   * 开始治疗/按摩
   * @param channel
   */
  startTherapy(channel: DeviceChannel = DEFAULT_CHANNEL): string {
    // 持续时间需要两个字节(高字节在前)
    return createCommand(
      CommandType.START_THERAPY,
      CommandValue.SET_START(channel),
      channel,
    );
  },

  /**
   * 停止治疗/按摩
   */
  stopTherapy(channel: DeviceChannel = DEFAULT_CHANNEL): string {
    return createCommand(
      CommandType.STOP_THERAPY,
      CommandValue.SET_STOP(channel),
      channel,
    );
  },

  /**
   * 获取电池电量
   */
  getBattery(channel: DeviceChannel = DEFAULT_CHANNEL, value: number): string {
    return createCommand(CommandType.GET_BATTERY, [value], channel);
  },

  /**
   * 获取设备版本
   */
  getVersion(channel: DeviceChannel = DEFAULT_CHANNEL): string {
    return createCommand(
      CommandType.GET_VERSION,
      CommandValue.GET_VERSION,
      channel,
    );
  },

  // 设置工作时间
  setWorkTime(time: number, channel: DeviceChannel = DEFAULT_CHANNEL) {
    return createCommand(
      CommandType.SET_WORK_TIME,
      CommandValue.SET_WORK_TIME(channel, time),
      channel,
    );
  },

  // 获取设备信息
  getDeviceInfo(chanel: DeviceChannel = DEFAULT_CHANNEL) {
    //5A 01 01 09 01 00 66
    return createCommand(
      CommandType.GET_DEVICE_INFO,
      CommandValue.GET_DEVICE_INFO(),
      chanel,
    );
  },

  // 回复强度
  replyIntensity(level: number, channel: DeviceChannel = DEFAULT_CHANNEL) {
    return createCommand(
      CommandType.GET_DEVICE_INFO,
      [CommandType.GET_INTENSITY, channel, level],
      channel,
    );
  },

  // 回复模式
  replyMode(mode: DeviceMode, channel: DeviceChannel = DEFAULT_CHANNEL) {
    return createCommand(
      CommandType.GET_DEVICE_INFO,
      [CommandType.GET_MODE, mode],
      channel,
    );
  },

  // 回复剩余时间 5A 02 01 09 03 03 00 14 80
  replyWorkTime(duration: number, channel: DeviceChannel = DEFAULT_CHANNEL) {
    return createCommand(
      CommandType.GET_DEVICE_INFO,
      CommandValue.REPLY_WORK_TIME(duration),
      channel,
    );
  },

  // 回复设备活动状态
  replyDeviceStatus(status: number, channel: DeviceChannel = DEFAULT_CHANNEL) {
    return createCommand(
      CommandType.GET_DEVICE_INFO,
      [CommandType.DEVICE_STATUS, channel, status],
      channel,
    );
  },

  // 回复电量信息
  replyBattery(value: number, channel: DeviceChannel = DEFAULT_CHANNEL) {
    return createCommand(
      CommandType.GET_BATTERY,
      [value],
      channel,
    );
  },

  // 设置爬坡时间
  setClimbingTime(value: number, channel: DeviceChannel = DEFAULT_CHANNEL) {
    return createCommand(
      CommandType.SET_CLIMBING_TIME,
      CommandValue.SET_CLIMBING_TIME(value),
      channel,
    );
  },
  // 回复峰值时间
  
  // 设置峰值时间
  setPeakTime(value: number, channel: DeviceChannel = DEFAULT_CHANNEL) {
    return createCommand(
      CommandType.SET_PEEK_TIME,
      CommandValue.SET_PEEK_TIME(value),
      channel,
    );
  },
  // 设置停止时间
  setStopTime(value: number, channel: DeviceChannel = DEFAULT_CHANNEL) {
    return createCommand(
      CommandType.SET_STOP_TIME,
      CommandValue.SET_STOP_TIME(value),
      channel,
    );
  },
};

/**
 * 使用示例：
 *
 * import { BLECommands, BLE_UUID, DeviceModel } from '../services/protocol';
 *
 * // 读取设备数据
 * const response = await BLEManager.readCharacteristic(
 *   deviceId,
 *   BLE_UUID.SERVICE,
 *   BLE_UUID.CHARACTERISTIC_READ
 * );
 *
 * // 写入命令到设备(使用默认1路设备)
 * await BLEManager.writeCharacteristic(
 *   deviceId,
 *   BLE_UUID.SERVICE,
 *   BLE_UUID.CHARACTERISTIC_WRITE,
 *   BLECommands.setIntensity(8)
 * );
 *
 * // 写入命令到2路设备
 * await BLEManager.writeCharacteristic(
 *   deviceId,
 *   BLE_UUID.SERVICE,
 *   BLE_UUID.CHARACTERISTIC_WRITE,
 *   BLECommands.setIntensity(8, DeviceModel.MODEL_2)
 * );
 *
 * // 发送关机命令(需要发送两次)
 * async function shutdownDevice(deviceId) {
 *   // 第一次发送
 *   await BLEManager.writeCharacteristic(
 *     deviceId,
 *     BLE_UUID.SERVICE,
 *     BLE_UUID.CHARACTERISTIC_WRITE,
 *     BLECommands.powerOff()
 *   );
 *
 *   // 等待100ms
 *   await new Promise(resolve => setTimeout(resolve, 100));
 *
 *   // 第二次发送
 *   await BLEManager.writeCharacteristic(
 *     deviceId,
 *     BLE_UUID.SERVICE,
 *     BLE_UUID.CHARACTERISTIC_WRITE,
 *     BLECommands.powerOff()
 *   );
 * }
 */
