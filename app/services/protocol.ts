/**
 * 蓝牙通信协议
 * 基于蓝牙透传协议文档
 */

// React Native 环境中需要专门引入Buffer库
import { Buffer } from 'buffer';

// 蓝牙UUID常量 - 使用标准格式
export const BLE_UUID = {
    // 服务UUID (16位UUID转128位)
    SERVICE: '0000FFE0-0000-1000-8000-00805F9B34FB',
    // 读特性UUID
    CHARACTERISTIC_READ: '0000FFE1-0000-1000-8000-00805F9B34FB',
    // 写特性UUID
    CHARACTERISTIC_WRITE: '0000FFE2-0000-1000-8000-00805F9B34FB'
};

// 也提供简短形式，某些BLE库可能接受这种格式
export const BLE_UUID_SHORT = {
    SERVICE: 'FFE0',
    CHARACTERISTIC_READ: 'FFE1',
    CHARACTERISTIC_WRITE: 'FFE2'
};

// 命令类型枚举
export enum CommandType {
    // 设备控制命令
    POWER_ON = 0x01,
    POWER_OFF = 0x02,
    SET_INTENSITY = 0x03,
    GET_INTENSITY = 0x04,
    SET_MODE = 0x05,
    GET_MODE = 0x06,
    START_THERAPY = 0x07,
    STOP_THERAPY = 0x08,
    GET_BATTERY = 0x09,
    GET_VERSION = 0x0A,
    UNKNOWN,
    // 可以根据协议文档添加更多命令...
}

// 工作模式枚举
/*
    const modes: ModeItem[] = [
        { id: 0x01, name: 'Fitness', icon: <Dumbbell size={24} color="#1e88e5" /> },
        { id: 0x02, name: 'Warm up', icon: <Flame size={24} color="#1e88e5" /> },
        { id: 0x03, name: 'Cardio', icon: <Heart size={24} color="#1e88e5" /> },
        { id: 0x04, name: 'Relax', icon: <Smile size={24} color="#1e88e5" /> },
        { id: 0x05, name: 'Dermal', icon: <User size={24} color="#1e88e5" /> },
        { id: 0x06, name: 'Drainage', icon: <Droplet size={24} color="#1e88e5" /> },
        { id: 0x07, name: 'Cellulite', icon: <Scan size={24} color="#1e88e5" /> },
        { id: 0x08, name: 'Metabolic', icon: <Activity size={24} color="#1e88e5" /> },
        { id: 0x09, name: 'Slim', icon: <Scissors size={24} color="#1e88e5" /> },
        { id: 0x0A, name: 'Resistance', icon: <Shield size={24} color="#1e88e5" /> },
        { id: 0x0B, name: 'Contractures', icon: <Zap size={24} color="#1e88e5" /> },
        { id: 0x0C, name: 'Capillary', icon: <Activity size={24} color="#1e88e5" /> },
        { id: 0x0D, name: 'Vip', icon: <Crown size={24} color="#1e88e5" /> },
    ];
*/
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
   RESISTANCE = 0x0A,
   CONTRACTURES = 0x0B,
   CAPILLARY = 0x0C,
   VIP = 0x0D,
}

// 协议帧格式定义
const FRAME_HEADER = 0xAA;
const MIN_FRAME_LENGTH = 4; // 帧头+命令+数据长度+校验和

/**
 * 创建命令帧
 * @param command 命令类型
 * @param data 命令数据(可选)
 * @returns 经过base64编码的命令字符串，可直接发送给BLEManager
 */
