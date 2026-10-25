
import * as SmsListener from 'expo-sms-listener';
import { PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyzeMessageWithGemini } from './aiService';
import { triggerScamAlert } from './notificationService';
import * as Notifications from 'expo-notifications';


const API_BASE_URL = 'https://ethiophish-api.davidhabte7.workers.dev';
const CACHE_KEY = '@DejenSecurity_registry_cache';
const OFFLINE_QUEUE_KEY = '@DejenSecurity_offline_queue';

export async function requestSmsPermissions() {
  if (Platform.OS === 'android') {
    try {
      const grants = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_SMS,
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      ]);

      const readGranted = grants['android.permission.READ_SMS'] === PermissionsAndroid.RESULTS.GRANTED;
      const receiveGranted = grants['android.permission.RECEIVE_SMS'] === PermissionsAndroid.RESULTS.GRANTED;

      let expoGranted = true;
      if (SmsListener.requestSmsPermissionAsync) {
        const res = await SmsListener.requestSmsPermissionAsync();
        expoGranted = res.granted;
      }

      return (readGranted || receiveGranted || expoGranted);
    } catch (err) {
      console.error("SMS Permission Error:", err);
      return false;
    }
  }
  return true;
}


async function checkInternetConnectivity() {
  console.log("[Foreground Network Check] Testing internet connectivity against Cloudflare endpoint...");
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); 

    const response = await fetch(`${API_BASE_URL}/registry`, {
      method: 'HEAD',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const isOnline = response.ok || response.status < 500;
    console.log(`[Foreground Network Check] Result: ${isOnline ? '🌐 Online (Connected)' : '📴 Offline (Server Error)'}`);
    return isOnline;
  } catch (err) {
    console.warn(`[Foreground Network Check] 📴 Offline detected via fetch exception:`, err.message);
    return false;
  }
}


