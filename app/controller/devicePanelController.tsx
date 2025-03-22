import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal
} from 'react-native';
import { NavigationFunctionComponent } from 'react-native-navigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BLEManager } from '../services/BLEManager';
import {
  Dumbbell,
  Flame,
  Heart,
  Smile,
  Droplet,
  Zap,
  Crown,
  User,
  Scan,
  Activity,
  Scissors,
  Shield,
  Settings,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Smartphone,
  Icon,
  Bluetooth,
} from 'lucide-react-native';
import { Device } from 'react-native-ble-plx';
import { FoundDevice } from '../components/scan-found-device/scanFoundDevice';
import { useNavigationComponentDidAppear } from 'react-native-navigation-hooks';
import { decode } from '@frsource/base64'; // 修正导入
import ModeListActionSheet, { getIconByMode } from '../components/mode-list-action-sheet/modeListActionSheet';
import BottomSheet from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { TimePickerActionSheet } from '../components/time-picker-action-sheet/timePickerActionSheet';

interface ModeItem {
  id: string;
  name: string;
  icon: any;
}

export interface DevicePanelControllerProps {
  devices: FoundDevice[];
}

// 添加缺失的类型定义和函数
interface ServiceInfo {
  uuid: string;
  characteristicInfos: {
    uuid: string;
  }[];
}

// 定义 Base64 解码函数
const decodeBase64Value = (value: string): string => {
  try {
    return decode(value);
  } catch (error) {
    console.error('Error decoding Base64 value:', error);
    return 'Decoding error';
  }
};

