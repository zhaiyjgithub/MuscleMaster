import React from 'react';
import {Text, View, ScrollView} from 'react-native';
import {NavigationFunctionComponent} from 'react-native-navigation';
import {SafeAreaView} from 'react-native-safe-area-context';
import ScanSection from '../components/scan-section/scanSection';
import ScanFoundDeviceList, { FoundDevice, ServiceInfo } from '../components/scan-found-device/scanFoundDevice';
import { useEffect, useState } from 'react';
import { BLEManager } from '../services/BLEManager';
import { Device } from 'react-native-ble-plx';
import { TouchableOpacity } from 'react-native';

// 计算信号强度级别
const calculateSignalStrength = (device: Device): 'excellent' | 'good' | 'weak' => {
  const rssi = device.rssi;
  if (rssi !== null && rssi >= -50) {
    return 'excellent';
  } else if (rssi !== null && rssi >= -70) {
    return 'good';
  } else {
    return 'weak';
  }
};

// 计算信号的增益
function calculateSignalGain(rssi: number | null) {
  if (rssi === null) {
    return 0;
  }
  return rssi + 100;
}

const ScanDeviceController: NavigationFunctionComponent = () => {
  const [devices, setDevices] = useState<FoundDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  // 开始扫描设备的函数
  const startScanning = async () => {
    if (isScanning) return;
    
    setIsScanning(true);
    await BLEManager.startScan((device) => {
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
    });
    
    // 扫描完成后更新状态
    setIsScanning(false);
  };

  // 组件挂载时自动开始首次扫描
  useEffect(() => {
    startScanning();
    
    // 组件卸载时停止扫描
    return () => {
      BLEManager.stopScan();
    };
  }, []);
  
  // 处理取消按钮
  const handleCancelScan = () => {
    BLEManager.stopScan();
    setIsScanning(false);
  };

  // 处理开始训练按钮
  const handleStartTraining = () => {
    console.log('Start training pressed');
    // 这里可以添加导航到训练页面的逻辑
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
  
  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <View className="flex-1 relative">
        <ScrollView className="flex-1 pb-20">
          <ScanSection 
            onCancelPress={handleCancelScan} 
          />
          <ScanFoundDeviceList 
            devices={devices} 
            updateConnectionStatus={updateDeviceConnectionStatus}
            updateDeviceServices={updateDeviceServices}
          />
        </ScrollView>
        
        {/* 固定在底部的按钮 */}
        <View className="absolute bottom-0 left-0 right-0 pb-4 px-4 bg-gray-100">
          <TouchableOpacity 
            onPress={handleStartTraining}
            className="bg-blue-600 py-4 rounded-lg items-center"
          >
            <Text className="text-white font-bold text-lg">Start Training</Text>
          </TouchableOpacity>
        </View>
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