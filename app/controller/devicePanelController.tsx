import BottomSheet from '@gorhom/bottom-sheet';
import Slider from '@react-native-community/slider';
import { Battery, ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Text, TouchableOpacity, View } from 'react-native';
import { Subscription } from 'react-native-ble-plx';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationFunctionComponent } from 'react-native-navigation';
import {
  useNavigationComponentDidAppear,
  useNavigationComponentDidDisappear,
} from 'react-native-navigation-hooks';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useToast } from 'react-native-toast-notifications';
import DeviceListActionSheet from '../components/device-list-action-sheet/deviceListActionSheet';
import ModeListActionSheet, {
  Modes,
} from '../components/mode-list-action-sheet/modeListActionSheet';
import { FoundDevice } from '../components/scan-found-device/scanFoundDevice';
import { TimePickerActionSheet } from '../components/time-picker-action-sheet/timePickerActionSheet';
import { BLEManager } from '../services/BLEManager';
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

const DevicePanelController: NavigationFunctionComponent<
  DevicePanelControllerProps
> = ({ devices }) => {
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
  const deviceTimerIntervalsRef = useRef<Record<string, NodeJS.Timeout | null>>({});

  // 将 deviceLoadingStates 从 state 改为 ref
  const deviceLoadingStatesRef = useRef<Record<string, boolean>>({});

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
  }>({ deviceId: '', status: 0 });

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
      console.log(`设置设备 ${deviceId} 计时器保护期至 ${new Date(timerProtectionRef.current[deviceId]).toISOString()}`);

      console.log(`启动设备 ${deviceId} 的计时器，初始值: ${seconds} 秒`);

      // 记录上次更新时间，确保间隔约为1秒
      const lastUpdateTimeRef = { current: Date.now() };

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

  // 设备特性监控的创建函数
  const setupCharacteristicMonitor = (deviceId: string) => {
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
            const { command, data } = parsedResponse;
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
            } else if (command === CommandType.GET_DEVICE_INFO) {
              const subCommand = data[0];
              console.log('subCommand', subCommand);
              if (subCommand === CommandType.GET_INTENSITY) {
                // 设置设备强度 返回强度：5A 02 01 09 03 05 01 32 A1
                if (data.length >= 3) {
                  const intensity = data[2];
                  setDeviceIntensity(deviceId, intensity);

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
                if (data.length >= 3) {
                  const highByte = data[1];
                  const lowByte = data[2];
                  const workTime = (highByte << 8) | lowByte;

                  // reply work time
                  BLEManager.writeCharacteristic(
                    deviceId,
                    BLE_UUID.SERVICE,
                    BLE_UUID.CHARACTERISTIC_READ,
                    BLECommands.replyWorkTime(workTime),
                  )
                    .then(() => {
                      console.log('Successfully reply work time');
                    })
                    .catch(error => {
                      console.error('Error reply work time:', error);
                    });

                  console.log('设备发送的倒计时时间：', workTime);

                  // 更新设备计时器值
                  setDeviceTimerValue(deviceId, workTime);
                  
                  // 同时更新备用存储
                  if (workTime > 0) {
                    deviceTimerBackupRef.current[deviceId] = workTime;
                    console.log(`已保存设备 ${deviceId} 的倒计时值 ${workTime} 到备用存储`);
                  }
                  
                  // 检查计时器是否在运行
                  const isRunning = deviceTimerRunning[deviceId] || false;
                  const hasActiveInterval = !!deviceTimerIntervalsRef.current[deviceId];
                  
                  if (workTime > 0) {
                    // 记录原始的运行状态，避免 UI 闪烁
                    const wasRunning = isRunning;
                    
                    // 如果有活动的计时器，停止它，但不改变运行状态
                    if (hasActiveInterval) {
                      console.log(`设备 ${deviceId} 接收到新的倒计时时间，重新启动计时器`);
                      const interval = deviceTimerIntervalsRef.current[deviceId];
                      if (interval) {
                        clearInterval(interval);
                        deviceTimerIntervalsRef.current[deviceId] = null;
                      }
                      // 不在这里设置运行状态为 false
                    } else {
                      console.log(`设备 ${deviceId} 接收到新的倒计时时间，启动新计时器`);
                    }
                    
                    // 启动新的计时器，保持原来的运行状态
                    if (selectedDevice && selectedDevice.id === deviceId) {
                      // 如果计时器之前在运行，则保持运行状态
                      if (wasRunning) {
                        startTimer(deviceId, workTime);
                      } else {
                        // 只更新值，不启动计时器
                        setDeviceTimerValue(deviceId, workTime);
                      }
                    } else {
                      // 对于非选中设备，按照原来状态处理
                      if (wasRunning) {
                        startTimerWithValue(deviceId, workTime);
                      } else {
                        // 只更新计时器值，不启动
                        setDeviceTimerValue(deviceId, workTime);
                      }
                    }
                    
                    // 设置计时器保护期
                    timerProtectionRef.current[deviceId] = Date.now() + 3000; // 3 秒保护期
                  } else {
                    // 如果工作时间为 0 且计时器在运行，停止计时器
                    if (isRunning && hasActiveInterval) {
                      console.log(`设备 ${deviceId} 接收到 0 倒计时，停止计时器`);
                      const interval = deviceTimerIntervalsRef.current[deviceId];
                      if (interval) {
                        clearInterval(interval);
                        deviceTimerIntervalsRef.current[deviceId] = null;
                      }
                      setDeviceTimerRunningState(deviceId, false);
                    }
                  }
                }
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
                  const protectionEndTime = timerProtectionRef.current[deviceId] || 0;
                  const isProtected = Date.now() < protectionEndTime;

                  // 获取设备计时器信息 - 直接从deviceTimerValues获取，不依赖getDeviceTimerValue
                  const deviceLastValue = deviceTimerValues[deviceId] || 0;
                  const isRunning = deviceTimerRunning[deviceId] || false;

                  console.log(`处理设备状态：设备=${deviceId}, 状态=${status}, 暂存计时器值=${deviceLastValue}, 运行状态=${isRunning}`);

                  // 直接在这里处理状态变化，无需经过状态更新和useEffect
                  if (status === CommandType.DEVICE_STATUS_CANCEL) {
                    if (isProtected && isRunning) {
                      console.log('收到CANCEL状态，但计时器处于保护期内，忽略此命令');
                    } else {
                      console.log('收到CANCEL状态，取消倒计时');

                      // 注意：这里需要处理指定设备的计时器，而不是selectedDevice
                      // 如果当前设备就是selectedDevice，则可以直接使用resetTimerByDevice
                      if (selectedDevice && selectedDevice.id === deviceId) {
                        resetTimerByDevice(); // 这个函数内部会使用selectedDevice.id
                      } else {
                        // 否则手动清除指定设备的计时器
                        const interval = deviceTimerIntervalsRef.current[deviceId];
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
                          const interval = deviceTimerIntervalsRef.current[deviceId];
                          if (interval) {
                            clearInterval(interval);
                            deviceTimerIntervalsRef.current[deviceId] = null;
                          }
                          setDeviceTimerRunningState(deviceId, false);
                        }
                      } else {
                        // 即使计时器未运行，也应该处理暂停命令，确保状态同步
                        console.log(`收到暂停命令，设备 ${deviceId} 计时器未运行，但仍设置状态为暂停`);

                        // 备份当前计时器值，以防万一
                        const currentValue = deviceTimerValues[deviceId] || 0;
                        if (currentValue > 0) {
                          deviceTimerBackupRef.current[deviceId] = currentValue;
                          console.log(`已保存设备 ${deviceId} 的计时器值：${currentValue} 到备用存储中`);
                        }

                        // 确保设置运行状态为 false
                        setDeviceTimerRunningState(deviceId, false);

                        // 清理可能存在的计时器
                        const interval = deviceTimerIntervalsRef.current[deviceId];
                        if (interval) {
                          console.log(`发现设备 ${deviceId} 有活动的计时器但状态为非运行，清除计时器`);
                          clearInterval(interval);
                          deviceTimerIntervalsRef.current[deviceId] = null;
                        }
                      }
                    } else {
                      // 处理启动命令 - 总是检查 deviceTimerValues
                      // 首先检查是否已有计时器在运行
                      const isAlreadyRunning = deviceTimerRunning[deviceId] || false;
                      const existingInterval = deviceTimerIntervalsRef.current[deviceId];

                      if (isAlreadyRunning && existingInterval) {
                        console.log(`收到启动命令，但设备 ${deviceId} 计时器已经在运行中，忽略此命令`);
                      } else if (isAlreadyRunning && !existingInterval) {
                        // 状态不一致：状态为运行但没有活动计时器
                        console.log(`状态不一致：设备 ${deviceId} 状态为运行但没有活动计时器，尝试恢复`);

                        // 查找有效的计时器值
                        const timerValue = getValidTimerValue(deviceId);
                        if (timerValue > 0) {
                          console.log(`找到有效的计时器值 ${timerValue}，恢复计时器`);
                          if (selectedDevice && selectedDevice.id === deviceId) {
                            setDeviceTimerValue(deviceId, timerValue);
                            startTimer(deviceId, timerValue);
                          } else {
                            startTimerWithValue(deviceId, timerValue);
                          }
                        } else {
                          console.log(`无法找到有效的计时器值，将状态设为非运行`);
                          setDeviceTimerRunningState(deviceId, false);
                        }
                      } else {
                        // 常规启动逻辑（设备未运行）
                        if (deviceLastValue > 0) {
                          console.log(`处理设备 ${deviceId} 启动命令，使用暂存计时器值 ${deviceLastValue}`);

                          if (selectedDevice && selectedDevice.id === deviceId) {
                            // 确保计时器值正确设置
                            setDeviceTimerValue(deviceId, deviceLastValue);
                            startTimer(deviceId, deviceLastValue);
                          } else {
                            // 手动启动指定设备的计时器
                            startTimerWithValue(deviceId, deviceLastValue);
                          }
                        } else {
                          // 检查是否存在最新的计时器值 (直接查询 deviceTimerValues 而不是依赖缓存值)
                          console.log(`设备启动命令检测：deviceTimerValues 完整内容:`, JSON.stringify(deviceTimerValues));
                          const latestTimerValue = deviceTimerValues[deviceId];

                          // 检查备用存储
                          const backupValue = deviceTimerBackupRef.current[deviceId];
                          console.log(`备用存储中的计时器值：${backupValue || 0}`);

                          // 使用备用存储或状态中的值，优先使用备用存储
                          const finalValue = (backupValue && backupValue > 0) ? backupValue :
                            (latestTimerValue && latestTimerValue > 0) ? latestTimerValue : 0;

                          if (finalValue > 0) {
                            console.log(`发现设备 ${deviceId} 有有效的计时器值：${finalValue}，将使用该值启动`);

                            if (selectedDevice && selectedDevice.id === deviceId) {
                              setDeviceTimerValue(deviceId, finalValue);
                              // 直接传入 finalValue 作为覆盖值
                              startTimer(deviceId, finalValue);
                            } else {
                              // 直接使用找到的值启动计时器
                              startTimerWithValue(deviceId, finalValue);
                            }
                          } else {
                            console.log(`收到启动命令，但设备 ${deviceId} 没有有效的计时器值，无法启动`);
                          }
                        }
                      }
                    }
                  }

                  // 更新设备状态 (仅用于记录)
                  setDeviceStatus({ deviceId, status });

                
                }
              }
            }
          }
        }
      },
    );

    // 只存储在 ref 中，不再使用状态
    subscriptionsRef.current[`char_${deviceId}`] = subscription;
  };

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
      const { connectedDevice, err } = await BLEManager.connectToDevice(
        device.id,
      );
      if (connectedDevice) {
        console.log(`Successfully connected to ${device.name}`);

        // 更新设备连接状态
        updateConnectionStatus(device.id, true);

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
      const msg = `Failed to ${device.connected ? 'disconnect from' : 'connect to'
      } ${device.name ?? 'Device'}`;
      console.error(
        `Failed to ${device.connected ? 'disconnect from' : 'connect to'} ${device.name
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
        console.log('set current device timer value', value)
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
      const currentIntensity = deviceIntensities[deviceId] || 50;

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
        console.log(
          `设备 ${deviceId} 需要恢复计时器，当前值：${valueToUse}`,
        );
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
      const timerValueToUse = overrideValue !== undefined
        ? overrideValue
        : getDeviceTimerValue(deviceId);

      // 只有当时间大于 0 时才启动计时器
      if (timerValueToUse <= 0) {
        console.log("Timer value is 0, can't start timer");
        return;
      }

      console.log(`startTimer: 设备=${deviceId}, 使用计时器值=${timerValueToUse}`);
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
        console.log(
          `暂停设备 ${deviceId} 的计时器，当前值：${currentValue}`,
        );
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
          console.log(`已保存设备 ${deviceId} 的计时器值：${currentValue} 到设备状态和备用存储中`);
        }
      }
      setDeviceTimerRunningState(deviceId, false);
    },
    [deviceTimerValues, getDeviceTimerValue, setDeviceTimerRunningState],
  );

  // Toggle timer state (start/pause) for the selected device
  const toggleTimer = useCallback(() => {
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
        console.log(`设备 ${deviceId} 状态为非运行，但发现活动的计时器，先停止再重启`);
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

      // 检查是否有可用的计时器值
      if (timerValueToUse <= 0) {
        console.log(`无法启动计时器，找不到有效的计时器值`);
        // 可以在这里打开时间选择器
        timePickerActionSheetRef.current?.expand();
        return;
      }

      console.log(`toggleTimer: 启动计时器，值=${timerValueToUse}`);
      startTimer(deviceId, timerValueToUse);
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
  }, [deviceTimerRunning, getDeviceTimerValue, pauseTimer, selectedDevice, setDeviceTimerValue, startTimer, timePickerActionSheetRef]);

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
  }, [
    selectedDevice,
    setDeviceTimerRunningState,
    setDeviceTimerValue,
  ]);

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

  // 为单个设备设置连接监控
  const setupConnectionMonitor = async (deviceId: string) => {
    console.log(`为设备 ${deviceId} 设置连接监控`);
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
          setDeviceConnectionStates(prev => ({
            ...prev,
            [device.id]: isConnected,
          }));

          setIsConnecting(false);
          console.log(
            `设备 ${device.name} 现在是 ${isConnected ? '已连接' : '已断开'
            } 状态`,
          );

          const msgName = device.name ? device.name : 'Device';
          if (!isConnected) {
            // 设备断开连接时，无条件取消任何可能的倒计时
            console.log(`设备 ${device.id} 断开连接，取消任何可能的倒计时`);
            
            // 停止计时器
            const interval = deviceTimerIntervalsRef.current[device.id];
            if (interval) {
              clearInterval(interval);
              deviceTimerIntervalsRef.current[device.id] = null;
            }
            
            // 清除备份存储的计时器值
            if (deviceTimerBackupRef.current[device.id]) {
              deviceTimerBackupRef.current[device.id] = 0;
            }
            
            // 更新计时器状态
            setDeviceTimerValue(device.id, 0);
            setDeviceTimerRunningState(device.id, false);
            
            // 如果是当前选中的设备，直接更新 UI 显示
            if (selectedDevice?.id === device.id) {
              setTimerValue(0);
              setTimerRunning(false);
            }
            
            // 清理设备的特性监控
            const charSubscription = subscriptionsRef.current[`char_${deviceId}`];
            if (charSubscription) {
              console.log(`清理设备 ${device.id} 的特性监控`);
              charSubscription.remove();
              delete subscriptionsRef.current[`char_${deviceId}`];
            }
            
            toast.show(`${msgName} - Disconnected`, {
              type: 'danger',
              placement: 'top',
              duration: 4000,
            });
          } else if (isConnected) {
            // show toast
            toast.show(`${msgName} - Connected`, {
              type: 'success',
              placement: 'top',
              duration: 4000,
            });
          }
        }
      },
    );

    // 在 ref 中存储监控状态
    connectionMonitorsActive.current[`conn_${deviceId}`] = true;
    subscriptionsRef.current[`conn_${deviceId}`] = subscription;
  };

  useNavigationComponentDidAppear(async () => {
    const initialDevice = devices[0];
    console.log('自动连接到第一个设备', initialDevice.name);
    // 连接设备并等待成功
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
    Object.entries(deviceTimerIntervalsRef.current).forEach(([_, interval]) => {
      if (interval) {
        clearInterval(interval);
      }
    });

    console.log('DevicePanelController 清理：断开连接并清理监控');
    if (timerCheckIntervalRef.current) {
      clearInterval(timerCheckIntervalRef.current);
    }
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
      console.log(`设置设备 ${deviceId} 计时器保护期至 ${new Date(timerProtectionRef.current[deviceId]).toISOString()}`);

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

  // 修改设备选择回调函数
  const handleDeviceSelect = async (device: FoundDevice) => {
    console.log('Selected device:', device);

    // 先检查设备是否已在运行计时器
    const isTimerRunning = deviceTimerRunning[device.id] || false;
    const currentTimerValue = deviceTimerValues[device.id] || 0;
    const hasActiveInterval = !!deviceTimerIntervalsRef.current[device.id];

    // 设置新的选中设备
    setSelectedDevice(device);

    // 如果设备未连接，则连接
    if (!getDeviceConnectionStatus(device.id)) {
      await connectToDevice(device);
    }

    // 检查计时器状态
    if (isTimerRunning) {
      // 计时器标记为运行
      console.log(`选择的设备 ${device.id} 计时器状态为运行，当前值：${currentTimerValue}`);

      if (!hasActiveInterval) {
        // 计时器标记为运行但没有活动计时器 - 需要恢复
        console.log(`计时器标记为运行但没有活动间隔，需要恢复计时器`);

        // 获取计时器值，优先使用备用存储的值
        const backupValue = deviceTimerBackupRef.current[device.id];
        const timerValue = backupValue > 0 ?
          backupValue :
          currentTimerValue;

        if (timerValue > 0) {
          console.log(`恢复设备 ${device.id} 的计时器，使用值：${timerValue}`);
          startTimerWithValue(device.id, timerValue);
        } else {
          console.log(`无法恢复计时器，没有有效的计时器值`);
          setDeviceTimerRunningState(device.id, false);
        }
      } else {
        // 计时器已经在运行，不需要任何操作
        console.log(`设备 ${device.id} 计时器已经在运行中，值为 ${currentTimerValue}，不进行重置`);
      }
    } else {
      // 计时器未运行
      console.log(`设备 ${device.id} 的计时器未运行，同步 UI 显示值为 ${currentTimerValue}`);
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
              transform: [{ scale: pulseAnim }],
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
          className={`text-xs ${isCurrentDeviceConnected ? 'text-green-600' : 'text-red-500'
          }`}>
          {isCurrentDeviceConnected ? 'Connected' : 'Disconnected'}
        </Text>
      </View>
    );
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
          <ChevronRight size={20} color="black" className="ml-2" />
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
          toast.show('请先选择一个设备', {
            type: 'warning',
            placement: 'top',
            duration: 3000,
          });
          return;
        }
        
        // 检查当前选中设备的连接状态
        const isConnected = getDeviceConnectionStatus(selectedDevice.id);
        if (!isConnected) {
          toast.show(`${selectedDevice.name || '设备'} 未连接，请先连接设备`, {
            type: 'warning',
            placement: 'top',
            duration: 3000,
          });
          return;
        }
        
        // 只有在计时器未运行且没有设置时间值时才允许打开时间选择器
        if (!timerRunning && !timerValue) {
          timePickerActionSheetRef.current?.expand();
        }
      }}
      disabled={timerRunning}>
      <Text
        className={`text-8xl ${timerRunning ? 'text-orange-500' : 'text-gray-700'
        } font-bold pt-4`}>
        {formatTime(timerValue)}
      </Text>
    </TouchableOpacity>
  );

  const changeToNextMode = () => {
    const currentIndex = Modes.findIndex(m => m.name === selectedMode);
    const nextIndex = (currentIndex + 1) % Modes.length;
    const nextMode = Modes[nextIndex];
    handleModeSelect(nextMode.id, nextMode.name);
  };

  const changeToPreviousMode = () => {
    const currentIndex = Modes.findIndex(m => m.name === selectedMode);
    const previousIndex = (currentIndex - 1 + Modes.length) % Modes.length;
    const previousMode = Modes[previousIndex];
    handleModeSelect(previousMode.id, previousMode.name);
  };

  const $intensityControl = (
    <View className="flex-col border-gray-200 rounded-2xl">
      <View className="flex-row justify-between items-center relative gap-x-3">
        <TouchableOpacity
          className="h-14 w-14 rounded-full bg-blue-500 items-center justify-center"
          onPress={changeToPreviousMode}>
          <ChevronLeft size={24} color="white" />
        </TouchableOpacity>

        <TouchableOpacity
          className="flex-1 py-4 rounded-xl bg-white items-center justify-center"
          onPress={() => {
            modeListActionSheetRef.current?.expand();
          }}>
          <View className={'border-b-2 border-blue-500'}>
            <Text className="font-semibold text-3xl text-blue-500">
              {selectedMode}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          className="h-14 w-14 rounded-full bg-blue-500 items-center justify-center"
          onPress={changeToNextMode}>
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
        minimumValue={1}
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
        maximumTrackTintColor="#D1D5DB"
      />

      <View className="flex-row items-center justify-between ">
        <Text className="text-lg font-semibold text-blue-500">1</Text>
        <Text className="text-lg font-semibold text-blue-500">100</Text>
      </View>
    </View>
  );

  const $startAndPauseActivity = (
    <TouchableOpacity
      className={`py-4 rounded-lg items-center justify-center ${timerValue > 0
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
      className={`items-center justify-center ${timerValue > 0 ? 'border-blue-500' : 'border-gray-300'
      }`}
      onPress={resetTimer}
      disabled={timerValue === 0}>
      <Text
        className={`font-semibold text-base ${timerValue > 0 ? 'text-blue-500' : 'text-gray-500'
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
  }, [selectedDevice, deviceConnectionStates, setDeviceTimerValue, setDeviceTimerRunningState]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
