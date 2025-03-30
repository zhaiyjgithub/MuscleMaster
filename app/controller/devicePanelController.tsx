import BottomSheet from '@gorhom/bottom-sheet';
import Slider from '@react-native-community/slider';
import {Battery, ChevronLeft, ChevronRight} from 'lucide-react-native';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Animated, Text, TouchableOpacity, View} from 'react-native';
import {Subscription} from 'react-native-ble-plx';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {NavigationFunctionComponent} from 'react-native-navigation';
import {
  useNavigationComponentDidAppear,
  useNavigationComponentDidDisappear,
} from 'react-native-navigation-hooks';
import {SafeAreaView} from 'react-native-safe-area-context';
import DeviceListActionSheet from '../components/device-list-action-sheet/deviceListActionSheet';
import ModeListActionSheet from '../components/mode-list-action-sheet/modeListActionSheet';
import {FoundDevice} from '../components/scan-found-device/scanFoundDevice';
import {TimePickerActionSheet} from '../components/time-picker-action-sheet/timePickerActionSheet';
import {BLEManager} from '../services/BLEManager';
import {
  BLE_UUID,
  BLECommands,
  CommandType,
  DeviceMode,
  parseResponse,
} from '../services/protocol';

export interface DevicePanelControllerProps {
  devices: FoundDevice[];
}

const maxIntensity = 100;
const batteryLevel = '75';

const DevicePanelController: NavigationFunctionComponent<
  DevicePanelControllerProps
