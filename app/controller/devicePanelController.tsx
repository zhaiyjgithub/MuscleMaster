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
import {Animated, AppState, Text, TouchableOpacity, View} from 'react-native';
import {Subscription} from 'react-native-ble-plx';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {NavigationFunctionComponent} from 'react-native-navigation';
import {
  useNavigationComponentDidAppear,
  useNavigationComponentDidDisappear,
} from 'react-native-navigation-hooks';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useToast} from 'react-native-toast-notifications';
import ActionsSettingList from '../components/actions-setting-list/actionsSettingList';
import DeviceListActionSheet from '../components/device-list-action-sheet/deviceListActionSheet';
import ModeListActionSheet, {
  Modes,
} from '../components/mode-list-action-sheet/modeListActionSheet';
import {FoundDevice} from '../components/scan-found-device/scanFoundDevice';
import {TimePickerActionSheet} from '../components/time-picker-action-sheet/timePickerActionSheet';
import {cn} from '../lib/utils';
import {BLEManager} from '../services/BLEManager';
import {
  BLE_UUID,
  BLECommands,
  CommandType,
  DeviceMode,
  parseResponse,
} from '../services/protocol';
import TimerDevice from './model/timerDevice.ts';
import {sendTurnOffCmd} from './service/service.ts';
import Loading from './view/loading';

export interface DevicePanelControllerProps {
  devices: FoundDevice[];
  initialSelectedDeviceId?: string;
}

const DevicePanelController: NavigationFunctionComponent<
  DevicePanelControllerProps
