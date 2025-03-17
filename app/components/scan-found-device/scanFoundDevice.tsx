import React from 'react';
import { Text, View, TouchableOpacity } from "react-native";

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
          <Text className="text-lg" style={{ color: iconColor }}>{icon}</Text>
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
        className={`py-2 rounded-lg items-center ${connected ? 'bg-green-600' : 'bg-blue-600'}`}
        onPress={onConnectPress}
      >
        <Text className="text-white font-medium text-[13px]">{connected ? 'Connected' : 'Connect'}</Text>
      </TouchableOpacity>
    </View>
  );
};

// 示例用法
const ScanFoundDeviceList = () => {
  return (
    <View className='p-4'>
      <View className=' bg-white flex flex-col gap-y-2 rounded-xl'>
        <View className='mx-4 flex flex-row items-center justify-between p-4'>
          <Text className='text-lg text-black font-semibold'>Found Devices</Text>
          <Text>3 devices</Text>
        </View>
        <View className='w-full h-px bg-gray-200' />
        <View className=" bg-white px-4">
          <ScanFoundDevice
            name="Smart Dumbbell Pro"
            id="MM-DB-2024"
            signalStrength="excellent"
            connected={true}
            icon="💪"
            iconColor="#1e88e5"
            onConnectPress={() => console.log('Connect to Smart Dumbbell Pro')}
          />

          <ScanFoundDevice
            name="Muscle Stimulator X1"
            id="MM-EMS-1001"
            signalStrength="good"
            connected={false}
            icon="⚡"
            iconColor="#ff9800"
            onConnectPress={() => console.log('Connect to Muscle Stimulator X1')}
          />

          <ScanFoundDevice
            name="Ab Trainer 3000"
            id="MM-AB-3030"
            signalStrength="weak"
            connected={false}
            icon="🏋️"
            iconColor="#9c27b0"
            onConnectPress={() => console.log('Connect to Ab Trainer 3000')}
          />
        </View>
      </View>
    </View>
  );
};

export default ScanFoundDeviceList;