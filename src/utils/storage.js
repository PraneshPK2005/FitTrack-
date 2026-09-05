/**
 * Native storage adapter — wraps @react-native-async-storage/async-storage
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const storage = {
  getItem:    (key)        => AsyncStorage.getItem(key),
  setItem:    (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key)        => AsyncStorage.removeItem(key),
};

export default storage;