> = ({devices, initialSelectedDeviceId}) => {
  const [isConnecting, setIsConnecting] = useState(false);

  // 将 deviceLoadingStates 从 state 改为 ref
  const deviceLoadingStatesRef = useRef<Record<string, boolean>>({});

  // Add AppState ref to track previous state
  const appStateRef = useRef(AppState.currentState);

  const modeListActionSheetRef = useRef<BottomSheet>(null);
  const deviceListActionSheetRef = useRef<BottomSheet>(null);
  const timePickerActionSheetRef = useRef<BottomSheet>(null);

  const toast = useToast();

  // 创建一个动画值用于状态指示器的呼吸效果
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // 使用 refs 存储设备订阅，避免依赖循环
  const subscriptionsRef = useRef<Record<string, Subscription | null>>({});
  const connectionMonitorsActive = useRef<Record<string, boolean>>({});

  // Add loading state variables
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const initialLoadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track received device parameters
  const receivedParamsRef = useRef({
    workTime: false,
    intensity: false,
    mode: false,
  });

  const [timerDevices, setTimerDevices] = useState<TimerDevice[]>(() => {
    return devices.map(device => ({
      id: device.id,
      name: device.name,
      timer: null,
      timerValue: 0,
      timerStatus: 'stopped',
      connectionStatus: 'disconnected',
      climbingTime: 3,
      runningTime: 5,
      stopTime: 3,
      battery: 0,
      mode: '',
      intensity: 1,
      version: '',
      selected: initialSelectedDeviceId === device.id,
    }));
  });

  // 监听 initialSelectedDeviceId 的变化，更新选中状态
  useEffect(() => {
    if (initialSelectedDeviceId) {
      setTimerDevices(prevDevices =>
        prevDevices.map(device => ({
          ...device,
          selected: device.id === initialSelectedDeviceId,
        })),
      );
    }
  }, [initialSelectedDeviceId]);

  const [currentTimeValue, setCurrentTimeValue] = useState(0);

  const slog = (message: string, ...args: unknown[]) => {
    // console.log(`[App] ${message}`, ...args);
  };

  const getCurrentSelectedDevice = () => {
    return timerDevices.find(device => device.selected);
  };

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

  // 获取设备状态颜色
  const getDeviceStatusColor = () => {
    if (isConnecting) {
      return '#f59e0b';
    } // 黄色，连接中

    // 检查当前选中设备的连接状态
    const currentSelectedDevice = timerDevices.find(device => device.selected);
    if (
      currentSelectedDevice &&
      currentSelectedDevice.connectionStatus === 'connected'
    ) {
      return '#10b981';
    } // 绿色，已连接

    return '#ef4444'; // 红色，未连接
  };

  // Function to check if all required parameters are received
  const checkAllParamsReceived = useCallback(() => {
    const {workTime, intensity, mode} = receivedParamsRef.current;

    if (workTime && intensity && mode) {
      slog('All required device parameters received, hiding loading');
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
      slog(`发现设备 ${deviceId} 已存在特性监控，先移除它`);
      existingSubscription.remove();
      delete subscriptionsRef.current[`char_${deviceId}`];
    }

    slog('开始监控蓝牙特性');
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
          slog(`Received value from device ${deviceId}:`, characteristic.value);
          const parsedResponse = parseResponse(characteristic.value);

          // 检查是否为有效响应
          if (parsedResponse.isValid) {
            // 判断命令类型
            slog('Monitored characteristic value:', parsedResponse);
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

                // 更新当前选择设备的版本
                const updatedTimerDevices = timerDevices.map(d => {
                  if (d.id === deviceId) {
                    d.version = formattedVersion;
                  }
                  return d;
                });
                setTimerDevices(updatedTimerDevices);
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
              // 更新当前选择设备的电池
              const updatedTimerDevices = timerDevices.map(d => {
                if (d.id === deviceId) {
                  d.battery = batteryLevel;
                }
                return d;
              });
              setTimerDevices(updatedTimerDevices);
            } else if (command === CommandType.GET_DEVICE_INFO) {
              const subCommand = data[0] as CommandType;
              slog('subCommand', subCommand);
              if (subCommand === CommandType.GET_INTENSITY) {
                // 设置设备强度 返回强度：5A 02 01 09 03 05 01 32 A1
                if (data.length >= 3) {
                  const intensity = data[2];
                  // 更新当前选择设备的强度
                  const updatedTimerDevices = timerDevices.map(d => {
                    if (d.id === deviceId) {
                      d.intensity = intensity;
                    }
                    return d;
                  });
                  setTimerDevices(updatedTimerDevices);
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
                      slog('Successfully reply intensity value:', intensity);
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
                    // 更新当前选择设备的模式
                    const updatedTimerDevices = timerDevices.map(d => {
                      if (d.id === deviceId) {
                        d.mode = mode.name;
                      }
                      return d;
                    });
                    setTimerDevices(updatedTimerDevices);
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
                        slog('Successfully reply mode value:', modeId);
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

                  // Mark work time as received
                  receivedParamsRef.current.workTime = true;
                  checkAllParamsReceived();

                  // reply work time
                  BLEManager.writeCharacteristic(
                    deviceId,
                    BLE_UUID.SERVICE,
                    BLE_UUID.CHARACTERISTIC_READ,
                    BLECommands.replyWorkTime(workTime),
                  )
                    .then(() => {
                      slog('Successfully reply work time');
                    })
                    .catch(error => {
                      console.error('Error reply work time:', error);
                    });

                  slog('设备发送的倒计时时间：', workTime);
                  // 更新当前选择设备的计时器值
                  const updatedTimerDevices = timerDevices.map(d => {
                    if (d.id === deviceId) {
                      d.timerStatus = 'stopped';
                      d.timerValue = workTime;
                    }
                    return d;
                  });
                  slog('当前同步设备的', updatedTimerDevices);
                  // 更新当前选择设备的计时器值
                  const currentSelectedDevice = getCurrentSelectedDevice();
                  if (currentSelectedDevice?.id === deviceId) {
                    setCurrentTimeValue(workTime);
                  }
                  setTimerDevices(updatedTimerDevices);
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
                      slog('Successfully reply device status:', status);
                    })
                    .catch(error => {
                      console.error('Error reply device status:', error);
                    });

                  slog(
                    '获取设备的开关状态：channel',
                    channel,
                    'status',
                    status,
                  );
                  // 直接在这里处理状态变化，无需经过状态更新和 useEffect
                  if (status === CommandType.DEVICE_STATUS_CANCEL) {
                    // 处理取消命令
                    const updatedTimerDevices = timerDevices.map(d => {
                      if (d.id === deviceId) {
                        d.timerStatus = 'paused';
                        d.timer && clearInterval(d.timer);
                        d.timer = null;
                        d.timerValue = 0;
                      }
                      return d;
                    });
                    setTimerDevices(updatedTimerDevices);
                  } else if (status === CommandType.DEVICE_STATUS_START) {
                    // 处理启动命令
                    const updatedTimerDevices = timerDevices.map(d => {
                      if (d.id === deviceId) {
                        d.timerStatus = 'running';
                        d.timer && clearInterval(d.timer);
                        d.timer = setInterval(() => {
                          if (d.timerStatus !== 'running') {
                            slog('设备没有在启动，忽略');
                            return;
                          }
                          d.timerValue -= 1;
                          if (d.timerValue <= 0) {
                            d.timerStatus = 'stopped';
                            d.timer && clearInterval(d.timer);
                            d.timer = null;
                            d.timerValue = 0;
                            slog('设备倒计时结束, 发送关机命令', d.id);
                            sendTurnOffCmd(d.id).then();
                          }
                          const td = timerDevices.find(d => d.selected);
                          slog(
                            '倒计时 当前 数组选中设备',
                            td?.id,
                            '倒计时的 value',
                            d.timerValue,
                          );
                          if (td?.id === d.id) {
                            setCurrentTimeValue(d.timerValue);
                          } else {
                            slog('当前不是选择该设备，无需更新 UI');
                          }
                        }, 1000);
                      }
                      return d;
                    });
                    setTimerDevices(updatedTimerDevices);
                  } else if (status === CommandType.DEVICE_STATUS_STOP) {
                    // 处理暂停命令
                    const updatedTimerDevices = timerDevices.map(d => {
                      if (d.id === deviceId) {
                        d.timerStatus = 'paused';
                        d.timer && clearInterval(d.timer);
                        d.timer = null;
                      }
                      return d;
                    });
                    setTimerDevices(updatedTimerDevices);
                  }
                }
              } else if (subCommand === CommandType.SET_CLIMBING_TIME) {
                let climbingTime = data[1];
                if (climbingTime < 0) {
                  climbingTime = 0;
                } else if (climbingTime > 10) {
                  climbingTime = 10;
                }

                // 更新当前选择设备的攀爬时间
                const updatedTimerDevices = timerDevices.map(d => {
                  if (d.id === deviceId) {
                    d.climbingTime = climbingTime;
                  }
                  return d;
                });
                setTimerDevices(updatedTimerDevices);
                slog('setDeviceClimbTime', deviceId, climbingTime);

                // 回复设备
                BLEManager.writeCharacteristic(
                  deviceId,
                  BLE_UUID.SERVICE,
                  BLE_UUID.CHARACTERISTIC_READ,
                  BLECommands.replyClimbingTime(climbingTime),
                )
                  .then(() => {
                    slog('Successfully reply climb time');

                    // 确保 UI 更新
                    const currentSelectedDevice = getCurrentSelectedDevice();
                    if (currentSelectedDevice?.id === deviceId) {
                      slog(
                        `设备 ${deviceId} 的攀爬时间已更新为 ${climbingTime}，UI 应该自动更新`,
                      );
                    }
                  })
                  .catch(error => {
                    console.error('Error reply climb time:', error);
                  });
              } else if (subCommand === CommandType.SET_STOP_TIME) {
                let stopTime = data[1];
                if (stopTime < 2) {
                  stopTime = 2;
                } else if (stopTime > 10) {
                  stopTime = 10;
                }
                // 更新设备停止时间
                const updatedTimerDevices = timerDevices.map(d => {
                  if (d.id === deviceId) {
                    d.stopTime = stopTime;
                  }
                  return d;
                });
                setTimerDevices(updatedTimerDevices);
                // 回复设备
                BLEManager.writeCharacteristic(
                  deviceId,
                  BLE_UUID.SERVICE,
                  BLE_UUID.CHARACTERISTIC_READ,
                  BLECommands.replyStopTime(stopTime),
                )
                  .then(() => {
                    slog('Successfully reply stop time');
                  })
                  .catch(error => {
                    console.error('Error reply stop time:', error);
                  });
              } else if (subCommand === CommandType.SET_PEEK_TIME) {
                let peakTime = data[1];
                if (peakTime < 1) {
                  peakTime = 1;
                } else if (peakTime > 10) {
                  peakTime = 10;
                }
                // 更新设备运行时间
                const updatedTimerDevices = timerDevices.map(d => {
                  if (d.id === deviceId) {
                    d.runningTime = peakTime;
                  }
                  return d;
                });
                setTimerDevices(updatedTimerDevices);

                // 回复设备
                BLEManager.writeCharacteristic(
                  deviceId,
                  BLE_UUID.SERVICE,
                  BLE_UUID.CHARACTERISTIC_READ,
                  BLECommands.replyPeakTime(peakTime),
                )
                  .then(() => {
                    slog('Successfully reply peak time');
                  })
                  .catch(error => {
                    console.error('Error reply peak time:', error);
                  });
              }
            }
          }
        }
      },
    );

    // 只存储在 ref 中，不再使用状态
    subscriptionsRef.current[`char_${deviceId}`] = subscription;
  };

  // 修改模式选择逻辑
  const handleModeSelect = async (mode: DeviceMode, name: string) => {
    const currentSelectedDevice = getCurrentSelectedDevice();
    if (!currentSelectedDevice) {
      return;
    }

    const deviceId = currentSelectedDevice.id;

    // 发送暂停指令
    BLEManager.writeCharacteristic(
      deviceId,
      BLE_UUID.SERVICE,
      BLE_UUID.CHARACTERISTIC_WRITE,
      BLECommands.stopTherapy(),
    )
      .then(() => {
        slog('Successfully stop device');
      })
      .catch(error => {
        console.error('Error stop device:', error);
      });

    await new Promise(resolve => setTimeout(resolve, 10));

    // 更新设备模式
    const updatedTimerDevices = timerDevices.map(d => {
      if (d.id === deviceId) {
        d.mode = name;
        d.timerStatus = 'paused';
        d.timer && clearInterval(d.timer);
        d.timer = null;
      }
      return d;
    });
    setTimerDevices(updatedTimerDevices);

    modeListActionSheetRef.current?.close();

    // 写入模式到设备
    BLEManager.writeCharacteristic(
      deviceId,
      BLE_UUID.SERVICE,
      BLE_UUID.CHARACTERISTIC_WRITE,
      BLECommands.setMode(mode),
    )
      .then(() => {
        slog('Successfully wrote mode value:', mode);
      })
      .catch(error => {
        console.error('Error writing mode:', error);
      });
  };

  // Toggle timer state (start/pause) for the selected device
  const toggleTimer = useCallback(async () => {
    const td = timerDevices.find(d => d.selected);
    if (!td) {
      slog('no device');
      return;
    }

    const deviceId = td.id;
    const isRunning = td.timerStatus === 'running';
    if (isRunning) {
      // 如果计时器正在运行，暂停它
      slog(
        `UI 触发暂停命令，当前运行状态：${isRunning}`,
        td.id,
        td.timer,
        td.timerValue,
      );
      // 暂停当前选择的设备的定时器
      const updatedTimerDevices = timerDevices.map(d => {
        if (d.id === deviceId) {
          d.timerStatus = 'paused';
          d.timer && clearInterval(d.timer);
          d.timer = null;
        }
        return d;
      });
      setTimerDevices(updatedTimerDevices);

      BLEManager.writeCharacteristic(
        deviceId,
        BLE_UUID.SERVICE,
        BLE_UUID.CHARACTERISTIC_WRITE,
        BLECommands.stopTherapy(),
      )
        .then(() => {
          slog('Successfully stop device');
        })
        .catch(error => {
          console.error('Error stop device:', error);
        });
    } else {
      const updatedTimerDevices = timerDevices.map(d => {
        if (d.id === deviceId) {
          d.timerStatus = 'running';
          d.timer && clearInterval(d.timer);
          d.timer = setInterval(() => {
            d.timerValue--;
            if (d.timerValue <= 0) {
              d.timerStatus = 'stopped';
              d.timer && clearInterval(d.timer);
              d.timer = null;
              d.timerValue = 0;
              slog('设备倒计时结束, 发送关机命令', d.id);
              sendTurnOffCmd(d.id).then();
            }

            const cd = timerDevices.find(d => d.selected);
            slog('倒计时 当前 设备', cd?.id);
            slog(
              '倒计时 当前 数组选中设备',
              cd?.id,
              '倒计时的 value',
              d.timerValue,
            );
            if (cd?.id === d.id) {
              setCurrentTimeValue(d.timerValue);
            } else {
              slog('当前不是选择该设备，无需更新 UI');
            }
          }, 1000);
        }
        return d;
      });
      setTimerDevices(updatedTimerDevices);

      BLEManager.writeCharacteristic(
        deviceId,
        BLE_UUID.SERVICE,
        BLE_UUID.CHARACTERISTIC_WRITE,
        BLECommands.startTherapy(),
      )
        .then(() => {
          slog('Successfully start device');
        })
        .catch(error => {
          console.error('Error start device:', error);
        });
    }
  }, [timerDevices]);

  useNavigationComponentDidAppear(async () => {
    // 获取初始选中的设备，如果没有则使用第一个设备
    const initialDevice =
      timerDevices.find(device => device.selected) || timerDevices[0];

    if (!initialDevice) {
      slog('没有可用的设备');
      return;
    }

    slog('自动连接到初始设备', initialDevice.name);

    // Remove loading show from here - we'll only show it after connection succeeds
    resetReceivedParams();
    // Connect to device
    slog('开始连接设备...');
    await connectToDevice(initialDevice);
  });

  useEffect(() => {
    slog('####useEffect');
    return () => {
      // 清理所有订阅
      slog('清理所有订阅');
      Object.entries(subscriptionsRef.current).forEach(
        ([key, subscription]) => {
          if (subscription) {
            slog(`清理订阅：${key}`);
            subscription.remove();
          }
        },
      );

      // 清空所有订阅和监控状态
      subscriptionsRef.current = {};
      connectionMonitorsActive.current = {};

      // 断开所有蓝牙连接
      timerDevices.forEach(async device => {
        await BLEManager.disconnectDevice(device.id);
        // 移除所有定时器
        device.timer && clearInterval(device.timer);
        device.timer = null;
      });
    };
  }, []);

  useNavigationComponentDidDisappear(async () => {
    slog('####useNavigationComponentDidDisappear');
  });

  const $modeActionSheet = (
    <ModeListActionSheet
      selectedMode={getCurrentSelectedDevice()?.mode ?? 'Fitness'}
      handleModeSelect={handleModeSelect}
      ref={modeListActionSheetRef}
    />
  );

  // 定义时间选择回调函数
  const onTimeSelected = (hours: number, minutes: number, seconds: number) => {
    const currentSelectedDevice = getCurrentSelectedDevice();
    if (!currentSelectedDevice) {
      slog('No device selected');
      return;
    }

    onCancelActivity();

    slog(
      `Time selected: ${hours}:${minutes}:${seconds}`,
      currentSelectedDevice.id,
    );
    // 计算总秒数
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    setCurrentTimeValue(totalSeconds);
    // 确保时间大于 0
    if (totalSeconds > 0) {
      // 设置计时器保护期，以防设置时间后立即收到 CANCEL 命令
      const deviceId = currentSelectedDevice.id;

      // 设置设备特定的时间值，但不触发额外的状态变化
      const updatedTimerDevices = timerDevices.map(d => {
        if (d.id === deviceId) {
          d.timerValue = totalSeconds;
          d.timerStatus = 'paused';
          d.timer && clearInterval(d.timer);
        }
        return d;
      });
      setTimerDevices(updatedTimerDevices);

      // 设置工作时间
      BLEManager.writeCharacteristic(
        currentSelectedDevice.id,
        BLE_UUID.SERVICE,
        BLE_UUID.CHARACTERISTIC_WRITE,
        BLECommands.setWorkTime(totalSeconds),
      )
        .then(() => {
          slog('Successfully set work time');
        })
        .catch(error => {
          console.error('Error setting work time:', error);
        });
    }
  };

  const getDeviceTimerValue = () => {
    const currentSelectedDevice = getCurrentSelectedDevice();
    if (!currentSelectedDevice) {
      return 0;
    }
    return currentSelectedDevice.timerValue;
  };

  const $timePickerActionSheet = (
    <TimePickerActionSheet
      ref={timePickerActionSheetRef}
      initialHours={Math.floor(getDeviceTimerValue() / 3600)}
      initialMinutes={Math.floor((getDeviceTimerValue() % 3600) / 60)}
      initialSeconds={getDeviceTimerValue() % 60}
      onTimeSelected={onTimeSelected}
    />
  );

  // Modify handleDeviceSelect to reset params and show loading
  const handleDeviceSelect = async (device: TimerDevice) => {
    slog('Selected device:', device);

    // 设置新的选中设备
    const updatedTimerDevices = timerDevices.map(d => {
      d.selected = d.id === device.id;
      return d;
    });

    setTimerDevices(updatedTimerDevices);
    slog('更新新设备 倒计时', device.id, device.timerValue);
    setCurrentTimeValue(device.timerValue);
    // Reset received params but don't show loading yet
    resetReceivedParams();

    // 如果设备未连接，则连接
    if (device.connectionStatus !== 'connected') {
      await connectToDevice(device);
    } else {
      // If already connected, show loading to sync parameters
      setIsInitialLoading(true);

      // Set timeout to hide loading after 5 seconds
      if (initialLoadingTimeoutRef.current) {
        clearTimeout(initialLoadingTimeoutRef.current);
      }

      initialLoadingTimeoutRef.current = setTimeout(() => {
        slog('Loading timeout reached (5s), hiding loading');
        setIsInitialLoading(false);
        initialLoadingTimeoutRef.current = null;
      }, 5000);

      // For already connected device, try to get parameters
      try {
        if (device) {
          await BLEManager.writeCharacteristic(
            device.id,
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
  };

  const $deviceListActionSheet = (
    <DeviceListActionSheet
      ref={deviceListActionSheetRef}
      devices={timerDevices}
      selectedDevice={getCurrentSelectedDevice()}
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
    const isCurrentDeviceConnected =
      getCurrentSelectedDevice()?.connectionStatus === 'connected';
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

  const getDeviceBatteryLevel = () => {
    const selectedDevice =
      timerDevices.find(d => d.selected) ?? timerDevices[0];
    const device = timerDevices.find(d => d.id === selectedDevice.id);
    if (!device) {
      return 0;
    }
    return device.battery;
  };

  const getDeviceVersion = () => {
    const selectedDevice =
      timerDevices.find(d => d.selected) ?? timerDevices[0];
    const device = timerDevices.find(d => d.id === selectedDevice.id);
    if (!device) {
      return '';
    }
    return device.version;
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
            {getCurrentSelectedDevice()?.name || 'No device selected'}
            {getDeviceVersion() && ` (${getDeviceVersion()})`}
          </Text>
        </View>
        <View className="flex-row items-center">
          {getBatteryIconByLevel(getDeviceBatteryLevel() || 0)}
          <Text
            className={cn('text-base font-semibold  ml-2', {
              'text-red-500': getDeviceBatteryLevel() < 20,
              'text-yellow-500':
                getDeviceBatteryLevel() >= 20 && getDeviceBatteryLevel() < 50,
              'text-green-500':
                getDeviceBatteryLevel() >= 50 && getDeviceBatteryLevel() < 90,
              'text-green-600': getDeviceBatteryLevel() >= 90,
            })}>
            {getDeviceBatteryLevel() || '0'}%
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
        timePickerActionSheetRef.current?.expand();
      }}
      // disabled={getCurrentSelectedDevice()?.timerStatus === 'running'}
    >
      <Text
        className={`text-8xl ${
          getCurrentSelectedDevice()?.timerStatus === 'running'
            ? 'text-orange-500'
            : 'text-gray-700'
        } font-bold pt-4`}>
        {formatTime(currentTimeValue)}
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
            {getCurrentSelectedDevice()?.mode || 'Fitness'}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const onChangeIntensity = (value: number) => {
    const currentSelectedDevice = getCurrentSelectedDevice();
    if (!currentSelectedDevice) {
      return;
    }

    const deviceId = currentSelectedDevice.id;
    // 更新设备强度
    const updatedTimerDevices = timerDevices.map(d => {
      if (d.id === deviceId) {
        d.intensity = value;
      }
      return d;
    });
    setTimerDevices(updatedTimerDevices);

    // 写入强度到设备
    BLEManager.writeCharacteristic(
      deviceId,
      BLE_UUID.SERVICE,
      BLE_UUID.CHARACTERISTIC_WRITE,
      BLECommands.setIntensity(value),
    )
      .then(() => {
        slog('Successfully wrote intensity value:', value);
      })
      .catch(error => {
        console.error('Error writing intensity:', error);
      });
  };

  const getDeviceIntensity = () => {
    const currentSelectedDevice = getCurrentSelectedDevice();
    if (!currentSelectedDevice) {
      return 0;
    }
    return currentSelectedDevice.intensity;
  };
  const $intensityControl = (
    <View className="flex-col border-gray-200 rounded-2xl">
      <View className="flex-row justify-between items-center relative gap-x-3">
        <TouchableOpacity
          className="h-14 w-14 rounded-full bg-blue-500 items-center justify-center"
          onPress={() => {
            if (getDeviceIntensity() > 1) {
              onChangeIntensity(getDeviceIntensity() - 1);
            }
          }}>
          <ChevronLeft size={24} color="white" />
        </TouchableOpacity>

        <View className="flex-1 py-4 rounded-xl bg-white items-center justify-center">
          <View className={'border-b-2 border-blue-500'}>
            <Text className="font-semibold text-3xl text-blue-500">
              {getDeviceIntensity()}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          className="h-14 w-14 rounded-full bg-blue-500 items-center justify-center"
          onPress={() => {
            if (getDeviceIntensity() < 10) {
              onChangeIntensity(getDeviceIntensity() + 1);
            }
          }}>
          <ChevronRight size={24} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const getDeviceClimbingTime = () => {
    const currentSelectedDevice = getCurrentSelectedDevice();
    if (!currentSelectedDevice) {
      return 0;
    }
    return currentSelectedDevice.climbingTime;
  };

  const getDeviceStopTime = () => {
    const currentSelectedDevice = getCurrentSelectedDevice();
    if (!currentSelectedDevice) {
      return 0;
    }
    return currentSelectedDevice.stopTime;
  };

  const getDeviceRunTime = () => {
    const currentSelectedDevice = getCurrentSelectedDevice();
    if (!currentSelectedDevice) {
      return 0;
    }
    return currentSelectedDevice.runningTime;
  };

  const $actionsSettingList = (
    <View className="">
      <ActionsSettingList
        climbTime={getDeviceClimbingTime()}
        stopTime={getDeviceStopTime()}
        runTime={getDeviceRunTime()}
        onClimbTimeChange={value => {
          // Ensure value stays within 0-10 range
          let newValue = value;
          if (newValue < 0) {
            newValue = 0;
          } else if (newValue > 10) {
            newValue = 10;
          }

          const currentSelectedDevice = getCurrentSelectedDevice();
          if (currentSelectedDevice) {
            // Update device-specific value
            // 更新设备攀爬时间
            const updatedTimerDevices = timerDevices.map(d => {
              if (d.id === currentSelectedDevice.id) {
                d.climbingTime = newValue;
              }
              return d;
            });
            setTimerDevices(updatedTimerDevices);
            slog(`Sending new climb time value to device: ${newValue}`);
            // Add device command here if needed
            BLEManager.writeCharacteristic(
              currentSelectedDevice.id,
              BLE_UUID.SERVICE,
              BLE_UUID.CHARACTERISTIC_WRITE,
              BLECommands.setClimbingTime(newValue),
            )
              .then(() => {
                slog(`Successfully wrote climb time value: ${newValue}`);
              })
              .catch(error => {
                console.error(`Error writing climb time value: ${error}`);
              });
          }
        }}
        onStopTimeChange={value => {
          // Ensure value stays within 2-10 range
          let newValue = value;
          if (newValue < 2) {
            newValue = 2;
          } else if (newValue > 10) {
            newValue = 10;
          }
          const currentSelectedDevice = getCurrentSelectedDevice();
          if (currentSelectedDevice) {
            // Update device-specific value
            // 更新设备停止时间
            const updatedTimerDevices = timerDevices.map(d => {
              if (d.id === currentSelectedDevice.id) {
                d.stopTime = newValue;
              }
              return d;
            });
            setTimerDevices(updatedTimerDevices);
            slog(`Sending new stop time value to device: ${newValue}`);
            // Add device command here if needed
            BLEManager.writeCharacteristic(
              currentSelectedDevice.id,
              BLE_UUID.SERVICE,
              BLE_UUID.CHARACTERISTIC_WRITE,
              BLECommands.setStopTime(newValue),
            )
              .then(() => {
                slog(`Successfully wrote stop time value: ${newValue}`);
              })
              .catch(error => {
                console.error(`Error writing stop time value: ${error}`);
              });
          }
        }}
        onRunTimeChange={value => {
          // Ensure value stays within 1-10 range
          let newValue = value;
          if (newValue < 1) {
            newValue = 1;
          } else if (newValue > 10) {
            newValue = 10;
          }
          const currentSelectedDevice = getCurrentSelectedDevice();
          if (currentSelectedDevice) {
            // Update device-specific value
            const updatedTimerDevices = timerDevices.map(d => {
              if (d.id === currentSelectedDevice.id) {
                d.runningTime = newValue;
              }
              return d;
            });
            setTimerDevices(updatedTimerDevices);

            slog(`Sending new run time value to device: ${newValue}`);
            // Add device command here if needed
            BLEManager.writeCharacteristic(
              currentSelectedDevice.id,
              BLE_UUID.SERVICE,
              BLE_UUID.CHARACTERISTIC_WRITE,
              BLECommands.setPeakTime(newValue),
            )
              .then(() => {
                slog(`Successfully wrote run time value: ${newValue}`);
              })
              .catch(error => {
                console.error(`Error writing run time value: ${error}`);
              });
          }
        }}
      />
    </View>
  );

  const getDeviceTimerRunning = () => {
    const currentSelectedDevice = getCurrentSelectedDevice();
    if (!currentSelectedDevice) {
      return false;
    }
    return currentSelectedDevice.timerStatus === 'running';
  };

  const getStartButtonColor = () => {
    const currentSelectedDevice = getCurrentSelectedDevice();
    if (!currentSelectedDevice) {
      return 'bg-gray-400';
    }
    if (currentSelectedDevice?.timerStatus === 'running') {
      return 'bg-orange-500';
    } else if (currentSelectedDevice?.timerStatus === 'paused') {
      return 'bg-green-500';
    } else {
      return 'bg-gray-400';
    }
  };
  const $startAndPauseActivity = (
    <TouchableOpacity
      className={`py-4 rounded-lg items-center justify-center ${getStartButtonColor()}`}
      onPress={toggleTimer}
      disabled={getDeviceTimerValue() === 0}>
      <Text className="text-white font-semibold text-xl">
        {getDeviceTimerRunning() ? 'Pause' : 'Start'}
      </Text>
    </TouchableOpacity>
  );

  const onCancelActivity = () => {
    const currentSelectedDevice = timerDevices.find(device => device.selected);
    const updatedTimerDevices = timerDevices.map(d => {
      if (d.id === currentSelectedDevice?.id) {
        d.timerStatus = 'stopped';
        d.timer && clearInterval(d.timer);
        d.timer = null;
        d.timerValue = 0;
      }
      return d;
    });
    setCurrentTimeValue(0);
    setTimerDevices(updatedTimerDevices);
    // 发送 cancel 执行
    slog('发送停止设备的命令');
    if (currentSelectedDevice) {
      BLEManager.writeCharacteristic(
        currentSelectedDevice.id,
        BLE_UUID.SERVICE,
        BLE_UUID.CHARACTERISTIC_WRITE,
        BLECommands.stopTherapy(),
      )
        .then(() => {
          slog('Successfully to stop device');
        })
        .catch(error => {
          console.error(`Error writing to stop device: ${error}`);
        });
    }
  };

  // 添加一个全局函数，用于完全清理设备相关的所有监控和状态
  const cleanupDeviceResources = useCallback(
    (deviceId: string, showNotification = false) => {
      slog(`完全清理设备 ${deviceId} 的所有资源和监控`);

      // 清理特性监控
      const charSubscription = subscriptionsRef.current[`char_${deviceId}`];
      if (charSubscription) {
        slog(`清理设备 ${deviceId} 的特性监控`);
        charSubscription.remove();
        delete subscriptionsRef.current[`char_${deviceId}`];
      }

      // 清理连接监控
      const connSubscription = subscriptionsRef.current[`conn_${deviceId}`];
      if (connSubscription) {
        slog(`清理设备 ${deviceId} 的连接监控`);
        connSubscription.remove();
        delete subscriptionsRef.current[`conn_${deviceId}`];
      }

      // 清理连接监控状态
      if (connectionMonitorsActive.current[`conn_${deviceId}`]) {
        slog(`设置设备 ${deviceId} 的连接监控状态为非活动`);
        connectionMonitorsActive.current[`conn_${deviceId}`] = false;
      }

      // clean up target device id
      const updatedTimerDevices = timerDevices.map(d => {
        if (d.id === deviceId) {
          d.connectionStatus = 'disconnected';
          d.timer && clearInterval(d.timer);
          d.timer = null;
          d.timerStatus = 'stopped';
          d.timerValue = 0;
          d.selected = false;
        }
        return d;
      });
      setTimerDevices(updatedTimerDevices);

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
    [devices, timerDevices, toast],
  );

  // 为单个设备设置连接监控
  const setupConnectionMonitor = useCallback(
    async (deviceId: string) => {
      slog(`为设备 ${deviceId} 设置连接监控`);

      // 找到设备
      const device = devices.find(d => d.id === deviceId);
      if (!device) {
        slog(`找不到设备 ID 为 ${deviceId} 的设备`);
        return;
      }
      slog(`创建设备 ${deviceId} 的新连接监控`);

      // 创建设备的连接监控
      const subscription = BLEManager.monitorDeviceConnection(
        deviceId,
        (device, isConnected, error) => {
          if (error) {
            console.error(`设备 ${deviceId} 连接错误:`, error);
          } else {
            slog(
              `设备 ${device.name || deviceId} 连接状态变更为：${
                isConnected ? '已连接' : '已断开'
              }`,
            );
            if (!isConnected) {
              cleanupDeviceResources(deviceId, true); // 显示断开通知
            } else {
              // 更新连接状态
              const updatedTimerDevices = timerDevices.map(d => {
                if (d.id === deviceId) {
                  d.connectionStatus = 'connected';
                }
                return d;
              });

              setTimerDevices(updatedTimerDevices);
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
    [cleanupDeviceResources, devices, timerDevices, toast],
  );

  // 封装设备连接逻辑为可重用的函数
  const connectToDevice = async (device: TimerDevice) => {
    try {
      // 如果设备已经连接，不重复连接
      if (device.connectionStatus === 'connected') {
        slog(`设备 ${device.name} 已经连接，无需重复连接`);
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
        slog(`Successfully connected to ${device.name}`);
        const updatedTimerDevices = timerDevices.map(d => {
          if (d.id === device.id) {
            d.connectionStatus = 'connected';
            d.selected = true;
          }
          return d;
        });
        slog('connect to device updatedTimerDevices', updatedTimerDevices);
        setTimerDevices(updatedTimerDevices);

        // Reset received params tracking for the new connection
        resetReceivedParams();

        // Show loading overlay when device connects successfully
        setIsInitialLoading(true);

        // Set timeout to hide loading after 5 seconds if params aren't received
        if (initialLoadingTimeoutRef.current) {
          clearTimeout(initialLoadingTimeoutRef.current);
        }

        initialLoadingTimeoutRef.current = setTimeout(() => {
          slog('Loading timeout reached (5s), hiding loading');
          setIsInitialLoading(false);
          initialLoadingTimeoutRef.current = null;
        }, 5000);

        // 为设备监控连接状态
        await setupConnectionMonitor(device.id);

        // 为设备创建特性监控
        setupCharacteristicMonitor(device.id);

        try {
          // Add a delay to allow the BLE system to fully register the connection
          await new Promise(resolve => setTimeout(resolve, 500));

          await BLEManager.writeCharacteristic(
            device.id,
            BLE_UUID.SERVICE,
            BLE_UUID.CHARACTERISTIC_READ,
            BLECommands.getVersion(),
          );

          await new Promise(resolve => setTimeout(resolve, 500));

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
        device.connectionStatus === 'connected'
          ? 'disconnect from'
          : 'connect to'
      } ${device.name ?? 'Device'}`;
      console.error(
        `Failed to ${
          device.connectionStatus === 'connected'
            ? 'disconnect from'
            : 'connect to'
        } ${device.name}:`,
        error,
      );

      toast.show(msg, {
        type: 'danger',
        placement: 'top',
        duration: 4000,
      });
      // 更新设备连接状态为断开
      const updatedTimerDevices = timerDevices.map(d => {
        if (d.id === device.id) {
          d.connectionStatus = 'disconnected';
        }
        return d;
      });
      setTimerDevices(updatedTimerDevices);
    } finally {
      // 无论成功失败，都结束加载状态（仅针对连接加载状态，不是参数加载状态）
      setDeviceLoading(device.id, false);
      setIsConnecting(false);
    }
  };

  // Add AppState listener to disconnect devices when app is locked or backgrounder
  useEffect(() => {
    const appStateListener = AppState.addEventListener(
      'change',
      async nextAppState => {
        slog('App state changed to:', nextAppState);

        // 应用从后台返回前台
        if (
          (appStateRef.current === 'background' ||
            appStateRef.current === 'inactive') &&
          nextAppState === 'active'
        ) {
          slog('App returned to foreground, verifying device connections');

          // If already connected, show loading to sync parameters
          setIsInitialLoading(true);

          // Set timeout to hide loading after 5 seconds
          if (initialLoadingTimeoutRef.current) {
            clearTimeout(initialLoadingTimeoutRef.current);
          }

          initialLoadingTimeoutRef.current = setTimeout(() => {
            slog('Loading timeout reached (5s), hiding loading');
            setIsInitialLoading(false);
            initialLoadingTimeoutRef.current = null;
          }, 5000);

          // 发送 get device info 指令，重新同步所有设备信息
          const td = timerDevices.find(d => d.selected);
          if (td) {
            BLEManager.writeCharacteristic(
              td.id,
              BLE_UUID.SERVICE,
              BLE_UUID.CHARACTERISTIC_WRITE,
              BLECommands.getDeviceInfo(),
            )
              .then(() => {
                slog('Successfully get device info for device:', td.id);
              })
              .catch(error => {
                console.error(
                  'Error get device info for device:',
                  td.id,
                  error,
                );
              });
          }
        } else if (
          appStateRef.current === 'active' &&
          (nextAppState === 'background' || nextAppState === 'inactive')
        ) {
          // 应用进入后台时，确保后台服务已启动（如果有连接的设备）
          slog('App is going to background');
          // 停止所有计时器
          const updatedTimerDevices = timerDevices.map(d => {
            d.timer && clearInterval(d.timer);
            d.timer = null;
            d.timerStatus = 'stopped';
            d.timerValue = 0;
            return d;
          });
          setTimerDevices(updatedTimerDevices);
        }
        // 更新当前状态引用
        appStateRef.current = nextAppState;
      },
    );

    return () => {
      appStateListener.remove();
    };
  }, [timerDevices]);

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

          <View className="flex-col gap-y-6">{$startAndPauseActivity}</View>
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
  },
};

export default DevicePanelController;
