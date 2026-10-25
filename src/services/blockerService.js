
import { NativeModules, Platform, Alert } from 'react-native';

const { SmsBlockerModule } = NativeModules;

export async function blockPhoneNumber(phoneNumber) {
  if (Platform.OS !== 'android') {
    Alert.alert("Notice", "Number blocking is only supported on Android devices.");
    return false;
  }

  try {
    if (SmsBlockerModule && typeof SmsBlockerModule.blockNumber === 'function') {
      const success = await SmsBlockerModule.blockNumber(phoneNumber);
      if (success) {
        Alert.alert("Success", `Number ${phoneNumber} has been blocked successfully.`);
        return true;
      } else {
        Alert.alert("Notice", "Number could not be blocked or is already blocked.");
      }
    } else {
      Alert.alert("Error", "SmsBlockerModule is not linked properly in native code.");
    }
  } catch (error) {
    console.error("Block number error:", error);
    Alert.alert("Block Failed", error.message || "An error occurred while trying to block the number.");
  }
  return false;
}
