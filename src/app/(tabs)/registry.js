import React, { useState, useCallback } from 'react';
import { Text, View, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, RefreshControl, Modal, Platform, NativeModules } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ShieldCheck, Search, AlertTriangle, Smartphone, Landmark, ChevronRight, Plus, X, MessageSquare, Edit3 } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';

const { SmsReaderModule } = NativeModules;


const API_BASE_URL = 'https://ethiophish-api.davidhabte7.workers.dev';

export default function RegistryScreen() {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [registryItems, setRegistryItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [reportMode, setReportMode] = useState('menu'); 
  const [manualNumber, setManualNumber] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  
  
  const [inboxMessages, setInboxMessages] = useState([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);

  
  useFocusEffect(
    useCallback(() => {
      fetchRegistry();
    }, [])
  );

  const fetchRegistry = async (isRefresh = false) => {
    try {
      if (isRefresh) setIsRefreshing(true);
      else setIsLoading(true);

      const response = await fetch(`${API_BASE_URL}/registry`);
      const data = await response.json();
      if (Array.isArray(data)) {
        setRegistryItems(data);
      }
    } catch (error) {
      console.error("Failed to fetch registry", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleOpenReportModal = () => {
    setReportMode('menu');
    setManualNumber('');
    setManualDescription('');
    setIsModalVisible(true);
  };

  const handleOpenSmsPicker = async () => {
    setReportMode('sms');
    if (Platform.OS !== 'android') {
      Alert.alert("Notice", "SMS inbox scanning is only supported on Android devices.");
      return;
    }

    try {
      setIsLoadingInbox(true);
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      if (SmsReaderModule && typeof SmsReaderModule.queryInbox === 'function') {
        const messages = await SmsReaderModule.queryInbox(sevenDaysAgo);
        setInboxMessages(messages || []);
      } else {
        Alert.alert("Error", "SmsReaderModule is not linked properly.");
      }
    } catch (e) {
      console.error("Failed to load SMS inbox for reporting", e);
      Alert.alert("Error", "Could not load device inbox messages.");
    } finally {
      setIsLoadingInbox(false);
    }
  };

  const submitReport = async (title, description, iconType = 'alert') => {
    if (!title || !title.trim()) {
      Alert.alert("Error", "Please provide a valid number or sender ID.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || 'Community Reported Scam',
          iconType: iconType
        })
      });
      const result = await response.json();
      if (result.success) {
        setRegistryItems(result.data);
        setIsModalVisible(false);
        Alert.alert("Success", "Number successfully reported to the community registry!");
      } else {
        Alert.alert("Error", result.error || "Could not submit report.");
      }
    } catch (error) {
      Alert.alert("Network Error", "Could not connect to the reporting server.");
    }
  };

  
  const filteredRegistry = registryItems.filter(
    (item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderIcon = (type) => {
    switch (type) {
      case 'alert':
        return <AlertTriangle size={20} color="#e11d48" />;
      case 'phone':
        return <Smartphone size={20} color="#e11d48" />;
      case 'bank':
        return <Landmark size={20} color="#e11d48" />;
      default:
        return <AlertTriangle size={20} color="#e11d48" />;
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      
      {}
      <View className="flex-row items-center justify-between px-6 py-4 bg-white border-b border-slate-100">
        <View className="flex-row items-center">
          <View className="bg-blue-600 p-2 rounded-xl mr-3 shadow-sm">
            <ShieldCheck size={22} color="#ffffff" />
          </View>
          <Text className="text-xl font-bold text-slate-900 tracking-tight">DejenSecurity</Text>
        </View>
      </View>

      <ScrollView 
        className="flex-1 px-6 pt-6" 
        showsVerticalScrollIndicator={false}
        
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 160, 180) }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => fetchRegistry(true)} tintColor="#2563eb" />
        }
      >
        
        {}
        <View className="mb-5">
          <Text className="text-2xl font-extrabold text-slate-900 mb-1">Registry</Text>
          <Text className="text-slate-500 text-xs leading-relaxed">
            Search verified scam Ethiopian numbers & active community threats. Swipe down to refresh.
          </Text>
        </View>

        {}
        <View className="flex-row items-center bg-white border border-slate-200/80 rounded-2xl px-4 py-3.5 mb-5 shadow-sm">
          <Search size={18} color="#94a3b8" className="mr-3" />
          <TextInput
            className="flex-1 text-slate-900 text-sm font-medium"
            placeholder="Search number or sender (e.g. 0911...)"
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {}
        <View className="mb-3">
          <Text className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            {filteredRegistry.length} REGISTRY MATCHES
          </Text>
        </View>

        {}
        <View>
          {isLoading ? (
            <ActivityIndicator size="large" color="#2563eb" className="py-12" />
          ) : filteredRegistry.length === 0 ? (
            <View className="items-center py-16 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
              <Text className="text-slate-400 text-xs text-center">No matching numbers found in registry.</Text>
            </View>
          ) : (
            filteredRegistry.map((item) => (
              <View
                key={item.id}
                className="bg-white border border-slate-100 rounded-2xl p-4 mb-3 shadow-sm flex-row items-center justify-between"
              >
                <View className="flex-row items-center flex-1 pr-3">
                  <View className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-100 items-center justify-center mr-3.5 shrink-0">
                    {renderIcon(item.iconType)}
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-900 font-bold text-sm mb-0.5" numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text className="text-slate-500 text-xs" numberOfLines={1}>
                      {item.description}
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-center">
                  <View className="bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100 mr-2">
                    <Text className="text-rose-600 text-[10px] font-bold">{item.reports}</Text>
                  </View>
                  <ChevronRight size={16} color="#cbd5e1" />
                </View>
              </View>
            ))
          )}
        </View>

      </ScrollView>

      {}
      <View 
        className="absolute left-6 right-6 items-center"
        style={{ bottom: Math.max(insets.bottom + 90, 85) }}
      >
        <TouchableOpacity
          onPress={handleOpenReportModal}
          className="bg-blue-600 w-full py-4 rounded-2xl flex-row items-center justify-center shadow-md shadow-blue-600/25 active:opacity-90"
        >
          <Plus size={18} color="#ffffff" className="mr-2" />
          <Text className="text-white font-bold text-sm uppercase tracking-wider">Report Number</Text>
        </TouchableOpacity>
      </View>

      {}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <View 
            className="bg-white rounded-t-[32px] p-6 max-h-[85%] shadow-2xl"
            style={{ paddingBottom: Math.max(insets.bottom + 16, 24) }}
          >
            
            <View className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4" />

            {}
            <View className="flex-row items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <View className="flex-row items-center">
                <View className="p-2.5 bg-blue-50 rounded-2xl mr-3 border border-blue-100">
                  <Plus size={20} color="#2563eb" />
                </View>
                <View>
                  <Text className="text-base font-extrabold text-slate-900">
                    {reportMode === 'menu' && 'Report Scam Number'}
                    {reportMode === 'manual' && 'Manual Entry'}
                    {reportMode === 'sms' && 'Select from SMS Inbox'}
                  </Text>
                  <Text className="text-xs text-slate-500">Contribute to the Ethiopian community registry</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setIsModalVisible(false)} className="p-2 bg-slate-100 rounded-full">
                <X size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            {}
            {reportMode === 'menu' && (
              <View className="py-2 mb-2">
                <TouchableOpacity
                  onPress={() => setReportMode('manual')}
                  className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 mb-3.5 flex-row items-center active:opacity-70"
                >
                  <View className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 items-center justify-center mr-3.5">
                    <Edit3 size={20} color="#2563eb" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-900 font-bold text-sm mb-0.5">Enter Number Manually</Text>
                    <Text className="text-slate-500 text-xs">Type a phone number or sender ID directly</Text>
                  </View>
                  <ChevronRight size={16} color="#cbd5e1" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleOpenSmsPicker}
                  className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex-row items-center active:opacity-70"
                >
                  <View className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 items-center justify-center mr-3.5">
                    <MessageSquare size={20} color="#10b981" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-900 font-bold text-sm mb-0.5">Select from SMS Inbox</Text>
                    <Text className="text-slate-500 text-xs">Choose a message from your device messages</Text>
                  </View>
                  <ChevronRight size={16} color="#cbd5e1" />
                </TouchableOpacity>
              </View>
            )}

            {}
            {reportMode === 'manual' && (
              <View className="py-2 mb-2">
                <Text className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">Phone Number or Sender ID</Text>
                <TextInput
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm mb-4 font-medium"
                  placeholder="e.g., +251 91 000 0000 or TELEBIRR"
                  placeholderTextColor="#94a3b8"
                  value={manualNumber}
                  onChangeText={setManualNumber}
                />

                <Text className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">Scam Description / Reason</Text>
                <TextInput
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm mb-6 h-24 font-medium"
                  placeholder="e.g., Fake job offer SMS asking for money transfer"
                  placeholderTextColor="#94a3b8"
                  multiline={true}
                  textAlignVertical="top"
                  value={manualDescription}
                  onChangeText={setManualDescription}
                />

                <View className="flex-row space-x-3">
                  <TouchableOpacity
                    onPress={() => setReportMode('menu')}
                    className="flex-1 bg-slate-100 py-3.5 rounded-xl items-center active:opacity-80"
                  >
                    <Text className="text-slate-700 font-bold text-xs uppercase tracking-wider">Back</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    onPress={() => submitReport(manualNumber, manualDescription)}
                    className="flex-1 bg-blue-600 py-3.5 rounded-xl items-center shadow-sm active:opacity-90"
                  >
                    <Text className="text-white font-bold text-xs uppercase tracking-wider">Submit Report</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {}
            {reportMode === 'sms' && (
              <View className="py-1">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Select Message to Report</Text>
                  <TouchableOpacity onPress={() => setReportMode('menu')}>
                    <Text className="text-blue-600 text-xs font-bold">Back to Options</Text>
                  </TouchableOpacity>
                </View>

                {isLoadingInbox ? (
                  <ActivityIndicator size="small" color="#2563eb" className="py-10" />
                ) : inboxMessages.length === 0 ? (
                  <View className="py-10 items-center">
                    <Text className="text-slate-400 text-xs">No recent SMS messages found in your inbox.</Text>
                  </View>
                ) : (
                  <ScrollView className="max-h-72 mb-2" showsVerticalScrollIndicator={false}>
                    {inboxMessages.map((msg, index) => (
                      <TouchableOpacity
                        key={index}
                        onPress={() => submitReport(msg.sender, msg.body, 'alert')}
                        className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5 mb-2.5 active:opacity-70"
                      >
                        <Text className="text-xs font-bold text-slate-900 mb-1">Sender: {msg.sender}</Text>
                        <Text className="text-xs text-slate-600 italic" numberOfLines={2}>"{msg.body}"</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