async function waitForInternetWithRetry(maxAttempts = 3, delayMs = 3000) {
  console.log(`[Foreground Network Polling] Starting active internet polling (Max attempts: ${maxAttempts})...`);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const isOnline = await checkInternetConnectivity();
    if (isOnline) {
      console.log(`[Foreground Network Polling] ✅ Internet connection detected on attempt ${attempt}/${maxAttempts}!`);
      return true;
    }
    if (attempt < maxAttempts) {
      console.log(`[Foreground Network Polling] ⏳ Still offline. Waiting ${delayMs / 1000}s before retry ${attempt + 1}/${maxAttempts}...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  console.log(`[Foreground Network Polling] ❌ Exhausted all ${maxAttempts} polling attempts. Device remains offline.`);
  return false;
}


async function triggerOfflineQueuedNotification(sender) {
  try {
    console.log(`[Foreground Offline Notification] Dispatching status notification for unscanned message from ${sender}...`);
    await Notifications.scheduleNotificationAsync({
      identifier: `offline-queued-fg-${sender}-${Date.now()}`,
      content: {
        title: '📴 Offline Mode: Message Queued',
        body: `Could not scan SMS from ${sender} due to no internet connection. Will scan automatically when online.`,
        sound: 'default',
        channelId: 'DejenSecurity-status',
      },
      trigger: null,
    });
  } catch (err) {
    console.error("[Foreground Offline Notification] Failed to trigger notification:", err);
  }
}


async function syncRegistryCacheAndProcessQueue() {
  console.log("[DejenSecurity Cache FG] Attempting to sync registry cache and process offline queue...");
  
  const isOnline = await waitForInternetWithRetry(2, 2000);
  if (!isOnline) {
    console.log("[DejenSecurity Cache FG] Skipping sync and queue flush: Device is currently offline.");
    return;
  }

  try {
    console.log(`[DejenSecurity Cache FG] Fetching registry from ${API_BASE_URL}/registry...`);
    const response = await fetch(`${API_BASE_URL}/registry`);
    const data = await response.json();
    
    if (Array.isArray(data)) {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
      console.log(`[DejenSecurity Cache FG] ✅ Successfully synced ${data.length} global scam entries.`);
      
      
      await processOfflineQueue();
    } else {
      console.warn("[DejenSecurity Cache FG] ⚠️ Fetched registry data is not a valid array:", typeof data);
    }
  } catch (err) {
    console.warn("[DejenSecurity Cache FG] ❌ Failed to sync registry cache in foreground:", err.message);
  }
}


async function storeInOfflineQueue(sender, messageBody, timestamp) {
  try {
    console.log(`[DejenSecurity Offline Queue FG] Preparing to store unanalyzed message from "${sender}"...`);
    const queueJson = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    let queue = queueJson ? JSON.parse(queueJson) : [];
    console.log(`[DejenSecurity Offline Queue FG] Current queue size before insertion: ${queue.length}`);
    
    const exists = queue.some(item => item.sender === sender && item.body === messageBody);
    if (!exists) {
      queue.push({ sender, body: messageBody, timestamp: timestamp || Date.now() });
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
      console.log(`[DejenSecurity Offline Queue FG] 📥 Successfully stored offline message. New queue length: ${queue.length}`);
      
      await triggerOfflineQueuedNotification(sender);
    } else {
      console.log(`[DejenSecurity Offline Queue FG] ℹ️ Duplicate message skipped from queue: ${sender}`);
    }
  } catch (e) {
    console.error("[DejenSecurity Offline Queue FG] ❌ Failed to store message in queue:", e);
  }
}


async function processOfflineQueue() {
  try {
    console.log("[DejenSecurity Offline Queue FG] Checking for pending offline messages to flush...");
    const queueJson = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!queueJson) {
      console.log("[DejenSecurity Offline Queue FG] Queue storage key is empty.");
      return;
    }

    let queue = JSON.parse(queueJson);
    if (!Array.isArray(queue) || queue.length === 0) {
      console.log("[DejenSecurity Offline Queue FG] Queue array is empty.");
      return;
    }

    console.log(`[DejenSecurity Offline Queue FG] 🔄 Network online! Processing ${queue.length} pending backlog messages in foreground...`);
    
    const remainingQueue = [];

    for (const msg of queue) {
      try {
        console.log(`[DejenSecurity Offline Queue FG] 🔍 Scanning backlog message from ${msg.sender}...`);
        const analysis = await analyzeMessageWithGemini(msg.sender, msg.body);
        console.log(`[DejenSecurity Offline Queue FG] Backlog analysis result for ${msg.sender}:`, JSON.stringify(analysis));

        if (analysis && analysis.scam_probability >= 50) {
          console.log(`[DejenSecurity Offline Queue FG] 🚨 Backlog threat detected (${analysis.scam_probability}%). Alerting user...`);
          await triggerScamAlert(msg.sender, analysis.category, analysis.scam_probability, `[Catch-up Scan] ${analysis.reason}`);
          await trackAndAutoReportScam(msg.sender, analysis.category, analysis.reason);
        } else {
          console.log(`[DejenSecurity Offline Queue FG] ✅ Backlog message verified safe.`);
        }
      } catch (err) {
        console.warn(`[DejenSecurity Offline Queue FG] ⚠️ Failed to scan backlog message from ${msg.sender}. Retaining in queue. Error:`, err.message);
        remainingQueue.push(msg);
      }
    }

    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
    console.log(`[DejenSecurity Offline Queue FG] Flush complete. Remaining queue length: ${remainingQueue.length}`);
  } catch (e) {
    console.error("[DejenSecurity Offline Queue FG] ❌ Error processing queue flush:", e);
  }
}


async function checkLocalRegistryCache(sender) {
  try {
    console.log(`[DejenSecurity Cache FG] Checking local registry cache for sender: "${sender}"...`);
    const cachedJson = await AsyncStorage.getItem(CACHE_KEY);
    if (!cachedJson) {
      console.log("[DejenSecurity Cache FG] Local registry cache is empty.");
      return null;
    }

    const registryItems = JSON.parse(cachedJson);
    console.log(`[DejenSecurity Cache FG] Loaded registry cache with ${registryItems.length} entries.`);

    const match = registryItems.find(item => 
      item.title && item.title.trim().toLowerCase() === sender.trim().toLowerCase()
    );

    if (match) {
      console.log(`[DejenSecurity Cache FG] 🎯 Found match in local registry cache for "${sender}":`, JSON.stringify(match));
    } else {
      console.log(`[DejenSecurity Cache FG] ❌ No match found in local registry cache for "${sender}".`);
    }

    return match || null;
  } catch (err) {
    console.error("[DejenSecurity Cache FG] ❌ Error reading local cache:", err);
    return null;
  }
}


async function trackAndAutoReportScam(sender, category, reason) {
  try {
    console.log(`[DejenSecurity Intelligence FG] Tracking foreground strike for sender "${sender}"...`);
    const storageKey = '@DejenSecurity_sender_strikes';
    const strikesJson = await AsyncStorage.getItem(storageKey);
    let strikesMap = strikesJson ? JSON.parse(strikesJson) : {};

    const currentData = strikesMap[sender] || { count: 0, reported: false };
    currentData.count += 1;
    strikesMap[sender] = currentData;

    await AsyncStorage.setItem(storageKey, JSON.stringify(strikesMap));
    console.log(`[DejenSecurity Intelligence FG] 📊 Sender "${sender}" strike count updated to: ${currentData.count} (Already reported? ${currentData.reported})`);

    
    if (currentData.count >= 3 && !currentData.reported) {
      console.log(`[DejenSecurity Intelligence FG] 🚀 Threshold of 3 reached! Checking connectivity before auto-reporting ${sender}...`);

      const isOnline = await waitForInternetWithRetry(2, 2000);
      if (!isOnline) {
        console.warn(`[DejenSecurity Intelligence FG] 📴 Offline mode: Cannot auto-report ${sender} to Cloudflare right now.`);
        return;
      }

      const payload = {
        title: sender,
        description: `Auto-reported: ${category || 'Phishing Scam'} (${reason || 'Repeated malicious activity'})`,
        iconType: 'alert'
      };

      console.log(`[DejenSecurity Intelligence FG] 📦 Sending payload to Cloudflare:`, JSON.stringify(payload));

      const response = await fetch(`${API_BASE_URL}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        console.error(`[DejenSecurity Intelligence FG] ❌ Failed to parse Cloudflare response as JSON!`);
        return;
      }

      if (result.success) {
        strikesMap[sender].reported = true;
        await AsyncStorage.setItem(storageKey, JSON.stringify(strikesMap));
        console.log(`[DejenSecurity Intelligence FG] ✅ Successfully locked & auto-reported ${sender} to Cloudflare KV!`);
        
        await syncRegistryCacheAndProcessQueue();
      } else {
        console.warn(`[DejenSecurity Intelligence FG] ⚠️ Cloudflare returned success: false ->`, result);
      }
    } else if (currentData.reported) {
      console.log(`[DejenSecurity Intelligence FG] ℹ️ Sender "${sender}" was already reported previously. Skipping API call.`);
    } else {
      console.log(`[DejenSecurity Intelligence FG] ⏳ Sender "${sender}" needs ${3 - currentData.count} more strike(s) before auto-reporting.`);
    }
  } catch (err) {
    console.error("[DejenSecurity Intelligence FG] ❌ Auto-report error:", err);
  }
}

