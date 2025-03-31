import {
  BleError,
  BleManager,
  Characteristic,
  Device,
  State,
  Subscription,
} from 'react-native-ble-plx';
import {PermissionsAndroid, Platform} from 'react-native';
import {encodeBase64Value} from '../lib/utils';

type ConnectionListener = (
  device: Device,
  isConnected: boolean,
  error?: Error | null,
) => void;

class BLEManagerClass {
  private manager: BleManager;
  private devices: Map<string, Device> = new Map();
  private isScanning: boolean = false;

  private connectionListeners: Map<string, ConnectionListener[]> = new Map();
  private globalConnectionListeners: ConnectionListener[] = [];
  private connectedDevices: Map<string, Device> = new Map();

  constructor() {
    this.manager = new BleManager();
    this.setupBleListener();
  }

  // 设置蓝牙状态监听
  private setupBleListener() {
    this.manager.onStateChange(state => {
      console.log('BLE state changed:', state);
      if (state === State.PoweredOn) {
        // 蓝牙已打开，可以开始扫描
        console.log('Bluetooth is powered on');
      }
    }, true);
  }

  // 获取当前蓝牙状态的公共方法
  async getState(): Promise<State> {
    return await this.manager.state();
  }

  // 监听蓝牙状态变化的公共方法
  onStateChange(
    listener: (state: State) => void,
    emitCurrentState: boolean = true,
  ): Subscription {
    return this.manager.onStateChange(listener, emitCurrentState);
  }

