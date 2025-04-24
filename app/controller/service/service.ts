import BLEManager from '../../services/BLEManager.ts';
import {BLE_UUID, BLECommands} from '../../services/protocol.ts';

export {sendTurnOffCmd};

const sendTurnOffCmd = async (deviceId: string) => {
  BLEManager.writeCharacteristic(
    deviceId,
    BLE_UUID.SERVICE,
    BLE_UUID.CHARACTERISTIC_WRITE,
    BLECommands.turnOff(),
  )
    .then(() => {
      console.log('Successfully wrote mode value:');
    })
    .catch(error => {
      console.error('Error writing mode:', error);
    });
};
