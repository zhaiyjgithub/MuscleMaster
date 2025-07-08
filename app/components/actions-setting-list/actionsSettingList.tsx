import {
  ChartNoAxesColumn,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronUp,
  Coffee,
  Icon,
  Mountain,
  OctagonMinus,
  PersonStanding,
} from 'lucide-react-native';
import {View, Text, TouchableOpacity} from 'react-native';
import Svg, {Circle} from 'react-native-svg';

interface ActionSettingListProps {
  climbTime: number;
  stopTime: number;
  runTime: number;
  onClimbTimeChange: (time: number) => void;
  onStopTimeChange: (time: number) => void;
  onRunTimeChange: (time: number) => void;
}

const ActionSettingList = ({
  climbTime,
  stopTime,
  runTime,
  onClimbTimeChange,
  onStopTimeChange,
  onRunTimeChange,
}: ActionSettingListProps) => {
  const data = [
    {
      id: 1,
      color: 'orange',
      icon: <ChartNoAxesCombined size={28} color="orange" />,
      value: climbTime,
      onAdd: () => onClimbTimeChange(climbTime + 1),
      onSubtract: () => onClimbTimeChange(climbTime - 1),
    },
    {
      id: 2,
      color: 'green',
      icon: <PersonStanding size={28} color="green" />,
      value: runTime,
      onAdd: () => onRunTimeChange(runTime + 1),
      onSubtract: () => onRunTimeChange(runTime - 1),
    },
    {
      id: 3,
      color: 'red',
      icon: <Coffee size={28} color="red" />,
      value: stopTime,
      onAdd: () => onStopTimeChange(stopTime + 1),
      onSubtract: () => onStopTimeChange(stopTime - 1),
    },
  ];

  return (
    <View className="flex-row items-center justify-between">
      {data.map(({id, icon, value, onAdd, onSubtract, color}, index) => (
        <View
          key={index}
          className="flex-row items-center justify-center gap-x-2">
          <View className="flex-col items-center gap-y-2">
            {icon}
            <View className="relative">
              <View className="relative">
                <Svg width={48} height={48}>
                  <Circle
                    cx={24}
                    cy={24}
                    r={20}
                    stroke="#E5E7EB"
                    strokeWidth={4}
                    fill="black"
                  />
                  <Circle
                    cx={24}
                    cy={24}
                    r={20}
                    stroke={color}
                    strokeWidth={4}
                    fill="none"
                    strokeDasharray={`${(value / 10) * 125.6} 125.6`}
                    transform="rotate(-90 24 24)"
                  />
                </Svg>
                <View className="absolute left-0 top-0 w-full h-full items-center justify-center">
                  <Text className="text-white text-lg font-bold">{value}</Text>
                </View>
              </View>
            </View>
          </View>
          <View className="flex-col gap-y-4">
            <TouchableOpacity
              onPress={onAdd}
              className="bg-black rounded-full items-center justify-center w-10 h-10">
              <ChevronUp size={24} color={'white'} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSubtract}
              className="bg-black rounded-full p-2 items-center justify-center w-10 h-10">
              <ChevronDown size={24} color={'white'} />
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
};

export default ActionSettingList;
