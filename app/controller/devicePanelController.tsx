import React, { useState, useEffect } from 'react';
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

interface ModeItem {
  id: string;
  name: string;
  icon: any;
}

export interface DevicePanelControllerProps {
  devices: Device[];
}

const DevicePanelController: NavigationFunctionComponent<DevicePanelControllerProps> = ({ componentId, devices }) => {
  const [selectedMode, setSelectedMode] = useState('Strength Training');
  const [selectedDevice, setSelectedDevice] = useState('MuscleMaster Pro');
  const [isConnected, setIsConnected] = useState(true);
  const [batteryLevel, setBatteryLevel] = useState(75);
  const [intensityLevel, setIntensityLevel] = useState(7);
  const [maxIntensity, setMaxIntensity] = useState(10);
  const [timerValue, setTimerValue] = useState('00:05:32');
  const [timerRunning, setTimerRunning] = useState(false);
  const [modeModalVisible, setModeModalVisible] = useState(false);
  const [deviceModalVisible, setDeviceModalVisible] = useState(false);

  // Available modes for selection
  const modes: ModeItem[] = [
    { id: '1', name: 'Fitness', icon:  <Dumbbell  size={24} color="#1e88e5" />},
    { id: '2', name: 'Warm up', icon: <Flame size={24} color="#1e88e5" />},
    { id: '3', name: 'Cardio', icon: <Heart size={24} color="#1e88e5" /> },
    { id: '4', name: 'Relax', icon: <Smile size={24} color="#1e88e5" /> },
    { id: '5', name: 'Dermal', icon: <User size={24} color="#1e88e5" /> },
    { id: '6', name: 'Drainage', icon: <Droplet size={24} color="#1e88e5" /> },
    { id: '7', name: 'Cellulite', icon: <Scan size={24} color="#1e88e5" /> },
    { id: '8', name: 'Metabolic', icon: <Activity size={24} color="#1e88e5" /> },
    { id: '9', name: 'Slim', icon: <Scissors size={24} color="#1e88e5" /> },
    { id: '10', name: 'Resistance', icon: <Shield size={24} color="#1e88e5" /> },
    { id: '11', name: 'Contractures', icon: <Zap size={24} color="#1e88e5" /> },
    { id: '12', name: 'Capillary', icon: <Activity size={24} color="#1e88e5" /> },
    { id: '13', name: 'Vip', icon: <Crown size={24} color="#1e88e5" /> },
  ];

  // Available devices for selection
  const devices = [
    { id: '1', name: 'MuscleMaster Pro', status: 'Connected', battery: 75 },
    { id: '2', name: 'MuscleMaster Mini', status: 'Available', battery: 92 },
    { id: '3', name: 'MuscleMaster Lite', status: 'Available', battery: 64 },
  ];

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
    setTimerRunning(!timerRunning);
  };

  // Reset timer
  const resetTimer = () => {
    setTimerValue('00:00:00');
    setTimerRunning(false);
  };

  // Handle device selection
  const handleDeviceSelect = (device: string) => {
    setSelectedDevice(device);
    setDeviceModalVisible(false);
  };

  // Handle mode selection
  const handleModeSelect = (mode: string) => {
    setSelectedMode(mode);
    setModeModalVisible(false);
  };

  // Navigate to settings
  const navigateToSettings = () => {
    console.log('Navigate to settings');
    // Implementation of navigation to settings
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Top Navigation Bar */}
      <View className="h-11 flex-row justify-center items-center bg-opacity-80 bg-gray-100 border-b border-gray-200 relative">
        <Text className="text-base font-semibold text-black">MuscleMaster</Text>
        {isConnected && (
          <View className="absolute right-[50px] flex-row items-center">
            <View className="w-2 h-2 rounded-full bg-green-600 mr-1.5" />
            <Bluetooth size={18} color="#43a047" className="ml-1" />
          </View>
        )}
        <TouchableOpacity 
          className="absolute right-4 w-7 h-7 rounded-full justify-center items-center" 
          onPress={navigateToSettings}
        >
          <Settings size={20} color="#333" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 p-4">
        {/* Current Device Section */}
        <View className="bg-white rounded-2xl overflow-hidden mb-4 shadow-sm">
          <TouchableOpacity 
            className="flex-row justify-between items-center p-4"
            onPress={() => setDeviceModalVisible(true)}
          >
            <View className="flex-row items-center">
              <View className="w-2 h-2 rounded-full bg-green-600 mr-1.5" />
              <Text className="text-base font-semibold text-gray-800">{selectedDevice}</Text>
            </View>
            <ChevronRight size={20} color="#777" />
          </TouchableOpacity>
        </View>

        {/* Timer Section */}
        <View className="bg-white rounded-2xl overflow-hidden mb-4 shadow-sm">
          <View className="p-4 items-center">
            <Text className="text-5xl font-light text-gray-800 mb-4 tracking-wider">{timerValue}</Text>
            <View className="flex-row gap-4">
              <TouchableOpacity 
                className="py-2 px-5 rounded-full bg-blue-600 items-center justify-center"
                onPress={toggleTimer}
              >
                <Text className="text-white font-medium text-sm">
                  {timerRunning ? 'Pause' : 'Start'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="py-2 px-5 rounded-full bg-transparent border border-blue-600 items-center justify-center"
                onPress={resetTimer}
              >
                <Text className="text-blue-600 font-medium text-sm">Reset</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Intensity Control Section */}
        <View className="bg-white rounded-2xl overflow-hidden mb-4 shadow-sm">
          <View className="p-4">
            <View className="items-center mb-3.5">
              <Text className="text-[22px] font-bold text-blue-600">
                {intensityLevel} / {maxIntensity}
              </Text>
            </View>
            <View className="flex-row justify-between h-12 relative">
              <TouchableOpacity 
                className="w-[90px] h-10 rounded-lg bg-gray-100 items-center justify-center shadow-sm" 
                onPress={increaseIntensity}
              >
                <ChevronUp size={24} color="#1e88e5" />
                <Text className="font-semibold mt-0.5">Up</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="w-[90px] h-10 rounded-lg bg-gray-100 items-center justify-center shadow-sm" 
                onPress={decreaseIntensity}
              >
                <ChevronDown size={24} color="#1e88e5" />
                <Text className="font-semibold mt-0.5">Down</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Mode Selection Section */}
        <View className="bg-white rounded-2xl overflow-hidden mb-4 shadow-sm">
          <View className="p-4">
            <View className="items-center mb-3.5">
              <Text className="text-[22px] font-bold text-blue-600">{selectedMode}</Text>
            </View>
            <TouchableOpacity 
              className="h-[50px] rounded-xl bg-gray-100 items-center justify-center mt-3"
              onPress={() => setModeModalVisible(true)}
            >
              <Text className="font-medium text-base text-gray-800">Mode</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Mode Selection Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modeModalVisible}
        onRequestClose={() => setModeModalVisible(false)}
      >
        <View className="flex-1 bg-black bg-opacity-40 justify-end">
          <View className="bg-white rounded-t-2xl p-5 max-h-[80%]">
            <View className="flex-row justify-center mb-5 relative">
              <Text className="font-semibold text-lg">Select Mode</Text>
              <TouchableOpacity
                onPress={() => setModeModalVisible(false)}
                className="absolute right-0 top-0"
              >
                <Text className="text-2xl font-medium">×</Text>
              </TouchableOpacity>
            </View>
            
            <View className="flex-row flex-wrap justify-center gap-[25px] mb-4">
              {modes.map((mode) => (
                <TouchableOpacity
                  key={mode.id}
                  className={`w-12 h-12 rounded-full items-center justify-center mb-5 ${
                    selectedMode === mode.name 
                      ? 'bg-blue-600 scale-105' 
                      : 'bg-[#062e62]'
                  }`}
                  onPress={() => handleModeSelect(mode.name)}
                >
                    {mode.icon}
                  <Text className="text-[10px] text-center absolute -bottom-[18px] text-gray-800 font-medium w-[60px]">{mode.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <TouchableOpacity
              className="bg-blue-600 rounded-lg py-3.5 items-center"
              onPress={() => setModeModalVisible(false)}
            >
              <Text className="text-white font-medium text-base">Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Device Selection Modal */}
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
              {devices.map((device) => (
                <TouchableOpacity
                  key={device.id}
                  className={`flex-row items-center p-4 rounded-xl mb-3 ${
                    selectedDevice === device.name 
                      ? 'bg-blue-50 border border-blue-200' 
                      : 'bg-gray-100'
                  }`}
                  onPress={() => handleDeviceSelect(device.name)}
                >
                  <Smartphone size={24} color="#1e88e5" />
                  <View className="flex-1 ml-3">
                    <Text className="font-semibold text-base text-gray-800 mb-1">{device.name}</Text>
                    <Text className="text-sm text-gray-600">{device.status}</Text>
                  </View>
                  <Text className="text-sm text-green-600 font-medium">{device.battery}%</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <TouchableOpacity
              className="bg-blue-600 rounded-lg py-3.5 items-center"
              onPress={() => setDeviceModalVisible(false)}
            >
              <Text className="text-white font-medium text-base">Connect</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

DevicePanelController.options = {
  topBar: {
    visible: false,
    height: 0,
  },
};

export default DevicePanelController;
