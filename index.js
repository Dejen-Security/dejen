
import { AppRegistry } from 'react-native';
import 'expo-router/entry';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyzeMessageWithGemini } from './src/services/aiService';
import { triggerScamAlert } from './src/services/notificationService';
import * as Notifications from 'expo-notifications';

const API_BASE_URL = 'https://ethiophish-api.davidhabte7.workers.dev';
const CACHE_KEY = '@DejenSecurity_registry_cache';
const OFFLINE_QUEUE_KEY = '@DejenSecurity_offline_queue';


async function checkInternetConnectivity() {
  console.log("[Network Check] Testing internet connectivity against Cloudflare endpoint...");
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); 

    const response = await fetch(`${API_BASE_URL}/registry`, {
      method: 'HEAD',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const isOnline = response.ok || response.status < 500;
    console.log(`[Network Check] Result: ${isOnline ? '🌐 Online (Connected)' : '📴 Offline (Server Error)'}`);
    return isOnline;
  } catch (err) {
    console.warn(`[Network Check] 📴 Offline detected via fetch exception:`, err.message);
    return false;
  }
}


async function waitForInternetWithRetry(maxAttempts = 3, delayMs = 3000) {
  console.log(`[Network Polling] Starting active internet polling (Max attempts: ${maxAttempts})...`);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const isOnline = await checkInternetConnectivity();
    if (isOnline) {
      console.log(`[Network Polling] ✅ Internet connection detected on attempt ${attempt}/${maxAttempts}!`);
      return true;
    }
    if (attempt < maxAttempts) {
      console.log(`[Network Polling] ⏳ Still offline. Waiting ${delayMs / 1000}s before retry ${attempt + 1}/${maxAttempts}...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  console.log(`[Network Polling] ❌ Exhausted all ${maxAttempts} polling attempts. Device remains offline.`);
  return false;
}


async function triggerOfflineQueuedNotification(sender) {
  try {
    console.log(`[Offline Notification] Dispatching status notification for unscanned message from ${sender}...`);
    await Notifications.scheduleNotificationAsync({
      identifier: `offline-queued-${sender}-${Date.now()}`,
      content: {
        title: '📴 Offline Mode: Message Queued',
        body: `Could not scan SMS from ${sender} due to no internet connection. Will scan automatically when online.`,
        sound: 'default',
        channelId: 'DejenSecurity-status',
      },
      trigger: null,
    });
  } catch (err) {
    console.error("[Offline Notification] Failed to trigger notification:", err);
  }
}


async function syncRegistryCacheAndProcessQueue() {
  console.log("[DejenSecurity Cache] Attempting to sync registry cache and process offline queue...");
  
  
  const isOnline = await waitForInternetWithRetry(2, 2000);
  if (!isOnline) {
    console.log("[DejenSecurity Cache] Skipping sync and queue flush: Device is currently offline.");
    return;
  }

  try {
    console.log(`[DejenSecurity Cache] Fetching registry from ${API_BASE_URL}/registry...`);
    const response = await fetch(`${API_BASE_URL}/registry`);
    const data = await response.json();
    
    if (Array.isArray(data)) {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
      console.log(`[DejenSecurity Cache] ✅ Successfully synced ${data.length} global scam entries to local cache.`);
      
      
      await processOfflineQueue();
    } else {
      console.warn("[DejenSecurity Cache] ⚠️ Fetched registry data is not a valid array:", typeof data);
    }
  } catch (err) {
    console.warn("[DejenSecurity Cache] ❌ Failed to sync registry cache:", err.message);
  }
}


async function storeInOfflineQueue(sender, messageBody, timestamp) {
  try {
    console.log(`[DejenSecurity Offline Queue] Preparing to store unanalyzed message from "${sender}"...`);
    const queueJson = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    let queue = queueJson ? JSON.parse(queueJson) : [];
    console.log(`[DejenSecurity Offline Queue] Current queue size before insertion: ${queue.length}`);
    
    
    const exists = queue.some(item => item.sender === sender && item.body === messageBody);
    if (!exists) {
      queue.push({ sender, body: messageBody, timestamp: timestamp || Date.now() });
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
      console.log(`[DejenSecurity Offline Queue] 📥 Successfully stored offline message. New queue length: ${queue.length}`);
      
      
      await triggerOfflineQueuedNotification(sender);
    } else {
      console.log(`[DejenSecurity Offline Queue] ℹ️ Duplicate message skipped from queue: ${sender}`);
    }
  } catch (e) {
    console.error("[DejenSecurity Offline Queue] ❌ Failed to store message in queue:", e);
  }
}


async function processOfflineQueue() {
  try {
    console.log("[DejenSecurity Offline Queue] Checking for pending offline messages to flush...");
    const queueJson = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!queueJson) {
      console.log("[DejenSecurity Offline Queue] Queue storage key is empty.");
      return;
    }

    let queue = JSON.parse(queueJson);
    if (!Array.isArray(queue) || queue.length === 0) {
      console.log("[DejenSecurity Offline Queue] Queue array is empty.");
      return;
    }

    console.log(`[DejenSecurity Offline Queue] 🔄 Network online! Processing ${queue.length} pending backlog messages...`);
    
    const remainingQueue = [];

    for (const msg of queue) {
      try {
        console.log(`[DejenSecurity Offline Queue] 🔍 Scanning backlog message from ${msg.sender} (Timestamp: ${msg.timestamp})...`);
        const analysis = await analyzeMessageWithGemini(msg.sender, msg.body);
        console.log(`[DejenSecurity Offline Queue] Backlog analysis result for ${msg.sender}:`, JSON.stringify(analysis));

        if (analysis && analysis.scam_probability >= 50) {
          console.log(`[DejenSecurity Offline Queue] 🚨 Backlog threat detected (${analysis.scam_probability}%). Alerting user...`);
          await triggerScamAlert(msg.sender, analysis.category, analysis.scam_probability, `[Catch-up Scan] ${analysis.reason}`);
          await trackAndAutoReportScamBackground(msg.sender, analysis.category, analysis.reason);
        } else {
          console.log(`[DejenSecurity Offline Queue] ✅ Backlog message verified safe.`);
        }
      } catch (err) {
        console.warn(`[DejenSecurity Offline Queue] ⚠️ Failed to scan backlog message from ${msg.sender}. Retaining in queue. Error:`, err.message);
        remainingQueue.push(msg);
      }
    }

    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
    console.log(`[DejenSecurity Offline Queue] Flush complete. Remaining queue length: ${remainingQueue.length}`);
  } catch (e) {
    console.error("[DejenSecurity Offline Queue] ❌ Error processing queue flush:", e);
  }
}


async function checkLocalRegistryCache(sender) {
  try {
    console.log(`[DejenSecurity Cache] Checking local registry cache for sender: "${sender}"...`);
    const cachedJson = await AsyncStorage.getItem(CACHE_KEY);
    if (!cachedJson) {
      console.log("[DejenSecurity Cache] Local registry cache is empty.");
      return null;
    }

    const registryItems = JSON.parse(cachedJson);
    console.log(`[DejenSecurity Cache] Loaded registry cache with ${registryItems.length} entries.`);

    const match = registryItems.find(item => 
      item.title && item.title.trim().toLowerCase() === sender.trim().toLowerCase()
    );

    if (match) {
      console.log(`[DejenSecurity Cache] 🎯 Found match in local registry cache for "${sender}":`, JSON.stringify(match));
    } else {
      console.log(`[DejenSecurity Cache] ❌ No match found in local registry cache for "${sender}".`);
    }

    return match || null;
  } catch (err) {
    console.error("[DejenSecurity Cache] ❌ Error reading local cache:", err);
    return null;
  }
}

async function trackAndAutoReportScamBackground(sender, category, reason) {
  try {
    console.log(`[DejenSecurity Intelligence] Tracking background strike for sender "${sender}"...`);
    const storageKey = '@DejenSecurity_sender_strikes';
    const strikesJson = await AsyncStorage.getItem(storageKey);
    let strikesMap = strikesJson ? JSON.parse(strikesJson) : {};

    const currentData = strikesMap[sender] || { count: 0, reported: false };
    currentData.count += 1;
    strikesMap[sender] = currentData;

    await AsyncStorage.setItem(storageKey, JSON.stringify(strikesMap));
    console.log(`[DejenSecurity Intelligence] 📊 Sender "${sender}" strike count: ${currentData.count} (Reported? ${currentData.reported})`);

    if (currentData.count >= 3 && !currentData.reported) {
      console.log(`[DejenSecurity Intelligence] 🚀 Threshold of 3 reached! Checking connectivity before auto-reporting ${sender}...`);

      const isOnline = await waitForInternetWithRetry(2, 2000);
      if (!isOnline) {
        console.warn(`[DejenSecurity Intelligence] 📴 Offline mode: Cannot auto-report ${sender} to Cloudflare right now.`);
        return;
      }

      const payload = {
        title: sender,
        description: `Auto-reported: ${category || 'Phishing Scam'} (${reason || 'Repeated malicious activity'})`,
        iconType: 'alert'
      };

      console.log(`[DejenSecurity Intelligence] 📦 Sending auto-report payload to Cloudflare:`, JSON.stringify(payload));
      const response = await fetch(`${API_BASE_URL}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      const result = JSON.parse(responseText);

      if (result.success) {
        strikesMap[sender].reported = true;
        await AsyncStorage.setItem(storageKey, JSON.stringify(strikesMap));
        console.log(`[DejenSecurity Intelligence] ✅ Successfully auto-reported ${sender} & synced!`);
        
        await syncRegistryCacheAndProcessQueue();
      } else {
        console.warn(`[DejenSecurity Intelligence] ⚠️ Cloudflare auto-report returned success: false`, result);
      }
    }
  } catch (err) {
    console.error("[DejenSecurity Intelligence] ❌ Error in background auto-report:", err);
  }
}

