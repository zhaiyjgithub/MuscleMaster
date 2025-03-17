import {Text, View} from 'react-native';
import {NavigationFunctionComponent} from 'react-native-navigation';
import {SafeAreaView} from 'react-native-safe-area-context';
import ScanSection from '../components/scan-section/scanSection';

const ScanDeviceController: NavigationFunctionComponent = () => {
  return (
    <SafeAreaView className={'flex-1 p-6 '}>
      <ScanSection onCancelPress={() => {}} />
      <Text className="text-red-600">Hello</Text>
    </SafeAreaView>
  );
};

ScanDeviceController.options = {
  topBar: {
    title: {
      text: 'Muscle Master',
    },
  },
};

export default ScanDeviceController;
