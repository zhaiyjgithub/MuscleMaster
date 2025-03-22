import React from 'react';
import {Text, View, ScrollView} from 'react-native';
import {Navigation, NavigationFunctionComponent} from 'react-native-navigation';
import {SafeAreaView} from 'react-native-safe-area-context';
import ScanSection from '../components/scan-section/scanSection';
import ScanFoundDeviceList, { FoundDevice, ServiceInfo } from '../components/scan-found-device/scanFoundDevice';
import { useEffect, useState } from 'react';
import { BLEManager, calculateSignalStrength } from '../services/BLEManager';
import { Device } from 'react-native-ble-plx';
import { TouchableOpacity } from 'react-native';

const ScanDeviceController: NavigationFunctionComponent = ({ componentId }) => {
  const [devices, setDevices] = useState<FoundDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [bleReady, setBleReady] = useState(false);

  // 开始扫描设备的函数
  const startScanning = async () => {
    if (isScanning) return;
    
    try {
      setIsScanning(true);
      await BLEManager.startScan(
        (device) => {
          console.log('Found device:', device.name, device.id);
          
          setDevices((prevDevices) => {
            // Check if device already exists
            const existingDeviceIndex = prevDevices.findIndex(d => d.id === device.id);
            
            // If device exists, return unchanged array
            if (existingDeviceIndex >= 0) {
              return prevDevices;
            }

            // 计算信号强度
            const signalStrength = calculateSignalStrength(device);

            // If device is new, add it to array
            return [...prevDevices, {
              name: device.name || '',
              id: device.id,
              signalStrength: signalStrength,
              connected: false,
              icon: '💪', 
              iconColor: '#1e88e5'
            }];
          });
        },
        // 扫描完成回调
        () => {
          console.log('Scanning completed');
          setIsScanning(false);
        }
      );
    } catch (error) {
      console.error('Error starting scan:', error);
      setIsScanning(false);
    }
  };

  // 等待蓝牙状态变为 PoweredOn 并开始扫描
  const waitForBluetoothAndScan = () => {
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
  };

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
  }, []);
  
  // 处理取消按钮
  const handleCancelScan = () => {
    console.log('Cancelling scan');
    BLEManager.stopScan();
    setIsScanning(false);
  };

  // 处理重新扫描
  const handleRescan = () => {
    if (bleReady) {
      startScanning();
    } else {
      waitForBluetoothAndScan();
    }
  };

  // 处理开始训练按钮
  const handleStartTraining = (device: FoundDevice) => {
    console.log('Start training pressed');
    Navigation.push(componentId, {
      component: {
        name: 'DevicePanelController',
        passProps: {
          devices: [device],
        },
      },
    });
  };
  // 更新设备连接状态
  const updateDeviceConnectionStatus = (deviceId: string, isConnected: boolean) => {
    setDevices(prevDevices => 
      prevDevices.map(device => 
        device.id === deviceId 
          ? { ...device, connected: isConnected }
          : device
      )
    );
  };

  // 更新设备服务
  const updateDeviceServices = (deviceId: string, serviceInfos: ServiceInfo[]) => {
    setDevices(prevDevices => 
      prevDevices.map(device => 
        device.id === deviceId 
          ? { ...device, serviceInfos }
          : device
      )
    );
  };
  
  console.log('isScanning', isScanning);
  console.log('bleReady', bleReady);
  return (
    <SafeAreaView className="flex-1 bg-gray-200">
      <View className="flex-1 relative">
        <TouchableOpacity onPress={() => Navigation.push(componentId, {
          component: {
            name: 'DevicePanelController',
            passProps: {
              devices: [{
                name: 'Device 1',
                id: '1',
                signalStrength: 100,
                connected: true,
                icon: '💪',
                iconColor: '#1e88e5',
                
              }],
            },
          },
        })}>
          <Text>Settings</Text>
        </TouchableOpacity>
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
      text: 'Muscle Master',
    },
  },
};

export default ScanDeviceController;