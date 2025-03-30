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
  // 设备特定的定时器状态
  const [deviceTimerValues, setDeviceTimerValues] = useState<Record<string, number>>({});
  const [deviceTimerRunning, setDeviceTimerRunning] = useState<Record<string, boolean>>({});
  const [deviceTimerIntervals, setDeviceTimerIntervals] = useState<Record<string, NodeJS.Timeout | null>>({});
  
  const [deviceLoadingStates, setDeviceLoadingStates] = useState<
    Record<string, boolean>
  >({});
  const [deviceConnectionStates, setDeviceConnectionStates] = useState<
    Record<string, boolean>
  >({});
  const [deviceVersion, setDeviceVersion] = useState('');
  useState<Subscription | null>(null);
  // 存储每个设备的特性监控订阅
  const [deviceSubscriptions, setDeviceSubscriptions] = useState<Record<string, Subscription | null>>({});
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

  // 修改为设备特定的连接监控
  useEffect(() => {
    // 为所有已连接设备创建连接监控
    const setupConnectionMonitors = async () => {
      // 获取所有已连接设备
      const connectedDeviceIds = Object.entries(deviceConnectionStates)
        .filter(([_, isConnected]) => isConnected)
        .map(([id]) => id);

      // 防止重复创建相同的监控
      for (const deviceId of connectedDeviceIds) {
        // 如果已经有这个设备的监控，跳过
        if (deviceSubscriptions[`conn_${deviceId}`]) {
          continue;
        }
        
        // 创建或更新设备的连接监控
        const device = devices.find(d => d.id === deviceId);
        if (device) {
          const subscription = BLEManager.monitorDeviceConnection(
            deviceId,
            (device, isConnected, error) => {
              if (error) {
                console.error(`Connection error for device ${deviceId}:`, error);
              } else {
                // 使用函数形式的 setState 以避免依赖最新的 state
                setDeviceConnectionStates(prev => ({
                  ...prev,
                  [device.id]: isConnected,
                }));
                
                // 如果当前选中的设备状态改变，更新整体连接状态显示
                if (selectedDevice && selectedDevice.id === device.id) {
                  setIsConnected(isConnected);
                }
                
                setIsConnecting(false);
                console.log(
                  `Device ${device.name} is now ${
                    isConnected ? 'connected' : 'disconnected'
                  }`,
                );

                // 如果设备断开连接，清理其特性监控
                if (!isConnected) {
                  cleanupDeviceSubscription(deviceId);
                }
              }
            },
          );

          // 存储设备的连接监控订阅
          setDeviceSubscriptions(prev => ({
            ...prev,
            [`conn_${deviceId}`]: subscription,
          }));
        }
      }
    };

    setupConnectionMonitors();

    // 组件卸载时清理所有监控
    return () => {
      console.log('Component unmounting, disconnecting from all devices');
      Object.entries(deviceSubscriptions).forEach(([key, subscription]) => {
        if (subscription) {
          subscription.remove();
        }
      });
    };
  // 移除对 deviceConnectionStates 的依赖，只在 devices 或组件挂载时设置监控
  }, [devices, deviceSubscriptions, selectedDevice]);

  // 设备特性监控的创建函数
  const setupCharacteristicMonitor = useCallback((deviceId: string) => {
    // 如果已经有监控，不重复创建
    if (deviceSubscriptions[`char_${deviceId}`]) {
      return;
    }

    const subscription = BLEManager.monitorCharacteristicForDevice(
      deviceId,
      BLE_UUID.SERVICE,
      BLE_UUID.CHARACTERISTIC_WRITE,
      (error, characteristic) => {
        if (error) {
          console.error(`Characteristic monitoring error for device ${deviceId}:`, error);
        } else if (characteristic && characteristic.value) {
          console.log(`Received value from device ${deviceId}:`, characteristic.value);
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

                // 只在选中设备时更新 UI 显示的版本
                if (selectedDevice?.id === deviceId) {
                  setDeviceVersion(
                    `${deviceType.toString().padStart(2, '0')}` +
                      ' - ' +
                      vcode.toString().padStart(2, '0'),
                  );
                }
              }
            }
          }
        }
      },
    );

    // 存储设备的特性监控订阅
    setDeviceSubscriptions(prev => ({
      ...prev,
      [`char_${deviceId}`]: subscription,
    }));
  }, [deviceSubscriptions, selectedDevice]);

  // 清理设备的特性监控
  const cleanupDeviceSubscription = useCallback((deviceId: string) => {
    const charSubscription = deviceSubscriptions[`char_${deviceId}`];
    if (charSubscription) {
      charSubscription.remove();
      setDeviceSubscriptions(prev => {
        const newState = {...prev};
        delete newState[`char_${deviceId}`];
        return newState;
      });
    }
  }, [deviceSubscriptions]);

  // 获取设备状态颜色
  const getDeviceStatusColor = () => {
    if (isConnecting) {
      return '#f59e0b';
    } // 黄色，连接中
    
    // 检查当前选中设备的连接状态
    if (selectedDevice && getDeviceConnectionStatus(selectedDevice.id)) {
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

  // 更新连接状态的函数也需修改
  const updateConnectionStatus = (deviceId: string, connected: boolean) => {
    // 使用函数形式的 setState 以避免依赖最新的 state
    setDeviceConnectionStates(prev => {
      // 如果状态没有变化，返回原状态，避免不必要的重渲染
      if (prev[deviceId] === connected) {
        return prev;
      }
      return {
        ...prev,
        [deviceId]: connected,
      };
    });
    
    // 如果当前选中的设备状态改变，更新整体连接状态显示
    if (selectedDevice && selectedDevice.id === deviceId) {
      setIsConnected(connected);
    }
    
    setIsConnecting(false);
    console.log(`更新设备 ${deviceId} 连接状态为：${connected}`);
  };

  // 获取特定设备的连接状态
  const getDeviceConnectionStatus = (deviceId: string): boolean => {
    return deviceConnectionStates[deviceId] || false;
  };

  // 获取设备特定的定时器值
  const getDeviceTimerValue = (deviceId: string): number => {
    return deviceTimerValues[deviceId] || 0;
  };

  // 获取设备特定的定时器运行状态
  const isDeviceTimerRunning = (deviceId: string): boolean => {
    return deviceTimerRunning[deviceId] || false;
  };

  // 设置设备特定的定时器值
  const setDeviceTimerValue = (deviceId: string, value: number) => {
    setDeviceTimerValues(prev => ({
      ...prev,
      [deviceId]: value,
    }));
    
    // 如果是当前选中的设备，同时更新 UI 显示的值
    if (selectedDevice?.id === deviceId) {
      setTimerValue(value);
    }
  };

  // 设置设备特定的定时器运行状态
  const setDeviceTimerRunningState = (deviceId: string, isRunning: boolean) => {
    setDeviceTimerRunning(prev => ({
      ...prev,
      [deviceId]: isRunning,
    }));
    
    // 如果是当前选中的设备，同时更新 UI 显示的状态
    if (selectedDevice?.id === deviceId) {
      setTimerRunning(isRunning);
    }
  };

  // 保存设备特定的定时器间隔
  const setDeviceTimerInterval = (deviceId: string, interval: NodeJS.Timeout | null) => {
    setDeviceTimerIntervals(prev => ({
      ...prev,
      [deviceId]: interval,
    }));
  
  };

  // 同步当前选中设备的定时器状态到 UI
  useEffect(() => {
    if (selectedDevice) {
      const deviceId = selectedDevice.id;
      // 同步定时器值和运行状态
      console.log(`同步设备 ${deviceId} 定时器状态到 UI，当前值：${getDeviceTimerValue(deviceId)}，运行状态：${isDeviceTimerRunning(deviceId)}`);
      setTimerValue(getDeviceTimerValue(deviceId));
      setTimerRunning(isDeviceTimerRunning(deviceId));
    }
  }, [selectedDevice, deviceTimerValues, deviceTimerRunning]);

  // 同步当前设备的连接状态
  useEffect(() => {
    if (selectedDevice) {
      setIsConnected(getDeviceConnectionStatus(selectedDevice.id));
    }
  }, [selectedDevice, deviceConnectionStates]);

  // 添加一个标记，确保自动连接只执行一次
  const autoConnectExecuted = useRef(false);

  useNavigationComponentDidAppear(async (e) => {
    // 确保自动连接只执行一次
    if (!autoConnectExecuted.current) {
      if (devices && devices.length > 0) {
        console.log('Auto-connecting to first device', devices[0].name);
        setSelectedDevice(devices[0]);

        // 自动连接到第一个设备
        await connectToDevice(devices[0]);
      }
      autoConnectExecuted.current = true;
    }
  });

  useEffect(() => {
    // 组件挂载时的代码...

    // 返回清理函数，当组件即将卸载时执行
    return () => {
      console.log('Component unmounting cleanup');
      
      const disconnectDevices = async () => {
        // 断开所有已连接设备
        const connectedDeviceIds = Object.entries(deviceConnectionStates)
          .filter(([_, isConnected]) => isConnected)
          .map(([id]) => id);
        
        for (const deviceId of connectedDeviceIds) {
          try {
            await BLEManager.disconnectDevice(deviceId);
            console.log(`Successfully disconnected from device ${deviceId}`);
          } catch (error) {
            console.error(`Error disconnecting from device ${deviceId}:`, error);
          }
        }
      };
      
      // 异步执行断开连接，不要在清理函数中等待
      disconnectDevices().catch(console.error);
      
      // 清理所有设备订阅 - 这里不要 setState，避免引起新的渲染循环
      Object.entries(deviceSubscriptions).forEach(([key, subscription]) => {
        if (subscription) {
          subscription.remove();
        }
      });
    };
  }, []); // 空依赖数组，确保清理函数只在组件卸载时运行

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

  // Toggle timer state (start/pause) for the selected device
  const toggleTimer = () => {
    if (!selectedDevice) return;
    
    const deviceId = selectedDevice.id;
    const isRunning = isDeviceTimerRunning(deviceId);
    
    if (isRunning) {
      // 如果计时器正在运行，暂停它
      pauseTimer(deviceId);
      if (selectedDevice) {
        BLEManager.writeCharacteristic(
          deviceId,
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
      startTimer(deviceId);
      if (selectedDevice) {
        BLEManager.writeCharacteristic(
          deviceId,
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

  // 启动设备特定的计时器
  const startTimer = (deviceId: string) => {
    // 只有当时间大于 0 时才启动计时器
    const timerValue = getDeviceTimerValue(deviceId);
    if (timerValue <= 0) {
      console.log("Timer value is 0, can't start timer");
      return;
    }

    // 使用通用启动方法，传入设备ID和当前时间值
    startTimerWithValue(deviceId, timerValue);
  };

  // 暂停设备特定的计时器
  const pauseTimer = (deviceId: string) => {
    const interval = deviceTimerIntervals[deviceId];
    if (interval) {
      clearInterval(interval);
      setDeviceTimerInterval(deviceId, null);
    }
    setDeviceTimerRunningState(deviceId, false);
  };

  // Reset timer for a specific device
  const resetTimer = () => {
    if (!selectedDevice) return;
    
    const deviceId = selectedDevice.id;
    // 停止计时器
    const interval = deviceTimerIntervals[deviceId];
    if (interval) {
      clearInterval(interval);
      setDeviceTimerInterval(deviceId, null);
    }
    setDeviceTimerValue(deviceId, 0);
    setDeviceTimerRunningState(deviceId, false);
    timePickerActionSheetRef.current?.expand();

    // 停止设备
    BLEManager.writeCharacteristic(
      deviceId,
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
  };

  // 在组件卸载时清除所有设备的定时器
  useEffect(() => {
    return () => {
      // 清除所有设备的定时器
      Object.entries(deviceTimerIntervals).forEach(([_, interval]) => {
        if (interval) {
          clearInterval(interval);
        }
      });
    };
  }, [deviceTimerIntervals]);

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
  const connectToDevice = useCallback(async (device: FoundDevice) => {
    if (!device) {
      return;
    }

    try {
      // 如果设备已经连接，不重复连接
      if (deviceConnectionStates[device.id]) {
        console.log(`设备 ${device.name} 已经连接，无需重复连接`);
        return;
      }

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

        // 为设备创建特性监控
        setupCharacteristicMonitor(device.id);

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
  }, [deviceConnectionStates, setupCharacteristicMonitor]);

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
    if (!selectedDevice) return;
    
    console.log(`Time selected: ${hours}:${minutes}:${seconds}`);
    // 计算总秒数
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;

    // 确保时间大于 0
    if (totalSeconds > 0) {
      // 设置设备特定的时间值
      setDeviceTimerValue(selectedDevice.id, totalSeconds);

      // 设置工作时间
      BLEManager.writeCharacteristic(
        selectedDevice.id,
        BLE_UUID.SERVICE,
        BLE_UUID.CHARACTERISTIC_WRITE,
        BLECommands.setWorkTime(totalSeconds),
      )
        .then(() => {
          console.log('Successfully set work time');
          
          // 自动启动计时器和设备
          startTimer(selectedDevice.id);
          BLEManager.writeCharacteristic(
            selectedDevice.id,
            BLE_UUID.SERVICE,
            BLE_UUID.CHARACTERISTIC_WRITE,
            BLECommands.startTherapy(),
          )
            .then(() => {
              console.log('Successfully started device after setting time');
            })
            .catch(error => {
              console.error('Error starting device after setting time:', error);
            });
        })
        .catch(error => {
          console.error('Error setting work time:', error);
        });
    }
  };

  // 启动特定设备的计时器，使用指定的时间值
  const startTimerWithValue = (deviceId: string, seconds: number) => {
    // 确认有时间可以倒计时
    if (seconds <= 0) {
      console.log("Timer value is 0, can't start timer");
      return;
    }

    // 如果已经有一个计时器在运行，先清除它
    const existingInterval = deviceTimerIntervals[deviceId];
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // 设置运行状态
    setDeviceTimerRunningState(deviceId, true);

    // 每秒减少一秒
    const interval = setInterval(() => {
      setDeviceTimerValues(prev => {
        const prevTime = prev[deviceId] || 0;
        if (prevTime <= 1) {
          // 时间到，停止计时器
          clearInterval(interval);
          
          // 更新状态
          setDeviceTimerRunningState(deviceId, false);
          setDeviceTimerInterval(deviceId, null);
          
          // 如果是当前选中的设备，直接更新UI显示的值
          if (selectedDevice?.id === deviceId) {
            setTimerValue(0);
          }
          
          // 可以添加提示音或振动
          console.log('Timer finished for device:', deviceId);

          // 停止设备
          BLEManager.writeCharacteristic(
            deviceId,
            BLE_UUID.SERVICE,
            BLE_UUID.CHARACTERISTIC_WRITE,
            BLECommands.stopTherapy(),
          )
            .then(() => {
              console.log('Successfully stopped device after timer finished');
            })
            .catch(error => {
              console.error('Error stopping device after timer finished:', error);
            });

          return {
            ...prev,
            [deviceId]: 0
          };
        }
        
        const newValue = prevTime - 1;
        
        // 如果是当前选中的设备，直接更新 UI 显示的值
        if (selectedDevice?.id === deviceId) {
          setTimerValue(newValue);
        }
        
        return {
          ...prev,
          [deviceId]: newValue
        };
      });
    }, 1000);

    setDeviceTimerInterval(deviceId, interval);
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
    console.log('Selected device:', device);
    
    // 保存之前设备的状态
    if (selectedDevice) {
      console.log(`离开设备 ${selectedDevice.id}，定时器值：${timerValue}，运行状态：${timerRunning}`);
    }
    
    // 设置新的选中设备
    setSelectedDevice(device);
    
    // 更新连接状态显示
    setIsConnected(getDeviceConnectionStatus(device.id));
    
    // 更新定时器显示（由 useEffect 处理详细同步）
    console.log(`切换到设备 ${device.id}，定时器值：${getDeviceTimerValue(device.id)}，运行状态：${isDeviceTimerRunning(device.id)}`);
    
    // 如果设备未连接，则连接
    if (!getDeviceConnectionStatus(device.id)) {
      connectToDevice(device);
    }
  }, [deviceConnectionStates, deviceTimerValues, deviceTimerRunning, selectedDevice, timerValue, timerRunning]);

  const $deviceListActionSheet = (
    <DeviceListActionSheet
      ref={deviceListActionSheetRef}
      devices={devices}
      selectedDevice={selectedDevice}
      deviceConnectionStates={deviceConnectionStates}
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
    const isCurrentDeviceConnected = selectedDevice ? 
      getDeviceConnectionStatus(selectedDevice.id) : false;

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
            isCurrentDeviceConnected ? 'text-green-600' : 'text-red-500'
          }`}>
          {isCurrentDeviceConnected ? 'Connected' : 'Disconnected'}
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
          deviceListActionSheetRef.current?.expand();
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

  const $timerValue = (
    <View className="flex-row items-center justify-center p-4">
      <TouchableOpacity
      className="p-4 flex flex-row items-center justify-center bg-white rounded-2xl"
      onPress={() =>
        !timerRunning && timePickerActionSheetRef.current?.expand()
      }
      disabled={timerRunning}>
      <Text
        className={`text-8xl ${
          timerRunning ? 'text-orange-500' : 'text-gray-700'
        } font-bold pt-4`}>
        {formatTime(timerValue)}
      </Text>
    </TouchableOpacity>
    </View>
  );

  const $intensityControl = (
    <View className="flex-col border-gray-200 rounded-2xl">
      <View className="flex-row justify-between items-center relative gap-x-3">
        <TouchableOpacity
          className="h-14 w-14 rounded-full bg-blue-500 items-center justify-center"
          onPress={decreaseIntensity}>
          <ChevronLeft size={24} color="white" />
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
          className="h-14 w-14 rounded-full bg-blue-500 items-center justify-center"
          onPress={increaseIntensity}>
          <ChevronRight size={24} color="white" />
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
        onValueChange={value => {
          // 只更新本地状态，不触发设备通信
          // setIntensityLevel(value);
          console.log('intensityLevel', value);
        }}
        onSlidingComplete={value => {
          // 滑动完成后，向设备发送新的强度值
          setIntensityLevel(value);
          if (selectedDevice) {
            BLEManager.writeCharacteristic(
              selectedDevice.id,
              BLE_UUID.SERVICE,
              BLE_UUID.CHARACTERISTIC_WRITE,
              BLECommands.setIntensity(value),
            )
              .then(() => {
                console.log('Successfully wrote intensity value:', value);
              })
              .catch(error => {
                console.error('Error writing intensity:', error);
              });
          }
        }}
        minimumTrackTintColor="#1e88e5"
        maximumTrackTintColor="#f5f5f5"
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
      <SafeAreaView className="flex-1 bg-[#f5f5f5]">
        <View className={'flex flex-1 flex-col justify-between p-4'}>
          {$deviceInfo}
          <View className={'flex flex-1 flex-col gap-y-6 mt-8'}>
            {$timerValue}
            <View className="flex-col gap-y-4 p-4 bg-white rounded-2xl">
              {$intensityControl}
              {$intensityControlSlider}
            </View>
          </View>

          <View className="flex-col gap-y-6">
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
      text: 'Panel',
    },
    // rightButtons: [
    //   {
    //     id: 'settings',
    //     icon: require('../assets/settings.png'),
    //     color: 'white',
    //   },
    // ],
  },
};

export default DevicePanelController;
