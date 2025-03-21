/**
 * @format
 */

import React from 'react';
import {Navigation} from 'react-native-navigation';
import './global.css';
import ScanDeviceController from './app/controller/scanDeviceController';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationProvider} from 'react-native-navigation-hooks';

Navigation.registerComponent(
  'ScanDeviceController',
  () => props => {
    return (
      <NavigationProvider value={{componentId: props.componentId}}>
        <SafeAreaProvider>
          <ScanDeviceController {...props} />
        </SafeAreaProvider>
      </NavigationProvider>
    );
  },
  () => ScanDeviceController,
);

Navigation.setDefaultOptions({
  topBar: {
    title: {
      color: 'white',
    },
    backButton: {
      color: 'white',
    },
    background: {
      color: '#1e88e5',
    },
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
