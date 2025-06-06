export default TimerDevice;
interface TimerDevice {
  id: string;
  name: string;
  timer: NodeJS.Timeout | null;
  timerValue: number;
  timerStatus: 'running' | 'stopped' | 'paused';
  connectionStatus:
    | 'connected'
    | 'disconnected'
    | 'connecting'
    | 'disconnecting';
  climbingTime: number;
  runningTime: number;
  stopTime: number;
  battery: number;
  mode: string;
  intensity: number;
  version: string;
  selected: boolean;
}
