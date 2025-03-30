import BottomSheet from '@gorhom/bottom-sheet';
import {
  Battery,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Smartphone,
} from 'lucide-react-native';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Subscription} from 'react-native-ble-plx';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {NavigationFunctionComponent} from 'react-native-navigation';
import {useNavigationComponentDidAppear} from 'react-native-navigation-hooks';
import {SafeAreaView} from 'react-native-safe-area-context';
import ModeListActionSheet, {
  getIconByMode,
} from '../components/mode-list-action-sheet/modeListActionSheet';
import {FoundDevice} from '../components/scan-found-device/scanFoundDevice';
import {TimePickerActionSheet} from '../components/time-picker-action-sheet/timePickerActionSheet';
import {decodeBase64Value} from '../lib/utils';
import {BLEManager} from '../services/BLEManager';
import {
  BLE_UUID,
  BLECommands,
  CommandType,
  DeviceMode,
  parseResponse,
} from '../services/protocol';
import Slider from '@react-native-community/slider';
import DeviceListActionSheet from '../components/device-list-action-sheet/deviceListActionSheet';

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

const DevicePanelController: NavigationFunctionComponent<
  DevicePanelControllerProps
> = ({componentId, devices}) => {
  const [selectedMode, setSelectedMode] = useState('Fitness');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState('75');
  const [intensityLevel, setIntensityLevel] = useState(50);
  const [maxIntensity, setMaxIntensity] = useState(100);
  const [timerValue, setTimerValue] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(
    null,
  );
  const [deviceLoadingStates, setDeviceLoadingStates] = useState<
    Record<string, boolean>
  >({});
  const [deviceVersion, setDeviceVersion] = useState('');
  useState<Subscription | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<FoundDevice | null>(
    null,
  );
  const modeListActionSheetRef = useRef<BottomSheet>(null);
  const deviceListActionSheetRef = useRef<BottomSheet>(null);

  const firstLoad = useRef(true);
  const subscriptionRef = useRef<Subscription | null>(null);

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
        ]),
      ).start();
    } else {
      pulseAnim.setValue(1);
    }

    return () => {
      pulseAnim.stopAnimation();
    };
  }, [isConnecting, pulseAnim]);

  useEffect(() => {
    if (selectedDevice) {
      const subscription = BLEManager.monitorDeviceConnection(
        selectedDevice.id,
        (device, isConnected, error) => {
          if (error) {
            console.error('Connection error:', error);
          } else {
            setIsConnected(isConnected);
            console.log(
              `Device ${device.name} is now ${
                isConnected ? 'connected' : 'disconnected'
              }`,
            );
          }
        },
      );

      return () => {
        subscription.remove();
      };
    }
  }, [selectedDevice]);

  // 获取设备状态颜色
  const getDeviceStatusColor = () => {
    if (isConnecting) {
      return '#f59e0b';
    } // 黄色，连接中
    if (isConnected) {
      return '#10b981';
    } // 绿色，已连接
    return '#ef4444'; // 红色，未连接
  };



  // 添加设备加载状态管理函数
  const setDeviceLoading = (deviceId: string, isLoading: boolean) => {
    setDeviceLoadingStates(prev => ({
      ...prev,
      [deviceId]: isLoading,
    }));
  };

  // 添加连接状态更新函数
  const updateConnectionStatus = (deviceId: string, connected: boolean) => {
    setIsConnected(connected);
    setIsConnecting(false);
    console.log(`更新设备 ${deviceId} 连接状态为：${connected}`);
  };

  // 添加服务和特性发现函数
  const discoverServicesAndCharacteristics = async (
    deviceId: string,
  ): Promise<ServiceInfo[]> => {
    try {
      // 使用 BLEManager 发现所有服务和特性
      await BLEManager.discoverAllServicesAndCharacteristics(deviceId);

      // 获取服务
      const services = await BLEManager.servicesForDevice(deviceId);
      const serviceInfos: ServiceInfo[] = [];

      // 对每个服务获取特性
      for (const service of services) {
        const characteristics = await BLEManager.characteristicsForDevice(
          deviceId,
          service.uuid,
        );

        serviceInfos.push({
          uuid: service.uuid,
          characteristicInfos: characteristics.map(char => ({uuid: char.uuid})),
        });
      }

      return serviceInfos;
    } catch (error) {
      console.error('Error discovering services and characteristics:', error);
      return [];
    }
  };

  useNavigationComponentDidAppear(async () => {
    if (firstLoad.current) {
      if (devices && devices.length > 0) {
        setSelectedDevice(devices[0]);

        // 自动连接到第一个设备
        await connectToDevice(devices[0]);
      }
      firstLoad.current = false;
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
          .catch(error => {
            console.error('Error disconnecting from device:', error);
          });

        // 清理订阅
        subscriptionRef.current?.remove();
      }
    };
  }, [isConnected, selectedDevice]); // 空依赖数组表示这个效果只在挂载和卸载时运行

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
          BLE_UUID.SERVICE,
          BLE_UUID.CHARACTERISTIC_WRITE,
          BLECommands.setIntensity(newIntensity),
        )
          .then(() => {
            console.log('Successfully wrote intensity value:', newIntensity);
          })
          .catch(error => {
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
          BLE_UUID.SERVICE,
          BLE_UUID.CHARACTERISTIC_WRITE,
          BLECommands.setIntensity(newIntensity),
        )
          .then(() => {
            console.log('Successfully wrote intensity value:', newIntensity);
          })
          .catch(error => {
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
      if (selectedDevice) {
        BLEManager.writeCharacteristic(
          selectedDevice.id,
          BLE_UUID.SERVICE,
          BLE_UUID.CHARACTERISTIC_WRITE,
          BLECommands.stopTherapy(),
        )
          .then(() => {
            console.log('Successfully stop device');
          })
          .catch(error => {
            console.error('Error stop device:', error);
          });
      }
    } else {
      // 如果计时器未运行，启动它
      startTimer();
      if (selectedDevice) {
        BLEManager.writeCharacteristic(
          selectedDevice.id,
          BLE_UUID.SERVICE,
          BLE_UUID.CHARACTERISTIC_WRITE,
          BLECommands.startTherapy(),
        )
          .then(() => {
            console.log('Successfully start device');
          })
          .catch(error => {
            console.error('Error start device:', error);
          });
      }
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

    // 停止设备
    if (selectedDevice) {
      BLEManager.writeCharacteristic(
        selectedDevice.id,
        BLE_UUID.SERVICE,
        BLE_UUID.CHARACTERISTIC_WRITE,
        BLECommands.stopTherapy(),
      )
        .then(() => {
          console.log('Successfully stop device');
        })
        .catch(error => {
          console.error('Error stop device:', error);
        });
    }
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
    if (!selectedDevice) {
      return;
    }

    if (isConnected) {
      // 设备已连接，显示两个按钮的 Alert
      Alert.alert(
        'Connected',
        `Do you want to reconnect to ${
          selectedDevice.name || 'Unnamed device'
        }?`,
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
                .catch(error => {
                  console.error('Error reconnecting:', error);
                  updateConnectionStatus(selectedDevice.id, false);
                });
            },
          },
        ],
        {cancelable: true},
      );
    } else {
      // 设备未连接，显示单个按钮的 Alert
      Alert.alert(
        'Device not connected',
        `Do you want to connect to ${selectedDevice.name || 'Unnamed device'}?`,
        [
          {
            text: 'Connect',
            onPress: async () => {
              console.log('Connecting to device');
              await connectToDevice(selectedDevice);
            },
          },
        ],
        {cancelable: true},
      );
    }
  };

  // 封装设备连接逻辑为可重用的函数
  const connectToDevice = async (device: FoundDevice) => {
    if (!device) {
      return;
    }

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

        subscriptionRef.current = BLEManager.monitorCharacteristicForDevice(
          device.id,
          BLE_UUID.SERVICE,
          BLE_UUID.CHARACTERISTIC_WRITE,
          (error, characteristic) => {
            if (error) {
              console.error('Characteristic monitoring error:', error);
            } else if (characteristic && characteristic.value) {
              console.log('value ', characteristic.value);
              const parsedResponse = parseResponse(characteristic.value);

              // 检查是否为有效响应
              if (parsedResponse.isValid) {
                // 判断命令类型
                console.log('Monitored characteristic value:', parsedResponse);
                const {command, data} = parsedResponse;
                if (command === CommandType.GET_VERSION) {
                  // 设置设备版本信息
                  if (data.length >= 2) {
                    const deviceType = data[0];
                    const vcode = data[1];

                    setDeviceVersion(
                      `${deviceType.toString().padStart(2, '0')}` +
                        ' - ' +
                        vcode.toString().padStart(2, '0'),
                    );
                  }
                }
              }
            }
          },
        );

        try {
          await BLEManager.writeCharacteristic(
            device.id,
            BLE_UUID.SERVICE,
            BLE_UUID.CHARACTERISTIC_READ,
            BLECommands.getVersion(),
          );
        } catch (error) {
          console.error('Error reading device version:', error);
        }
        // 遍历读取特性
        // for (const service of serviceInfos) {
        //   for (const characteristic of service.characteristicInfos) {
        //     const value = await BLEManager.readCharacteristic(
        //       device.id,
        //       service.uuid,
        //       characteristic.uuid,
        //     );
        //     console.log(
        //       `service UUID: ${service.uuid} characteristic UUID: ${characteristic.uuid}`,
        //     );
        //     if (value) {
        //       const decodedValue = decodeBase64Value(value);
        //       console.log(
        //         `Decoded value of ${characteristic.uuid}:`,
        //         decodedValue,
        //       );
        //     }
        //   }
        // }
      }
    } catch (error) {
      console.error(
        `Failed to ${device.connected ? 'disconnect from' : 'connect to'} ${
          device.name
        }:`,
        error,
      );
      // 更新设备连接状态为断开
      updateConnectionStatus(device.id, false);
    } finally {
      // 无论成功失败，都结束加载状态
      setDeviceLoading(device.id, false);
      setIsConnecting(false);
    }
  };

  // Handle mode selection
  const handleModeSelect = (mode: DeviceMode, name: string) => {
    setSelectedMode(name);
    modeListActionSheetRef.current?.close();

    if (selectedDevice) {
      BLEManager.writeCharacteristic(
        selectedDevice.id,
        BLE_UUID.SERVICE,
        BLE_UUID.CHARACTERISTIC_WRITE,
        BLECommands.setMode(mode),
      )
        .then(() => {
          console.log('Successfully wrote mode value:', mode);
        })
        .catch(error => {
          console.error('Error writing mode:', error);
        });
    }
  };

  const $modeActionSheet = (
    <ModeListActionSheet
      selectedMode={selectedMode}
      handleModeSelect={handleModeSelect}
      ref={modeListActionSheetRef}
    />
  );

  const timePickerActionSheetRef = useRef<BottomSheet>(null);

  const onTimeSelected = (hours: number, minutes: number, seconds: number) => {
    console.log(`Time selected: ${hours}:${minutes}:${seconds}`);
    // 计算总秒数
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;

    // 确保时间大于 0
    if (totalSeconds > 0) {
      // 设置时间值
      setTimerValue(totalSeconds);

      // 设置工作时间
      if (selectedDevice) {
        BLEManager.writeCharacteristic(
          selectedDevice.id,
          BLE_UUID.SERVICE,
          BLE_UUID.CHARACTERISTIC_WRITE,
          BLECommands.setWorkTime(totalSeconds),
        )
          .then(() => {
            console.log('Successfully set work time');
          })
          .catch(error => {
            console.error('Error setting work time:', error);
          });
      }

      // 使用短延迟确保 UI 更新
      // setTimeout(() => {
      //   console.log('Starting timer with', totalSeconds, 'seconds');
      //   // 创建一个直接使用 totalSeconds 的自定义启动函数
      //   startTimerWithValue(totalSeconds);
      // }, 300);
    }
  };

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
      setTimerValue(prevTime => {
        if (prevTime <= 1) {
          // 时间到，停止计时器
          clearInterval(interval);
          setTimerRunning(false);
          setTimerInterval(null);
          // 可以添加提示音或振动
          console.log('Timer finished!');

          // 停止设备
          if (selectedDevice) {
            BLEManager.writeCharacteristic(
              selectedDevice.id,
              BLE_UUID.SERVICE,
              BLE_UUID.CHARACTERISTIC_WRITE,
              BLECommands.stopTherapy(),
            )
              .then(() => {
                console.log('Successfully stop device');
              })
              .catch(error => {
                console.error('Error stop device:', error);
              });
          }

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
  );

  

  const handleDeviceSelect = useCallback((device: FoundDevice) => {
    // Handle device selection logic here
    console.log('Selected device:', device);
  }, []);

  const $deviceListActionSheet = (
    <DeviceListActionSheet
      ref={deviceListActionSheetRef}
      devices={devices}
      selectedDevice={selectedDevice}
      isConnected={isConnected}
      deviceLoadingStates={deviceLoadingStates}
      handleDeviceSelect={handleDeviceSelect}
    />
  );

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  };

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
              transform: [{scale: pulseAnim}],
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
            marginRight: 6,
          }}
        />
        <Text
          className={`text-xs ${
            isConnected ? 'text-green-600' : 'text-red-500'
          }`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </Text>
      </View>
    );
  };

  const [deviceModalVisible, setDeviceModalVisible] = useState(false);

  const $deviceInfo = (
    <View className="bg-white rounded-2xl border border-gray-200">
      <TouchableOpacity
        className="flex-row justify-between items-center p-4"
        onPress={() => {
          handleDeviceNamePress();
        }}>
        <View className="flex-row items-center">
          {renderDeviceStatusIndicator()}
          <Text className="text-base font-semibold text-gray-800 ml-2">
            {selectedDevice?.name || 'No device selected'}
            {deviceVersion && ` (${deviceVersion})`}
          </Text>
        </View>
        <View className="flex-row items-center">
          <Battery size={16} color="#777" />
          <Text className="text-sm text-gray-500 ml-1">{batteryLevel}%</Text>
          <ChevronRight size={20} color="#777" className="ml-2" />
        </View>
      </TouchableOpacity>
    </View>
  );

  /*
  *  font-size: 60px;
            font-weight: 700;
            color: #333;
            letter-spacing: 2px;
  * */
  const $timerValue = (
    <TouchableOpacity
      className="p-4 flex flex-row items-center justify-center"
      onPress={() =>
        !timerRunning && timePickerActionSheetRef.current?.expand()
      }
      disabled={timerRunning}>
      <Text
        className={`text-8xl ${
          timerRunning ? 'text-orange-500' : '#333'
        } font-bold`}>
        {formatTime(timerValue)}
      </Text>
    </TouchableOpacity>
  );

  const $intensityControl = (
    <View className="flex-col border border-gray-200 rounded-2xl">
      <View className="flex-row justify-between items-center relative gap-x-3">
        <TouchableOpacity
          className="h-14 w-14 rounded-full bg-white items-center justify-center"
          onPress={decreaseIntensity}>
          <ChevronLeft size={24} color="black" />
        </TouchableOpacity>

        <TouchableOpacity
          className="flex-1 py-4 rounded-xl bg-white items-center justify-center"
          onPress={() => {
            modeListActionSheetRef.current?.expand();
          }}>
          <Text className="font-semibold text-2xl text-black">
            {selectedMode}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="h-14 w-14 rounded-full bg-white items-center justify-center"
          onPress={increaseIntensity}>
          <ChevronRight size={24} color="black" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const $intensityControlSlider = (
    <View className="flex-col gap-y-2">
      <View className="flex-row items-center justify-center">
        <Text className="text-lg font-semibold text-blue-500">
          {intensityLevel}
        </Text>
      </View>
      <Slider
        className="w-full"
        minimumValue={0}
        maximumValue={100}
        value={intensityLevel}
        step={1}
        onValueChange={setIntensityLevel}
        minimumTrackTintColor="#1e88e5"
        maximumTrackTintColor="#FFF"
      />

      <View className="flex-row items-center justify-between ">
        <Text className="text-lg font-semibold text-blue-500">1</Text>
        <Text className="text-lg font-semibold text-blue-500">100</Text>
      </View>
    </View>
  );

  const $startAndPauseActivity = (
    <TouchableOpacity
      className={`py-4 rounded-lg items-center justify-center ${
        timerValue > 0
          ? timerRunning
            ? 'bg-orange-500'
            : 'bg-green-500'
          : 'bg-gray-400'
      }`}
      onPress={toggleTimer}
      disabled={timerValue === 0}>
      <Text className="text-white font-semibold text-xl">
        {timerRunning ? 'Pause' : 'Continue'}
      </Text>
    </TouchableOpacity>
  );

  const $cancelActivity = (
    <TouchableOpacity
      className={`items-center justify-center ${
        timerValue > 0 ? 'border-blue-500' : 'border-gray-300'
      }`}
      onPress={resetTimer}
      disabled={timerValue === 0}>
      <Text
        className={`font-semibold text-base ${
          timerValue > 0 ? 'text-blue-500' : 'text-gray-500'
        }`}>
        Cancel
      </Text>
    </TouchableOpacity>
  );

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaView className="flex-1 bg-gray-200">
        <View className={'flex flex-1 flex-col justify-between p-4'}>
          {$deviceInfo}
          <View className={'flex flex-1 flex-col  justify-around'}>
            {$timerValue}
            {$intensityControl}
            {$intensityControlSlider}
          </View>

          <View className="flex-col gap-y-4">
            {$startAndPauseActivity}
            {$cancelActivity}
          </View>
        </View>

    
        {$modeActionSheet}
        {$timePickerActionSheet}
        {$deviceListActionSheet}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};

DevicePanelController.options = {
  topBar: {
    visible: true,
    title: {
      text: 'GuGeer Device',
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
