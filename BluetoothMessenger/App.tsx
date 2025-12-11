import React, {useState, useEffect} from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  PermissionsAndroid,
  Platform,
  Alert,
} from 'react-native';
import {BleManager, Device} from 'react-native-ble-plx';

const SERVICE_UUID = '0000180C-0000-1000-8000-00805F9B34FB';
const CHAR_UUID = '00002A56-0000-1000-8000-00805F9B34FB';

const encodeBase64 = (text: string) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = text;
  let output = '';
  for (let block = 0, charCode, i = 0, map = chars; str.charAt(i | 0) || ((map = '='), i % 1); output += map.charAt(63 & (block >> (8 - (i % 1) * 8)))) {
    charCode = str.charCodeAt((i += 3 / 4));
    block = (block << 8) | charCode;
  }
  return output;
};

const decodeBase64 = (input: string) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = input.replace(/=+$/, '');
  let output = '';
  for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4) ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)))) : 0) {
    buffer = chars.indexOf(buffer);
  }
  return output;
};

const manager = new BleManager();

const App = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [lastMessage, setLastMessage] = useState('');

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return (
          granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED
        );
      } catch (err) {
        return false;
      }
    }
    return true;
  };

  const startScan = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    setDevices([]);
    setIsScanning(true);

    manager.startDeviceScan(null, {allowDuplicates: false}, (error, device) => {
      if (error) {
        setIsScanning(false);
        return;
      }
      if (device && device.name) {
        setDevices(prev => {
          if (!prev.find(d => d.id === device.id)) {
            return [...prev, device];
          }
          return prev;
        });
      }
    });

    setTimeout(() => {
      manager.stopDeviceScan();
      setIsScanning(false);
    }, 10000);
  };

  const connectToDevice = async (device: Device) => {
    try {
      manager.stopDeviceScan();
      setIsScanning(false);
      
      const connected = await device.connect();
      await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(connected);
      
      Alert.alert('Success', `Connected to ${device.name}`);
      
      // START LISTENING
      connected.monitorCharacteristicForService(SERVICE_UUID, CHAR_UUID, (error, characteristic) => {
        if (error) {
          // SHOW ME THE ERROR ON SCREEN
          Alert.alert('Monitor Error', error.message); 
          return;
        }
        
        if (characteristic?.value) {
          const text = decodeBase64(characteristic.value);
          // SHOW ME THE DATA ON SCREEN
          Alert.alert('New Data Arrived!', text); 
          setLastMessage(text);
        }
      });
    } catch (error) {
      Alert.alert('Connection Failed', error.message);
    }
  };

  const disconnectDevice = async () => {
    if (connectedDevice) {
      await manager.cancelDeviceConnection(connectedDevice.id);
      setConnectedDevice(null);
    }
  };

  const sendMessage = async () => {
    if (!connectedDevice) return;
    try {
      await connectedDevice.writeCharacteristicWithResponseForService(
        SERVICE_UUID, CHAR_UUID, encodeBase64('Hello')
      );
      Alert.alert('Success', 'Message Sent!');
    } catch (error) {
      Alert.alert('Send Failed', error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bluetooth Messenger</Text>

      {/* Show Connected View OR Scan Button */}
      {connectedDevice ? (
        <View style={styles.connectedView}>
          <Text style={styles.connectedText}>Connected to: {connectedDevice.name}</Text>
          
          <View style={styles.messageBox}>
            <Text style={styles.messageTitle}>Last Message:</Text>
            <Text style={styles.messageText}>{lastMessage || "No messages yet"}</Text>
          </View>
          
          <TouchableOpacity style={styles.buttonSend} onPress={sendMessage}>
            <Text style={styles.buttonText}>Send "Hello"</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.buttonRed} onPress={disconnectDevice}>
            <Text style={styles.buttonText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={isScanning ? styles.buttonDisabled : styles.button}
          onPress={startScan}
          disabled={isScanning}>
          <Text style={styles.buttonText}>{isScanning ? 'Scanning...' : 'Scan for Devices'}</Text>
        </TouchableOpacity>
      )}

      {/* Device List */}
      <FlatList
        data={devices}
        keyExtractor={item => item.id}
        renderItem={({item}) => {
          // --- UI LOGIC TO CHANGE BUTTON COLOR ---
          const isConnectedToThisDevice = connectedDevice?.id === item.id;
          const isBusy = !!connectedDevice; 

          return (
            <View style={styles.deviceItem}>
              <View>
                <Text style={styles.deviceName}>{item.name}</Text>
                <Text style={styles.deviceId}>{item.id}</Text>
              </View>
              <TouchableOpacity
                style={
                  isConnectedToThisDevice
                    ? styles.buttonConnected     // Gray "Connected"
                    : isBusy
                    ? styles.buttonDisabledSmall // Light Gray (disabled)
                    : styles.connectButton       // Green "Connect"
                }
                onPress={() => connectToDevice(item)}
                disabled={isBusy} 
              >
                <Text style={styles.connectText}>
                  {isConnectedToThisDevice ? 'Connected' : 'Connect'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, padding: 20, backgroundColor: '#f5f5f5'},
  title: {fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#333'},
  connectedView: {marginBottom: 20, alignItems: 'center'},
  connectedText: {fontSize: 18, color: 'green', marginBottom: 10},
  deviceItem: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: 'white', marginBottom: 10, borderRadius: 8, elevation: 2},
  deviceName: {fontSize: 16, fontWeight: 'bold', color: 'black'},
  deviceId: {fontSize: 12, color: 'gray'},
  button: {backgroundColor: '#007AFF', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 20},
  buttonDisabled: {backgroundColor: '#A0A0A0', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 20},
  buttonRed: {backgroundColor: '#FF3B30', padding: 10, borderRadius: 8, alignItems: 'center'},
  buttonSend: {backgroundColor: '#5856D6', padding: 15, borderRadius: 8, marginBottom: 10, width: 200, alignItems: 'center'},
  // Button Styles
  connectButton: {backgroundColor: '#34C759', padding: 10, borderRadius: 5},
  buttonConnected: {backgroundColor: '#8E8E93', padding: 10, borderRadius: 5},
  buttonDisabledSmall: {backgroundColor: '#D1D1D6', padding: 10, borderRadius: 5},
  
  connectText: {color: 'white', fontWeight: 'bold'},
  buttonText: {color: 'white', fontSize: 16, fontWeight: 'bold'},
  messageBox: {backgroundColor: '#E5E5EA', padding: 15, borderRadius: 10, marginBottom: 15, width: '100%'},
  messageTitle: {fontSize: 12, color: 'gray', marginBottom: 5},
  messageText: {fontSize: 18, color: 'black', fontWeight: 'bold'},
});

export default App;