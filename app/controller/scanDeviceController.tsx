import {Text, View, ScrollView} from 'react-native';
import {NavigationFunctionComponent} from 'react-native-navigation';
import {SafeAreaView} from 'react-native-safe-area-context';
import ScanSection from '../components/scan-section/scanSection';
import ScanFoundDeviceList from '../components/scan-found-device/scanFoundDevice';

const ScanDeviceController: NavigationFunctionComponent = () => {
  return (
    <SafeAreaView className={'flex-1 bg-gray-100'}>
     <ScrollView className='flex-1'>
      <ScanSection onCancelPress={() => {}} />
      <ScanFoundDeviceList />
     </ScrollView>
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
