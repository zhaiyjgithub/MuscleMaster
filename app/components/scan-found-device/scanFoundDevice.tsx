import React, { useEffect, useState } from 'react';
import { Text, View, TouchableOpacity, Platform, ActivityIndicator, ScrollView } from "react-native";
import { BLEManager } from '../../services/BLEManager';
import { Bluetooth } from 'lucide-react-native';
import { Navigation } from 'react-native-navigation';
import { decodeBase64Value } from '../../lib/utils';
// 定义特性信息接口
export interface CharacteristicInfo {
  uuid: string;
  isReadable: boolean;
  isWritableWithResponse: boolean;
  isWritableWithoutResponse: boolean;
  isNotifiable: boolean;
  isIndicatable: boolean;
}

// 定义服务信息接口
export interface ServiceInfo {
  uuid: string;
  isPrimary: boolean;
  characteristicInfos: CharacteristicInfo[];
}

interface DeviceItemProps {
  name: string;
  id: string;
  signalStrength: 'excellent' | 'good' | 'weak';
  connected: boolean;
  icon: string;
  iconColor: string;
  onConnectPress: () => void;
  loading?: boolean;
  serviceInfos?: ServiceInfo[];
  onServicesDiscovered?: (serviceInfos: ServiceInfo[]) => void;
}

const ScanFoundDevice: React.FC<DeviceItemProps> = ({
  name,
  id,
  signalStrength,
  connected,
  icon,
  iconColor,
  onConnectPress,
  loading = false,
  serviceInfos = [],
  onServicesDiscovered
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
  const [expandedService, setExpandedService] = useState<string | null>(null);

  // 切换服务展开状态
  const toggleServiceExpand = (serviceUUID: string) => {
    if (expandedService === serviceUUID) {
      setExpandedService(null);
    } else {
      setExpandedService(serviceUUID);
    }
  };

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
        disabled={loading}
      >
        {loading ? (
          <View className="flex-row items-center">
            <ActivityIndicator size="small" color="white" />
            <Text className="text-white font-medium text-[13px] ml-2">
              {connected ? 'Disconnecting...' : 'Connecting...'}
            </Text>
          </View>
        ) : (
          <Text className="text-white font-medium text-[13px]">
            {connected ? 'Connected' : 'Connect'}
          </Text>
        )}
      </TouchableOpacity>

      {/* Services and Characteristics (Only shown when connected) */}
      {connected && serviceInfos.length > 0 && (
        <View className="mt-3 border-t border-gray-200 pt-3">
          <Text className="font-medium text-[14px] text-gray-900 mb-2">Services:</Text>
          <ScrollView style={{ maxHeight: 200 }}>
            {serviceInfos.map((service) => (
              <View key={service.uuid} className="mb-2">
                <TouchableOpacity 
                  className="flex-row items-center justify-between py-1"
                  onPress={() => toggleServiceExpand(service.uuid)}
                >
                  <Text className="text-[12px] text-blue-700">{service.uuid}</Text>
                  <Text className="text-[12px] text-gray-500">{expandedService === service.uuid ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                
                {expandedService === service.uuid && (
                  <View className="ml-3 mt-1 mb-2">
                    <Text className="text-[12px] font-medium text-gray-700 mb-1">Characteristics:</Text>
                    {service.characteristicInfos && service.characteristicInfos.length > 0 ? (
                      service.characteristicInfos.map(characteristic => (
                        <View key={characteristic.uuid} className="mb-1 ml-2">
                          <Text className="text-[11px] text-gray-600">• {characteristic.uuid}</Text>
                          <Text className="text-[10px] text-gray-500 ml-3">
                            {[
                              characteristic.isReadable ? 'Read' : null,
                              characteristic.isWritableWithResponse ? 'Write' : null,
                              characteristic.isWritableWithoutResponse ? 'WriteNoResponse' : null,
                              characteristic.isNotifiable ? 'Notify' : null,
                              characteristic.isIndicatable ? 'Indicate' : null
                            ].filter(Boolean).join(', ')}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text className="text-[11px] text-gray-500 ml-2">Loading characteristics...</Text>
                    )}
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )}
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
  loading?: boolean;
  serviceInfos?: ServiceInfo[];
  selected?: boolean;
}
interface ScanFoundDeviceListProps {
  devices: FoundDevice[];
  updateConnectionStatus?: (deviceId: string, isConnected: boolean) => void;
  updateDeviceServices?: (deviceId: string, serviceInfos: ServiceInfo[]) => void;
  onPress: (device: FoundDevice) => void;
}

const ScanFoundDeviceList: React.FC<ScanFoundDeviceListProps> = ({ 
  devices, 
  updateConnectionStatus,
  updateDeviceServices,
  onPress
}) => {
  // 跟踪正在加载的设备 ID
  const [loadingDeviceIds, setLoadingDeviceIds] = useState<Set<string>>(new Set());

  // 设置设备加载状态
  const setDeviceLoading = (deviceId: string, isLoading: boolean) => {
    setLoadingDeviceIds(prevIds => {
      const newIds = new Set(prevIds);
      if (isLoading) {
        newIds.add(deviceId);
      } else {
        newIds.delete(deviceId);
      }
      return newIds;
    });
  };

  // 发现服务和特性
  const discoverServicesAndCharacteristics = async (deviceId: string) => {
    try {
      console.log(`Discovering services for device: ${deviceId}`);
      
      // 发现所有服务和特性
      await BLEManager.discoverAllServicesAndCharacteristics(deviceId);
      
      // 获取所有服务
      const services = await BLEManager.servicesForDevice(deviceId);
      console.log(`Found ${services.length} services`);
      
      // 转换成我们自定义的 ServiceInfo 格式
      const serviceInfos: ServiceInfo[] = [];
      
      // 获取每个服务的特性
      for (const service of services) {
        console.log(`Discovering characteristics for service: ${service.uuid}`);
        const characteristics = await BLEManager.characteristicsForDevice(deviceId, service.uuid);
        console.log(`Found ${characteristics.length} characteristics for service ${service.uuid}`);
        
        // 将特性转换为我们的格式
        const characteristicInfos: CharacteristicInfo[] = characteristics.map(char => ({
          uuid: char.uuid,
          isReadable: char.isReadable,
          isWritableWithResponse: char.isWritableWithResponse,
          isWritableWithoutResponse: char.isWritableWithoutResponse,
          isNotifiable: char.isNotifiable,
          isIndicatable: char.isIndicatable
        }));
        
        // 添加到服务信息数组
        serviceInfos.push({
          uuid: service.uuid,
          isPrimary: service.isPrimary,
          characteristicInfos
        });
      }

      // 更新设备的服务信息
      if (updateDeviceServices) {
        updateDeviceServices(deviceId, serviceInfos);
      }
      
      return serviceInfos;
    } catch (error) {
      console.error('Error discovering services:', error);
      return [];
    }
  };

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
          {devices.map((device) => (
            <ScanFoundDevice
              key={device.id}
              {...device}
              loading={loadingDeviceIds.has(device.id)}
              onConnectPress={async () => {
                onPress(device);
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
};

export default ScanFoundDeviceList;