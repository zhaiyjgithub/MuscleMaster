/**
 * @format
 */

import React from 'react';
import {Navigation} from 'react-native-navigation';
import './global.css';
import ScanDeviceController from './app/controller/scanDeviceController';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationProvider} from 'react-native-navigation-hooks';
import DevicePanelController from './app/controller/devicePanelController';
import {GestureHandlerRootView} from 'react-native-gesture-handler';

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
