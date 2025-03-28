import React, {useEffect, useRef} from 'react';
import {View, Text, TouchableOpacity, Animated, Easing} from 'react-native';

interface ScanSectionProps {
  onCancelPress: () => void;
  onRescanPress?: () => void;
  isScanning?: boolean;
  isBleReady?: boolean;
}

const ScanSection: React.FC<ScanSectionProps> = ({
  onCancelPress,
  onRescanPress,
  isScanning = false,
  isBleReady = true,
}) => {
  // Animation values
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim2 = useRef(new Animated.Value(0)).current;
  const pulseAnim3 = useRef(new Animated.Value(0)).current;
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const blipAnim1 = useRef(new Animated.Value(0)).current;
  const blipAnim2 = useRef(new Animated.Value(0)).current;
  const blipAnim3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    console.log('ScanSection: isScanning changed to', isScanning);
    // Only start animations when scanning
    if (isScanning) {
      // Pulse animations with delays
      Animated.loop(
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();

      // Second pulse with delay
      Animated.loop(
        Animated.timing(pulseAnim2, {
          toValue: 1,
          duration: 2000,
          delay: 650,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();

      // Third pulse with delay
      Animated.loop(
        Animated.timing(pulseAnim3, {
          toValue: 1,
          duration: 2000,
          delay: 1300,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();

      // Radar sweep animation
      Animated.loop(
        Animated.timing(sweepAnim, {
          toValue: 1,
          duration: 3000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();

      // Blip animations with different delays
      Animated.loop(
        Animated.sequence([
          Animated.timing(blipAnim1, {
            toValue: 1,
            duration: 3000,
            delay: 600,
            useNativeDriver: true,
          }),
          Animated.timing(blipAnim1, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(blipAnim2, {
            toValue: 1,
            duration: 3000,
            delay: 1700,
            useNativeDriver: true,
          }),
          Animated.timing(blipAnim2, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(blipAnim3, {
            toValue: 1,
            duration: 3000,
            delay: 900,
            useNativeDriver: true,
          }),
          Animated.timing(blipAnim3, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      // If not in scanning state, stop all animations and reset their values
      pulseAnim.stopAnimation();
      pulseAnim2.stopAnimation();
      pulseAnim3.stopAnimation();
      sweepAnim.stopAnimation();
      blipAnim1.stopAnimation();
      blipAnim2.stopAnimation();
      blipAnim3.stopAnimation();

      // Reset all animation values to 0
      pulseAnim.setValue(0);
      pulseAnim2.setValue(0);
      pulseAnim3.setValue(0);
      sweepAnim.setValue(0);
      blipAnim1.setValue(0);
      blipAnim2.setValue(0);
      blipAnim3.setValue(0);
    }
  }, [
    isScanning,
    pulseAnim,
    pulseAnim2,
    pulseAnim3,
    sweepAnim,
    blipAnim1,
    blipAnim2,
    blipAnim3,
  ]);

  useEffect(() => {
    // Stop all animations and reset values when component unmounts or when scanning stops
    return () => {
      // Explicitly stop all animations
      pulseAnim.stopAnimation();
      pulseAnim2.stopAnimation();
      pulseAnim3.stopAnimation();
      sweepAnim.stopAnimation();
      blipAnim1.stopAnimation();
      blipAnim2.stopAnimation();
      blipAnim3.stopAnimation();
      
      // Reset all animation values
      pulseAnim.setValue(0);
      pulseAnim2.setValue(0);
      pulseAnim3.setValue(0);
      sweepAnim.setValue(0);
      blipAnim1.setValue(0);
      blipAnim2.setValue(0);
      blipAnim3.setValue(0);
    };
  }, []);

  // Interpolate animations
  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 1],
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  // Second pulse interpolations
  const pulseScale2 = pulseAnim2.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.8],
  });

  const pulseOpacity2 = pulseAnim2.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [1, 0.8, 0],
  });

  // Third pulse interpolations
  const pulseScale3 = pulseAnim3.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1, 0.6],
  });

  const pulseOpacity3 = pulseAnim3.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [1, 0.6, 0],
  });

  const sweepRotate = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Blip animations interpolations
  const blip1Scale = blipAnim1.interpolate({
    inputRange: [0, 0.3, 0.7, 1],
    outputRange: [0, 1, 1, 1.5],
  });

  const blip1Opacity = blipAnim1.interpolate({
    inputRange: [0, 0.3, 0.7, 1],
    outputRange: [0, 1, 1, 0],
  });

  const blip2Scale = blipAnim2.interpolate({
    inputRange: [0, 0.3, 0.7, 1],
    outputRange: [0, 1, 1, 1.5],
  });

  const blip2Opacity = blipAnim2.interpolate({
    inputRange: [0, 0.3, 0.7, 1],
    outputRange: [0, 1, 1, 0],
  });

  const blip3Scale = blipAnim3.interpolate({
    inputRange: [0, 0.3, 0.7, 1],
    outputRange: [0, 1, 1, 1.5],
  });

  const blip3Opacity = blipAnim3.interpolate({
    inputRange: [0, 0.3, 0.7, 1],
    outputRange: [0, 1, 1, 0],
  });

  // Get scanning text based on state
  const getScanningText = () => {
    if (!isBleReady) {
      return 'Bluetooth is not enabled, please turn on Bluetooth';
    }

    if (isScanning) {
      return 'Scanning for devices...';
    }

    return 'Click scan button to start searching for devices';
  };

  // Get action button based on state
  const renderActionButton = () => {
    if (isScanning) {
      return (
        <TouchableOpacity
          className="py-2 px-5 bg-transparent border border-red-500 rounded-full"
          onPress={onCancelPress}>
          <Text className="text-red-500 text-sm font-medium">Cancel Scan</Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        className={`py-2 px-5 bg-transparent border ${
          isBleReady ? 'border-blue-600' : 'border-gray-400'
        } rounded-full`}
        onPress={onRescanPress}
        disabled={!isBleReady}>
        <Text
          className={`text-sm font-medium ${
            isBleReady ? 'text-blue-600' : 'text-gray-400'
          }`}>
          Rescan
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View className="px-4 pt-4">
      <View className="flex flex-col items-center justify-center p-4 text-center bg-white rounded-2xl">
        <View className="w-[120px] h-[120px] rounded-full border-2 border-blue-600 items-center justify-center relative overflow-hidden bg-blue-50/20">
          {/* Multiple pulsing circles */}
          <Animated.View
            className="absolute w-full h-full rounded-full border-2 border-blue-500/20"
            style={{
              transform: [{scale: pulseScale}],
              opacity: pulseOpacity,
            }}
          />
          <Animated.View
            className="absolute w-full h-full rounded-full border-2 border-blue-500/20"
            style={{
              transform: [{scale: pulseScale2}],
              opacity: pulseOpacity2,
            }}
          />
          <Animated.View
            className="absolute w-full h-full rounded-full border-2 border-blue-500/20"
            style={{
              transform: [{scale: pulseScale3}],
              opacity: pulseOpacity3,
            }}
          />

          {/* Center point */}
          <View className="absolute w-1 h-1 rounded-full bg-blue-500/80 z-30" />

          {/* Final radar sweep implementation */}
          <View className="absolute w-[120px] h-[120px] z-20">
            <Animated.View
              style={{
                position: 'absolute',
                width: 120,
                height: 120,
                justifyContent: 'center',
                alignItems: 'center',
                transform: [{rotate: sweepRotate}],
              }}>
              <View
                style={{
                  position: 'absolute',
                  backgroundColor: 'rgba(30, 136, 229, 0.8)',
                  height: 2,
                  width: 60,
                  right: 0,
                  alignSelf: 'center',
                }}
              />
            </Animated.View>
          </View>

          {/* Radar dots */}
          <Animated.View
            className="absolute w-1.5 h-1.5 bg-blue-500/80 rounded-full z-10 top-[30%] left-[70%]"
            style={{
              transform: [{scale: blip1Scale}],
              opacity: blip1Opacity,
            }}
          />
          <Animated.View
            className="absolute w-1.5 h-1.5 bg-blue-500/80 rounded-full z-10 top-[60%] left-[40%]"
            style={{
              transform: [{scale: blip2Scale}],
              opacity: blip2Opacity,
            }}
          />
          <Animated.View
            className="absolute w-1.5 h-1.5 bg-blue-500/80 rounded-full z-10 top-[45%] left-[75%]"
            style={{
              transform: [{scale: blip3Scale}],
              opacity: blip3Opacity,
            }}
          />
        </View>

        <View className="flex flex-col items-center justify-center gap-y-2 mt-2">
          <Text className="text-base text-gray-800 font-medium">
            {getScanningText()}
          </Text>
          <Text className="text-xs text-gray-500">
            {isBleReady
              ? 'Searching for nearby Bluetooth devices'
              : 'Please enable Bluetooth in settings'}
          </Text>

          {renderActionButton()}
        </View>
      </View>
    </View>
  );
};

export default ScanSection;
