import DevicePanelController from './app/controller/devicePanelController';
import ScanDeviceController from './app/controller/scanDeviceController';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {NavigationProvider} from 'react-native-navigation-hooks';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {Navigation} from 'react-native-navigation';
import React from 'react';
import './global.css';
/**
 * @format
 */


Navigation.registerComponent(
  'ScanDeviceController',
  () => props => {
    return (
      <NavigationProvider value={{componentId: props.componentId}}>
        <GestureHandlerRootView>
          <SafeAreaProvider>
            <ScanDeviceController {...props} />
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </NavigationProvider>
    );
  },
  () => ScanDeviceController,
);

Navigation.registerComponent(
  'DevicePanelController',
  () => props => {
    return (
      <NavigationProvider value={{componentId: props.componentId}}>
        <SafeAreaProvider>
          <DevicePanelController {...props} />
        </SafeAreaProvider>
      </NavigationProvider>
    );
  },
  () => DevicePanelController,
);

Navigation.setDefaultOptions({
  topBar: {
    title: {
      color: 'white',
    },
    backButton: {
      color: 'white',
      showTitle: false,
    },
    background: {
      color: '#1e88e5',
    },
    rightButtonColor: 'white',
  },
  statusBar: {
    backgroundColor: '#1976d2',
    style: 'light',
    translucent: true,
    drawBehind: true,
  },
});

Navigation.events().registerAppLaunchedListener(() => {
  Navigation.setRoot({
    root: {
      stack: {
        children: [
          {
            component: {
              name: 'ScanDeviceController',
            },
            options: {
              topBar: {
                title: {
                  // text: 'Muscle Master',
                  // color: 'white',
                  // fontSize: 18,
                },
              },
            },
          },
        ],
      },
    },
  });
});
