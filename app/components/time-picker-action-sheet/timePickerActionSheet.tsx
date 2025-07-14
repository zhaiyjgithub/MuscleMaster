import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  useMemo,
} from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import WheelPicker from '@quidone/react-native-wheel-picker';

interface TimePickerActionSheetProps {
  initialHours?: number;
  initialMinutes?: number;
  initialSeconds?: number;
  onTimeSelected?: (hours: number, minutes: number, seconds: number) => void;
}

export const TimePickerActionSheet = forwardRef<
  BottomSheet,
  TimePickerActionSheetProps
>((props, ref) => {
  const {
    initialHours = 0,
    initialMinutes = 0,
    initialSeconds = 0,
    onTimeSelected,
  } = props;

  const [hours, setHours] = useState(initialHours);
  const [minutes, setMinutes] = useState(initialMinutes);
  const [seconds, setSeconds] = useState(initialSeconds);

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
        enableTouchThrough={true}
        pressBehavior="close"
      />
    ),
    [],
  );

  // 生成 0-59 的数组用于选择器
  const generateNumbers = (max: number) => {
    return Array.from({length: max + 1}, (_, i) => i);
  };

  const minutesArray = generateNumbers(59);
  const secondsArray = generateNumbers(59);

  const handleConfirm = () => {
    if (onTimeSelected) {
      onTimeSelected(hours, minutes, seconds);
    }
    bottomSheetRef.current?.close();
  };

  const handleCancel = () => {
    bottomSheetRef.current?.close();
  };

  const minutesData = useMemo(() => {
    return minutesArray.map(minute => ({
      label: `${minute}`,
      value: minute,
    }));
  }, [minutesArray]);

  const secondsData = useMemo(() => {
    return secondsArray.map(second => ({
      label: `${second}`,
      value: second,
    }));
  }, [secondsArray]);

  const $timerPicker = (
    <View className="">
      <Text className="text-xl font-bold text-center mb-5">Time Setting</Text>

      <View className="flex-row justify-between mb-5">
        <View className="flex-1 items-center">
          <Text className="text-base mb-2">Minutes</Text>
          <WheelPicker
            width={80}
            data={minutesData}
            value={minutes}
            onValueChanged={({item: {value}}) => setMinutes(value)}
          />
        </View>

        <View className="flex-1 items-center">
          <Text className="text-base mb-2">Seconds</Text>
          <WheelPicker
            width={80}
            data={secondsData}
            value={seconds}
            onValueChanged={({item: {value}}) => setSeconds(value)}
          />
        </View>
      </View>

      <View className="flex-row justify-between mt-20">
        <TouchableOpacity
          className="flex-1 py-4 rounded-lg bg-gray-200 items-center mx-2"
          onPress={handleCancel}>
          <Text className="text-gray-800 text-base font-medium">Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 py-4 rounded-lg bg-blue-500 items-center mx-2"
          onPress={handleConfirm}>
          <Text className="text-white text-base font-medium">Confirm</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <BottomSheet
      enablePanDownToClose={false}
      enableContentPanningGesture={false}
      enableOverDrag={false}
      ref={bottomSheetRef}
      index={-1}
      backgroundStyle={{backgroundColor: 'white'}}
      backdropComponent={renderBackdrop}
      onChange={handleSheetChanges}>
      <BottomSheetView>
        <SafeAreaView className="flex flex-col p-4 bg-white">
          {$timerPicker}
        </SafeAreaView>
      </BottomSheetView>
    </BottomSheet>
  );
});

export default TimePickerActionSheet;