export function initSmsListener() {
  try {
    if (typeof SmsListener.startSmsListener === 'function') {
      return SmsListener.startSmsListener(async (message) => {
        if (!message) {
          console.log("[DejenSecurity Foreground] Received empty message object. Ignoring.");
          return;
        }
        
        try {
          
          const protectionState = await AsyncStorage.getItem('@DejenSecurity_protection_active');
          console.log("[DejenSecurity Foreground Debug] protectionState from storage:", protectionState, typeof protectionState);

          if (
            protectionState === 'false' || 
            protectionState === false || 
            (protectionState && JSON.parse(protectionState) === false)
          ) {
            console.log("[DejenSecurity Foreground] ⏸️ Protection is paused. Ignoring incoming SMS.");
            return; 
          }

          
          console.log("[DejenSecurity Foreground] Proactively checking network and polling for connection to flush offline queue...");
          await syncRegistryCacheAndProcessQueue();

          const sender = message.originatingAddress || "Unknown";
          const messageBody = message.body || "";

          console.log(`[DejenSecurity Foreground] 📨 Intercepted active SMS from ${sender}: "${messageBody}"`);

          
          const cachedScamMatch = await checkLocalRegistryCache(sender);

          if (cachedScamMatch) {
            console.log(`[DejenSecurity Cache Match] ⚡ FOREGROUND CACHE HIT! Sender "${sender}" found in local scam registry cache. Skipping Gemini!`);
            
            await triggerScamAlert(
              sender, 
              cachedScamMatch.description || "Blacklisted Scam", 
              100, 
              `Verified by Community Registry (${cachedScamMatch.reports || 'Multiple reports'})`
            );
            return; 
          }

          console.log(`[DejenSecurity Cache Match] ❌ FOREGROUND CACHE MISS. Sender "${sender}" not in local registry cache.`);

          
          console.log("[DejenSecurity Foreground] Actively checking/polling internet connectivity for Gemini scan...");
          const isOnline = await waitForInternetWithRetry(3, 3000); 

          if (!isOnline) {
            console.warn(`[DejenSecurity Foreground] 📴 No internet connection detected after retries! Queuing message for later and notifying user.`);
            await storeInOfflineQueue(sender, messageBody, message.timestamp);
            return; 
          }

          
          console.log(`[DejenSecurity Foreground] 🤖 Internet active. Sending text from "${sender}" to Gemini for analysis...`);
          
          try {
            const analysis = await analyzeMessageWithGemini(sender, messageBody);
            console.log(`[DejenSecurity AI FG] Gemini Raw Analysis Result:`, JSON.stringify(analysis));

            if (analysis) {
              console.log(`[DejenSecurity AI FG] Scam Probability: ${analysis.scam_probability}% | Category: ${analysis.category}`);

              if (analysis.scam_probability >= 50) {
                console.log(`[DejenSecurity AI FG] 🚨 Scam threshold met (>= 50%). Triggering local alert notification...`);
                await triggerScamAlert(
                  sender,
                  analysis.category,
                  analysis.scam_probability,
                  analysis.reason
                );

                
                console.log(`[DejenSecurity AI FG] Calling auto-report tracker...`);
                await trackAndAutoReportScam(sender, analysis.category, analysis.reason);
              } else {
                console.log(`[DejenSecurity AI FG] ✅ Message considered safe (< 50% risk). No alert or report triggered.`);
              }
            } else {
              console.warn(`[DejenSecurity AI FG] ⚠️ Gemini returned null or undefined analysis.`);
            }
          } catch (apiError) {
            
            console.warn("[DejenSecurity Foreground] 📴 Network unavailable or Gemini failed. Storing message in offline queue.");
            await storeInOfflineQueue(sender, messageBody, message.timestamp);
          }

        } catch (error) {
          console.error("[DejenSecurity Foreground] ❌ Failed to process message:", error);
        }
      });
    }
  } catch (e) {
    console.warn("SMS Listener start error:", e);
  }
  return null;
}
