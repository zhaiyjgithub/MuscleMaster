import BottomSheet from '@gorhom/bottom-sheet';
import {
  Battery,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react-native';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  Text,
  TouchableOpacity,
  View,
  AppState,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {Subscription} from 'react-native-ble-plx';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {NavigationFunctionComponent} from 'react-native-navigation';
import {
  useNavigationComponentDidAppear,
  useNavigationComponentDidDisappear,
} from 'react-native-navigation-hooks';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useToast} from 'react-native-toast-notifications';
import DeviceListActionSheet from '../components/device-list-action-sheet/deviceListActionSheet';
import ModeListActionSheet, {
  Modes,
} from '../components/mode-list-action-sheet/modeListActionSheet';
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
import {cn} from '../lib/utils';
import ActionsSettingList from '../components/actions-setting-list/actionsSettingList';
import {BluetoothBackgroundService} from '../services/BluetoothBackgroundService';
import Loading from './view/loading';

const MAX_INTENSITY = 10;
const MIN_INTENSITY = 1;
export interface DevicePanelControllerProps {
  devices: FoundDevice[];
}

const DevicePanelController: NavigationFunctionComponent<
  DevicePanelControllerProps
> = ({devices}) => {
  // 全局 UI 显示状态
  const [selectedMode, setSelectedMode] = useState('Fitness');
  const [intensityLevel, setIntensityLevel] = useState(0);
  // 添加三个新的状态变量用于 UI 显示
  const [climbTime, setClimbTime] = useState(3);
  const [stopTime, setStopTime] = useState(3);
  const [runTime, setRunTime] = useState(5);

  // 设备特定的模式和强度状态
  const [deviceModes, setDeviceModes] = useState<Record<string, string>>({});
  const [deviceIntensities, setDeviceIntensities] = useState<
    Record<string, number>
  >({});

  const [isConnecting, setIsConnecting] = useState(false);
  const [timerValue, setTimerValue] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [deviceBatteryLevels, setDeviceBatteryLevels] = useState<
    Record<string, number>
  >({});
  // 设备特定的定时器状态
  const [deviceTimerValues, setDeviceTimerValues] = useState<
    Record<string, number>
  >({});
  const [deviceTimerRunning, setDeviceTimerRunning] = useState<
    Record<string, boolean>
  >({});
  const deviceTimerIntervalsRef = useRef<Record<string, NodeJS.Timeout | null>>(
    {},
  );

  // 将 deviceLoadingStates 从 state 改为 ref
  const deviceLoadingStatesRef = useRef<Record<string, boolean>>({});

  // Add AppState ref to track previous state
  const appStateRef = useRef(AppState.currentState);

  // 添加备用计时器值存储，避免状态更新时机问题
  const deviceTimerBackupRef = useRef<Record<string, number>>({});

  const [deviceConnectionStates, setDeviceConnectionStates] = useState<
    Record<string, boolean>
  >({});
  const [deviceVersion, setDeviceVersion] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<FoundDevice | null>(
    devices.length > 0 ? devices[0] : null,
  );
  const [deviceStatus, setDeviceStatus] = useState<{
    deviceId: string;
    status: number;
  }>({deviceId: '', status: 0});

  // 添加一个计时器保护期记录，刚启动的计时器不会被 CANCEL 命令立即取消
  const timerProtectionRef = useRef<Record<string, number>>({});

  const modeListActionSheetRef = useRef<BottomSheet>(null);
  const deviceListActionSheetRef = useRef<BottomSheet>(null);
  const timePickerActionSheetRef = useRef<BottomSheet>(null);

  const toast = useToast();

  // 创建一个动画值用于状态指示器的呼吸效果
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // 使用 refs 存储设备订阅，避免依赖循环
  const subscriptionsRef = useRef<Record<string, Subscription | null>>({});
  const connectionMonitorsActive = useRef<Record<string, boolean>>({});
  const timerCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Add loading state variables
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const initialLoadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track received device parameters
  const receivedParamsRef = useRef({
    workTime: false,
    intensity: false,
    mode: false,
  });

  // Add device-specific action settings
  const [deviceClimbTimes, setDeviceClimbTimes] = useState<
    Record<string, number>
  >({});
  const [deviceStopTimes, setDeviceStopTimes] = useState<
    Record<string, number>
  >({});
  const [deviceRunTimes, setDeviceRunTimes] = useState<Record<string, number>>(
    {},
  );

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

      // 检查是否已有计时器在运行
      const existingInterval = deviceTimerIntervalsRef.current[deviceId];
      if (existingInterval) {
        console.log(`设备 ${deviceId} 已有计时器在运行，先清除它`);
        clearInterval(existingInterval);
        deviceTimerIntervalsRef.current[deviceId] = null;
      }

      // 检查运行状态 - 避免重复启动
      const isAlreadyRunning = deviceTimerRunning[deviceId] || false;
      if (isAlreadyRunning) {
        console.log(`设备 ${deviceId} 计时器已经在运行中，避免重复启动`);
        return;
      }

      // 设置运行状态
      setDeviceTimerRunningState(deviceId, true);

      // 设置计时器保护期，防止刚启动的计时器被立即取消
      timerProtectionRef.current[deviceId] = Date.now() + 3000; // 3秒保护期
      console.log(
        `设置设备 ${deviceId} 计时器保护期至 ${new Date(
          timerProtectionRef.current[deviceId],
        ).toISOString()}`,
      );

      console.log(`启动设备 ${deviceId} 的计时器，初始值: ${seconds} 秒`);

      // 记录上次更新时间，确保间隔约为1秒
      const lastUpdateTimeRef = {current: Date.now()};

      // 每秒减少一秒
      const interval = setInterval(() => {
        // 验证间隔时间
        const now = Date.now();
        const elapsed = now - lastUpdateTimeRef.current;
        lastUpdateTimeRef.current = now;

        // 记录实际间隔时间用于调试
        console.log(`计时器间隔：${elapsed}ms`);

        setDeviceTimerValues(prev => {
          const prevTime = prev[deviceId] || 0;
          if (prevTime <= 1) {
            // 时间到，停止计时器
            clearInterval(interval);

            // 更新状态 - 只影响当前设备
            setDeviceTimerRunningState(deviceId, false);
            // 更新ref而不是state
            deviceTimerIntervalsRef.current[deviceId] = null;

            // 如果是当前选中的设备，直接更新UI显示的值
            if (selectedDevice?.id === deviceId) {
              setTimerValue(0);
              // UI 状态已经由 setDeviceTimerRunningState 更新，这里不需要重复设置
            }

            // 可以添加提示音或振动
            console.log('Timer finished for device:', deviceId);

            /*
             *   toast
             * */
            // 显示设备名称 - 活动已经完成
            toast.show(
              `${selectedDevice?.name ?? 'Device'} - Activity completed`,
              {
                type: 'success',
                placement: 'top',
                duration: 4000,
              },
            );

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

      // 存储新的计时器 interval (在 ref 中)
      deviceTimerIntervalsRef.current[deviceId] = interval;
    },
    [
      selectedDevice?.id,
      selectedDevice?.name,
      setDeviceTimerRunningState,
      deviceTimerRunning,
      toast,
    ],
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
    deviceLoadingStatesRef.current[deviceId] = isLoading;
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

  // 获取特定设备的连接状态
  const getDeviceConnectionStatus = useCallback(
    (deviceId: string): boolean => {
      return deviceConnectionStates[deviceId] || false;
    },
    [deviceConnectionStates],
  );

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

  // Function to check if all required parameters are received
  const checkAllParamsReceived = useCallback(() => {
    const {workTime, intensity, mode} = receivedParamsRef.current;

    if (workTime && intensity && mode) {
      console.log('All required device parameters received, hiding loading');
      // Clear timeout if it exists
      if (initialLoadingTimeoutRef.current) {
        clearTimeout(initialLoadingTimeoutRef.current);
        initialLoadingTimeoutRef.current = null;
      }
      // Hide loading
      setIsInitialLoading(false);
    }
  }, []);

  // Reset received params when selecting a new device
  const resetReceivedParams = () => {
    receivedParamsRef.current = {
      workTime: false,
      intensity: false,
      mode: false,
    };
  };

  // 设备特性监控的创建函数
  const setupCharacteristicMonitor = (deviceId: string) => {
    // 如果已经有监控，先移除它，确保不会有重复的监控
    const existingSubscription = subscriptionsRef.current[`char_${deviceId}`];
    if (existingSubscription) {
      console.log(`发现设备 ${deviceId} 已存在特性监控，先移除它`);
      existingSubscription.remove();
      delete subscriptionsRef.current[`char_${deviceId}`];
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

                // 格式化版本号
                const formattedVersion =
                  `${deviceType.toString().padStart(2, '0')}` +
                  ' - V' +
                  vcode.toString().padStart(2, '0');

                setDeviceVersion(prev => {
                  console.log('prev', prev, devices, selectedDevice);
                  return formattedVersion;
                });
              }
            } else if (command === CommandType.GET_BATTERY) {
              const batteryLevel = data[0];
              // reply battery level
              BLEManager.writeCharacteristic(
                deviceId,
                BLE_UUID.SERVICE,
                BLE_UUID.CHARACTERISTIC_READ,
                BLECommands.replyBattery(batteryLevel),
              );
              setDeviceBatteryLevels(prev => ({
                ...prev,
                [deviceId]: batteryLevel,
              }));
            } else if (command === CommandType.GET_DEVICE_INFO) {
              const subCommand = data[0] as CommandType;
              console.log('subCommand', subCommand);
              if (subCommand === CommandType.GET_INTENSITY) {
                // 设置设备强度 返回强度：5A 02 01 09 03 05 01 32 A1
                if (data.length >= 3) {
                  const intensity = data[2];
                  setDeviceIntensity(deviceId, intensity);

                  // Mark intensity as received
                  receivedParamsRef.current.intensity = true;
                  checkAllParamsReceived();

                  // reply intensity
                  BLEManager.writeCharacteristic(
                    deviceId,
                    BLE_UUID.SERVICE,
                    BLE_UUID.CHARACTERISTIC_READ,
                    BLECommands.replyIntensity(intensity),
                  )
                    .then(() => {
                      console.log(
                        'Successfully reply intensity value:',
                        intensity,
                      );
                    })
                    .catch(error => {
                      console.error('Error reply intensity:', error);
                    });
                }
              } else if (subCommand === CommandType.GET_MODE) {
                // 设置设备工作时间 返回工作时间：5A 02 01 09 02 06 0C 7A
                if (data.length >= 2) {
                  const modeId = data[1];
                  const mode = Modes.find(m => m.id === modeId);
                  if (mode) {
                    setDeviceMode(deviceId, mode.name);

                    // Mark mode as received
                    receivedParamsRef.current.mode = true;
                    checkAllParamsReceived();

                    // reply mode
                    BLEManager.writeCharacteristic(
                      deviceId,
                      BLE_UUID.SERVICE,
                      BLE_UUID.CHARACTERISTIC_READ,
                      BLECommands.replyMode(modeId),
                    )
                      .then(() => {
                        console.log('Successfully reply mode value:', modeId);
                      })
                      .catch(error => {
                        console.error('Error reply mode:', error);
                      });
                  }
                }
              } else if (subCommand === CommandType.GET_WORK_TIME) {
                // 设置设备工作时间 返回工作时间：5A 02 01 09 03 03 00 14 80
                // if (data.length >= 3) {
                //   const highByte = data[1];
                //   const lowByte = data[2];
                //   const workTime = (highByte << 8) | lowByte;
                //
                //   // Mark work time as received
                //   receivedParamsRef.current.workTime = true;
                //   checkAllParamsReceived();
                //
                //   // reply work time
                //   BLEManager.writeCharacteristic(
                //     deviceId,
                //     BLE_UUID.SERVICE,
                //     BLE_UUID.CHARACTERISTIC_READ,
                //     BLECommands.replyWorkTime(workTime),
                //   )
                //     .then(() => {
                //       console.log('Successfully reply work time');
                //     })
                //     .catch(error => {
                //       console.error('Error reply work time:', error);
                //     });
                //
                //   console.log('设备发送的倒计时时间：', workTime);
                //
                //   // 更新设备计时器值
                //   setDeviceTimerValue(deviceId, workTime);
                //
                //   // 同时更新备用存储
                //   if (workTime > 0) {
                //     deviceTimerBackupRef.current[deviceId] = workTime;
                //     console.log(
                //       `已保存设备 ${deviceId} 的倒计时值 ${workTime} 到备用存储`,
                //     );
                //
                //     // 检查计时器是否在运行
                //     const isRunning = deviceTimerRunning[deviceId] || false;
                //     const hasActiveInterval =
                //       !!deviceTimerIntervalsRef.current[deviceId];
                //
                //     if (workTime > 0) {
                //       // 记录原始的运行状态，避免 UI 闪烁
                //       const wasRunning = isRunning;
                //
                //       // 如果有活动的计时器，停止它，但不改变运行状态
                //       if (hasActiveInterval) {
                //         console.log(
                //           `设备 ${deviceId} 接收到新的倒计时时间，重新启动计时器`,
                //         );
                //         const interval =
                //           deviceTimerIntervalsRef.current[deviceId];
                //         if (interval) {
                //           clearInterval(interval);
                //           deviceTimerIntervalsRef.current[deviceId] = null;
                //         }
                //         // 不在这里设置运行状态为 false
                //       } else {
                //         console.log(
                //           `设备 ${deviceId} 接收到新的倒计时时间，启动新计时器`,
                //         );
                //       }
                //
                //       // 启动新的计时器，保持原来的运行状态
                //       if (selectedDevice && selectedDevice.id === deviceId) {
                //         // 如果计时器之前在运行，则保持运行状态
                //         if (wasRunning) {
                //           startTimer(deviceId, workTime);
                //         } else {
                //           // 只更新值，不启动计时器
                //           setDeviceTimerValue(deviceId, workTime);
                //         }
                //       } else {
                //         // 对于非选中设备，按照原来状态处理
                //         if (wasRunning) {
                //           startTimerWithValue(deviceId, workTime);
                //         } else {
                //           // 只更新计时器值，不启动
                //           setDeviceTimerValue(deviceId, workTime);
                //         }
                //       }
                //
                //       // 设置计时器保护期
                //       timerProtectionRef.current[deviceId] = Date.now() + 3000; // 3 秒保护期
                //     } else {
                //       // 如果工作时间为 0 且计时器在运行，停止计时器
                //       if (isRunning && hasActiveInterval) {
                //         console.log(
                //           `设备 ${deviceId} 接收到 0 倒计时，停止计时器`,
                //         );
                //         const interval =
                //           deviceTimerIntervalsRef.current[deviceId];
                //         if (interval) {
                //           clearInterval(interval);
                //           deviceTimerIntervalsRef.current[deviceId] = null;
                //         }
                //         setDeviceTimerRunningState(deviceId, false);
                //       }
                //     }
                //   }
              } else if (subCommand === CommandType.DEVICE_STATUS) {
                if (data.length >= 3) {
                  const channel = data[1];
                  const status = data[2];

                  // 回复设备
                  BLEManager.writeCharacteristic(
                    deviceId,
                    BLE_UUID.SERVICE,
                    BLE_UUID.CHARACTERISTIC_READ,
                    BLECommands.replyDeviceStatus(status, channel),
                  )
                    .then(() => {
                      console.log('Successfully reply device status:', status);
                    })
                    .catch(error => {
                      console.error('Error reply device status:', error);
                    });

                  console.log('channel', channel, 'status', status);

                  // 检查是否在计时器保护期内
                  const protectionEndTime =
                    timerProtectionRef.current[deviceId] || 0;
                  const isProtected = Date.now() < protectionEndTime;

                  // 获取设备计时器信息 - 直接从deviceTimerValues获取，不依赖getDeviceTimerValue
                  const deviceLastValue = deviceTimerValues[deviceId] || 0;
                  const isRunning = deviceTimerRunning[deviceId] || false;

                  console.log(
                    `处理设备状态：设备=${deviceId}, 状态=${status}, 暂存计时器值=${deviceLastValue}, 运行状态=${isRunning}`,
                  );

                  // 直接在这里处理状态变化，无需经过状态更新和useEffect
                  if (status === CommandType.DEVICE_STATUS_CANCEL) {
                    if (isProtected && isRunning) {
                      console.log(
                        '收到CANCEL状态，但计时器处于保护期内，忽略此命令',
                      );
                    } else {
                      console.log('收到CANCEL状态，取消倒计时');

                      // 注意：这里需要处理指定设备的计时器，而不是selectedDevice
                      // 如果当前设备就是selectedDevice，则可以直接使用resetTimerByDevice
                      if (selectedDevice && selectedDevice.id === deviceId) {
                        resetTimerByDevice(); // 这个函数内部会使用selectedDevice.id
                      } else {
                        // 否则手动清除指定设备的计时器
                        const interval =
                          deviceTimerIntervalsRef.current[deviceId];
                        if (interval) {
                          clearInterval(interval);
                          deviceTimerIntervalsRef.current[deviceId] = null;
                        }
                        setDeviceTimerValue(deviceId, 0);
                        setDeviceTimerRunningState(deviceId, false);
                      }
                    }
                  } else {
                    // 处理启动/暂停命令
                    const isPause = status === CommandType.DEVICE_STATUS_STOP;

                    if (isPause) {
                      // 处理暂停命令
                      if (isRunning) {
                        console.log(`处理设备 ${deviceId} 暂停命令`);

                        if (selectedDevice && selectedDevice.id === deviceId) {
                          pauseTimer(deviceId);
                        } else {
                          // 否则手动处理指定设备的计时器
                          const interval =
                            deviceTimerIntervalsRef.current[deviceId];
                          if (interval) {
                            clearInterval(interval);
                            deviceTimerIntervalsRef.current[deviceId] = null;
                          }
                          setDeviceTimerRunningState(deviceId, false);
                        }
                      } else {
                        // 即使计时器未运行，也应该处理暂停命令，确保状态同步
                        console.log(
                          `收到暂停命令，设备 ${deviceId} 计时器未运行，但仍设置状态为暂停`,
                        );

                        // 备份当前计时器值，以防万一
                        const currentValue = deviceTimerValues[deviceId] || 0;
                        if (currentValue > 0) {
                          deviceTimerBackupRef.current[deviceId] = currentValue;
                          console.log(
                            `已保存设备 ${deviceId} 的计时器值：${currentValue} 到备用存储中`,
                          );
                        }

                        // 确保设置运行状态为 false
                        setDeviceTimerRunningState(deviceId, false);

                        // 清理可能存在的计时器
                        const interval =
                          deviceTimerIntervalsRef.current[deviceId];
                        if (interval) {
                          console.log(
                            `发现设备 ${deviceId} 有活动的计时器但状态为非运行，清除计时器`,
                          );
                          clearInterval(interval);
                          deviceTimerIntervalsRef.current[deviceId] = null;
                        }
                      }
                    } else {
                      // 处理启动命令 - 总是检查 deviceTimerValues
                      // 首先检查是否已有计时器在运行
                      const isAlreadyRunning =
                        deviceTimerRunning[deviceId] || false;
                      const existingInterval =
                        deviceTimerIntervalsRef.current[deviceId];

                      if (isAlreadyRunning && existingInterval) {
                        console.log(
                          `收到启动命令，但设备 ${deviceId} 计时器已经在运行中，忽略此命令`,
                        );
                      } else if (isAlreadyRunning && !existingInterval) {
                        // 状态不一致：状态为运行但没有活动计时器
                        console.log(
                          `状态不一致：设备 ${deviceId} 状态为运行但没有活动计时器，尝试恢复`,
                        );

                        // 查找有效的计时器值
                        const timerValue = getValidTimerValue(deviceId);
                        if (timerValue > 0) {
                          console.log(
                            `找到有效的计时器值 ${timerValue}，恢复计时器`,
                          );
                          if (
                            selectedDevice &&
                            selectedDevice.id === deviceId
                          ) {
                            setDeviceTimerValue(deviceId, timerValue);
                            startTimer(deviceId, timerValue);
                          } else {
                            startTimerWithValue(deviceId, timerValue);
                          }
                        } else {
                          console.log(
                            '无法找到有效的计时器值，将状态设为非运行',
                          );
                          setDeviceTimerRunningState(deviceId, false);
                        }
                      } else {
                        // 常规启动逻辑（设备未运行）
                        if (deviceLastValue > 0) {
                          console.log(
                            `处理设备 ${deviceId} 启动命令，使用暂存计时器值 ${deviceLastValue}`,
                          );

                          if (
                            selectedDevice &&
                            selectedDevice.id === deviceId
                          ) {
                            // 确保计时器值正确设置
                            setDeviceTimerValue(deviceId, deviceLastValue);
                            startTimer(deviceId, deviceLastValue);
                          } else {
                            // 手动启动指定设备的计时器
                            startTimerWithValue(deviceId, deviceLastValue);
                          }
                        } else {
                          // 检查是否存在最新的计时器值 (直接查询 deviceTimerValues 而不是依赖缓存值)
                          console.log(
                            '设备启动命令检测：deviceTimerValues 完整内容:',
                            JSON.stringify(deviceTimerValues),
                          );
                          const latestTimerValue = deviceTimerValues[deviceId];

                          // 检查备用存储
                          const backupValue =
                            deviceTimerBackupRef.current[deviceId];
                          console.log(
                            `备用存储中的计时器值：${backupValue || 0}`,
                          );

                          // 使用备用存储或状态中的值，优先使用备用存储
                          const finalValue =
                            backupValue && backupValue > 0
                              ? backupValue
                              : latestTimerValue && latestTimerValue > 0
                              ? latestTimerValue
                              : 0;

                          if (finalValue > 0) {
                            console.log(
                              `发现设备 ${deviceId} 有有效的计时器值：${finalValue}，将使用该值启动`,
                            );

                            if (
                              selectedDevice &&
                              selectedDevice.id === deviceId
                            ) {
                              setDeviceTimerValue(deviceId, finalValue);
                              // 直接传入 finalValue 作为覆盖值
                              startTimer(deviceId, finalValue);
                            } else {
                              // 直接使用找到的值启动计时器
                              startTimerWithValue(deviceId, finalValue);
                            }
                          } else {
                            console.log(
                              `收到启动命令，但设备 ${deviceId} 没有有效的计时器值，无法启动`,
                            );
                          }
                        }
                      }
                    }
                  }
                  // 更新设备状态 (仅用于记录)
                  setDeviceStatus({deviceId, status});
                }
              } else if (subCommand === CommandType.SET_CLIMBING_TIME) {
                const climbingTime = data[1];
                setDeviceClimbTime(deviceId, climbingTime);
                console.log('setDeviceClimbTime', deviceId, climbingTime);

                // 回复设备
                BLEManager.writeCharacteristic(
                  deviceId,
                  BLE_UUID.SERVICE,
                  BLE_UUID.CHARACTERISTIC_READ,
                  BLECommands.replyClimbingTime(climbingTime),
                )
                  .then(() => {
                    console.log('Successfully reply climb time');

                    // 确保 UI 更新
                    if (selectedDevice?.id === deviceId) {
                      console.log(
                        `设备 ${deviceId} 的攀爬时间已更新为 ${climbingTime}，UI 应该自动更新`,
                      );
                    }
                  })
                  .catch(error => {
                    console.error('Error reply climb time:', error);
                  });
              } else if (subCommand === CommandType.SET_STOP_TIME) {
                // const stopTime = data[1];
                // setDeviceStopTime(deviceId, stopTime);
                //
                // // 回复设备
                // BLEManager.writeCharacteristic(
                //   deviceId,
                //   BLE_UUID.SERVICE,
                //   BLE_UUID.CHARACTERISTIC_READ,
                //   BLECommands.replyStopTime(stopTime),
                // )
                //   .then(() => {
                //     console.log('Successfully reply stop time');
                //   })
                //   .catch(error => {
                //     console.error('Error reply stop time:', error);
                //   });
              } else if (subCommand === CommandType.SET_PEEK_TIME) {
                // const peakTime = data[1];
                // setDeviceRunTime(deviceId, peakTime);
                //
                // // 回复设备
                // BLEManager.writeCharacteristic(
                //   deviceId,
                //   BLE_UUID.SERVICE,
                //   BLE_UUID.CHARACTERISTIC_READ,
                //   BLECommands.replyPeakTime(peakTime),
                // )
                //   .then(() => {
                //     console.log('Successfully reply peak time');
                //   })
                //   .catch(error => {
                //     console.error('Error reply peak time:', error);
                //   });
              }
            }
          }
        }
      },
    );

    // 只存储在 ref 中，不再使用状态
    subscriptionsRef.current[`char_${deviceId}`] = subscription;
  };

  // 获取设备特定的定时器值
  const getDeviceTimerValue = useCallback(
    (deviceId: string): number => {
      return deviceTimerValues[deviceId] || 0;
    },
    [deviceTimerValues],
  );

  // 获取设备特定的定时器运行状态
  const isDeviceTimerRunning = useCallback(
    (deviceId: string): boolean => {
      return deviceTimerRunning[deviceId] || false;
    },
    [deviceTimerRunning],
  );

  // 设置设备特定的定时器值
  const setDeviceTimerValue = useCallback(
    (deviceId: string, value: number) => {
      setDeviceTimerValues(prev => ({
        ...prev,
        [deviceId]: value,
      }));

      // 如果是当前选中的设备，同时更新 UI 显示的值
      if (selectedDevice?.id === deviceId) {
        console.log('set current device timer value', value);
        setTimerValue(value);
      }
    },
    [selectedDevice?.id],
  );

  // 保存设备特定的定时器间隔
  const setDeviceTimerInterval = (
    deviceId: string,
    interval: NodeJS.Timeout | null,
  ) => {
    deviceTimerIntervalsRef.current[deviceId] = interval;
  };

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

  // 设置设备特定的攀爬时间
  const setDeviceClimbTime = (deviceId: string, value: number) => {
    setDeviceClimbTimes(prev => ({
      ...prev,
      [deviceId]: value,
    }));

    // 如果是当前选中的设备，同时更新 UI 显示的值
    if (selectedDevice?.id === deviceId) {
      setClimbTime(value);
      console.log(`更新当前选中设备的攀爬时间到 UI: ${value}`);
    }
  };

  // 设置设备特定的停止时间
  const setDeviceStopTime = (deviceId: string, value: number) => {
    setDeviceStopTimes(prev => ({
      ...prev,
      [deviceId]: value,
    }));

    // 如果是当前选中的设备，同时更新 UI 显示的值
    if (selectedDevice?.id === deviceId) {
      setStopTime(value);
      console.log(`更新当前选中设备的停止时间到 UI: ${value}`);
    }
  };

  // 设置设备特定的运行时间
  const setDeviceRunTime = (deviceId: string, value: number) => {
    setDeviceRunTimes(prev => ({
      ...prev,
      [deviceId]: value,
    }));

    // 如果是当前选中的设备，同时更新 UI 显示的值
    if (selectedDevice?.id === deviceId) {
      setRunTime(value);
      console.log(`更新当前选中设备的运行时间到 UI: ${value}`);
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
  }, [
    selectedDevice?.id,
    deviceTimerValues,
    deviceTimerRunning,
    selectedDevice,
  ]);

  // 同步当前选中设备的强度值到 UI
  useEffect(() => {
    if (selectedDevice) {
      const deviceId = selectedDevice.id;

      // 从设备强度状态获取值
      let currentIntensity = deviceIntensities[deviceId] || MIN_INTENSITY;

      if (currentIntensity < MIN_INTENSITY) {
        currentIntensity = MIN_INTENSITY;
      } else if (currentIntensity > MAX_INTENSITY) {
        currentIntensity = MAX_INTENSITY;
      }

      console.log(
        `同步设备 ${deviceId} 强度值到 UI，当前强度：${currentIntensity}`,
      );

      // 直接设置 UI 状态，确保反映当前设备
      setIntensityLevel(currentIntensity);
    }
  }, [selectedDevice?.id, deviceIntensities, selectedDevice]);

  // 同步当前选中设备的模式到 UI
  useEffect(() => {
    if (selectedDevice) {
      const deviceId = selectedDevice.id;

      // 从设备模式状态获取值
      const currentMode = deviceModes[deviceId] || 'Fitness';

      console.log(`同步设备 ${deviceId} 模式到 UI，当前模式：${currentMode}`);

      // 直接设置 UI 状态，确保反映当前设备
      setSelectedMode(currentMode);
    }
  }, [selectedDevice?.id, deviceModes, selectedDevice]);

  // 同步当前选中设备的动作设置到 UI
  useEffect(() => {
    if (selectedDevice) {
      const deviceId = selectedDevice.id;

      // 从设备状态获取值，使用默认值如果没有设置过
      const currentClimbTime = deviceClimbTimes[deviceId] || 3;
      const currentStopTime = deviceStopTimes[deviceId] || 3;
      const currentRunTime = deviceRunTimes[deviceId] || 5;

      console.log(
        `同步设备 ${deviceId} 动作设置到 UI：攀爬=${currentClimbTime}, 停止=${currentStopTime}, 运行=${currentRunTime}`,
      );
    }
  }, [
    selectedDevice?.id,
    deviceClimbTimes,
    deviceStopTimes,
    deviceRunTimes,
    selectedDevice,
  ]);

  // 单独处理计时器恢复逻辑
  useEffect(() => {
    if (selectedDevice) {
      const deviceId = selectedDevice.id;
      // 检查并恢复计时器
      if (
        deviceTimerRunning[deviceId] &&
        deviceTimerValues[deviceId] > 0 &&
        !deviceTimerIntervalsRef.current[deviceId]
      ) {
        const valueToUse = deviceTimerValues[deviceId];
        console.log(`设备 ${deviceId} 需要恢复计时器，当前值：${valueToUse}`);
        startTimerWithValue(deviceId, valueToUse);
      }
    }
  }, [
    selectedDevice?.id,
    deviceTimerRunning,
    deviceTimerValues,
    selectedDevice,
    startTimerWithValue,
  ]);

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
  const startTimer = useCallback(
    (deviceId: string, overrideValue?: number) => {
      // 使用传入的覆盖值或从状态获取
      const timerValueToUse =
        overrideValue !== undefined
          ? overrideValue
          : getDeviceTimerValue(deviceId);

      // 只有当时间大于 0 时才启动计时器
      if (timerValueToUse <= 0) {
        console.log("Timer value is 0, can't start timer");
        return;
      }

      console.log(
        `startTimer: 设备=${deviceId}, 使用计时器值=${timerValueToUse}`,
      );
      // 使用通用启动方法，传入设备ID和当前时间值
      startTimerWithValue(deviceId, timerValueToUse);
    },
    [getDeviceTimerValue, startTimerWithValue],
  );

  // 修改pauseTimer确保不丢失计时器值
  const pauseTimer = useCallback(
    (deviceId: string) => {
      const interval = deviceTimerIntervalsRef.current[deviceId];
      if (interval) {
        // 记录当前计时器值
        const currentValue = getDeviceTimerValue(deviceId);
        console.log(`暂停设备 ${deviceId} 的计时器，当前值：${currentValue}`);
        clearInterval(interval);
        deviceTimerIntervalsRef.current[deviceId] = null;

        // 直接更新 deviceTimerValues 确保值被保存
        if (currentValue > 0) {
          // 使用非函数形式直接设置，确保立即更新
          const updatedValues = {
            ...deviceTimerValues,
            [deviceId]: currentValue,
          };
          setDeviceTimerValues(updatedValues);

          // 同时在备用存储中保存值
          deviceTimerBackupRef.current[deviceId] = currentValue;

          // 添加额外日志确认值已保存
          console.log(
            `已保存设备 ${deviceId} 的计时器值：${currentValue} 到设备状态和备用存储中`,
          );
        }
      }
      setDeviceTimerRunningState(deviceId, false);
    },
    [deviceTimerValues, getDeviceTimerValue, setDeviceTimerRunningState],
  );

  // Toggle timer state (start/pause) for the selected device
  const toggleTimer = useCallback(async () => {
    if (!selectedDevice) {
      console.log('no device');
      return;
    }

    const deviceId = selectedDevice.id;
    const isRunning = deviceTimerRunning[deviceId] || false;

    if (isRunning) {
      // 如果计时器正在运行，暂停它
      console.log(`UI 触发暂停命令，当前运行状态：${isRunning}`);
      pauseTimer(deviceId);

      // 如果是 Android 平台，同时停止原生层的计时器
      if (Platform.OS === 'android') {
        // 先同步计时器值，确保原生层知道最新状态
        const currentValue = deviceTimerValues[deviceId] || 0;
        BluetoothBackgroundService.syncTimerValue(deviceId, currentValue);
      }

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
      // 即使计时器已经是停止状态，也确保清理任何可能存在的定时器
      const existingInterval = deviceTimerIntervalsRef.current[deviceId];
      if (existingInterval) {
        console.log(
          `设备 ${deviceId} 状态为非运行，但发现活动的计时器，先停止再重启`,
        );
        clearInterval(existingInterval);
        deviceTimerIntervalsRef.current[deviceId] = null;
      }

      // 如果计时器未运行，启动它
      // 先检查常规计时器值
      let timerValueToUse = getDeviceTimerValue(deviceId);

      // 如果计时器值为 0，检查备份存储
      if (timerValueToUse <= 0) {
        const backupValue = deviceTimerBackupRef.current[deviceId];
        if (backupValue > 0) {
          console.log(`toggleTimer: 使用备用存储中的计时器值 ${backupValue}`);
          timerValueToUse = backupValue;
          // 同时更新常规计时器值
          setDeviceTimerValue(deviceId, backupValue);
        }
      }

      // 如果计时器值仍为 0，检查 Android 原生层
      if (timerValueToUse <= 0 && Platform.OS === 'android') {
        try {
          const nativeValue =
            await BluetoothBackgroundService.getCurrentTimerValue(deviceId);
          if (nativeValue > 0) {
            console.log(
              `toggleTimer: 使用 Android 原生层的计时器值 ${nativeValue}`,
            );
            timerValueToUse = nativeValue;
            setDeviceTimerValue(deviceId, nativeValue);
          }
        } catch (error) {
          console.error('获取原生计时器值出错：', error);
        }
      }

      // 检查是否有可用的计时器值
      if (timerValueToUse <= 0) {
        console.log('无法启动计时器，找不到有效的计时器值');
        // 可以在这里打开时间选择器
        timePickerActionSheetRef.current?.expand();
        return;
      }

      console.log(`toggleTimer: 启动计时器，值=${timerValueToUse}`);
      startTimer(deviceId, timerValueToUse);

      // 如果是 Android，同步到原生层
      if (Platform.OS === 'android') {
        BluetoothBackgroundService.syncTimerValue(deviceId, timerValueToUse);
      }

      // 设置计时器保护期，3 秒内不会被 CANCEL 命令取消
      timerProtectionRef.current[deviceId] = Date.now() + 3000; // 3 秒保护期
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
  }, [
    deviceTimerRunning,
    deviceTimerValues,
    getDeviceTimerValue,
    pauseTimer,
    selectedDevice,
    setDeviceTimerValue,
    startTimer,
    timePickerActionSheetRef,
  ]);

  // Reset timer for a specific device
  const resetTimerByDevice = useCallback(() => {
    console.log('reset timer by device');
    if (!selectedDevice) {
      return;
    }

    const deviceId = selectedDevice.id;
    // 停止计时器
    const interval = deviceTimerIntervalsRef.current[deviceId];
    if (interval) {
      clearInterval(interval);
      setDeviceTimerInterval(deviceId, null);
    }
    setDeviceTimerValue(deviceId, 0);
    setDeviceTimerRunningState(deviceId, false);
  }, [selectedDevice, setDeviceTimerRunningState, setDeviceTimerValue]);

  // Reset timer for a specific device
  const resetTimer = () => {
    console.log('reset timer');
    if (!selectedDevice) {
      return;
    }

    const deviceId = selectedDevice.id;
    // 停止计时器
    const interval = deviceTimerIntervalsRef.current[deviceId];
    if (interval) {
      clearInterval(interval);
      setDeviceTimerInterval(deviceId, null);
    }
    setDeviceTimerValue(deviceId, 0);
    setDeviceTimerRunningState(deviceId, false);
    // timePickerActionSheetRef.current?.expand();

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

  useNavigationComponentDidAppear(async () => {
    const initialDevice = devices[0];
    console.log('自动连接到第一个设备', initialDevice.name);

    // Remove loading show from here - we'll only show it after connection succeeds
    resetReceivedParams();

    // Connect to device
    console.log('开始连接设备...');
    await connectToDevice(initialDevice);

    const checkAllDeviceTimers = () => {
      // console.log('检查所有设备的计时器状态');

      Object.entries(deviceTimerRunning).forEach(([deviceId, isRunning]) => {
        // 检查标记为运行中但没有活动 interval 的设备
        if (
          isRunning &&
          !deviceTimerIntervalsRef.current[deviceId] &&
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

  useEffect(() => {
    console.log('####useEffect');
    return () => {
      console.log('####useEffect cleanup');
      // Clear loading timeout
      if (initialLoadingTimeoutRef.current) {
        clearTimeout(initialLoadingTimeoutRef.current);
        initialLoadingTimeoutRef.current = null;
      }

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
      Object.entries(subscriptionsRef.current).forEach(
        ([key, subscription]) => {
          if (subscription) {
            console.log(`清理订阅：${key}`);
            subscription.remove();
          }
        },
      );

      // 清空所有订阅和监控状态
      subscriptionsRef.current = {};
      connectionMonitorsActive.current = {};

      // 清除所有计时器
      Object.entries(deviceTimerIntervalsRef.current).forEach(
        ([deviceId, interval]) => {
          if (interval) {
            console.log(`清理设备 ${deviceId} 的计时器`);
            clearInterval(interval);
          }
        },
      );
      deviceTimerIntervalsRef.current = {};

      console.log('DevicePanelController 清理：断开连接并清理监控');
      if (timerCheckIntervalRef.current) {
        clearInterval(timerCheckIntervalRef.current);
        timerCheckIntervalRef.current = null;
      }
    };
  }, []);

  useNavigationComponentDidDisappear(async () => {
    console.log('####useNavigationComponentDidDisappear');
  });

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
      console.log('No device selected');
      return;
    }

    console.log(`Time selected: ${hours}:${minutes}:${seconds}`);
    // 计算总秒数
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;

    // 确保时间大于 0
    if (totalSeconds > 0) {
      // 设置计时器保护期，以防设置时间后立即收到 CANCEL 命令
      const deviceId = selectedDevice.id;
      timerProtectionRef.current[deviceId] = Date.now() + 3000; // 3 秒保护期
      console.log(
        `设置设备 ${deviceId} 计时器保护期至 ${new Date(
          timerProtectionRef.current[deviceId],
        ).toISOString()}`,
      );

      // 设置设备特定的时间值，但不触发额外的状态变化
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

  // Modify handleDeviceSelect to reset params and show loading
  const handleDeviceSelect = async (device: FoundDevice) => {
    console.log('Selected device:', device);

    // Reset received params but don't show loading yet
    resetReceivedParams();

    // 先检查设备是否已在运行计时器
    const isTimerRunning = deviceTimerRunning[device.id] || false;
    const currentTimerValue = deviceTimerValues[device.id] || 0;
    const hasActiveInterval = !!deviceTimerIntervalsRef.current[device.id];

    // 设置新的选中设备
    setSelectedDevice(device);

    // 如果设备未连接，则连接
    if (!getDeviceConnectionStatus(device.id)) {
      await connectToDevice(device);
    } else {
      // If already connected, show loading to sync parameters
      setIsInitialLoading(true);

      // Set timeout to hide loading after 5 seconds
      if (initialLoadingTimeoutRef.current) {
        clearTimeout(initialLoadingTimeoutRef.current);
      }

      initialLoadingTimeoutRef.current = setTimeout(() => {
        console.log('Loading timeout reached (5s), hiding loading');
        setIsInitialLoading(false);
        initialLoadingTimeoutRef.current = null;
      }, 5000);

      // For already connected device, try to get parameters
      try {
        if (selectedDevice) {
          await BLEManager.writeCharacteristic(
            selectedDevice.id,
            BLE_UUID.SERVICE,
            BLE_UUID.CHARACTERISTIC_READ,
            BLECommands.getDeviceInfo(),
          );
        }
      } catch (error) {
        console.error(
          'Error reading device info for already connected device:',
          error,
        );
        setIsInitialLoading(false);
        if (initialLoadingTimeoutRef.current) {
          clearTimeout(initialLoadingTimeoutRef.current);
          initialLoadingTimeoutRef.current = null;
        }
      }
    }

    // 检查计时器状态
    if (isTimerRunning) {
      // 计时器标记为运行
      console.log(
        `选择的设备 ${device.id} 计时器状态为运行，当前值：${currentTimerValue}`,
      );

      if (!hasActiveInterval) {
        // 计时器标记为运行但没有活动计时器 - 需要恢复
        console.log('计时器标记为运行但没有活动间隔，需要恢复计时器');

        // 获取计时器值，优先使用备用存储的值
        const backupValue = deviceTimerBackupRef.current[device.id];
        const timerValue = backupValue > 0 ? backupValue : currentTimerValue;

        if (timerValue > 0) {
          console.log(`恢复设备 ${device.id} 的计时器，使用值：${timerValue}`);
          startTimerWithValue(device.id, timerValue);
        } else {
          console.log('无法恢复计时器，没有有效的计时器值');
          setDeviceTimerRunningState(device.id, false);
        }
      } else {
        // 计时器已经在运行，不需要任何操作
        console.log(
          `设备 ${device.id} 计时器已经在运行中，值为 ${currentTimerValue}，不进行重置`,
        );
      }
    } else {
      // 计时器未运行
      console.log(
        `设备 ${device.id} 的计时器未运行，同步 UI 显示值为 ${currentTimerValue}`,
      );
      // 更新 UI 显示的时间值
      setTimerValue(currentTimerValue);
    }
  };

  const $deviceListActionSheet = (
    <DeviceListActionSheet
      ref={deviceListActionSheetRef}
      devices={devices}
      selectedDevice={selectedDevice}
      deviceConnectionStates={deviceConnectionStates}
      deviceLoadingStates={deviceLoadingStatesRef.current}
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

  const getBatteryIconByLevel = (level: number) => {
    if (level >= 90) {
      return <BatteryFull size={20} color="#10b981" />;
    } else if (level >= 50) {
      return <BatteryMedium size={20} color="#10b981" />;
    } else if (level >= 20) {
      return <BatteryLow size={20} color="#f59e0b" />;
    } else {
      return <Battery size={20} color="#ef4444" />;
    }
  };

  const $deviceInfo = (
    <View className="bg-white rounded-2xl">
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
          {getBatteryIconByLevel(
            deviceBatteryLevels[selectedDevice?.id || ''] || 0,
          )}
          <Text
            className={cn('text-base font-semibold  ml-2', {
              'text-red-500':
                deviceBatteryLevels[selectedDevice?.id || ''] < 20,
              'text-yellow-500':
                deviceBatteryLevels[selectedDevice?.id || ''] >= 20 &&
                deviceBatteryLevels[selectedDevice?.id || ''] < 50,
              'text-green-500':
                deviceBatteryLevels[selectedDevice?.id || ''] >= 50 &&
                deviceBatteryLevels[selectedDevice?.id || ''] < 90,
              'text-green-600':
                deviceBatteryLevels[selectedDevice?.id || ''] >= 90,
            })}>
            {deviceBatteryLevels[selectedDevice?.id || ''] || '0'}%
          </Text>
          <ChevronRight size={20} color="black" className="" />
        </View>
      </TouchableOpacity>
    </View>
  );

  const $timerValue = (
    <TouchableOpacity
      className="p-4 flex flex-row items-center justify-center bg-white rounded-2xl"
      onPress={() => {
        // 检查当前是否有选中的设备
        if (!selectedDevice) {
          toast.show('Please select a device first', {
            type: 'warning',
            placement: 'top',
            duration: 3000,
          });
          return;
        }

        // 检查当前选中设备的连接状态
        const isConnected = getDeviceConnectionStatus(selectedDevice.id);
        if (!isConnected) {
          toast.show(
            `${
              selectedDevice.name || 'Device'
            } is not connected, please connect it first`,
            {
              type: 'warning',
              placement: 'top',
              duration: 3000,
            },
          );
          return;
        }

        // 检查是否已设置时间但未启动
        if (!timerRunning && timerValue > 0) {
          toast.show(
            "Please click the 'Cancel' button to clear current settings before setting a new timer",
            {
              type: 'warning',
              placement: 'top',
              duration: 4000,
            },
          );
          return;
        }

        // 只有在计时器未运行且没有设置时间值时才允许打开时间选择器
        if (!timerRunning && !timerValue) {
          timePickerActionSheetRef.current?.expand();
        }
      }}
      disabled={timerRunning}>
      <Text
        className={`text-8xl ${
          timerRunning ? 'text-orange-500' : 'text-gray-700'
        } font-bold pt-4`}>
        {formatTime(timerValue)}
      </Text>
    </TouchableOpacity>
  );

  const $mode = (
    <View className="bg-white rounded-xl flex items-center justify-center">
      <TouchableOpacity
        className=""
        onPress={() => {
          modeListActionSheetRef.current?.expand();
        }}>
        <View className="border-b-2 border-blue-500">
          <Text className="font-semibold text-3xl text-blue-500">
            {selectedMode || 'Fitness'}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const onChangeIntensity = (value: number) => {
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
  };

  const $intensityControl = (
    <View className="flex-col border-gray-200 rounded-2xl">
      <View className="flex-row justify-between items-center relative gap-x-3">
        <TouchableOpacity
          className="h-14 w-14 rounded-full bg-blue-500 items-center justify-center"
          onPress={() => {
            if (intensityLevel > 1) {
              onChangeIntensity(intensityLevel - 1);
            }
          }}>
          <ChevronLeft size={24} color="white" />
        </TouchableOpacity>

        <View className="flex-1 py-4 rounded-xl bg-white items-center justify-center">
          <View className={'border-b-2 border-blue-500'}>
            <Text className="font-semibold text-3xl text-blue-500">
              {intensityLevel}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          className="h-14 w-14 rounded-full bg-blue-500 items-center justify-center"
          onPress={() => {
            if (intensityLevel < 10) {
              onChangeIntensity(intensityLevel + 1);
            }
          }}>
          <ChevronRight size={24} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const $actionsSettingList = (
    <View className="">
      <ActionsSettingList
        climbTime={climbTime}
        stopTime={stopTime}
        runTime={runTime}
        onClimbTimeChange={value => {
          // Ensure value stays within 1-10 range
          if (value >= 0 && value <= 10) {
            if (selectedDevice) {
              // Update device-specific value
              setDeviceClimbTime(selectedDevice.id, value);

              console.log(`Sending new climb time value to device: ${value}`);
              // Add device command here if needed
              BLEManager.writeCharacteristic(
                selectedDevice.id,
                BLE_UUID.SERVICE,
                BLE_UUID.CHARACTERISTIC_WRITE,
                BLECommands.setClimbingTime(value),
              )
                .then(() => {
                  console.log(`Successfully wrote climb time value: ${value}`);
                })
                .catch(error => {
                  console.error(`Error writing climb time value: ${error}`);
                });
            }
          }
        }}
        onStopTimeChange={value => {
          // Ensure value stays within 1-10 range
          if (value >= 0 && value <= 10) {
            if (selectedDevice) {
              // Update device-specific value
              setDeviceStopTime(selectedDevice.id, value);

              console.log(`Sending new stop time value to device: ${value}`);
              // Add device command here if needed
              BLEManager.writeCharacteristic(
                selectedDevice.id,
                BLE_UUID.SERVICE,
                BLE_UUID.CHARACTERISTIC_WRITE,
                BLECommands.setStopTime(value),
              )
                .then(() => {
                  console.log(`Successfully wrote stop time value: ${value}`);
                })
                .catch(error => {
                  console.error(`Error writing stop time value: ${error}`);
                });
            }
          }
        }}
        onRunTimeChange={value => {
          // Ensure value stays within 1-10 range
          if (value >= 1 && value <= 10) {
            if (selectedDevice) {
              // Update device-specific value
              setDeviceRunTime(selectedDevice.id, value);

              console.log(`Sending new run time value to device: ${value}`);
              // Add device command here if needed
              BLEManager.writeCharacteristic(
                selectedDevice.id,
                BLE_UUID.SERVICE,
                BLE_UUID.CHARACTERISTIC_WRITE,
                BLECommands.setPeakTime(value),
              )
                .then(() => {
                  console.log(`Successfully wrote run time value: ${value}`);
                })
                .catch(error => {
                  console.error(`Error writing run time value: ${error}`);
                });
            }
          }
        }}
      />
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
        {timerRunning ? 'Pause' : 'Start'}
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

  // 获取特定设备的有效计时器值，综合检查所有可能的存储位置
  const getValidTimerValue = useCallback(
    (deviceId: string): number => {
      // 首先检查常规状态值
      const stateValue = deviceTimerValues[deviceId] || 0;
      if (stateValue > 0) {
        console.log(`从状态中获取到计时器值：${stateValue}`);
        return stateValue;
      }

      // 检查备用存储
      const backupValue = deviceTimerBackupRef.current[deviceId] || 0;
      if (backupValue > 0) {
        console.log(`从备用存储中获取到计时器值：${backupValue}`);
        return backupValue;
      }

      // 找不到有效值
      console.log(`无法为设备 ${deviceId} 找到有效的计时器值`);
      return 0;
    },
    [deviceTimerValues],
  );

  // 监听当前选中设备的连接状态，当设备断开时取消计时器
  useEffect(() => {
    if (selectedDevice) {
      const deviceId = selectedDevice.id;
      const isConnected = deviceConnectionStates[deviceId] || false;

      // 检查当前选择的设备是否已断开
      if (!isConnected) {
        console.log(`检测到当前选中设备 ${deviceId} 已断开连接，取消计时器`);

        // 停止计时器
        const interval = deviceTimerIntervalsRef.current[deviceId];
        if (interval) {
          clearInterval(interval);
          deviceTimerIntervalsRef.current[deviceId] = null;
        }

        // 清除备份计时器值
        if (deviceTimerBackupRef.current[deviceId]) {
          deviceTimerBackupRef.current[deviceId] = 0;
        }

        // 更新状态
        setDeviceTimerValue(deviceId, 0);
        setDeviceTimerRunningState(deviceId, false);
      }
    }
  }, [
    selectedDevice,
    deviceConnectionStates,
    setDeviceTimerValue,
    setDeviceTimerRunningState,
  ]);

  // 添加一个全局函数，用于完全清理设备相关的所有监控和状态
  const cleanupDeviceResources = useCallback(
    (deviceId: string, showNotification = false) => {
      console.log(`完全清理设备 ${deviceId} 的所有资源和监控`);

      // 清理特性监控
      const charSubscription = subscriptionsRef.current[`char_${deviceId}`];
      if (charSubscription) {
        console.log(`清理设备 ${deviceId} 的特性监控`);
        charSubscription.remove();
        delete subscriptionsRef.current[`char_${deviceId}`];
      }

      // 清理连接监控
      const connSubscription = subscriptionsRef.current[`conn_${deviceId}`];
      if (connSubscription) {
        console.log(`清理设备 ${deviceId} 的连接监控`);
        connSubscription.remove();
        delete subscriptionsRef.current[`conn_${deviceId}`];
      }

      // 清理连接监控状态
      if (connectionMonitorsActive.current[`conn_${deviceId}`]) {
        console.log(`设置设备 ${deviceId} 的连接监控状态为非活动`);
        connectionMonitorsActive.current[`conn_${deviceId}`] = false;
      }

      // 停止计时器
      const interval = deviceTimerIntervalsRef.current[deviceId];
      if (interval) {
        console.log(`清理设备 ${deviceId} 的计时器`);
        clearInterval(interval);
        deviceTimerIntervalsRef.current[deviceId] = null;
      }

      // 清除备份存储的计时器值
      if (deviceTimerBackupRef.current[deviceId]) {
        deviceTimerBackupRef.current[deviceId] = 0;
      }

      // 更新计时器状态
      setDeviceTimerValue(deviceId, 0);
      setDeviceTimerRunningState(deviceId, false);

      // 更新连接状态
      setDeviceConnectionStates(prev => ({
        ...prev,
        [deviceId]: false,
      }));

      // 如果是当前选中的设备，直接更新 UI 显示
      if (selectedDevice?.id === deviceId) {
        setTimerValue(0);
        setTimerRunning(false);
      }

      // 如果需要显示通知
      if (showNotification) {
        const device = devices.find(d => d.id === deviceId);
        const msgName = device?.name || 'Device';
        toast.show(`${msgName} - Disconnected`, {
          type: 'danger',
          placement: 'top',
          duration: 4000,
          id: `disconnect_${deviceId}_${Date.now()}`,
        });
      }
    },
    [
      selectedDevice?.id,
      devices,
      setDeviceTimerValue,
      setDeviceTimerRunningState,
      toast,
    ],
  );

  // 为单个设备设置连接监控
  const setupConnectionMonitor = useCallback(
    async (deviceId: string) => {
      console.log(`为设备 ${deviceId} 设置连接监控`);

      // 找到设备
      const device = devices.find(d => d.id === deviceId);
      if (!device) {
        console.log(`找不到设备 ID 为 ${deviceId} 的设备`);
        return;
      }

      // 先清理现有的所有监控，确保不会重复
      cleanupDeviceResources(deviceId);

      console.log(`创建设备 ${deviceId} 的新连接监控`);

      // 创建设备的连接监控
      const subscription = BLEManager.monitorDeviceConnection(
        deviceId,
        (device, isConnected, error) => {
          if (error) {
            console.error(`设备 ${deviceId} 连接错误:`, error);
          } else {
            console.log(
              `设备 ${device.name || deviceId} 连接状态变更为：${
                isConnected ? '已连接' : '已断开'
              }`,
            );
            if (!isConnected) {
              // 设备断开时，触发一次性清理
              cleanupDeviceResources(deviceId, true); // 显示断开通知
            } else {
              // 更新连接状态
              setDeviceConnectionStates(prev => ({
                ...prev,
                [device.id]: true,
              }));

              setIsConnecting(false);

              // 显示连接成功通知
              const msgName = device.name || 'Device';
              toast.show(`${msgName} - Connected`, {
                type: 'success',
                placement: 'top',
                duration: 4000,
                id: `connect_${device.id}_${Date.now()}`,
              });
            }
          }
        },
      );

      // 在 ref 中存储监控状态
      connectionMonitorsActive.current[`conn_${deviceId}`] = true;
      subscriptionsRef.current[`conn_${deviceId}`] = subscription;
    },
    [cleanupDeviceResources, devices, toast],
  );

  // 封装设备连接逻辑为可重用的函数
  const connectToDevice = useCallback(
    async (device: FoundDevice) => {
      if (!device) {
        return;
      }

      try {
        // 如果设备已经连接，不重复连接
        if (deviceConnectionStates[device.id]) {
          console.log(`设备 ${device.name} 已经连接，无需重复连接`);
          return;
        }

        // 在连接前清理可能存在的所有订阅和状态
        cleanupDeviceResources(device.id);

        // 设置连接中状态
        setIsConnecting(true);
        // 设置加载状态
        setDeviceLoading(device.id, true);

        // 停止扫描（在连接前停止扫描是最佳实践）
        BLEManager.stopScan();

        // 连接设备
        const {connectedDevice, err} = await BLEManager.connectToDevice(
          device.id,
        );
        if (connectedDevice) {
          console.log(`Successfully connected to ${device.name}`);

          // 更新设备连接状态
          updateConnectionStatus(device.id, true);

          // Reset received params tracking for the new connection
          resetReceivedParams();

          // Show loading overlay when device connects successfully
          setIsInitialLoading(true);

          // Set timeout to hide loading after 5 seconds if params aren't received
          if (initialLoadingTimeoutRef.current) {
            clearTimeout(initialLoadingTimeoutRef.current);
          }

          initialLoadingTimeoutRef.current = setTimeout(() => {
            console.log('Loading timeout reached (5s), hiding loading');
            setIsInitialLoading(false);
            initialLoadingTimeoutRef.current = null;
          }, 5000);

          // 为设备监控连接状态
          await setupConnectionMonitor(device.id);

          // 为设备创建特性监控
          setupCharacteristicMonitor(device.id);

          try {
            await BLEManager.writeCharacteristic(
              device.id,
              BLE_UUID.SERVICE,
              BLE_UUID.CHARACTERISTIC_READ,
              BLECommands.getVersion(),
            );

            await new Promise(resolve => setTimeout(resolve, 1000));
            await BLEManager.writeCharacteristic(
              device.id,
              BLE_UUID.SERVICE,
              BLE_UUID.CHARACTERISTIC_READ,
              BLECommands.getDeviceInfo(),
            );
          } catch (error) {
            console.error('Error reading device version:', error);
            // Hide loading if there's an error retrieving device information
            setIsInitialLoading(false);
            if (initialLoadingTimeoutRef.current) {
              clearTimeout(initialLoadingTimeoutRef.current);
              initialLoadingTimeoutRef.current = null;
            }
          }
        } else if (err) {
          if (err.message?.indexOf('time out')) {
            toast.show(`${device.name ?? 'Device'} Connection time out`, {
              type: 'danger',
              placement: 'top',
              duration: 4000,
            });
          }
        }
      } catch (error) {
        const msg = `Failed to ${
          device.connected ? 'disconnect from' : 'connect to'
        } ${device.name ?? 'Device'}`;
        console.error(
          `Failed to ${device.connected ? 'disconnect from' : 'connect to'} ${
            device.name
          }:`,
          error,
        );

        toast.show(msg, {
          type: 'danger',
          placement: 'top',
          duration: 4000,
        });
        // 更新设备连接状态为断开
        updateConnectionStatus(device.id, false);
      } finally {
        // 无论成功失败，都结束加载状态（仅针对连接加载状态，不是参数加载状态）
        setDeviceLoading(device.id, false);
        setIsConnecting(false);
      }
    },
    [
      cleanupDeviceResources,
      deviceConnectionStates,
      resetReceivedParams,
      setupCharacteristicMonitor,
      setupConnectionMonitor,
      toast,
      updateConnectionStatus,
    ],
  );

  // Add AppState listener to disconnect devices when app is locked or backgrounded
  useEffect(() => {
    const appStateListener = AppState.addEventListener(
      'change',
      async nextAppState => {
        console.log('App state changed to:', nextAppState);

        // 应用从后台返回前台
        if (
          (appStateRef.current === 'background' ||
            appStateRef.current === 'inactive') &&
          nextAppState === 'active'
        ) {
          console.log(
            'App returned to foreground, verifying device connections',
          );

          // 在这里恢复原生计时器状态到 JS 层
          if (Platform.OS === 'android') {
            for (const [deviceId] of Object.entries(
              deviceConnectionStates,
            ).filter(([_, isConnected]) => isConnected)) {
              try {
                // 检查原生层的计时器值
                const nativeTimerValue =
                  await BluetoothBackgroundService.getCurrentTimerValue(
                    deviceId,
                  );
                console.log(
                  `从原生层获取设备 ${deviceId} 的计时器值：${nativeTimerValue}`,
                );

                if (nativeTimerValue > 0) {
                  // 检查 JS 层的计时器状态
                  const isRunning = deviceTimerRunning[deviceId] || false;
                  const jsTimerValue = deviceTimerValues[deviceId] || 0;

                  // 如果 JS 层计时器在运行，但值与原生层差异较大，则同步
                  if (
                    isRunning &&
                    Math.abs(jsTimerValue - nativeTimerValue) > 3
                  ) {
                    console.log(
                      `JS 层计时器值 ${jsTimerValue} 与原生层 ${nativeTimerValue} 差异较大，同步`,
                    );

                    // 停止现有 JS 计时器
                    const existingInterval =
                      deviceTimerIntervalsRef.current[deviceId];
                    if (existingInterval) {
                      clearInterval(existingInterval);
                      deviceTimerIntervalsRef.current[deviceId] = null;
                    }

                    // 更新值并重启计时器
                    setDeviceTimerValue(deviceId, nativeTimerValue);
                    startTimerWithValue(deviceId, nativeTimerValue);
                  }
                  // 如果 JS 层计时器未运行，但原生层有值，则启动 JS 计时器
                  else if (!isRunning && nativeTimerValue > 0) {
                    console.log(
                      `原生层计时器在运行 (${nativeTimerValue}秒)，但 JS 层未运行，启动 JS 计时器`,
                    );
                    setDeviceTimerValue(deviceId, nativeTimerValue);
                    startTimerWithValue(deviceId, nativeTimerValue);
                  }
                }
              } catch (error) {
                console.error(`同步设备 ${deviceId} 计时器状态时出错:`, error);
              }
            }
          }
        } else if (
          appStateRef.current === 'active' &&
          (nextAppState === 'background' || nextAppState === 'inactive')
        ) {
          // 应用进入后台时，确保后台服务已启动（如果有连接的设备）
          console.log('App is going to background');

          const hasConnectedDevices = Object.values(
            deviceConnectionStates,
          ).some(isConnected => isConnected);

          if (hasConnectedDevices && Platform.OS === 'android') {
            console.log('有已连接设备，启动后台服务');
            await BluetoothBackgroundService.startService(true);
            await BluetoothBackgroundService.updateConnectionState(true);

            // 遍历所有运行中的计时器，将值同步到原生层并启动原生计时器
            for (const [deviceId, isRunning] of Object.entries(
              deviceTimerRunning,
            )) {
              if (isRunning) {
                const timerValue = deviceTimerValues[deviceId] || 0;
                if (timerValue > 0) {
                  console.log(
                    `同步设备 ${deviceId} 的计时器值 ${timerValue} 到原生层`,
                  );

                  // 先确保同步值成功
                  await BluetoothBackgroundService.syncTimerValue(
                    deviceId,
                    timerValue,
                  );

                  // 验证同步是否成功
                  const verifiedValue =
                    await BluetoothBackgroundService.getCurrentTimerValue(
                      deviceId,
                    );
                  console.log(
                    `进入后台前确认：设备 ${deviceId} 原生层计时值 = ${verifiedValue}, 期望值 = ${timerValue}`,
                  );

                  // 如果同步不成功，再尝试一次
                  if (verifiedValue !== timerValue) {
                    console.warn('同步未成功，重试...');
                    await BluetoothBackgroundService.syncTimerValue(
                      deviceId,
                      timerValue,
                    );
                    // 再次验证
                    const reVerifiedValue =
                      await BluetoothBackgroundService.getCurrentTimerValue(
                        deviceId,
                      );
                    console.log(
                      `重试后验证：原生层计时值 = ${reVerifiedValue}`,
                    );
                  }

                  // 启动原生层的计时器，传递当前计时器值
                  await BluetoothBackgroundService.startBackgroundTimer(
                    deviceId,
                    timerValue,
                  );

                  console.log(
                    `已启动设备 ${deviceId} 的原生计时器，值 ${timerValue}`,
                  );
                }
              }
            }
          }
        }

        // 更新当前状态引用
        appStateRef.current = nextAppState;
      },
    );

    return () => {
      appStateListener.remove();
    };
  }, [
    deviceConnectionStates,
    deviceTimerRunning,
    deviceTimerValues,
    setDeviceTimerValue,
    startTimerWithValue,
  ]);

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaView className="flex-1 bg-[#f5f5f5]">
        <View className={'flex flex-1 flex-col justify-between p-4'}>
          {$deviceInfo}
          <View className={'flex flex-1 flex-col gap-y-6 mt-8'}>
            <View className={''}>{$timerValue}</View>
            <View className="flex-col gap-y-6 p-4 bg-white rounded-2xl">
              {$mode}
              {$intensityControl}
              {$actionsSettingList}
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

        {/* Loading overlay */}
        {isInitialLoading && <Loading />}
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
