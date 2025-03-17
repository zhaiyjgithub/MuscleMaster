import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';

interface ScanSectionProps {
  onCancelPress: () => void;
}

const ScanSection: React.FC<ScanSectionProps> = ({ onCancelPress }) => {
  // Animation values
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim2 = useRef(new Animated.Value(0)).current;
  const pulseAnim3 = useRef(new Animated.Value(0)).current;
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const blipAnim1 = useRef(new Animated.Value(0)).current;
  const blipAnim2 = useRef(new Animated.Value(0)).current;
  const blipAnim3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Pulse animations with delays
    Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Second pulse with delay
    Animated.loop(
      Animated.timing(pulseAnim2, {
        toValue: 1,
        duration: 2000,
        delay: 650,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Third pulse with delay
    Animated.loop(
      Animated.timing(pulseAnim3, {
        toValue: 1,
        duration: 2000,
        delay: 1300,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Radar sweep animation
    Animated.loop(
      Animated.timing(sweepAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
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
      ])
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
      ])
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
      ])
    ).start();
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

  return (
    <View style={styles.scanSection}>
      <View style={styles.scanAnimation}>
        {/* Multiple pulsing circles */}
        <Animated.View
          style={[
            styles.pulseCircle,
            {
              transform: [{ scale: pulseScale }],
              opacity: pulseOpacity,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.pulseCircle,
            {
              transform: [{ scale: pulseScale2 }],
              opacity: pulseOpacity2,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.pulseCircle,
            {
              transform: [{ scale: pulseScale3 }],
              opacity: pulseOpacity3,
            },
          ]}
        />

        {/* Center point */}
        <View style={styles.centerPoint} />
        
        {/* Final radar sweep implementation */}
        <View style={styles.radarContainer}>
          <Animated.View 
            style={{
              position: 'absolute',
              width: 120,
              height: 120,
              justifyContent: 'center',
              alignItems: 'center',
              transform: [
                { rotate: sweepRotate },
              ],
            }}
          >
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
          style={[
            styles.radarDot,
            styles.radarDot1,
            {
              transform: [{ scale: blip1Scale }],
              opacity: blip1Opacity,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.radarDot,
            styles.radarDot2,
            {
              transform: [{ scale: blip2Scale }],
              opacity: blip2Opacity,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.radarDot,
            styles.radarDot3,
            {
              transform: [{ scale: blip3Scale }],
              opacity: blip3Opacity,
            },
          ]}
        />
      </View>

      <Text style={styles.scanText}>Scanning for devices...</Text>
      <Text style={styles.scanSubtext}>Looking for nearby Bluetooth devices</Text>
      
      <TouchableOpacity style={styles.cancelBtn} onPress={onCancelPress}>
        <Text style={styles.cancelBtnText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  scanSection: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    textAlign: 'center',
    backgroundColor: 'white',
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  scanAnimation: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: '#1e88e5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'rgba(30, 136, 229, 0.05)',
  },
  pulseCircle: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 60,
    borderWidth: 2,
    borderColor: 'rgba(30, 136, 229, 0.2)',
  },
  centerPoint: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(30, 136, 229, 0.8)',
    zIndex: 3,
  },
  radarContainer: {
    position: 'absolute',
    width: 120,
    height: 120,
    zIndex: 2,
  },
  radarDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    backgroundColor: 'rgba(30, 136, 229, 0.8)',
    borderRadius: 3,
    zIndex: 1,
  },
  radarDot1: {
    top: '30%',
    left: '70%',
  },
  radarDot2: {
    top: '60%',
    left: '40%',
  },
  radarDot3: {
    top: '45%',
    left: '75%',
  },
  scanText: {
    fontSize: 16,
    marginBottom: 5,
    color: '#333',
    fontWeight: '500',
  },
  scanSubtext: {
    fontSize: 13,
    color: '#777',
    marginBottom: 15,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
    borderColor: '#1e88e5',
    borderWidth: 1,
    borderRadius: 20,
    marginTop: 10,
  },
  cancelBtnText: {
    color: '#1e88e5',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default ScanSection;
