import {Text, View, ScrollView} from 'react-native';
import {NavigationFunctionComponent} from 'react-native-navigation';
import {SafeAreaView} from 'react-native-safe-area-context';
import ScanSection from '../components/scan-section/scanSection';
import ScanFoundDeviceList, { FoundDevice } from '../components/scan-found-device/scanFoundDevice';
import { useEffect, useState } from 'react';
import { BLEManager } from '../services/BLEManager';
import { Device } from 'react-native-ble-plx';

const ScanDeviceController: NavigationFunctionComponent = () => {
  const [devices, setDevices] = useState<FoundDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
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

          // 计算 信号强度
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
  
  return (
    <SafeAreaView className={'flex-1 bg-gray-100'}>
     <ScrollView className='flex-1'>
      <ScanSection onCancelPress={handleCancelScan} />
      <ScanFoundDeviceList devices={devices} />
     </ScrollView>
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

function calculateSignalStrength(device: Device) {
  const rssi = device.rssi;
  if (rssi >= -50) {
    return 'excellent';
  } else if (rssi >= -70) {
    return 'good';
  } else {
    return 'weak';
  }
}

// 计算信号的增益
function calculateSignalGain(rssi: number | null) {
  if (rssi === null) {
    return 0;
  }
  return rssi + 100;
}