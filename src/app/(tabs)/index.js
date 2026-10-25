
import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Text, View, TouchableOpacity, ScrollView, ActivityIndicator, Alert, NativeModules, Platform, Modal, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShieldCheck, ShieldAlert, Search, PauseCircle, PlayCircle, AlertTriangle, X, MessageSquareText, Users, Sparkles, CheckCircle2, Lock } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyzeMessageWithGemini } from '../../services/aiService';
import { requestSmsPermissions } from '../../services/smsListener';
import { 
  showPersistentGuardNotification, 
  dismissPersistentGuardNotification, 
  setupNotificationActionHandler 
} from '../../services/notificationService';


const { SmsReaderModule } = NativeModules;

const ONBOARDED_STORAGE_KEY = '@DejenSecurity_has_onboarded';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [isProtected, setIsProtected] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scamsBlockedCount, setScamsBlockedCount] = useState(0);
  const [totalScannedCount, setTotalScannedCount] = useState(0);
  const [hasSmsPermission, setHasSmsPermission] = useState(true);

  
  const [isOnboardingVisible, setIsOnboardingVisible] = useState(false);

  
  const [detectedThreats, setDetectedThreats] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [scannedSummaryCount, setScannedSummaryCount] = useState(0);

  useEffect(() => {
    checkOnboardingStatus();
    checkPermissions();
    loadStats();

    
    const subscription = setupNotificationActionHandler((newState) => {
      setIsProtected(newState);
    });

    return () => {
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
    };
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const onboarded = await AsyncStorage.getItem(ONBOARDED_STORAGE_KEY);
      if (!onboarded) {
        setIsOnboardingVisible(true);
      }
    } catch (e) {
      console.error("Failed to check onboarding state", e);
    }
  };

  const handleCompleteOnboarding = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDED_STORAGE_KEY, 'true');
      setIsOnboardingVisible(false);
      
      handleRequestPermission();
    } catch (e) {
      console.error("Failed to save onboarding state", e);
    }
  };

  const checkPermissions = async () => {
    const granted = await requestSmsPermissions();
    setHasSmsPermission(granted);
  };

  const handleRequestPermission = async () => {
    const granted = await requestSmsPermissions();
    setHasSmsPermission(granted);
    if (granted) {
      Alert.alert("Permission Granted", "DejenSecurity is now fully equipped to monitor incoming SMS threats.");
    } else {
      Alert.alert(
        "Permission Required", 
        "DejenSecurity needs SMS read/receive permissions to protect your device from phishing scams. Please enable it in your device settings if not prompted."
      );
    }
  };

  const loadStats = async () => {
    try {
      const storedBlocked = await AsyncStorage.getItem('@DejenSecurity_blocked_count');
      const storedScanned = await AsyncStorage.getItem('@DejenSecurity_scanned_count');
      const storedProtection = await AsyncStorage.getItem('@DejenSecurity_protection_active');

      if (storedBlocked) setScamsBlockedCount(parseInt(storedBlocked, 10));
      if (storedScanned) setTotalScannedCount(parseInt(storedScanned, 10));
      
      if (storedProtection !== null) {
        const active = JSON.parse(storedProtection);
        setIsProtected(active);
        if (active) {
          await showPersistentGuardNotification();
        } else {
          await dismissPersistentGuardNotification();
        }
      } else {
        
        await showPersistentGuardNotification();
      }
    } catch (e) {
      console.error("Failed to load stats", e);
    }
  };

  const saveStats = async (blocked, scanned) => {
    try {
      await AsyncStorage.setItem('@DejenSecurity_blocked_count', blocked.toString());
      await AsyncStorage.setItem('@DejenSecurity_scanned_count', scanned.toString());
    } catch (e) {
      console.error("Failed to save stats", e);
    }
  };

  const toggleProtection = async () => {
    const newState = !isProtected;
    setIsProtected(newState);
    try {
      await AsyncStorage.setItem('@DejenSecurity_protection_active', JSON.stringify(newState));
      console.log(`[DejenSecurity] Protection status updated: ${newState}`);

      if (newState) {
        await showPersistentGuardNotification();
        console.log("[DejenSecurity] Persistent guard enabled.");
      } else {
        
        await dismissPersistentGuardNotification();
        console.log("[DejenSecurity] Persistent guard dismissed.");
      }
    } catch (e) {
      console.error("Failed to save protection state", e);
    }
  };

  
  const handleScanLastWeek = async () => {
    if (!isProtected) {
      Alert.alert("Protection Paused", "Please resume protection before running a security scan.");
      return;
    }

    setIsScanning(true);
    try {
      const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
      let deviceMessages = [];

      if (Platform.OS === 'android') {
        if (SmsReaderModule && typeof SmsReaderModule.queryInbox === 'function') {
          deviceMessages = await SmsReaderModule.queryInbox(threeDaysAgo);
        } else {
          throw new Error("SmsReaderModule is not linked or registered properly in native Android code.");
        }
      } else {
        Alert.alert("Notice", "Device inbox reading is only supported on Android devices.");
        setIsScanning(false);
        return;
      }

      if (!deviceMessages || deviceMessages.length === 0) {
        Alert.alert(
          "Inbox Audit Complete", 
          "No SMS messages found in your device inbox from the past 3 days."
        );
        setIsScanning(false);
        return;
      }

      
      const cacheJson = await AsyncStorage.getItem('@DejenSecurity_message_cache');
      let messageCache = cacheJson ? JSON.parse(cacheJson) : {};

      const cachedResults = [];
      const uncachedMessages = [];

      
      deviceMessages.forEach((msg, index) => {
        const cacheKey = `${msg.sender || "Unknown"}_${msg.body || ""}`;
        if (messageCache[cacheKey]) {
          cachedResults.push({
            id: index + 1,
            sender: msg.sender || "Unknown",
            body: msg.body || "",
            ...messageCache[cacheKey]
          });
        } else {
          uncachedMessages.push({
            originalIndex: index + 1,
            sender: msg.sender || "Unknown",
            body: msg.body || "",
            timestamp: msg.timestamp || Date.now(),
            cacheKey: cacheKey
          });
        }
      });

      let newFetchedThreats = [];

      if (uncachedMessages.length > 0) {
        const formattedBatch = uncachedMessages.map((msg) => ({
          id: msg.originalIndex,
          sender: msg.sender,
          body: msg.body
        }));

        const batchAnalysis = await analyzeMessageWithGemini(
          "BATCH_AUDIT", 
          JSON.stringify(formattedBatch)
        );

        if (batchAnalysis && Array.isArray(batchAnalysis.threats)) {
          batchAnalysis.threats.forEach(threat => {
            const matchedMsg = uncachedMessages.find(m => m.originalIndex === threat.id);
            if (matchedMsg) {
              const analysisData = {
                scam_probability: threat.scam_probability,
                category: threat.category || "Phishing Scam",
                reason: threat.reason || "Flagged during audit.",
                timestamp: matchedMsg.timestamp 
              };
              messageCache[matchedMsg.cacheKey] = analysisData;
              newFetchedThreats.push({
                id: threat.id,
                sender: matchedMsg.sender,
                body: matchedMsg.body,
                ...analysisData
              });
            }
          });
        }

        uncachedMessages.forEach(msg => {
          const isStored = newFetchedThreats.some(t => t.id === msg.originalIndex);
          if (!isStored) {
            messageCache[msg.cacheKey] = {
              scam_probability: 0,
              category: "Safe Message",
              reason: "Passed security check.",
              timestamp: msg.timestamp
            };
          }
        });

        await AsyncStorage.setItem('@DejenSecurity_message_cache', JSON.stringify(messageCache));
      }

      const allScannedResults = [...cachedResults, ...newFetchedThreats];
      const foundThreats = allScannedResults.filter(t => t.scam_probability >= 50);

      const newlyDiscoveredCount = uncachedMessages.length;
      const newlyBlockedCount = newFetchedThreats.filter(t => t.scam_probability >= 50).length;

      const updatedBlocked = scamsBlockedCount + newlyBlockedCount;
      const updatedScannedTotal = totalScannedCount + newlyDiscoveredCount;

      setScamsBlockedCount(updatedBlocked);
      setTotalScannedCount(updatedScannedTotal);
      saveStats(updatedBlocked, updatedScannedTotal);

      setScannedSummaryCount(deviceMessages.length);
      setDetectedThreats(foundThreats);
      setIsModalVisible(true);

    } catch (error) {
      console.error("Device scan error:", error);
      Alert.alert("Scan Failed", error.message || "Could not query device SMS inbox or complete Gemini audit.");
    } finally {
      setIsScanning(false);
    }
  };

  const safePercentage = totalScannedCount === 0 ? 100 : Math.max(0, Math.round(((totalScannedCount - scamsBlockedCount) / totalScannedCount) * 100));

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      
      {}
      <View className="flex-row items-center justify-between px-6 py-4 bg-white border-b border-slate-100">
        <View className="flex-row items-center">
          <View className={`p-2 rounded-xl mr-3 ${isProtected ? 'bg-blue-600' : 'bg-amber-600'}`}>
            <ShieldCheck size={22} color="#ffffff" />
          </View>
          <Text className="text-xl font-bold text-slate-900 tracking-tight">DejenSecurity</Text>
        </View>

        <TouchableOpacity 
          onPress={toggleProtection}
          className={`flex-row items-center px-3 py-1.5 rounded-full border ${isProtected ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}
        >
          <View className={`w-2.5 h-2.5 rounded-full mr-2 ${isProtected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <Text className={`text-xs font-bold ${isProtected ? 'text-emerald-700' : 'text-rose-700'}`}>
            {isProtected ? 'Active' : 'Paused'}
          </Text>
        </TouchableOpacity>
      </View> 

      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        
        {}
        {!hasSmsPermission && (
          <TouchableOpacity 
            onPress={handleRequestPermission}
            activeOpacity={0.85}
            className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 mb-6 flex-row items-center shadow-sm"
          >
            <View className="p-2.5 bg-amber-100 rounded-xl mr-3">
              <AlertTriangle size={20} color="#d97706" />
            </View>
            <View className="flex-1 pr-2">
              <Text className="text-xs font-bold text-amber-900 mb-0.5">SMS Permission Required</Text>
              <Text className="text-[11px] text-amber-700 leading-relaxed">
                Tap here to grant SMS monitoring permissions so DejenSecurity can protect your device from scams.
              </Text>
            </View>
            <View className="bg-amber-600 px-3 py-1.5 rounded-xl">
              <Text className="text-white text-[11px] font-bold">Enable</Text>
            </View>
          </TouchableOpacity>
        )}

        {}
        <TouchableOpacity activeOpacity={0.9} onPress={toggleProtection} className="items-center my-6">
          <View className={`w-56 h-56 rounded-full items-center justify-center relative ${isProtected ? 'bg-emerald-50' : 'bg-rose-50'}`}>
            <View className={`w-44 h-44 rounded-full items-center justify-center ${isProtected ? 'bg-emerald-100/60' : 'bg-rose-100/60'}`}>
              <View className={`w-32 h-32 rounded-full items-center justify-center ${isProtected ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                <View className={`w-24 h-24 rounded-full items-center justify-center ${isProtected ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                  {isProtected ? (
                    <ShieldCheck size={48} color="#ffffff" />
                  ) : (
                    <ShieldAlert size={48} color="#ffffff" />
                  )}
                </View>
              </View>
            </View>
          </View>
        </TouchableOpacity>

        {}
        <View className="items-center mb-8">
          <Text className="text-3xl font-extrabold text-slate-900 mb-2">
            {isProtected ? 'Protected' : 'Protection Paused'}
          </Text>
          <Text className="text-slate-500 text-center text-sm px-6 leading-relaxed">
            {isProtected 
              ? 'DejenSecurity is actively screening SMS & background alerts.' 
              : 'Real-time security is paused. Tap the shield or resume below to activate.'}
          </Text>
        </View>

        {}
        <View className="bg-white border border-slate-100 rounded-3xl p-6 mb-8 flex-row items-center justify-between shadow-sm">
          <View className="flex-1 items-center">
            <Text className="text-3xl font-extrabold text-slate-900 mb-1">{scamsBlockedCount}</Text>
            <Text className="text-slate-400 text-xs font-medium text-center">Scams blocked</Text>
          </View>
          
          <View className="h-10 w-[1px] bg-slate-100" />
          
          <View className="flex-1 items-center">
            <View className="flex-row items-center mb-1">
              <View className={`w-2 h-2 rounded-full mr-1.5 ${safePercentage < 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              <Text className="text-3xl font-extrabold text-slate-900">{safePercentage}%</Text>
            </View>
            <Text className="text-slate-400 text-xs font-medium text-center">Safe index</Text>
          </View>
        </View>

        {}
        <TouchableOpacity 
          onPress={handleScanLastWeek}
          disabled={isScanning || !isProtected}
          className={`py-4 rounded-2xl flex-row items-center justify-center mb-4 ${isProtected ? 'bg-blue-600 active:opacity-90 shadow-sm' : 'bg-slate-300'}`}
        >
          {isScanning ? (
            <ActivityIndicator size="small" color="#ffffff" className="mr-2" />
          ) : (
            <Search size={20} color="#ffffff" className="mr-2" />
          )}
          <Text className="text-white font-bold text-base">
            {isScanning ? 'Scanning Past 3 Days...' : 'Scan Past 3 Days (Device Inbox)'}
          </Text>
        </TouchableOpacity>

        {}
        <TouchableOpacity onPress={toggleProtection} className="flex-row items-center justify-center mb-10 py-2">
          {isProtected ? (
            <>
              <PauseCircle size={18} color="#94a3b8" className="mr-1.5" />
              <Text className="text-slate-400 text-sm font-medium">Pause Protection</Text>
            </>
          ) : (
            <>
              <PlayCircle size={18} color="#10b981" className="mr-1.5" />
              <Text className="text-emerald-600 text-sm font-bold">Resume Protection</Text>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>

      {}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isOnboardingVisible}
        onRequestClose={() => {}}
      >
        <View className="flex-1 bg-black/70 justify-center px-6">
          <View className="bg-white rounded-[32px] p-7 shadow-2xl border border-slate-100 max-h-[90%]">
            
            <View className="w-16 h-16 bg-blue-50 rounded-2xl items-center justify-center mb-4 mx-auto border border-blue-100 shadow-sm">
              <ShieldCheck size={36} color="#2563eb" />
            </View>

            <Text className="text-2xl font-black text-slate-900 text-center mb-1 tracking-tight">
              Welcome to DejenSecurity
            </Text>
            <Text className="text-slate-500 text-xs text-center leading-relaxed mb-5 px-1">
              Your localized mobile defense system designed to detect and block SMS phishing scams across Ethiopia.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} className="mb-6">
              <View className="space-y-3">
                <View className="flex-row items-start bg-slate-50 p-3.5 rounded-2xl border border-slate-100 mb-2.5">
                  <View className="p-2 bg-blue-100/60 rounded-xl mr-3">
                    <MessageSquareText size={18} color="#2563eb" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-slate-900 mb-0.5">Real-Time SMS Scanning</Text>
                    <Text className="text-[11px] text-slate-500 leading-tight">AI-powered protection screens incoming messages for malicious links, fake bank alerts, and fraud.</Text>
                  </View>
                </View>

                <View className="flex-row items-start bg-slate-50 p-3.5 rounded-2xl border border-slate-100 mb-2.5">
                  <View className="p-2 bg-emerald-100/60 rounded-xl mr-3">
                    <Users size={18} color="#059669" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-slate-900 mb-0.5">Community Scam Registry</Text>
                    <Text className="text-[11px] text-slate-500 leading-tight">Contribute to and check crowd-sourced reports of malicious numbers and scam entities.</Text>
                  </View>
                </View>

                <View className="flex-row items-start bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <View className="p-2 bg-purple-100/60 rounded-xl mr-3">
                    <Lock size={18} color="#7c3aed" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-slate-900 mb-0.5">Privacy First</Text>
                    <Text className="text-[11px] text-slate-500 leading-tight">All scans run securely. Your personal text messages remain strictly private on your device.</Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              onPress={handleCompleteOnboarding}
              className="bg-blue-600 py-4 rounded-2xl items-center shadow-md shadow-blue-600/35 active:opacity-90"
            >
              <Text className="text-white font-bold text-xs uppercase tracking-wider">Get Started Securely</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View 
            className="bg-white rounded-t-[32px] p-6 max-h-[82%] shadow-2xl border-t border-slate-100"
            style={{ paddingBottom: Math.max(insets.bottom + 16, 24) }}
          >
            
            {}
            <View className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4" />

            {}
            <View className="flex-row items-center justify-between pb-4 border-b border-slate-100 mb-2">
              <View className="flex-row items-center">
                <View className="p-2.5 bg-rose-50 rounded-2xl mr-3 border border-rose-100">
                  <AlertTriangle size={20} color="#e11d48" />
                </View>
                <View>
                  <Text className="text-base font-extrabold text-slate-900">Audit Results</Text>
                  <Text className="text-xs text-slate-500">Scanned {scannedSummaryCount} messages from past 3 days</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setIsModalVisible(false)} className="p-2 bg-slate-100 rounded-full">
                <X size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            {}
            <ScrollView className="py-2 mb-2" showsVerticalScrollIndicator={false}>
              {detectedThreats.length === 0 ? (
                <View className="items-center py-12">
                  <View className="w-16 h-16 bg-emerald-50 rounded-2xl items-center justify-center mb-3 border border-emerald-100">
                    <ShieldCheck size={32} color="#10b981" />
                  </View>
                  <Text className="text-base font-bold text-slate-900 mb-1">Clean Inbox!</Text>
                  <Text className="text-slate-400 text-xs text-center px-6 leading-relaxed">
                    No phishing threats or scams were found in your recent messages.
                  </Text>
                </View>
              ) : (
                detectedThreats.map((threat, index) => (
                  <View key={index} className="bg-rose-50/60 border border-rose-100 rounded-2xl p-4 mb-3 shadow-sm">
                    <View className="flex-row items-center justify-between mb-1.5">
                      <Text className="text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-md border border-rose-200/50">
                        {threat.category || "Phishing Threat"}
                      </Text>
                      <Text className="text-xs font-black text-rose-600">
                        {threat.scam_probability}% Risk
                      </Text>
                    </View>
                    <Text className="text-xs font-semibold text-slate-800 mb-1">From: <Text className="text-slate-900">{threat.sender}</Text></Text>
                    <Text className="text-xs text-slate-600 mb-2.5 italic" numberOfLines={3}>
                      "{threat.body || "Message body unavailable"}"
                    </Text>
                    <View className="bg-white/90 p-2.5 rounded-xl border border-rose-100/60">
                      <Text className="text-[11px] text-slate-600 leading-relaxed">
                        <Text className="font-bold text-slate-900">Why flagged: </Text>{threat.reason}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            {}
            <TouchableOpacity 
              onPress={() => setIsModalVisible(false)}
              className="bg-slate-900 py-3.5 rounded-2xl items-center active:opacity-90 shadow-sm"
            >
              <Text className="text-white font-bold text-xs uppercase tracking-wider">Done</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