const DevicePanelController: NavigationFunctionComponent<DevicePanelControllerProps> = ({ componentId, devices }) => {
  const [selectedMode, setSelectedMode] = useState('Fitness');
  const [isConnected, setIsConnected] = useState(true);
  const [batteryLevel, setBatteryLevel] = useState(75);
  const [intensityLevel, setIntensityLevel] = useState(7);
  const [maxIntensity, setMaxIntensity] = useState(10);
  const [timerValue, setTimerValue] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [deviceLoadingStates, setDeviceLoadingStates] = useState<Record<string, boolean>>({});


  const modeListActionSheetRef = useRef<BottomSheet>(null);

  // 添加设备加载状态管理函数
  const setDeviceLoading = (deviceId: string, isLoading: boolean) => {
    setDeviceLoadingStates(prev => ({
      ...prev,
      [deviceId]: isLoading
    }));
  };

  // 添加连接状态更新函数
  const updateConnectionStatus = (deviceId: string, isConnected: boolean) => {
    // 这个函数在实际应用中应该用来更新 UI 或状态
    console.log(`更新设备 ${deviceId} 连接状态为：${isConnected}`);
  };

  // 添加服务和特性发现函数
  const discoverServicesAndCharacteristics = async (deviceId: string): Promise<ServiceInfo[]> => {
    try {
      // 使用 BLEManager 发现所有服务和特性
      await BLEManager.discoverAllServicesAndCharacteristics(deviceId);

      // 获取服务
      const services = await BLEManager.servicesForDevice(deviceId);
      const serviceInfos: ServiceInfo[] = [];

      // 对每个服务获取特性
      for (const service of services) {
        const characteristics = await BLEManager.characteristicsForDevice(deviceId, service.uuid);

        serviceInfos.push({
          uuid: service.uuid,
          characteristicInfos: characteristics.map(char => ({ uuid: char.uuid }))
        });
      }

      return serviceInfos;
    } catch (error) {
      console.error('Error discovering services and characteristics:', error);
      return [];
    }
  };
  const [selectedDevice, setSelectedDevice] = useState<FoundDevice | null>(null);

  useNavigationComponentDidAppear(() => {
    if (devices && devices.length > 0) {
      setSelectedDevice(devices[0]);

      // 尝试连接到设备
      const connectToDevice = async () => {
        const device = devices[0];

        try {
          // 设置加载状态
          setDeviceLoading(device.id, true);

          // 停止扫描（在连接前停止扫描是最佳实践）
          BLEManager.stopScan();

          // 连接设备
          const connectedDevice = await BLEManager.connectToDevice(device.id);
          if (connectedDevice) {
            console.log(`Successfully connected to ${device.name}`);

            // 更新设备连接状态
            updateConnectionStatus(device.id, true);

            // 发现服务和特性
            const serviceInfos = await discoverServicesAndCharacteristics(device.id);
            console.log(`Service infos: ${JSON.stringify(serviceInfos)}`);

            // 遍历读取特性
            // e.g. service UUID = '0000aaa0-0000-1000-8000-aabbccddeeff', characteristic UUID = 'abcdef01-1234-5678-1234-56789abcdef9'
            for (const service of serviceInfos) {
              for (const characteristic of service.characteristicInfos) {
                const value = await BLEManager.readCharacteristic(device.id, service.uuid, characteristic.uuid);
                console.log(`Value of ${characteristic.uuid}:`, value);
                if (value) {
                  const decodedValue = decodeBase64Value(value);
                  console.log(`Decoded value of ${characteristic.uuid}:`, decodedValue);
                }
              }
            }
          }
        } catch (error) {
          console.error(`Failed to ${device.connected ? 'disconnect from' : 'connect to'} ${device.name}:`, error);
        } finally {
          // 无论成功失败，都结束加载状态
          setDeviceLoading(device.id, false);
        }
      };

      connectToDevice();
    }
  });

  // Increase intensity level
  const increaseIntensity = () => {
    if (intensityLevel < maxIntensity) {
      setIntensityLevel(intensityLevel + 1);
    }
  };

  // Decrease intensity level
  const decreaseIntensity = () => {
    if (intensityLevel > 1) {
      setIntensityLevel(intensityLevel - 1);
    }
  };

  // Toggle timer state (start/pause)
  const toggleTimer = () => {
    if (timerRunning) {
      // 如果计时器正在运行，暂停它
      pauseTimer();
    } else {
      // 如果计时器未运行，启动它
      startTimer();
    }
  };

  // 启动计时器
  const startTimer = () => {
    // 只有当时间大于 0 时才启动计时器
    if (timerValue <= 0) {
      console.log("Timer value is 0, can't start timer");
      return;
    }

    // 使用通用启动方法，传入当前时间值
    startTimerWithValue(timerValue);
  };

  // 暂停计时器
  const pauseTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
    setTimerRunning(false);
  };

  // Reset timer
  const resetTimer = () => {
    // 停止计时器
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
    setTimerValue(0);
    setTimerRunning(false);
    timePickerActionSheetRef.current?.expand();
  };

  // 在组件卸载时清除定时器
  useEffect(() => {
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [timerInterval]);

  // Handle device selection
  const handleDeviceSelect = (device: FoundDevice) => {
    setSelectedDevice(device);
  };

  // Handle mode selection
  const handleModeSelect = (mode: string) => {
    setSelectedMode(mode);
    modeListActionSheetRef.current?.close();
  };

  // Navigate to settings
  const navigateToSettings = () => {
    console.log('Navigate to settings');
    // Implementation of navigation to settings
  };

  const $modeActionSheet = (
    <ModeListActionSheet
      selectedMode={selectedMode}
      handleModeSelect={handleModeSelect}
      ref={modeListActionSheetRef}
    />
  )

  const timePickerActionSheetRef = useRef<BottomSheet>(null);

  const onTimeSelected = (hours: number, minutes: number, seconds: number) => {
    console.log(`Time selected: ${hours}:${minutes}:${seconds}`);
    // 计算总秒数
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    
    // 确保时间大于 0
    if (totalSeconds > 0) {
      // 设置时间值
      setTimerValue(totalSeconds);

      // 使用短延迟确保 UI 更新
      setTimeout(() => {
        console.log('Starting timer with', totalSeconds, 'seconds');
        // 创建一个直接使用 totalSeconds 的自定义启动函数
        startTimerWithValue(totalSeconds);
      }, 300);
    }
  }

  // 启动计时器，使用指定的时间值
  const startTimerWithValue = (seconds: number) => {
    // 确认有时间可以倒计时
    if (seconds <= 0) {
      console.log("Timer value is 0, can't start timer");
      return;
    }

    // 如果已经有一个计时器在运行，先清除它
    if (timerInterval) {
      clearInterval(timerInterval);
    }

    // 设置运行状态
    setTimerRunning(true);
    
    // 每秒减少一秒
    const interval = setInterval(() => {
      setTimerValue((prevTime) => {
        if (prevTime <= 1) {
          // 时间到，停止计时器
          clearInterval(interval);
          setTimerRunning(false);
          setTimerInterval(null);
          // 可以添加提示音或振动
          console.log("Timer finished!");
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);

    setTimerInterval(interval);
  };

  const $timePickerActionSheet = (
    <TimePickerActionSheet
      ref={timePickerActionSheetRef}
      initialHours={Math.floor(timerValue / 3600)}
      initialMinutes={Math.floor((timerValue % 3600) / 60)}
      initialSeconds={timerValue % 60}
      onTimeSelected={onTimeSelected}
    />
  )

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    return formattedTime;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView className="flex-1 bg-gray-200">
        {/* Top Navigation Bar */}

        <ScrollView className="flex-1 p-4">
          {/* Current Device Section */}
          <View className="bg-white rounded-2xl overflow-hidden mb-4 shadow-sm">
            <TouchableOpacity
              className="flex-row justify-between items-center p-4"
              onPress={() => { }}
            >
              <View className="flex-row items-center">
                <View className="w-2 h-2 rounded-full bg-green-600 mr-1.5" />
                <Text className="text-base font-semibold text-gray-800">{selectedDevice?.name}</Text>
              </View>
              <ChevronRight size={20} color="#777" />
            </TouchableOpacity>
          </View>

          {/* Timer Section */}
          <View className="bg-white rounded-2xl overflow-hidden mb-4 shadow-sm">
            <View className="p-4 gap-y-4">
              <TouchableOpacity
                className='p-4 flex flex-row items-center justify-center'
                onPress={() => !timerRunning && timePickerActionSheetRef.current?.expand()}
                disabled={timerRunning}
              >
                <Text className={`text-5xl font-light ${timerRunning ? 'text-blue-500' : 'text-gray-800'} pt-2`}>
                  {formatTime(timerValue)}
                </Text>
              </TouchableOpacity>
              <View className="flex-row items-center justify-between ">
                <TouchableOpacity
                  className={`py-3 w-24 rounded-lg border items-center justify-center ${timerValue > 0 ? 'border-blue-500' : 'border-gray-300'
                    }`}
                  onPress={resetTimer}
                  disabled={timerValue === 0}
                >
                  <Text className={`font-semibold text-base ${timerValue > 0 ? 'text-blue-500' : 'text-gray-300'
                    }`}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  className={`py-3 w-24 rounded-lg items-center justify-center ${timerValue > 0 ? (timerRunning ? 'bg-orange-500' : 'bg-green-500') : 'bg-gray-300'
                    }`}
                  onPress={toggleTimer}
                  disabled={timerValue === 0}
                >
                  <Text className="text-white font-semibold text-base">
                    {timerRunning ? 'Pause' : 'Continue'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Mode Selection Section */}
          <View className="bg-white rounded-2xl overflow-hidden mb-4 shadow-sm">
            <View className="p-4">
              <View className="items-center mb-3.5 flex-col gap-y-2">
                {getIconByMode(selectedMode, 32, '#1e88e5')}
                <Text className="text-[22px] font-bold text-blue-500">{selectedMode}</Text>
              </View>
              <TouchableOpacity
                className="h-[50px] rounded-xl bg-blue-500 items-center justify-center mt-3"
                onPress={() => {
                  modeListActionSheetRef.current?.expand()
                }}
              >
                <Text className="font-medium text-base text-white">Mode</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Intensity Control Section */}
          <View className="bg-white rounded-2xl overflow-hidden mb-4 shadow-sm">
            <View className="p-4">
              <View className="items-center mb-3.5">
                <Text className="text-[22px] font-bold text-blue-500">
                  {intensityLevel} / {maxIntensity}
                </Text>
              </View>
              <View className="flex-row justify-between relative">
                <TouchableOpacity
                  className="w-[90px] py-4 rounded-lg bg-blue-500 items-center justify-center"
                  onPress={increaseIntensity}
                >
                  <ChevronUp size={24} color="white" />
                  <Text className="font-semibold mt-0.5 text-white">Up</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="w-[90px] py-4 rounded-lg bg-blue-500 items-center justify-center"
                  onPress={decreaseIntensity}
                >
                  <ChevronDown size={24} color="white" />
                  <Text className="font-semibold mt-0.5 text-white">Down</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>


        </ScrollView>

        {/* Mode Selection Modal */}
        {$modeActionSheet}
        {$timePickerActionSheet}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};

DevicePanelController.options = {
  topBar: {
    visible: true,
    title: {
      text: 'Muscle Master',
    },
    rightButtons: [
      {
        id: 'settings',
        icon: require('../assets/settings.png'),
        color: 'white',
      },
    ],
  },
};

export default DevicePanelController;
