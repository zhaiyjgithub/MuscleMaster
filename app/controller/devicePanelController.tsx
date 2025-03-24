import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  Animated,
  Alert
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
import { decodeBase64Value, encodeBase64Value } from '../lib/utils';
import { BLE_UUID_SHORT, Commands, CommandType, DeviceMode } from '../services/protocol';

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

const DevicePanelController: NavigationFunctionComponent<DevicePanelControllerProps> = ({ componentId, devices }) => {
  const [selectedMode, setSelectedMode] = useState('Fitness');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(75);
  const [intensityLevel, setIntensityLevel] = useState(7);
  const [maxIntensity, setMaxIntensity] = useState(10);
  const [timerValue, setTimerValue] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [deviceLoadingStates, setDeviceLoadingStates] = useState<Record<string, boolean>>({});
  
  const firstLoad = useRef(true);

  // 创建一个动画值用于状态指示器的呼吸效果
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // 状态指示器的呼吸动画
  useEffect(() => {
    if (isConnecting) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.5,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }

    return () => {
      pulseAnim.stopAnimation();
    };
  }, [isConnecting, pulseAnim]);

  // 获取设备状态颜色
  const getDeviceStatusColor = () => {
    if (isConnecting) return '#f59e0b'; // 黄色，连接中
    if (isConnected) return '#10b981';  // 绿色，已连接
    return '#ef4444';                    // 红色，未连接
  };

  const modeListActionSheetRef = useRef<BottomSheet>(null);

  // 添加设备加载状态管理函数
  const setDeviceLoading = (deviceId: string, isLoading: boolean) => {
    setDeviceLoadingStates(prev => ({
      ...prev,
      [deviceId]: isLoading
    }));
  };

  // 添加连接状态更新函数
  const updateConnectionStatus = (deviceId: string, connected: boolean) => {
    setIsConnected(connected);
    setIsConnecting(false);
    console.log(`更新设备 ${deviceId} 连接状态为：${connected}`);
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
    if (firstLoad.current) {  
      if (devices && devices.length > 0) {
        setSelectedDevice(devices[0]);

        // 自动连接到第一个设备
        connectToDevice(devices[0]);
      }
      firstLoad.current = false
    }
  });

  useEffect(() => {
    // 组件挂载时的代码...
    
    // 返回清理函数，当组件即将卸载时执行
    return () => {
      console.log('Component unmounting, disconnecting from device');
      
      if (selectedDevice && isConnected) {
        // 使用 Promise 而不是 await，因为清理函数不能是 async
        BLEManager.disconnectDevice(selectedDevice.id)
          .then(() => {
            console.log('Successfully disconnected from device');
          })
          .catch((error) => {
            console.error('Error disconnecting from device:', error);
          });
      }
    };
  }, []); // 空依赖数组表示这个效果只在挂载和卸载时运行

  // Increase intensity level
  const increaseIntensity = () => {
    if (intensityLevel < maxIntensity) {
      const newIntensity = intensityLevel + 1;
      setIntensityLevel(newIntensity);

      // 写入强度到设备
      if (selectedDevice) {
        // 使用智能写入方法，自动选择合适的写入模式
        BLEManager.writeCharacteristic(
          selectedDevice.id,
          BLE_UUID_SHORT.SERVICE,
          BLE_UUID_SHORT.CHARACTERISTIC_WRITE,
          Commands.setIntensity(newIntensity)
        ).then(() => {
          console.log('Successfully wrote intensity value:', newIntensity);
        }).catch(error => {
          console.error('Error writing intensity:', error);
        });
      }
    }
  };

  // Decrease intensity level
  const decreaseIntensity = () => {
    if (intensityLevel > 1) {
      const newIntensity = intensityLevel - 1;  
      setIntensityLevel(newIntensity);

      // 写入强度到设备
      if (selectedDevice) {
        BLEManager.writeCharacteristic(
          selectedDevice.id,
          BLE_UUID_SHORT.SERVICE,
          BLE_UUID_SHORT.CHARACTERISTIC_WRITE,
          Commands.setIntensity(newIntensity)
        ).then(() => {
          console.log('Successfully wrote intensity value:', newIntensity);
        }).catch(error => {
          console.error('Error writing intensity:', error); 
        });
      }
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
  // 添加设备名称点击处理函数
  const handleDeviceNamePress = () => {
    if (!selectedDevice) return;

    if (isConnected) {
      // 设备已连接，显示两个按钮的 Alert
      Alert.alert(
        'Connected',
        `Do you want to reconnect to ${selectedDevice.name || 'Unnamed device'}?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Reconnect',
            style: 'destructive',
            onPress: () => {
              console.log('Reconnecting device');
              // 先断开连接
              BLEManager.disconnectDevice(selectedDevice.id)
                .then(() => {
                  // 更新连接状态
                  setIsConnected(false);
                  updateConnectionStatus(selectedDevice.id, false);
                  // 然后重新连接
                  return connectToDevice(selectedDevice);
                })
                .catch((error) => {
                  console.error('Error reconnecting:', error);
                  updateConnectionStatus(selectedDevice.id, false);
                });
            },
          },
        ],
        { cancelable: true }
      );
    } else {
      // 设备未连接，显示单个按钮的 Alert
      Alert.alert(
        'Device not connected',
        `Do you want to connect to ${selectedDevice.name || 'Unnamed device'}?`,
        [
          {
            text: 'Connect',
            onPress: () => {
              console.log('Connecting to device');
              connectToDevice(selectedDevice);
            },
          },
        ],
        { cancelable: true }
      );
    }
  };



  // 封装设备连接逻辑为可重用的函数
  const connectToDevice = async (device: FoundDevice) => {
    if (!device) return;

    try {
      // 设置连接中状态
      setIsConnecting(true);
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
        for (const service of serviceInfos) {
          for (const characteristic of service.characteristicInfos) {
            const value = await BLEManager.readCharacteristic(device.id, service.uuid, characteristic.uuid);
            console.log(`service UUID: ${service.uuid} characteristic UUID: ${characteristic.uuid}`);
            if (value) {
              const decodedValue = decodeBase64Value(value);
              console.log(`Decoded value of ${characteristic.uuid}:`, decodedValue);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Failed to ${device.connected ? 'disconnect from' : 'connect to'} ${device.name}:`, error);
      // 更新设备连接状态为断开
      updateConnectionStatus(device.id, false);
    } finally {
      // 无论成功失败，都结束加载状态
      setDeviceLoading(device.id, false);
      setIsConnecting(false);
    }
  };

  // Handle mode selection
  const handleModeSelect = (mode: DeviceMode, name: string, icon: any) => {
    setSelectedMode(name);
    modeListActionSheetRef.current?.close();

    if (selectedDevice) {
      BLEManager.writeCharacteristic(
        selectedDevice.id,
        BLE_UUID_SHORT.SERVICE,
        BLE_UUID_SHORT.CHARACTERISTIC_WRITE,
        Commands.setMode(mode)
      ).then(() => {
        console.log('Successfully wrote mode value:', mode);
      }).catch(error => {
        console.error('Error writing mode:', error);
      });
    } 
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

  // 渲染设备状态指示器
  const renderDeviceStatusIndicator = () => {
    const statusColor = getDeviceStatusColor();

    if (isConnecting) {
      return (
        <View className="flex-row items-center">
          <Animated.View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: statusColor,
              marginRight: 6,
              transform: [{ scale: pulseAnim }]
            }}
          />
          <Text className="text-yellow-500 text-xs">Connecting...</Text>
        </View>
      );
    }

    return (
      <View className="flex-row items-center">
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: statusColor,
            marginRight: 6
          }}
        />
        <Text className={`text-xs ${isConnected ? 'text-green-600' : 'text-red-500'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </Text>
      </View>
    );
  };

  const [deviceModalVisible, setDeviceModalVisible] = useState(false);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView className="flex-1 bg-gray-200">

        <ScrollView className="flex-1 p-4">
          {/* Current Device Section */}
          <View className="bg-white rounded-2xl overflow-hidden mb-4 shadow-sm">
            <TouchableOpacity
              className="flex-row justify-between items-center p-4"
              onPress={() => {
                handleDeviceNamePress();
              }}
            >
              <View className="flex-row items-center">
                {renderDeviceStatusIndicator()}
                <Text className="text-base font-semibold text-gray-800 ml-2">{selectedDevice?.name || 'No device selected'}</Text>
              </View>
              <ChevronRight size={20} color="#777" />
            </TouchableOpacity>
          </View>

          {/* 设备选择弹窗 */}
          <Modal
            animationType="slide"
            transparent={true}
            visible={deviceModalVisible}
            onRequestClose={() => setDeviceModalVisible(false)}
          >
            <View className="flex-1 bg-black bg-opacity-40 justify-end">
              <View className="bg-white rounded-t-2xl p-5 max-h-[80%]">
                <View className="flex-row justify-center mb-5 relative">
                  <Text className="font-semibold text-lg">Select Device</Text>
                  <TouchableOpacity
                    onPress={() => setDeviceModalVisible(false)}
                    className="absolute right-0 top-0"
                  >
                    <Text className="text-2xl font-medium">×</Text>
                  </TouchableOpacity>
                </View>

                <View className="mb-5">
                  {devices.map((device) => {
                    const isLoading = deviceLoadingStates[device.id] || false;
                    const isCurrentDevice = selectedDevice?.id === device.id;
                    const isDeviceConnected = isCurrentDevice && isConnected;

                    return (
                      <TouchableOpacity
                        key={device.id}
                        className={`flex-row items-center p-4 rounded-xl mb-3 ${isCurrentDevice
                          ? 'bg-blue-50 border border-blue-200'
                          : 'bg-gray-100'
                          }`}
                        onPress={() => {

                        }}
                        disabled={isLoading}
                      >
                        <Smartphone size={24} color="#1e88e5" />
                        <View className="flex-1 ml-3">
                          <Text className="font-semibold text-base text-gray-800 mb-1">{device.name}</Text>
                          <View className="flex-row items-center">
                            {isLoading ? (
                              <View className="flex-row items-center">
                                <ActivityIndicator size="small" color="#f59e0b" />
                                <Text className="text-sm text-yellow-500 ml-2">Connecting...</Text>
                              </View>
                            ) : (
                              <View className="flex-row items-center">
                                <View
                                  className={`w-2 h-2 rounded-full mr-1.5 ${isDeviceConnected ? 'bg-green-500' : 'bg-red-500'
                                    }`}
                                />
                                <Text className="text-sm text-gray-600">
                                  {isDeviceConnected ? 'Connected' : 'Disconnected'}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <Text className="text-sm text-green-600 font-medium">
                          {isDeviceConnected ? 'Selected' : 'Select'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  className="bg-blue-500 rounded-lg py-3.5 items-center"
                  onPress={() => setDeviceModalVisible(false)}
                >
                  <Text className="text-white font-medium text-base">Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

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
