
import * as Notifications from 'expo-notifications';
import { Platform, BackHandler } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const ACTION_OPEN_APP = 'openAppAction';
export const ACTION_STOP_LISTENING = 'stopListeningAction';
export const THREAT_CATEGORY = 'DejenSecurityThreatCategory';
export const PERSISTENT_NOTIFICATION_ID = 'DejenSecurity-persistent-guard';
export const SCANNING_NOTIFICATION_ID = 'DejenSecurity-scanning';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('DejenSecurity-threats', {
      name: 'DejenSecurity Threat Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#ff0000',
    });

    
    await Notifications.setNotificationChannelAsync('DejenSecurity-status', {
      name: 'DejenSecurity Protection Status',
      importance: Notifications.AndroidImportance.LOW, 
    });
  }

  await Notifications.setNotificationCategoryAsync(THREAT_CATEGORY, [
    {
      identifier: ACTION_OPEN_APP,
      buttonTitle: 'Open App',
      options: { opensAppToForeground: true },
    },
    {
      identifier: ACTION_STOP_LISTENING,
      buttonTitle: 'Stop Protection',
      options: { opensAppToForeground: false, isDestructive: true },
    },
  ]);

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  return finalStatus === 'granted';
}


export async function showPersistentGuardNotification() {
  if (Platform.OS !== 'android') return;

  try {
    
    const storedProtection = await AsyncStorage.getItem('@DejenSecurity_protection_active');
    if (storedProtection !== null) {
      const isProtected = JSON.parse(storedProtection);
      if (!isProtected) {
        console.log("[DejenSecurity Notification] Protection is paused. Blocking persistent guard from appearing.");
        await dismissPersistentGuardNotification();
        return;
      }
    }

    await Notifications.scheduleNotificationAsync({
      identifier: PERSISTENT_NOTIFICATION_ID,
      content: {
        title: '🛡️ DejenSecurity Shield Active',
        body: 'Monitoring incoming SMS threats in real-time.',
        sticky: true, 
        autoDismiss: false,
        ongoing: true,
        channelId: 'DejenSecurity-status',
        categoryIdentifier: THREAT_CATEGORY, 
      },
      trigger: null,
    });
  } catch (error) {
    console.error("Failed to show persistent notification:", error);
  }
}


export async function dismissPersistentGuardNotification() {
  try {
    
    await Notifications.dismissNotificationAsync(PERSISTENT_NOTIFICATION_ID);
    await Notifications.cancelScheduledNotificationAsync(PERSISTENT_NOTIFICATION_ID);
  } catch (error) {
    console.error("Failed to dismiss persistent notification:", error);
  }
}


export async function showScanningNotification(sender) {
  if (Platform.OS !== 'android') return;

  try {
    const storedProtection = await AsyncStorage.getItem('@DejenSecurity_protection_active');
    if (storedProtection !== null && JSON.parse(storedProtection) === false) return;

    await Notifications.scheduleNotificationAsync({
      identifier: SCANNING_NOTIFICATION_ID,
      content: {
        title: '🔍 DejenSecurity Security',
        body: `Analyzing incoming message from ${sender}...`,
        sticky: false,
        autoDismiss: true,
        ongoing: false,
        channelId: 'DejenSecurity-status',
      },
      trigger: null,
    });
  } catch (error) {
    console.error("Failed to show scanning notification:", error);
  }
}


export async function dismissScanningNotification() {
  try {
    await Notifications.cancelScheduledNotificationAsync(SCANNING_NOTIFICATION_ID);
    await Notifications.dismissNotificationAsync(SCANNING_NOTIFICATION_ID);
  } catch (error) {
    
  }
}


export async function triggerScamAlert(sender, category, probability, reason) {
  const storedProtection = await AsyncStorage.getItem('@DejenSecurity_protection_active');
  if (storedProtection !== null && JSON.parse(storedProtection) === false) return;

  const uniqueId = `scam-alert-${sender}-${Date.now()}`;

  await Notifications.scheduleNotificationAsync({
    identifier: uniqueId,
    content: {
      title: `⚠️ Scam Detected! (${probability}% Risk)`,
      body: `Sender: ${sender}\n${category}: ${reason}`,
      data: { sender, category, reason },
      sound: 'default',
      channelId: 'DejenSecurity-threats',
      categoryIdentifier: THREAT_CATEGORY,
    },
    trigger: null,
  });
}


export function setupNotificationActionHandler(setIsProtectedCallback) {
  return Notifications.addNotificationResponseReceivedListener(async (response) => {
    const actionId = response.actionIdentifier;

    if (actionId === ACTION_STOP_LISTENING) {
      console.log("[DejenSecurity Notification] User clicked 'Stop Protection'. Killing background process.");
      try {
        
        await AsyncStorage.setItem('@DejenSecurity_protection_active', JSON.stringify(false));
        
        
        await dismissPersistentGuardNotification();

        if (setIsProtectedCallback) {
          setIsProtectedCallback(false);
        }

        
        if (Platform.OS === 'android') {
          setTimeout(() => {
            BackHandler.exitApp();
          }, 300); 
        }
      } catch (e) {
        console.error("Failed to stop protection and exit app", e);
      }
    }
  });
}
