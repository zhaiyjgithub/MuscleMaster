import { BleManager, Device, State, Subscription } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';

class BLEManagerClass {
  private manager: BleManager;
  private devices: Map<string, Device> = new Map();
  private isScanning: boolean = false;

  constructor() {
    this.manager = new BleManager();
    this.setupBleListener();
  }

  // 设置蓝牙状态监听
  private setupBleListener() {
    this.manager.onStateChange((state) => {
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
  onStateChange(listener: (state: State) => void, emitCurrentState: boolean = true): Subscription {
    return this.manager.onStateChange(listener, emitCurrentState);
  }

  // 检查权限
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'ios') {
      return true; // iOS 在 Info.plist 中已经配置了权限
    }

    if (Platform.OS === 'android') {
      if (Platform.Version >= 31) { // Android 12 或更高版本
        const grants = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        const allGranted = Object.values(grants).every(
          (result) => result === PermissionsAndroid.RESULTS.GRANTED
        );

        return allGranted;
      } else { // Android 11 或更低版本
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    }

    return false;
  }

  // 开始扫描设备
  async startScan(onDeviceFound: (device: Device) => void) {
    try {
      // 检查权限
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.error('BLE permission not granted');
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
            return;
          }

          if (device && device.name) {
            // 只处理有名称的设备
            this.devices.set(device.id, device);
            onDeviceFound(device);
          }
        }
      );

      console.log('Successfully started scanning for devices');

      // 15 秒后自动停止扫描
      setTimeout(() => {
        this.stopScan();
      }, 15000);

    } catch (error) {
      console.error('Failed to start scan:', error);
      this.isScanning = false;
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
      const device = await this.manager.connectToDevice(deviceId);
      console.log('Connected to device:', device.name);
      
      // 发现所有服务和特征
      await device.discoverAllServicesAndCharacteristics();
      console.log('Discovered services and characteristics');
      
      // 监听断开连接事件
      device.onDisconnected((error, disconnectedDevice) => {
        console.log('Device disconnected:', disconnectedDevice.name);
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
      await this.manager.cancelDeviceConnection(deviceId);
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
    return this.devices.get(deviceId);
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
    characteristicUUID: string
  ) {
    try {
      const characteristic = await this.manager.readCharacteristicForDevice(
        deviceId,
        serviceUUID,
        characteristicUUID
      );
      return characteristic.value; // Base64 encoded value
    } catch (error) {
      console.error('Read characteristic error:', error);
      return null;
    }
  }

  // 写入特性值（带响应）
  async writeCharacteristicWithResponse(
    deviceId: string,
    serviceUUID: string,
    characteristicUUID: string,
    value: string // Base64 encoded value
  ): Promise<boolean> {
    try {
      await this.manager.writeCharacteristicWithResponseForDevice(
        deviceId,
        serviceUUID,
        characteristicUUID,
        value
      );
      return true;
    } catch (error) {
      console.error('Write characteristic error:', error);
      return false;
    }
  }

  // 写入特性值（无响应）
  async writeCharacteristicWithoutResponse(
    deviceId: string,
    serviceUUID: string,
    characteristicUUID: string,
    value: string // Base64 encoded value
  ): Promise<boolean> {
    try {
      await this.manager.writeCharacteristicWithoutResponseForDevice(
        deviceId,
        serviceUUID,
        characteristicUUID,
        value
      );
      return true;
    } catch (error) {
      console.error('Write characteristic error:', error);
      return false;
    }
  }

  // 监听特性值变化
  monitorCharacteristic(
    deviceId: string,
    serviceUUID: string,
    characteristicUUID: string,
    listener: (value: string | null, error?: Error) => void
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
      }
    );
  }

  // 发现所有服务和特性
  async discoverAllServicesAndCharacteristics(deviceId: string) {
    try {
      const device = await this.manager.discoverAllServicesAndCharacteristicsForDevice(deviceId);
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
        serviceUUID
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