export function createCommand(command: CommandType, data: number[] = []): string {
    try {
        // 创建包含帧头、命令、数据长度的基础帧
        const frameBuffer = Buffer.alloc(3 + data.length + 1); // +1 for checksum

        // 帧头
        frameBuffer[0] = FRAME_HEADER;
        // 命令
        frameBuffer[1] = command;
        // 数据长度
        frameBuffer[2] = data.length;

        // 添加数据
        for (let i = 0; i < data.length; i++) {
            frameBuffer[3 + i] = data[i];
        }

        // 计算校验和(所有字节的异或值)
        let checksum = 0;
        for (let i = 0; i < frameBuffer.length - 1; i++) {
            checksum ^= frameBuffer[i];
        }

        // 添加校验和
        frameBuffer[frameBuffer.length - 1] = checksum;

        // 返回base64编码的命令
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
 * @returns base64编码的命令字符串
 */
export function createCommandAlt(command: CommandType, data: number[] = []): string {
    try {
        // 创建包含帧头、命令、数据长度的基础帧
        const frame = [FRAME_HEADER, command, data.length, ...data];

        // 计算校验和(所有字节的异或值)
        let checksum = 0;
        for (const byte of frame) {
            checksum ^= byte;
        }

        // 添加校验和
        frame.push(checksum);

        // 转换为Uint8Array
        const frameUint8 = new Uint8Array(frame);

        // 使用base64-js或类似库进行编码
        // 这里使用的是内置的btoa函数，在实际环境中可能需要替换
        const binary = String.fromCharCode.apply(null, [...frameUint8]);
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
export function parseResponse(responseBase64: string): { command: CommandType, data: number[], isValid: boolean } {
    try {
        // 将base64解码为Buffer
        const responseBuffer = Buffer.from(responseBase64, 'base64');

        // 检查最小长度
        if (responseBuffer.length < MIN_FRAME_LENGTH) {
            console.warn('Response too short:', responseBuffer.length);
            return { command: CommandType.UNKNOWN, data: [], isValid: false };
        }

        // 检查帧头
        if (responseBuffer[0] !== FRAME_HEADER) {
            console.warn('Invalid frame header:', responseBuffer[0]);
            return { command: CommandType.UNKNOWN, data: [], isValid: false };
        }

        // 提取命令
        const command = responseBuffer[1] as CommandType;

        // 提取数据长度
        const dataLength = responseBuffer[2];

        // 检查帧长度是否符合预期
        if (responseBuffer.length !== 3 + dataLength + 1) {
            console.warn('Invalid frame length. Expected:', 3 + dataLength + 1, 'Got:', responseBuffer.length);
            return { command: CommandType.UNKNOWN, data: [], isValid: false };
        }

        // 提取数据
        const data: number[] = [];
        for (let i = 0; i < dataLength; i++) {
            data.push(responseBuffer[3 + i]);
        }

        // 校验和验证
        let checksum = 0;
        for (let i = 0; i < responseBuffer.length - 1; i++) {
            checksum ^= responseBuffer[i];
        }

        const isValid = checksum === responseBuffer[responseBuffer.length - 1];
        if (!isValid) {
            console.warn('Checksum validation failed. Expected:', responseBuffer[responseBuffer.length - 1], 'Calculated:', checksum);
        }

        return { command, data, isValid };
    } catch (error) {
        console.error('Error parsing response:', error);
        return { command: CommandType.UNKNOWN, data: [], isValid: false };
    }
}

// 命令构建辅助函数
export const Commands = {
    /**
     * 打开设备电源
     */
    powerOn(): string {
        return createCommand(CommandType.POWER_ON);
    },

    /**
     * 关闭设备电源
     */
    powerOff(): string {
        return createCommand(CommandType.POWER_OFF);
    },

    /**
     * 设置强度等级
     * @param level 强度等级(例如1-10)
     */
    setIntensity(level: number): string {
        return createCommand(CommandType.SET_INTENSITY, [level]);
    },

    /**
     * 获取当前强度等级
     */
    getIntensity(): string {
        return createCommand(CommandType.GET_INTENSITY);
    },

    /**
     * 设置工作模式
     * @param mode 工作模式
     */
    setMode(mode: DeviceMode): string {
        return createCommand(CommandType.SET_MODE, [mode]);
    },

    /**
     * 获取当前工作模式
     */
    getMode(): string {
        return createCommand(CommandType.GET_MODE);
    },

    /**
     * 开始治疗/按摩
     * @param duration 持续时间(秒)
     */
    startTherapy(duration: number = 0): string {
        // 假设持续时间需要两个字节(高字节在前)
        const highByte = (duration >> 8) & 0xFF;
        const lowByte = duration & 0xFF;
        return createCommand(CommandType.START_THERAPY, [highByte, lowByte]);
    },

    /**
     * 停止治疗/按摩
     */
    stopTherapy(): string {
        return createCommand(CommandType.STOP_THERAPY);
    },

    /**
     * 获取电池电量
     */
    getBattery(): string {
        return createCommand(CommandType.GET_BATTERY);
    },

    /**
     * 获取设备版本
     */
    getVersion(): string {
        return createCommand(CommandType.GET_VERSION);
    },
};

/**
 * 修复后的实现提供了两种创建命令的方法:
 * 1. createCommand: 使用Node.js Buffer API
 * 2. createCommandAlt: 使用原生JavaScript实现，不依赖Buffer
 * 
 * 使用示例：
 * 
 * import { Commands, BLE_UUID } from '../services/protocol';
 * 
 * // 读取设备数据
 * const response = await BLEManager.readCharacteristic(
 *   deviceId,
 *   BLE_UUID.SERVICE,
 *   BLE_UUID.CHARACTERISTIC_READ
 * );
 * 
 * // 写入命令到设备
 * await BLEManager.writeCharacteristic(
 *   deviceId,
 *   BLE_UUID.SERVICE,
 *   BLE_UUID.CHARACTERISTIC_WRITE,
 *   Commands.setIntensity(8)
 * );
 */