> = ({devices}) => {
  // 全局 UI 显示状态
  const [selectedMode, setSelectedMode] = useState('Fitness');
  const [intensityLevel, setIntensityLevel] = useState(50);

  // 设备特定的模式和强度状态
  const [deviceModes, setDeviceModes] = useState<Record<string, string>>({});
  const [deviceIntensities, setDeviceIntensities] = useState<
    Record<string, number>
  >({});

  const [isConnecting, setIsConnecting] = useState(false);
  const [timerValue, setTimerValue] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  // 设备特定的定时器状态
  const [deviceTimerValues, setDeviceTimerValues] = useState<
    Record<string, number>
  >({});
  const [deviceTimerRunning, setDeviceTimerRunning] = useState<
    Record<string, boolean>
  >({});
  const [deviceTimerIntervals, setDeviceTimerIntervals] = useState<
    Record<string, NodeJS.Timeout | null>
  >({});

  const [deviceLoadingStates, setDeviceLoadingStates] = useState<
    Record<string, boolean>
  >({});
  const [deviceConnectionStates, setDeviceConnectionStates] = useState<
    Record<string, boolean>
  >({});
  const [deviceVersion, setDeviceVersion] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<FoundDevice | null>(
    null,
  );
  const modeListActionSheetRef = useRef<BottomSheet>(null);
  const deviceListActionSheetRef = useRef<BottomSheet>(null);
  const timePickerActionSheetRef = useRef<BottomSheet>(null);

  // 创建一个动画值用于状态指示器的呼吸效果
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // 使用 refs 存储设备订阅，避免依赖循环
  const subscriptionsRef = useRef<Record<string, Subscription | null>>({});
  const connectionMonitorsActive = useRef<Record<string, boolean>>({});
  const timerCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 设置设备特定的定时器运行状态
  const setDeviceTimerRunningState = useCallback(
    (deviceId: string, isRunning: boolean) => {
      setDeviceTimerRunning(prev => ({
        ...prev,
        [deviceId]: isRunning,
      }));

      // 如果是当前选中的设备，同时更新 UI 显示的状态
      if (selectedDevice?.id === deviceId) {
        setTimerRunning(isRunning);
      }
    },
    [selectedDevice?.id],
  );

  // 启动特定设备的计时器，使用指定的时间值
  const startTimerWithValue = useCallback(
    (deviceId: string, seconds: number) => {
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

      console.log(`启动设备 ${deviceId} 的计时器，初始值: ${seconds} 秒`);

      // 每秒减少一秒
      const interval = setInterval(() => {
        setDeviceTimerValues(prev => {
          const prevTime = prev[deviceId] || 0;
          if (prevTime <= 1) {
            // 时间到，停止计时器
            clearInterval(interval);

            // 更新状态 - 只影响当前设备
            setDeviceTimerRunningState(deviceId, false);
            setDeviceTimerInterval(deviceId, null);

            // 如果是当前选中的设备，直接更新UI显示的值
            if (selectedDevice?.id === deviceId) {
              setTimerValue(0);
              // UI 状态已经由 setDeviceTimerRunningState 更新，这里不需要重复设置
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
                console.error(
                  'Error stopping device after timer finished:',
                  error,
                );
              });

            return {
              ...prev,
              [deviceId]: 0,
            };
          }

          const newValue = prevTime - 1;
          console.log(
            `设备 ${deviceId} 计时器更新：${prevTime} -> ${newValue}`,
          );

          // 如果是当前选中的设备，直接更新 UI 显示的值
          if (selectedDevice?.id === deviceId) {
            setTimerValue(newValue);
          }

          return {
            ...prev,
            [deviceId]: newValue,
          };
        });
      }, 1000);

      // 存储新的计时器 interval
      setDeviceTimerInterval(deviceId, interval);
    },
    [deviceTimerIntervals, selectedDevice?.id, setDeviceTimerRunningState],
  );

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

    setIsConnecting(false);
    console.log(`更新设备 ${deviceId} 连接状态为：${connected}`);
  };

  // 设备特性监控的创建函数
  const setupCharacteristicMonitor = useCallback(
    (deviceId: string) => {
      // 如果已经有监控，不重复创建
      if (subscriptionsRef.current[`char_${deviceId}`]) {
        return;
      }

      const subscription = BLEManager.monitorCharacteristicForDevice(
        deviceId,
        BLE_UUID.SERVICE,
        BLE_UUID.CHARACTERISTIC_WRITE,
        (error, characteristic) => {
          if (error) {
            console.error(
              `Characteristic monitoring error for device ${deviceId}:`,
              error,
            );
          } else if (characteristic && characteristic.value) {
            console.log(
              `Received value from device ${deviceId}:`,
              characteristic.value,
            );
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

      // 只存储在 ref 中，不再使用状态
      subscriptionsRef.current[`char_${deviceId}`] = subscription;
    },
    [selectedDevice],
  );

  // 封装设备连接逻辑为可重用的函数
  const connectToDevice = async (device: FoundDevice) => {
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
  };

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

  // 获取特定设备的连接状态
  const getDeviceConnectionStatus = useCallback(
    (deviceId: string): boolean => {
      return deviceConnectionStates[deviceId] || false;
    },
    [deviceConnectionStates],
  );

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

  // 保存设备特定的定时器间隔
  const setDeviceTimerInterval = (
    deviceId: string,
    interval: NodeJS.Timeout | null,
  ) => {
    setDeviceTimerIntervals(prev => ({
      ...prev,
      [deviceId]: interval,
    }));
  };

  // 获取设备特定的模式
  const getDeviceMode = useCallback(
    (deviceId: string): string => {
      return deviceModes[deviceId] || 'Fitness';
    },
    [deviceModes],
  );

  // 获取设备特定的强度
  const getDeviceIntensity = useCallback(
    (deviceId: string): number => {
      return deviceIntensities[deviceId] || 50;
    },
    [deviceIntensities],
  );

  // 设置设备特定的模式
  const setDeviceMode = (deviceId: string, mode: string) => {
    setDeviceModes(prev => ({
      ...prev,
      [deviceId]: mode,
    }));

    // 如果是当前选中的设备，同时更新 UI 显示的值
    if (selectedDevice?.id === deviceId) {
      setSelectedMode(mode);
    }
  };

  // 设置设备特定的强度
  const setDeviceIntensity = (deviceId: string, intensity: number) => {
    setDeviceIntensities(prev => ({
      ...prev,
      [deviceId]: intensity,
    }));

    // 如果是当前选中的设备，同时更新 UI 显示的值
    if (selectedDevice?.id === deviceId) {
      setIntensityLevel(intensity);
    }
  };

  // 同步当前选中设备的定时器状态到 UI
  useEffect(() => {
    if (selectedDevice) {
      const deviceId = selectedDevice.id;

      // 明确从设备状态获取值，强制更新 UI
      const currentTimerValue = deviceTimerValues[deviceId] || 0;
      const currentTimerRunning = deviceTimerRunning[deviceId] || false;

      console.log(
        `同步设备 ${deviceId} 定时器状态到 UI，当前值：${currentTimerValue}，运行状态：${currentTimerRunning}`,
      );

      // 直接设置 UI 状态，确保反映当前设备
      setTimerValue(currentTimerValue);
      setTimerRunning(currentTimerRunning);
    }
    // 仅依赖设备 ID 和实际存储状态的变化
  }, [selectedDevice?.id, deviceTimerValues, deviceTimerRunning]);

  // 同步当前选中设备的强度值到 UI
  useEffect(() => {
    if (selectedDevice) {
      const deviceId = selectedDevice.id;
      
      // 从设备强度状态获取值
      const currentIntensity = deviceIntensities[deviceId] || 50;
      
      console.log(
        `同步设备 ${deviceId} 强度值到 UI，当前强度：${currentIntensity}`,
      );
      
      // 直接设置 UI 状态，确保反映当前设备
      setIntensityLevel(currentIntensity);
    }
  }, [selectedDevice?.id, deviceIntensities]);

  // 同步当前选中设备的模式到 UI
  useEffect(() => {
    if (selectedDevice) {
      const deviceId = selectedDevice.id;
      
      // 从设备模式状态获取值
      const currentMode = deviceModes[deviceId] || 'Fitness';
      
      console.log(
        `同步设备 ${deviceId} 模式到 UI，当前模式：${currentMode}`,
      );
      
      // 直接设置 UI 状态，确保反映当前设备
      setSelectedMode(currentMode);
    }
  }, [selectedDevice?.id, deviceModes]);

  // 单独处理计时器恢复逻辑
  useEffect(() => {
    if (selectedDevice) {
      const deviceId = selectedDevice.id;
      // 检查并恢复计时器
      if (
        deviceTimerRunning[deviceId] &&
        deviceTimerValues[deviceId] > 0 &&
        !deviceTimerIntervals[deviceId]
      ) {
        console.log(
          `设备 ${deviceId} 需要恢复计时器，当前值：${deviceTimerValues[deviceId]}`,
        );
        startTimerWithValue(deviceId, deviceTimerValues[deviceId]);
      }
    }
  }, [
    selectedDevice?.id,
    deviceTimerRunning,
    deviceTimerValues,
    deviceTimerIntervals,
  ]);

  // 修改强度增加逻辑
  const increaseIntensity = () => {
    if (!selectedDevice) {
      return;
    }

    const deviceId = selectedDevice.id;
    const currentIntensity = getDeviceIntensity(deviceId);

    if (currentIntensity < maxIntensity) {
      const newIntensity = currentIntensity + 1;

      // 更新设备强度
      setDeviceIntensity(deviceId, newIntensity);

      // 写入强度到设备
      BLEManager.writeCharacteristic(
        deviceId,
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
  };

  // 修改强度减少逻辑
  const decreaseIntensity = () => {
    if (!selectedDevice) {
      return;
    }

    const deviceId = selectedDevice.id;
    const currentIntensity = getDeviceIntensity(deviceId);

    if (currentIntensity > 1) {
      const newIntensity = currentIntensity - 1;

      // 更新设备强度
      setDeviceIntensity(deviceId, newIntensity);

      // 写入强度到设备
      BLEManager.writeCharacteristic(
        deviceId,
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
  };

  // 修改模式选择逻辑
  const handleModeSelect = (mode: DeviceMode, name: string) => {
    if (!selectedDevice) {
      return;
    }

    const deviceId = selectedDevice.id;

    // 更新设备模式
    setDeviceMode(deviceId, name);
    modeListActionSheetRef.current?.close();

    // 写入模式到设备
    BLEManager.writeCharacteristic(
      deviceId,
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
      console.log(
        `暂停设备 ${deviceId} 的计时器，当前值：${getDeviceTimerValue(
          deviceId,
        )}`,
      );
      clearInterval(interval);
      setDeviceTimerInterval(deviceId, null);
    }
    setDeviceTimerRunningState(deviceId, false);
  };

  // Toggle timer state (start/pause) for the selected device
  const toggleTimer = () => {
    if (!selectedDevice) {
      return;
    }

    const deviceId = selectedDevice.id;
    const isRunning = isDeviceTimerRunning(deviceId);

    if (isRunning) {
      // 如果计时器正在运行，暂停它
      pauseTimer(deviceId);
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
    } else {
      // 如果计时器未运行，启动它
      startTimer(deviceId);
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
  };

  // Reset timer for a specific device
  const resetTimer = () => {
    if (!selectedDevice) {
      return;
    }

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

  const $modeActionSheet = (
    <ModeListActionSheet
      selectedMode={selectedMode}
      handleModeSelect={handleModeSelect}
      ref={modeListActionSheetRef}
    />
  );

  // 定义时间选择回调函数
  const onTimeSelected = (hours: number, minutes: number, seconds: number) => {
    if (!selectedDevice) {
      return;
    }

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

  const $timePickerActionSheet = (
    <TimePickerActionSheet
      ref={timePickerActionSheetRef}
      initialHours={Math.floor(timerValue / 3600)}
      initialMinutes={Math.floor((timerValue % 3600) / 60)}
      initialSeconds={timerValue % 60}
      onTimeSelected={onTimeSelected}
    />
  );

  // 修改设备选择回调函数
  const handleDeviceSelect = async (device: FoundDevice) => {
    console.log('Selected device:', device);
    // 重置 UI 显示的计时器值
    setTimerValue(0);
    // 设置新的选中设备
    setSelectedDevice(device);
    // 如果设备未连接，则连接
    if (!getDeviceConnectionStatus(device.id)) {
      await connectToDevice(device);
    }

    // 无论如何，都检查并恢复计时器状态，不仅仅在 interval 为 null 时
    if (isDeviceTimerRunning(device.id) && deviceTimerValues[device.id] > 0) {
      console.log(
        `恢复设备 ${device.id} 的计时器，当前值：${getDeviceTimerValue(
          device.id,
        )}，尝试重新确保计时器在运行`,
      );

      // 先停止可能存在的计时器，然后重新开始
      const existingInterval = deviceTimerIntervals[device.id];
      if (existingInterval) {
        clearInterval(existingInterval);
        setDeviceTimerInterval(device.id, null);
      }

      // 重新开始计时器
      startTimerWithValue(device.id, getDeviceTimerValue(device.id));
    } else {
      console.log(
        `设备 ${device.id} 的计时器未运行或时间值为 0，不需要恢复计时器`,
      );
      // 更新 UI 显示的时间值
      setTimerValue(getDeviceTimerValue(device.id));
    }
  };

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
    const isCurrentDeviceConnected = selectedDevice
      ? getDeviceConnectionStatus(selectedDevice.id)
      : false;

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
          console.log('intensityLevel', value);
        }}
        onSlidingComplete={value => {
          if (!selectedDevice) {
            return;
          }

          const deviceId = selectedDevice.id;

          // 更新设备强度
          setDeviceIntensity(deviceId, value);

          // 写入强度到设备
          BLEManager.writeCharacteristic(
            deviceId,
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

  // 为单个设备设置连接监控
  const setupConnectionMonitor = async (deviceId: string) => {
    console.log(`为设备 ${deviceId} 设置连接监控`);

    // 如果设备未连接，则不设置监控
    if (!deviceConnectionStates[deviceId]) {
      console.log(`设备 ${deviceId} 未连接，跳过设置监控`);
      return;
    }

    // 如果已经有这个设备的监控，跳过
    if (connectionMonitorsActive.current[`conn_${deviceId}`]) {
      console.log(`已存在设备 ${deviceId} 的连接监控，跳过创建`);
      return;
    }

    // 找到设备
    const device = devices.find(d => d.id === deviceId);
    if (!device) {
      console.log(`找不到设备 ID 为 ${deviceId} 的设备`);
      return;
    }

    console.log(`创建设备 ${deviceId} 的连接监控`);

    // 创建设备的连接监控
    const subscription = BLEManager.monitorDeviceConnection(
      deviceId,
      (device, isConnected, error) => {
        if (error) {
          console.error(`设备 ${deviceId} 连接错误:`, error);
        } else {
          // 使用函数形式的 setState 以避免依赖最新的 state
          setDeviceConnectionStates(prev => ({
            ...prev,
            [device.id]: isConnected,
          }));

          setIsConnecting(false);
          console.log(
            `设备 ${device.name} 现在是 ${
              isConnected ? '已连接' : '已断开'
            } 状态`,
          );

          // 如果设备断开连接，清理其特性监控但保持计时器状态
          if (!isConnected) {
            const charSubscription =
              subscriptionsRef.current[`char_${deviceId}`];
            if (charSubscription) {
              charSubscription.remove();
              delete subscriptionsRef.current[`char_${deviceId}`];
            }
          }
        }
      },
    );

    // 在 ref 中存储监控状态
    connectionMonitorsActive.current[`conn_${deviceId}`] = true;
    subscriptionsRef.current[`conn_${deviceId}`] = subscription;
  };

  useNavigationComponentDidAppear(async () => {
    console.log('自动连接到第一个设备', devices[0].name);
    // 连接设备并等待成功
    console.log('开始连接设备...');
    await connectToDevice(devices[0]);
    console.log('设备连接成功，开始设置监控');
    // 仅在设备成功连接后才设置监控
    await setupConnectionMonitor(devices[0].id);

    setSelectedDevice(devices[0]);

    const checkAllDeviceTimers = () => {
      console.log('检查所有设备的计时器状态');

      Object.entries(deviceTimerRunning).forEach(([deviceId, isRunning]) => {
        // 检查标记为运行中但没有活动 interval 的设备
        if (
          isRunning &&
          !deviceTimerIntervals[deviceId] &&
          deviceTimerValues[deviceId] > 0
        ) {
          console.log(
            `检测到设备 ${deviceId} 的计时器状态异常：标记为运行但没有活动的 interval，正在恢复...`,
          );

          // 恢复计时器
          startTimerWithValue(deviceId, deviceTimerValues[deviceId]);
        }
      });
    };

    timerCheckIntervalRef.current = setInterval(checkAllDeviceTimers, 5000);
  });

  useNavigationComponentDidDisappear(async () => {
    // 断开所有设备连接
    const disconnectAllDevices = async () => {
      const connectedDeviceIds = Object.entries(deviceConnectionStates)
        .filter(([_, isConnected]) => isConnected)
        .map(([id]) => id);

      for (const deviceId of connectedDeviceIds) {
        try {
          await BLEManager.disconnectDevice(deviceId);
          console.log(`成功断开设备 ${deviceId} 连接`);
        } catch (error) {
          console.error(`断开设备 ${deviceId} 连接出错:`, error);
        }
      }
    };

    // 异步执行断开连接
    disconnectAllDevices().catch(console.error);

    // 清理所有订阅
    Object.values(subscriptionsRef.current).forEach(subscription => {
      if (subscription) {
        subscription.remove();
      }
    });

    // 清除所有计时器
    Object.entries(deviceTimerIntervals).forEach(([_, interval]) => {
      if (interval) {
        clearInterval(interval);
      }
    });

    console.log('DevicePanelController 清理：断开连接并清理监控');
    if (timerCheckIntervalRef.current) {
      clearInterval(timerCheckIntervalRef.current);
    }
  });

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaView className="flex-1 bg-[#f5f5f5]">
        <View className={'flex flex-1 flex-col justify-between p-4'}>
          {$deviceInfo}
          <View className={'flex flex-1 flex-col gap-y-6 mt-8'}>
            <View className={''}>{$timerValue}</View>
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
