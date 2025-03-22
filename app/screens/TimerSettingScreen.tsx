import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet from '@gorhom/bottom-sheet';
import { TimePickerActionSheet } from '../components/time-picker-action-sheet/timePickerActionSheet';

const TimerSettingScreen = () => {
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(5);
  const [seconds, setSeconds] = useState(0);
  const timePickerRef = useRef<BottomSheet>(null);

  const handleOpenTimePicker = () => {
    timePickerRef.current?.expand();
  };

  const handleTimeSelected = (h: number, m: number, s: number) => {
    setHours(h);
    setMinutes(m);
    setSeconds(s);
    console.log(`Selected time: ${h}h ${m}m ${s}s`);
  };

  // 格式化时间显示，确保两位数
  const formatTimeDigit = (num: number): string => {
    return num < 10 ? `0${num}` : `${num}`;
  };

  const formattedTime = `${formatTimeDigit(hours)}:${formatTimeDigit(minutes)}:${formatTimeDigit(seconds)}`;

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <View className="flex-1 p-5 items-center justify-center">
        <Text className="text-2xl font-bold mb-10 text-gray-800">计时器设置</Text>
        
        <View className="bg-white p-8 rounded-2xl mb-10 shadow-md">
          <Text className="text-5xl font-light text-gray-800 tracking-wider">{formattedTime}</Text>
        </View>
        
        <TouchableOpacity 
          className="bg-blue-500 py-4 px-8 rounded-xl w-4/5 items-center mb-4"
          onPress={handleOpenTimePicker}
        >
          <Text className="text-white text-lg font-medium">设置时间</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          className={`py-4 px-8 rounded-xl w-4/5 items-center ${
            hours === 0 && minutes === 0 && seconds === 0 
              ? 'bg-gray-400' 
              : 'bg-green-500'
          }`}
          disabled={hours === 0 && minutes === 0 && seconds === 0}
        >
          <Text className="text-white text-lg font-medium">开始计时</Text>
        </TouchableOpacity>
      </View>
      
      <TimePickerActionSheet 
        ref={timePickerRef}
        initialHours={hours}
        initialMinutes={minutes}
        initialSeconds={seconds}
        onTimeSelected={handleTimeSelected}
      />
    </SafeAreaView>
  );
};

export default TimerSettingScreen; 