import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';

import {
  Activity,
  Crown,
  Droplet,
  Dumbbell,
  Flame,
  Heart,
  Scan,
  Scissors,
  Shield,
  Smile,
  User,
  Zap,
} from 'lucide-react-native';
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {cn} from '../../lib/utils';
import {DeviceMode} from '../../services/protocol';

export const getIconByMode = (
  mode: string,
  size: number = 24,
  color: string = '#1e88e5',
) => {
  switch (mode) {
    case 'Fitness':
      return <Dumbbell size={size} color={color} />;
    case 'Warm up':
      return <Flame size={size} color={color} />;
    case 'Cardio':
      return <Heart size={size} color={color} />;
    case 'Relax':
      return <Smile size={size} color={color} />;
    case 'Dermal':
      return <User size={size} color={color} />;
    case 'Drainage':
      return <Droplet size={size} color={color} />;
    case 'Cellulite':
      return <Scan size={size} color={color} />;
    case 'Metabolic':
      return <Activity size={size} color={color} />;
    case 'Slim':
      return <Scissors size={size} color={color} />;
    case 'Resistance':
      return <Shield size={size} color={color} />;
    case 'Contractures':
      return <Zap size={size} color={color} />;
    case 'Capillary':
      return <Activity size={size} color={color} />;
    case 'Vip':
      return <Crown size={size} color={color} />;
    default:
      return null;
  }
};

interface ModeItem {
  id: DeviceMode;
  name: string;
  icon: any;
}

export interface ModeListActionSheetActionSheetProps {
  selectedMode: string;
  handleModeSelect: (mode: DeviceMode, name: string, icon: any) => void;
}

const ModeListActionSheet = forwardRef<
  BottomSheet,
  ModeListActionSheetActionSheetProps
>((props, ref) => {
  const {selectedMode, handleModeSelect} = props;
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

  const modes: ModeItem[] = [
    {
      id: DeviceMode.FITNESS,
      name: 'Fitness',
      icon: <Dumbbell size={24} color="#1e88e5" />,
    },
    {
      id: DeviceMode.WARM_UP,
      name: 'Warm up',
      icon: <Flame size={24} color="#1e88e5" />,
    },
    {
      id: DeviceMode.CARDIO,
      name: 'Cardio',
      icon: <Heart size={24} color="#1e88e5" />,
    },
    {
      id: DeviceMode.RELAX,
      name: 'Relax',
      icon: <Smile size={24} color="#1e88e5" />,
    },
    {
      id: DeviceMode.DERMAL,
      name: 'Dermal',
      icon: <User size={24} color="#1e88e5" />,
    },
    {
      id: DeviceMode.DRAINAGE,
      name: 'Drainage',
      icon: <Droplet size={24} color="#1e88e5" />,
    },
    {
      id: DeviceMode.CELLULITE,
      name: 'Cellulite',
      icon: <Scan size={24} color="#1e88e5" />,
    },
    {
      id: DeviceMode.METABOLIC,
      name: 'Metabolic',
      icon: <Activity size={24} color="#1e88e5" />,
    },
    {
      id: DeviceMode.SLIM,
      name: 'Slim',
      icon: <Scissors size={24} color="#1e88e5" />,
    },
    {
      id: DeviceMode.RESISTANCE,
      name: 'Resistance',
      icon: <Shield size={24} color="#1e88e5" />,
    },
    {
      id: DeviceMode.CONTRACTURES,
      name: 'Contractures',
      icon: <Zap size={24} color="#1e88e5" />,
    },
    {
      id: DeviceMode.CAPILLARY,
      name: 'Capillary',
      icon: <Activity size={24} color="#1e88e5" />,
    },
    {
      id: DeviceMode.VIP,
      name: 'Vip',
      icon: <Crown size={24} color="#1e88e5" />,
    },
  ];

  const $modeList = (
    <View className="flex-row flex-wrap gap-y-2">
      {modes.map((mode, index) => (
        <View
          key={index}
          className="w-1/3 flex flex-col items-center justify-center">
          <TouchableOpacity
            key={index}
            className={cn(
              'flex w-4/5 aspect-square flex-col items-center justify-center rounded-lg gap-y-2',
              selectedMode === mode.name ? 'bg-blue-500' : 'bg-gray-100',
            )}
            onPress={() => handleModeSelect(mode.id, mode.name, mode.icon)}>
            {getIconByMode(
              mode.name,
              32,
              selectedMode === mode.name ? 'white' : '#1e88e5',
            )}
            <Text
              className={cn(
                'text-black text-sm font-medium',
                selectedMode === mode.name ? 'text-white' : 'text-black',
              )}>
              {mode.name}
            </Text>
          </TouchableOpacity>
        </View>
      ))}
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
        <SafeAreaView className={'flex flex-col p-4 bg-white'}>
          {$modeList}
        </SafeAreaView>
      </BottomSheetScrollView>
    </BottomSheet>
  );
});

export default ModeListActionSheet;
