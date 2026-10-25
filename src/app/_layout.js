
import { useEffect, useState } from 'react';
import { Stack, router, useRootNavigationState } from 'expo-router';
import * as Notifications from 'expo-notifications';
import '../../global.css';
import { 
  registerForPushNotificationsAsync, 
  showPersistentGuardNotification, 
  dismissPersistentGuardNotification, 
  ACTION_STOP_LISTENING 
} from '../services/notificationService';
import { requestSmsPermissions, initSmsListener } from '../services/smsListener';

export default function RootLayout() {
  
  const navigationState = useRootNavigationState();
  const [pendingRoute, setPendingRoute] = useState(null);

  
  useEffect(() => {
    if (navigationState?.key && pendingRoute) {
      router.push(pendingRoute);
      setPendingRoute(null); 
    }
  }, [navigationState?.key, pendingRoute]);

  useEffect(() => {
    let subscription = null;
    let responseSubscription = null;

    async function initSecurity() {
      const granted = await registerForPushNotificationsAsync();
      const hasSmsPermission = await requestSmsPermissions();
      
      if (granted && hasSmsPermission) {
        console.log("[DejenSecurity] SMS monitoring active.");
        subscription = initSmsListener();
        
        
        await showPersistentGuardNotification();
      }
    }
    initSecurity();

    
    responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      const actionId = response.actionIdentifier;

      if (actionId === ACTION_STOP_LISTENING) {
        console.log("[DejenSecurity] Protection stopped via notification action.");
        if (subscription && subscription.remove) {
          subscription.remove();
        }
        dismissPersistentGuardNotification();
      } else {
        
        setPendingRoute('/(tabs)/threats');
      }
    });

    return () => {
      if (subscription && subscription.remove) {
        subscription.remove();
      }
      if (responseSubscription) {
        responseSubscription.remove();
      }
    };
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}
