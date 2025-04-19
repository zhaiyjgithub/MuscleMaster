import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from 'react';
import {Text, TouchableOpacity, View, ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {cn} from '../../lib/utils';
import {Smartphone} from 'lucide-react-native';
import TimerDevice from '../../controller/model/timerDevice';

export interface DeviceListActionSheetProps {
  devices: TimerDevice[];
  selectedDevice?: TimerDevice | null;
  handleDeviceSelect: (device: TimerDevice) => void;
}

const DeviceListActionSheet = forwardRef<
  BottomSheet,
  DeviceListActionSheetProps
>((props, ref) => {
  const {devices, selectedDevice, handleDeviceSelect} =
    props;
  const bottomSheetRef = useRef<BottomSheet>(null);
  useImperativeHandle(ref, () => bottomSheetRef.current!);

  const handleSheetChanges = useCallback((index: number) => {
    console.log('handleSheetChanges', index);
  }, []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    [],
  );

  const $deviceList = (
    <View className="mb-5">
      {devices?.map(device => {
        const isLoading = device.connectionStatus === 'connecting';
        const isCurrentDevice = selectedDevice?.id === device.id;
        const isDeviceConnected = device.connectionStatus === 'connected';

        return (
          <TouchableOpacity
            key={device.id}
            className={cn(
              'flex-row items-center p-4 rounded-xl mb-3',
              isCurrentDevice
                ? 'bg-blue-50 border border-blue-200'
                : 'bg-gray-100',
            )}
            onPress={() => {
              bottomSheetRef.current?.close();
              handleDeviceSelect(device);
            }}
            disabled={isLoading}>
            <Smartphone size={24} color="#1e88e5" />
            <View className="flex-1 ml-3">
              <Text className="font-semibold text-base text-gray-800 mb-1">
                {device.name}
              </Text>
              <View className="flex-row items-center">
                {isLoading ? (
                  <View className="flex-row items-center">
                    <ActivityIndicator size="small" color="#f59e0b" />
                    <Text className="text-sm text-yellow-500 ml-2">
                      Connecting...
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row items-center">
                    <View
                      className={cn(
                        'w-2 h-2 rounded-full mr-1.5',
                        isDeviceConnected ? 'bg-green-500' : 'bg-red-500',
                      )}
                    />
                    <Text className="text-sm text-gray-600">
                      {isDeviceConnected ? 'Connected' : 'Disconnected'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <Text className="text-sm text-green-600 font-medium">
              {isCurrentDevice ? 'Selected' : 'Select'}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <BottomSheet
      enablePanDownToClose={true}
      ref={bottomSheetRef}
      index={-1}
      backgroundStyle={{backgroundColor: 'white'}}
      backdropComponent={renderBackdrop}
      onChange={handleSheetChanges}>
      <BottomSheetScrollView>
        <SafeAreaView className="flex flex-col p-4 bg-white">
          <View className="flex-row justify-center mb-5 relative">
            <Text className="font-semibold text-lg">Select Device</Text>
          </View>
          {$deviceList}
          {/* <TouchableOpacity
            className="bg-blue-500 rounded-lg py-3.5 items-center mt-2"
            onPress={() => bottomSheetRef.current?.close()}>
            <Text className="text-white font-medium text-base">Confirm</Text>
          </TouchableOpacity> */}
        </SafeAreaView>
      </BottomSheetScrollView>
    </BottomSheet>
  );
});

export default DeviceListActionSheet;
