import React from 'react';
import {View, ScrollView, TouchableOpacity, Text} from 'react-native';
import {Navigation, NavigationFunctionComponent} from 'react-native-navigation';
import {SafeAreaView} from 'react-native-safe-area-context';
import ScanSection from '../components/scan-section/scanSection';
import ScanFoundDeviceList, {
  FoundDevice,
  ServiceInfo,
} from '../components/scan-found-device/scanFoundDevice';
import {useEffect, useState, useCallback} from 'react';
import {BLEManager, calculateSignalStrength} from '../services/BLEManager';

const ScanDeviceController: NavigationFunctionComponent = ({componentId}) => {
  const [devices, setDevices] = useState<FoundDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [bleReady, setBleReady] = useState(false);

  // 开始扫描设备的函数
  const startScanning = useCallback(async () => {
    if (isScanning) {
      return;
    }

    try {
      setIsScanning(true);
      await BLEManager.startScan(
        device => {
          console.log('Found device:', device.name, device.id);

          setDevices(prevDevices => {
            // Check if device already exists
            const existingDeviceIndex = prevDevices.findIndex(
              d => d.id === device.id,
            );

            // If device exists, return unchanged array
            if (existingDeviceIndex >= 0) {
              return prevDevices;
            }

            // 计算信号强度
            const signalStrength = calculateSignalStrength(device);

            // If device is new, add it to array
            // filter 'GuGeer' 开头的设备
            if (
              (device.name && device.name.toLowerCase().startsWith('gugeer')) ||
              (device.name && device.name.toLowerCase().indexOf('d30') !== -1)
            ) {
              return [
                ...prevDevices,
                {
                  name: device.name || '',
                  id: device.id,
                  signalStrength: signalStrength,
                  connected: false,
                  icon: '💪',
                  iconColor: '#1e88e5',
                },
              ];
            } else {
              return prevDevices;
            }
          });
        },
        // 扫描完成回调
        () => {
          console.log('Scanning completed');
          setIsScanning(false);
        },
      );
    } catch (error) {
      console.error('Error starting scan:', error);
      setIsScanning(false);
    }
  }, [isScanning]);

  // 等待蓝牙状态变为 PoweredOn 并开始扫描
  const waitForBluetoothAndScan = useCallback(() => {
    // 检查当前状态，使用公共方法 getState()
    BLEManager.getState()
      .then(state => {
        if (state === 'PoweredOn') {
          setBleReady(true);
          startScanning();
        } else {
          console.log('Bluetooth not ready, current state:', state);
        }
      })
      .catch(error => {
        console.error('Error checking Bluetooth state:', error);
      });
  }, [startScanning]);

  // 组件挂载时监听蓝牙状态变化
  useEffect(() => {
    // 订阅蓝牙状态变化，使用公共方法 onStateChange()
    const subscription = BLEManager.onStateChange(state => {
      console.log('Bluetooth state changed:', state);
      if (state === 'PoweredOn') {
        setBleReady(true);
        startScanning();
      } else {
        setBleReady(false);
      }
    }, true); // true 参数表示立即检查当前状态

    // 组件卸载时取消订阅并停止扫描
    return () => {
      subscription.remove();
      BLEManager.stopScan();
    };
  }, []); // 移除 startScanning 依赖

  // 处理取消按钮
  const handleCancelScan = useCallback(() => {
    setIsScanning(false);
    BLEManager.stopScan();
  }, []);

  // 处理重新扫描
  const handleRescan = useCallback(() => {
    if (bleReady) {
      // clear all previous devices
      setDevices([]);
      startScanning();
    } else {
      waitForBluetoothAndScan();
    }
  }, [bleReady, startScanning, waitForBluetoothAndScan]);

  // 处理开始训练按钮
  const handleStartTraining = useCallback(
    (device: FoundDevice) => {
      console.log('Start training pressed');
      Navigation.push(componentId, {
        component: {
          name: 'DevicePanelController',
          passProps: {
            devices: devices,
          },
        },
      });
    },
    [componentId],
  );

  // 更新设备连接状态
  const updateDeviceConnectionStatus = useCallback(
    (deviceId: string, isConnected: boolean) => {
      setDevices(prevDevices =>
        prevDevices.map(device =>
          device.id === deviceId ? {...device, connected: isConnected} : device,
        ),
      );
    },
    [],
  );

  // 更新设备服务
  const updateDeviceServices = useCallback(
    (deviceId: string, serviceInfos: ServiceInfo[]) => {
      setDevices(prevDevices =>
        prevDevices.map(device =>
          device.id === deviceId ? {...device, serviceInfos} : device,
        ),
      );
    },
    [],
  );

  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <View className="flex-1 relative">
        <ScrollView className="flex-1 pb-20">
          <ScanSection
            onCancelPress={handleCancelScan}
            onRescanPress={handleRescan}
            isScanning={isScanning}
            isBleReady={bleReady}
          />

          <ScanFoundDeviceList
            devices={devices}
            updateConnectionStatus={updateDeviceConnectionStatus}
            updateDeviceServices={updateDeviceServices}
            onPress={handleStartTraining}
          />
        </ScrollView>

        {/* 固定在底部的按钮 */}
        {/* <View className="absolute bottom-0 left-0 right-0 pb-4 px-4 bg-gray-100">
          <TouchableOpacity
            onPress={() => {
              handleStartTraining(devices[0]);
            }}
            className="bg-blue-600 py-4 rounded-lg items-center"
          >
            <Text className="text-white font-bold text-lg">Start Training</Text>
          </TouchableOpacity>
        </View> */}
      </View>
    </SafeAreaView>
  );
};

ScanDeviceController.options = {
  topBar: {
    title: {
      text: 'GuGeer',
    },
  },
};

export default ScanDeviceController;
