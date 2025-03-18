import React, { useEffect } from 'react';
import { Text, View, TouchableOpacity, Platform } from "react-native";
import { BLEManager } from '../../lib/manger';
import { Bluetooth } from 'lucide-react-native';

interface DeviceItemProps {
  name: string;
  id: string;
  signalStrength: 'excellent' | 'good' | 'weak';
  connected: boolean;
  icon: string;
  iconColor: string;
  onConnectPress: () => void;
}

const ScanFoundDevice: React.FC<DeviceItemProps> = ({
  name,
  id,
  signalStrength,
  connected,
  icon,
  iconColor,
  onConnectPress
}) => {
  // 信号强度对应的 bar 数量和文本
  const signalInfo = {
    excellent: {
      activeBars: 4,
      text: 'Excellent signal'
    },
    good: {
      activeBars: 2,
      text: 'Good signal'
    },
    weak: {
      activeBars: 1,
      text: 'Weak signal'
    }
  };

  const { activeBars, text } = signalInfo[signalStrength];

  return (
    <View className="flex flex-col p-3.5 rounded-xl bg-gray-50 mb-3">
      {/* Device Info */}
      <View className="flex-row items-start mb-4">
        <View className="w-[42px] h-[42px] bg-white rounded-full justify-center items-center mr-3.5 flex-shrink-0" style={{ backgroundColor: 'white' }}>
          <Bluetooth size={24} color={iconColor} />
        </View>

        <View className="flex-1">
          <Text className="font-medium mb-0.5 text-[15px] text-gray-900">{name}</Text>
          <View className="flex-row items-center">
            <Text style={{ color: iconColor }} className="mr-1">•</Text>
            <Text className="text-[13px] text-gray-500">{id}</Text>
          </View>
        </View>
      </View>

      {/* Device Status */}
      <View className="flex-row justify-between items-center mb-3">
        <View className="flex-row items-center">
          {[...Array(4)].map((_, index) => (
            <View
              key={index}
              className={`w-[3px] rounded-sm mr-0.5 ${index < activeBars ? 'bg-green-600' : 'bg-gray-300'}`}
              style={{
                height: 6 + (index * 4),
              }}
            />
          ))}
          <Text className="text-xs text-gray-500 ml-1.5">{text}</Text>
        </View>
      </View>

      {/* Connect Button */}
      <TouchableOpacity
        className={`py-3 rounded-lg items-center ${connected ? 'bg-green-600' : 'bg-blue-600'}`}
        onPress={onConnectPress}
      >
        <Text className="text-white font-medium text-[13px]">{connected ? 'Connected' : 'Connect'}</Text>
      </TouchableOpacity>
    </View>
  );
};

export interface FoundDevice {
  name: string;
  id: string;
  signalStrength: 'excellent' | 'good' | 'weak';
  connected: boolean;
  icon: string;
  iconColor: string;
}

interface ScanFoundDeviceListProps {
  devices: FoundDevice[];
  updateConnectionStatus?: (deviceId: string, isConnected: boolean) => void;
}

const ScanFoundDeviceList: React.FC<ScanFoundDeviceListProps> = ({ devices, updateConnectionStatus }) => {
  if (devices.length === 0) {
    return (
      <View className='p-4'>
        <View className=' bg-white flex flex-col gap-y-2 rounded-xl p-4'>
          <Text className='text-lg text-gray-800 font-semibold'>No devices found</Text>
        </View>
      </View>
    )
  }
  return (
    <View className='p-4'>
      <View className=' bg-white flex flex-col rounded-xl overflow-hidden'>
        <View className='flex flex-row items-center justify-between px-4 py-2'>
          <Text className='text-lg text-black font-semibold'>Found Devices</Text>
          <Text>{devices.length} devices</Text>
        </View>
        <View className='w-full h-px bg-gray-200' />
        <View className=" bg-white px-4 pt-4">
          {/* <ScanFoundDevice
            name="Smart Dumbbell Pro"
            id="MM-DB-2024"
            signalStrength="excellent"
            connected={true}
            icon="💪"
            iconColor="#1e88e5"
            onConnectPress={() => console.log('Connect to Smart Dumbbell Pro')}
          /> */}

          {devices.map((device) => (
            <ScanFoundDevice
              key={device.id}
              {...device}
              onConnectPress={async () => {
                try {
                  if (device.connected) {
                    // 如果已经连接，则断开连接
                    await BLEManager.disconnectDevice(device.id);
                    console.log(`Disconnected from ${device.name}`);
                    updateConnectionStatus?.(device.id, false);
                  } else {
                    // 连接设备
                    const connectedDevice = await BLEManager.connectToDevice(device.id);
                    if (connectedDevice) {
                      console.log(`Successfully connected to ${device.name}`);
                      // 使用传入的函数更新设备连接状态，触发 UI 更新
                      updateConnectionStatus?.(device.id, true);
                    }
                  }
                } catch (error) {
                  console.error(`Failed to ${device.connected ? 'disconnect from' : 'connect to'} ${device.name}:`, error);
                }
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
};

export default ScanFoundDeviceList;