  // 检查权限
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'ios') {
      return true; // iOS 在 Info.plist 中已经配置了权限
    }

    if (Platform.OS === 'android') {
      if (Platform.Version >= 31) {
        // Android 12 或更高版本
        const grants = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        const allGranted = Object.values(grants).every(
          result => result === PermissionsAndroid.RESULTS.GRANTED,
        );

        return allGranted;
      } else {
        // Android 11 或更低版本
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    }

    return false;
  }

  // 添加公共方法来检查是否正在扫描
  isScanningDevices(): boolean {
    return this.isScanning;
  }

  // 开始扫描设备
  async startScan(
    onDeviceFound: (device: Device) => void,
    onScanComplete?: () => void,
  ) {
    try {
      // 检查权限
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.error('BLE permission not granted');
        if (onScanComplete) {
          onScanComplete();
        }
        return;
      }

      // 检查蓝牙是否已启用
      const bleState = await this.manager.state();
      if (bleState !== State.PoweredOn) {
        console.warn('Bluetooth is not powered on. Current state:', bleState);

        // 如果蓝牙未开启，返回一个 Promise，等待蓝牙开启
        await new Promise<void>((resolve, reject) => {
          // 设置超时，避免无限等待
          const timeoutId = setTimeout(() => {
            // 取消订阅蓝牙状态变化
            subscription.remove();
            reject(new Error('Timeout waiting for Bluetooth to power on'));
          }, 10000); // 10 秒超时

          // 监听蓝牙状态变化
          const subscription = this.manager.onStateChange(state => {
            if (state === State.PoweredOn) {
              // 蓝牙已开启，清除超时并解决 Promise
              clearTimeout(timeoutId);
              subscription.remove();
              console.log('Bluetooth is now powered on');
              resolve();
            } else if (state === State.PoweredOff) {
              // 用户可能需要手动开启蓝牙
              console.warn('Please turn on Bluetooth');
            }
          }, true); // true 表示立即检查当前状态
        }).catch(error => {
          console.error('Failed waiting for Bluetooth:', error);
          if (onScanComplete) {
            onScanComplete();
          }
          throw error;
        });
      }

      if (this.isScanning) {
        console.log('Already scanning');
        return;
      }

      this.isScanning = true;

      // 清除之前的设备列表
      this.devices.clear();

      // 开始扫描
      this.manager.startDeviceScan(
        null, // 不过滤 UUID
        {
          allowDuplicates: false,
          scanMode: Platform.OS === 'android' ? 1 : undefined, // 平衡模式（Android）
        },
        (error, device) => {
          if (error) {
            console.error('Scan error:', error);
            this.stopScan();
            if (onScanComplete) {
              onScanComplete();
            }
            return;
          }

          if (device && device.name) {
            // 只处理有名称的设备
            this.devices.set(device.id, device);
            onDeviceFound(device);
          }
        },
      );

      console.log('Successfully started scanning for devices');

      // 15 秒后自动停止扫描
      setTimeout(() => {
        this.stopScan();
        if (onScanComplete) {
          onScanComplete();
        }
      }, 15000);
    } catch (error) {
      console.error('Failed to start scan:', error);
      this.isScanning = false;
      if (onScanComplete) {
        onScanComplete();
      }
      throw error;
    }
  }

  // 停止扫描
  stopScan() {
    if (this.isScanning) {
      this.manager.stopDeviceScan();
      this.isScanning = false;
      console.log('Scanning stopped');
    }
  }

  // 连接到设备
  async connectToDevice(deviceId: string): Promise<Device | null> {
    try {
      const device = await this.manager.connectToDevice(deviceId, {
        autoConnect: true,
        timeout: 15000, // 15s
      });
      console.log('Connected to device:', device.name);

      // 添加到已连接设备列表
      this.connectedDevices.set(deviceId, device);

      // 通知连接成功
      this.notifyConnectionChange(device, true);

      // 发现所有服务和特征
      await device.discoverAllServicesAndCharacteristics();
      console.log('Discovered services and characteristics');

      // 监听断开连接事件
      device.onDisconnected((error, disconnectedDevice) => {
        console.log('Device disconnected:', disconnectedDevice.name);

        // 从已连接设备列表中移除
        this.connectedDevices.delete(disconnectedDevice.id);

        // 通知断开连接
        this.notifyConnectionChange(disconnectedDevice, false, error);
      });

      return device;
    } catch (error) {
      console.error('Connection error:', error);
      return null;
    }
  }

  // 断开设备连接
  async disconnectDevice(deviceId: string): Promise<boolean> {
    try {
      const device = this.connectedDevices.get(deviceId);
      if (!device) {
        console.log('Device not found in connected devices');
        return false;
      }
      await this.manager.cancelDeviceConnection(deviceId);

      // 从已连接设备列表中移除
      this.connectedDevices.delete(deviceId);

      // 通知断开连接
      this.notifyConnectionChange(device, false);

      console.log('Device disconnected successfully');
      return true;
    } catch (error) {
      console.error('Disconnect error:', error);
      return false;
    }
  }

  // 获取当前已发现的设备列表
  getDevices(): Device[] {
    return Array.from(this.devices.values());
  }

  // 获取设备信息
  getDeviceById(deviceId: string): Device | undefined {
    return this.devices.get(deviceId) || this.connectedDevices.get(deviceId);
  }

  // 检查蓝牙是否已启用
  async isBleEnabled(): Promise<boolean> {
    const state = await this.manager.state();
    return state === State.PoweredOn;
  }

  // 读取特性值
  async readCharacteristic(
    deviceId: string,
    serviceUUID: string,
    characteristicUUID: string,
  ) {
    try {
      const characteristic = await this.manager.readCharacteristicForDevice(
        deviceId,
        serviceUUID,
        characteristicUUID,
      );
      return characteristic.value; // Base64 encoded value
    } catch (error) {
      console.error('Read characteristic error:', error);
      return null;
    }
  }

  // 检查特性是否支持特定写入模式
  async checkCharacteristicProperties(
    deviceId: string,
    serviceUUID: string,
    characteristicUUID: string,
  ) {
    try {
      // 读取特性以获取其属性
      const characteristic = await this.manager.readCharacteristicForDevice(
        deviceId,
        serviceUUID,
        characteristicUUID,
      );

      // 直接返回特性对象提供的属性标志
      return {
        canRead: characteristic.isReadable,
        canWriteWithResponse: characteristic.isWritableWithResponse,
        canWriteWithoutResponse: characteristic.isWritableWithoutResponse,
        canNotify: characteristic.isNotifiable,
        isNotifying: characteristic.isNotifying,
        canIndicate: characteristic.isIndicatable,
        value: characteristic.value,
      };
    } catch (error) {
      console.error('Error checking characteristic properties:', error);
      throw error;
    }
  }

  // 智能写入方法 - 使用优化后的特性属性检查
  async writeCharacteristicSmart(
    deviceId: string,
    serviceUUID: string,
    characteristicUUID: string,
    data: string,
  ) {
    try {
      // 检查特性属性
      return await this.manager.writeCharacteristicWithoutResponseForDevice(
        deviceId,
        serviceUUID,
        characteristicUUID,
        data,
      );

      // const props = await this.checkCharacteristicProperties(
      //   deviceId,
      //   serviceUUID,
      //   characteristicUUID,
      // );
      // console.log('Characteristic properties:', props);
      //
      // // 根据特性支持的写入模式选择写入方法
      // if (props.canWriteWithResponse) {
      //   console.log(
      //     'Using write with response for characteristic:',
      //     characteristicUUID,
      //   );
      //   return await this.manager.writeCharacteristicWithResponseForDevice(
      //     deviceId,
      //     serviceUUID,
      //     characteristicUUID,
      //     data,
      //   );
      // } else if (props.canWriteWithoutResponse) {
      //   console.log(
      //     'Using write without response for characteristic:',
      //     characteristicUUID,
      //   );
      //   return await this.manager.writeCharacteristicWithoutResponseForDevice(
      //     deviceId,
      //     serviceUUID,
      //     characteristicUUID,
      //     data,
      //   );
      // } else {
      //   throw new Error(
      //     `Characteristic ${characteristicUUID} does not support any write operations`,
      //   );
      // }
    } catch (error) {
      console.error('Error writing characteristic:', error);
      throw error;
    }
  }

  // 增强型写入特性方法，使用 encodeBase64Value 工具方法
  async writeCharacteristic(
    deviceId: string,
    serviceUUID: string,
    characteristicUUID: string,
    base64Data: any,
    forceWithResponse: boolean = false,
  ) {
    try {
      // 检查特性属性，以决定使用哪种写入方法
      if (forceWithResponse) {
        // 强制使用带响应的写入
        return await this.manager.writeCharacteristicWithResponseForDevice(
          deviceId,
          serviceUUID,
          characteristicUUID,
          base64Data,
        );
      } else {
        return await this.writeCharacteristicSmart(
          deviceId,
          serviceUUID,
          characteristicUUID,
          base64Data,
        );
      }
    } catch (error) {
      console.error('Error writing characteristic:', error);
      throw error;
    }
  }

  // 监听特性值变化
  monitorCharacteristic(
    deviceId: string,
    serviceUUID: string,
    characteristicUUID: string,
    listener: (value: string | null, error?: Error) => void,
  ) {
    return this.manager.monitorCharacteristicForDevice(
      deviceId,
      serviceUUID,
      characteristicUUID,
      (error, characteristic) => {
        if (error) {
          listener(null, error);
          return;
        }
        if (characteristic && characteristic.value) {
          listener(characteristic.value);
        }
      },
    );
  }

  // 发现所有服务和特性
  async discoverAllServicesAndCharacteristics(deviceId: string) {
    try {
      const device =
        await this.manager.discoverAllServicesAndCharacteristicsForDevice(
          deviceId,
        );
      return device;
    } catch (error) {
      console.error('Error discovering services and characteristics:', error);
      throw error;
    }
  }

  // 获取设备的所有服务
  async servicesForDevice(deviceId: string) {
    try {
      const services = await this.manager.servicesForDevice(deviceId);
      return services;
    } catch (error) {
      console.error('Error getting services for device:', error);
      return [];
    }
  }

  // 获取服务的所有特性
  async characteristicsForDevice(deviceId: string, serviceUUID: string) {
    try {
      const characteristics = await this.manager.characteristicsForDevice(
        deviceId,
        serviceUUID,
      );
      return characteristics;
    } catch (error) {
      console.error('Error getting characteristics for service:', error);
      return [];
    }
  }

  // 销毁管理器
  destroy() {
    this.manager.destroy();
  }

  // 添加连接状态监听器
  addConnectionListener(listener: ConnectionListener): void {
    this.globalConnectionListeners.push(listener);
  }

  // 移除连接状态监听器
  removeConnectionListener(listener: ConnectionListener): void {
    const index = this.globalConnectionListeners.indexOf(listener);
    if (index !== -1) {
      this.globalConnectionListeners.splice(index, 1);
    }
  }

  // 为特定设备添加连接状态监听器
  addDeviceConnectionListener(
    deviceId: string,
    listener: ConnectionListener,
  ): void {
    if (!this.connectionListeners.has(deviceId)) {
      this.connectionListeners.set(deviceId, []);
    }
    this.connectionListeners.get(deviceId)?.push(listener);
  }

  // 为特定设备移除连接状态监听器
  removeDeviceConnectionListener(
    deviceId: string,
    listener: ConnectionListener,
  ): void {
    if (!this.connectionListeners.has(deviceId)) {
      return;
    }
    const listeners = this.connectionListeners.get(deviceId);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  // 通知所有监听器设备连接状态变化
  private notifyConnectionChange(
    device: Device,
    isConnected: boolean,
    error?: Error | null,
  ): void {
    // 通知全局监听器
    for (const listener of this.globalConnectionListeners) {
      listener(device, isConnected, error);
    }

    // 通知设备特定监听器
    const deviceListeners = this.connectionListeners.get(device.id);
    if (deviceListeners) {
      for (const listener of deviceListeners) {
        listener(device, isConnected, error);
      }
    }

    // 更新已连接设备的缓存
    if (isConnected) {
      this.connectedDevices.set(device.id, device);
    } else {
      this.connectedDevices.delete(device.id);
    }
  }

  // 检查设备是否已连接
  isDeviceConnected(deviceId: string): boolean {
    return this.connectedDevices.has(deviceId);
  }

  // 获取所有已连接的设备
  getConnectedDevices(): Device[] {
    return Array.from(this.connectedDevices.values());
  }

  // 获取已连接设备的数量
  getConnectedDevicesCount(): number {
    return this.connectedDevices.size;
  }

  // 监控指定设备的连接状态
  monitorDeviceConnection(
    deviceId: string,
    listener: ConnectionListener,
  ): Subscription {
    // 首先检查设备是否已连接
    const isConnected = this.isDeviceConnected(deviceId);
    const device =
      this.devices.get(deviceId) || this.connectedDevices.get(deviceId);

    if (device && isConnected) {
      // 如果设备已连接，立即通知监听器
      listener(device, true);
    }

    // 添加设备特定监听器
    this.addDeviceConnectionListener(deviceId, listener);

    // 返回一个可取消的订阅对象
    return {
      remove: () => {
        this.removeDeviceConnectionListener(deviceId, listener);
      },
    };
  }

  monitorCharacteristicForDevice(
    deviceId: string,
    serviceUUID: string,
    characteristicUUID: string,
    listener: (
      error: BleError | null,
      characteristic: Characteristic | null,
    ) => void,
    transactionId?: string,
  ): Subscription {
    return this.manager.monitorCharacteristicForDevice(
      deviceId,
      serviceUUID,
      characteristicUUID,
      listener,
      transactionId,
    );
  }
}

// 导出单例实例
export const BLEManager = new BLEManagerClass();
export default BLEManager;

export function calculateSignalStrength(device: Device) {
  const rssi = device.rssi;
  if (rssi !== null && rssi >= -50) {
    return 'excellent';
  } else if (rssi !== null && rssi >= -70) {
    return 'good';
  } else {
    return 'weak';
  }
}

// 计算信号的增益
export function calculateSignalGain(rssi: number | null) {
  if (rssi === null) {
    return 0;
  }
  return rssi + 100;
}
