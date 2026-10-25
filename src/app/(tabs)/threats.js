import React, { useState, useEffect } from 'react';
import { Text, View, TextInput, TouchableOpacity, ScrollView, Modal, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ShieldCheck, Search, ShieldAlert, ChevronRight, AlertTriangle, X, CheckCircle2 } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname } from 'expo-router';

const API_BASE_URL = 'https://ethiophish-api.davidhabte7.workers.dev';
const REPORTED_CACHE_KEY = '@DejenSecurity_reported_senders';
const REGISTRY_CACHE_KEY = '@DejenSecurity_registry_cache';

export default function ThreatsScreen() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [threats, setThreats] = useState([]);
  const [isProtected, setIsProtected] = useState(true);
  const [isReporting, setIsReporting] = useState(false);
  const [reportedSenders, setReportedSenders] = useState({});
  const [globalRegistrySenders, setGlobalRegistrySenders] = useState({});
  
  
  const [selectedThreat, setSelectedThreat] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  
  useEffect(() => {
    if (pathname?.includes('threats')) {
      loadThreatsData();
    }
  }, [pathname]);

  useEffect(() => {
    loadThreatsData();
  }, []);

  const loadThreatsData = async () => {
    try {
      console.log("[Threats Debug] Starting loadThreatsData...");
      const storedProtection = await AsyncStorage.getItem('@DejenSecurity_protection_active');
      if (storedProtection !== null) {
        setIsProtected(JSON.parse(storedProtection));
      }

      
      const reportedJson = await AsyncStorage.getItem(REPORTED_CACHE_KEY);
      let localReportedMap = reportedJson ? JSON.parse(reportedJson) : {};
      setReportedSenders(localReportedMap);

      
      const registryJson = await AsyncStorage.getItem(REGISTRY_CACHE_KEY);
      let globalRegistryMap = {};
      if (registryJson) {
        const registryItems = JSON.parse(registryJson);
        registryItems.forEach(item => {
          if (item.title) {
            globalRegistryMap[item.title.trim().toLowerCase()] = true;
          }
        });
      }
      setGlobalRegistrySenders(globalRegistryMap);

      const allThreatsList = [];
      const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
      const now = Date.now();

      
      const cacheJson = await AsyncStorage.getItem('@DejenSecurity_message_cache');
      if (cacheJson) {
        const messageCache = JSON.parse(cacheJson);
        const keys = Object.keys(messageCache);
        console.log(`[Threats Debug] Found message cache with ${keys.length} total entries.`);

        keys.forEach((key, index) => {
          const item = messageCache[key];
          const timestamp = item.timestamp ? Number(item.timestamp) : now;
          const timeDiff = now - timestamp;
          
          console.log(`[Threats Debug] Item key: "${key.substring(0, 30)}..." | Prob: ${item?.scam_probability} | Age (hrs): ${(timeDiff / (1000 * 60 * 60)).toFixed(1)}`);

          
          if (item && item.scam_probability >= 50 && timeDiff <= threeDaysMs) {
            let sender = "Unknown Sender";
            let body = key;

            const separatorIndex = key.indexOf('_');
            if (separatorIndex !== -1) {
              sender = key.substring(0, separatorIndex);
              body = key.substring(separatorIndex + 1);
            }

            allThreatsList.push({
              id: `${sender}_${timestamp}_${index}`,
              title: item.category || "Phishing Threat",
              sender: sender,
              message: body,
              probability: item.scam_probability,
              reason: item.reason || "Flagged by AI security engine.",
              timestamp: timestamp
            });
          }
        });
      } else {
        console.warn("[Threats Debug] No '@DejenSecurity_message_cache' found in AsyncStorage!");
      }

      
      const strikesJson = await AsyncStorage.getItem('@DejenSecurity_sender_strikes');
      if (strikesJson) {
        const strikesMap = JSON.parse(strikesJson);
        console.log(`[Threats Debug] Found sender strikes map with ${Object.keys(strikesMap).length} entries.`);
        Object.keys(strikesMap).forEach((sender, index) => {
          const alreadyExists = allThreatsList.some(t => t.sender.trim().toLowerCase() === sender.trim().toLowerCase());
          if (!alreadyExists) {
            allThreatsList.push({
              id: `strike_${sender}_${index}`,
              title: "Repeated Phishing Scam",
              sender: sender,
              message: "Multiple flagged suspicious SMS entries detected from this sender.",
              probability: 95,
              reason: "Accumulated multiple strike infractions in security filter logs.",
              timestamp: now
            });
          }
        });
      }

      console.log(`[Threats Debug] Final total loaded threats matching criteria: ${allThreatsList.length}`);
      const sortedThreats = allThreatsList.sort((a, b) => b.timestamp - a.timestamp);
      setThreats(sortedThreats);
    } catch (e) {
      console.error("[Threats Debug] Failed to load threats data", e);
    }
  };

  
  const filteredThreats = threats.filter((item) => {
    if (!searchQuery) return true;
    
    return item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
           item.sender.toLowerCase().includes(searchQuery.toLowerCase()) ||
           item.message.toLowerCase().includes(searchQuery.toLowerCase());
  });

  
  const isSenderReportedOrBlacklisted = (sender) => {
    if (!sender) return false;
    const cleanSender = sender.trim().toLowerCase();
    return !!(reportedSenders[sender] || globalRegistrySenders[cleanSender]);
  };

  
  const highRiskCount = threats.filter(t => t.probability >= 80).length;
  const reportedCount = threats.filter(t => isSenderReportedOrBlacklisted(t.sender)).length;

  const handleOpenThreatDetails = (threat) => {
    setSelectedThreat(threat);
    setIsModalVisible(true);
  };

  const handleReportToRegistry = async (threat) => {
    if (isSenderReportedOrBlacklisted(threat.sender)) {
      Alert.alert('Already Reported', `Sender "${threat.sender}" is already present in the global community security registry.`);
      return;
    }

    setIsReporting(true);
    try {
      const payload = {
        title: threat.sender,
        description: `Community reported scam: ${threat.title} (${threat.reason})`,
        iconType: 'alert'
      };

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
        result = { success: response.ok };
      }

      if (result.success || response.ok) {
        const updatedReported = { ...reportedSenders, [threat.sender]: true };
        setReportedSenders(updatedReported);
        await AsyncStorage.setItem(REPORTED_CACHE_KEY, JSON.stringify(updatedReported));

        if (result.data && Array.isArray(result.data)) {
          await AsyncStorage.setItem(REGISTRY_CACHE_KEY, JSON.stringify(result.data));
        }

        Alert.alert('Successfully Reported', `Sender "${threat.sender}" has been submitted to the global security registry.`);
        setIsModalVisible(false);
        loadThreatsData();
      } else {
        Alert.alert('Notice', 'Sender may already exist in the global registry or network error occurred.');
      }
    } catch (err) {
      console.error("Registry report error:", err);
      Alert.alert('Connection Error', 'Could not connect to backend registry service.');
    } finally {
      setIsReporting(false);
    }
  };

  const isAlreadyReported = selectedThreat && isSenderReportedOrBlacklisted(selectedThreat.sender);

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      
      {}
      <View className="flex-row items-center justify-between px-6 py-4 bg-white border-b border-slate-100">
        <View className="flex-row items-center">
          <View className="bg-blue-600 p-2 rounded-xl mr-3 shadow-sm">
            <ShieldCheck size={22} color="#ffffff" />
          </View>
          <Text className="text-xl font-bold text-slate-900">DejenSecurity</Text>
        </View>

        <View className={`flex-row items-center px-3 py-1 rounded-full ${isProtected ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200'}`}>
          <View className={`w-2 h-2 rounded-full mr-1.5 ${isProtected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <Text className={`text-xs font-bold ${isProtected ? 'text-emerald-700' : 'text-rose-700'}`}>
            {isProtected ? 'Active' : 'Paused'}
          </Text>
        </View>
      </View>

      <ScrollView 
        className="flex-1 px-6 pt-5" 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 140, 160) }}
      >
        
        {}
        <View className="mb-4">
          <Text className="text-2xl font-extrabold text-slate-900 mb-1">Reported Threats</Text>
          <Text className="text-slate-500 text-xs">
            Showing <Text className="font-bold text-slate-700">{filteredThreats.length}</Text> flagged security incidents from the past 3 days
          </Text>
        </View>

        {}
        <View className="flex-row items-center bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-5 shadow-sm">
          <Search size={18} color="#94a3b8" className="mr-3" />
          <TextInput
            className="flex-1 text-slate-900 text-sm font-medium"
            placeholder="Search sender, category, or keywords..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {}
        <View className="mb-6">
          <View className="flex-row items-center mb-3">
            <ShieldAlert size={14} color="#64748b" className="mr-1.5" />
            <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider">Threat Overview (Past 3 Days)</Text>
          </View>
          
          <View className="flex-row justify-between">
            <View className="flex-1 bg-white border border-slate-200 p-3.5 rounded-2xl shadow-sm mr-3">
              <Text className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Total</Text>
              <Text className="text-xl font-black text-slate-900">{threats.length}</Text>
            </View>
            
            <View className="flex-1 bg-rose-50 border border-rose-100 p-3.5 rounded-2xl shadow-sm mr-3">
              <Text className="text-[10px] font-extrabold text-rose-400 uppercase tracking-wider mb-1">High Risk</Text>
              <Text className="text-xl font-black text-rose-700">{highRiskCount}</Text>
            </View>

            <View className="flex-1 bg-emerald-50 border border-emerald-100 p-3.5 rounded-2xl shadow-sm">
              <Text className="text-[10px] font-extrabold text-emerald-500 uppercase tracking-wider mb-1">Reported</Text>
              <Text className="text-xl font-black text-emerald-700">{reportedCount}</Text>
            </View>
          </View>
        </View>

        {}
        <View className="mb-6">
          {filteredThreats.length === 0 ? (
            <View className="items-center py-16 bg-white rounded-3xl border border-slate-100 px-6 shadow-sm">
              <View className="w-16 h-16 bg-emerald-50 rounded-2xl items-center justify-center mb-4 border border-emerald-100">
                <ShieldCheck size={32} color="#10b981" />
              </View>
              <Text className="text-base font-bold text-slate-900 mb-1">No Threats Found</Text>
              <Text className="text-slate-400 text-xs text-center leading-relaxed">
                No security incidents match your search query from the past 3 days.
              </Text>
            </View>
          ) : (
            filteredThreats.map((item) => {
              const isReported = isSenderReportedOrBlacklisted(item.sender);
              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => handleOpenThreatDetails(item)}
                  activeOpacity={0.7}
                  className="bg-white border border-slate-100 rounded-2xl p-4 mb-3.5 flex-row items-center justify-between shadow-sm"
                >
                  <View className="flex-row items-center flex-1 pr-3">
                    <View className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-100 items-center justify-center mr-3.5 shrink-0 relative">
                      <ShieldAlert size={22} color="#e11d48" />
                    </View>

                    <View className="flex-1">
                      <View className="flex-row items-center justify-between mb-1">
                        <Text className="text-slate-900 font-bold text-sm mr-2 flex-1" numberOfLines={1}>
                          {item.title}
                        </Text>
                        <View className="bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                          <Text className="text-rose-600 text-[10px] font-bold">{item.probability}% Risk</Text>
                        </View>
                      </View>
                      <Text className="text-slate-500 text-xs mb-1">
                        Sender: <Text className="text-slate-700 font-semibold">{item.sender}</Text>
                        {isReported && <Text className="text-emerald-600 font-bold"> • Reported</Text>}
                      </Text>
                      <Text className="text-slate-400 text-xs italic" numberOfLines={1}>
                        "{item.message}"
                      </Text>
                    </View>
                  </View>

                  <View className="pl-2 border-l border-slate-100">
                    <ChevronRight size={18} color="#cbd5e1" />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

      </ScrollView>

      {}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View 
            className="bg-white rounded-t-[32px] p-6 max-h-[80%] shadow-2xl"
            style={{ paddingBottom: Math.max(insets.bottom + 16, 24) }}
          >
            
            <View className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4" />

            <View className="flex-row items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <View className="flex-row items-center">
                <View className="p-2.5 bg-rose-50 rounded-2xl mr-3 border border-rose-100">
                  <AlertTriangle size={20} color="#e11d48" />
                </View>
                <View>
                  <Text className="text-base font-extrabold text-slate-900">Incident Breakdown</Text>
                  <Text className="text-xs text-rose-600 font-bold">{selectedThreat?.probability}% Malicious Probability</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setIsModalVisible(false)} className="p-2 bg-slate-100 rounded-full">
                <X size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView className="py-1 mb-3" showsVerticalScrollIndicator={false}>
              {selectedThreat && (
                <View>
                  <View className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 mb-4">
                    
                    <View className="mb-3">
                      <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Threat Category</Text>
                      <Text className="text-sm font-bold text-slate-900">{selectedThreat.title}</Text>
                    </View>

                    <View className="mb-3">
                      <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Originating Sender</Text>
                      <Text className="text-sm font-semibold text-slate-800">
                        {selectedThreat.sender}
                      </Text>
                    </View>

                    <View className="mb-3">
                      <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Intercepted Message Sample</Text>
                      <View className="bg-white p-3 rounded-xl border border-slate-200">
                        <Text className="text-xs text-slate-700 italic leading-relaxed">
                          "{selectedThreat.message}"
                        </Text>
                      </View>
                    </View>

                    <View>
                      <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">AI Security Reasoning</Text>
                      <View className="bg-rose-50 p-3 rounded-xl border border-rose-100">
                        <Text className="text-xs text-rose-900 font-medium leading-relaxed">
                          {selectedThreat.reason}
                        </Text>
                      </View>
                    </View>

                  </View>

                  <TouchableOpacity 
                    onPress={() => handleReportToRegistry(selectedThreat)}
                    disabled={isReporting || isAlreadyReported}
                    className={`py-4 rounded-2xl flex-row items-center justify-center shadow-md mb-2 ${isAlreadyReported ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-blue-600 shadow-blue-600/30 active:opacity-90'}`}
                  >
                    {isReporting ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : isAlreadyReported ? (
                      <>
                        <CheckCircle2 size={18} color="#ffffff" className="mr-2" />
                        <Text className="text-white font-bold text-xs uppercase tracking-wider">Already Reported to Registry</Text>
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={18} color="#ffffff" className="mr-2" />
                        <Text className="text-white font-bold text-xs uppercase tracking-wider">Report to Global Security Registry</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity 
              onPress={() => setIsModalVisible(false)}
              className="bg-slate-100 py-3.5 rounded-2xl items-center active:opacity-90 border border-slate-200"
            >
              <Text className="text-slate-700 font-bold text-xs uppercase tracking-wider">Dismiss</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