AppRegistry.registerHeadlessTask('ExpoSmsListenerBackground', () => async (message) => {
  if (!message) {
    console.log("[DejenSecurity Background] Received empty message object in headless task. Ignoring.");
    return;
  }

  try {
    console.log("[DejenSecurity Background] Headless SMS task triggered.");
    const protectionState = await AsyncStorage.getItem('@DejenSecurity_protection_active');
    console.log("[DejenSecurity Background] Protection state in storage:", protectionState);

    if (
      protectionState === 'false' || 
      protectionState === false || 
      (protectionState && JSON.parse(protectionState) === false)
    ) {
      console.log("[DejenSecurity Background] ⏸️ Protection is paused. Ignoring incoming SMS.");
      return;
    }

    
    console.log("[DejenSecurity Background] Proactively checking network and polling for connection to flush offline queue...");
    await syncRegistryCacheAndProcessQueue();

    const sender = message.originatingAddress || "Unknown";
    const messageBody = message.body || "";
    
    console.log(`[DejenSecurity Background] 📨 Processing SMS from ${sender}: "${messageBody}"`);

    
    const cachedScamMatch = await checkLocalRegistryCache(sender);

    if (cachedScamMatch) {
      console.log(`[DejenSecurity Cache Match] ⚡ CACHE HIT! Sender "${sender}" found in local scam registry cache. Skipping Gemini completely!`);
      
      await triggerScamAlert(
        sender, 
        cachedScamMatch.description || "Blacklisted Scam", 
        100, 
        `Verified by Community Registry (${cachedScamMatch.reports || 'Multiple reports'})`
      );
      return; 
    }

    console.log(`[DejenSecurity Cache Match] ❌ CACHE MISS. Sender "${sender}" not in local registry cache.`);

    
    console.log("[DejenSecurity Background] Actively checking/polling internet connectivity for Gemini scan...");
    const isOnline = await waitForInternetWithRetry(3, 3000); 

    if (!isOnline) {
      console.warn(`[DejenSecurity Background] 📴 No internet connection detected after retries! Queuing message for later and notifying user.`);
      await storeInOfflineQueue(sender, messageBody, message.timestamp);
      return; 
    }

    
    console.log(`[DejenSecurity Background] 🤖 Internet active. Sending message from "${sender}" to Gemini AI for analysis...`);
    
    try {
      const analysis = await analyzeMessageWithGemini(sender, messageBody);
      console.log(`[DejenSecurity AI] Analysis response received:`, JSON.stringify(analysis));

      if (analysis && analysis.scam_probability >= 50) {
        console.log(`[DejenSecurity AI] 🚨 Scam threshold met (${analysis.scam_probability}% risk). Triggering local alert...`);
        await triggerScamAlert(sender, analysis.category, analysis.scam_probability, analysis.reason);
        await trackAndAutoReportScamBackground(sender, analysis.category, analysis.reason);
      } else {
        console.log(`[DejenSecurity AI] ✅ Message considered safe (${analysis?.scam_probability || 0}% risk).`);
      }
    } catch (apiError) {
      console.warn("[DejenSecurity Background] ⚠️ Gemini API call failed during background execution. Storing message in offline queue. Error:", apiError.message);
      await storeInOfflineQueue(sender, messageBody, message.timestamp);
    }

  } catch (error) {
    console.error("[DejenSecurity Background] ❌ Fatal error processing SMS in headless task:", error);
  }
});
