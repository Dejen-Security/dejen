import React, { useState, useRef } from 'react';
import { Text, View, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Modal, Platform, NativeModules } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ShieldCheck, Search, Clipboard, AlertTriangle, CheckCircle2, Zap, Clock, MessageSquare, X } from 'lucide-react-native';
import * as ClipboardAPI from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyzeMessageWithGemini } from '../../services/aiService';

const { SmsReaderModule } = NativeModules;
const SCAN_CACHE_KEY = '@DejenSecurity_scan_cache';
const SCAN_COOLDOWN_MS = 3000; 

export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const [inputText, setInputText] = useState('');
  const [scannedText, setScannedText] = useState(''); 
  const [isLoading, setIsLoading] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [isFromCache, setIsFromCache] = useState(false);

  
  const [isSmsModalVisible, setIsSmsModalVisible] = useState(false);
  const [inboxMessages, setInboxMessages] = useState([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  
  
  const lastScanTimeRef = useRef(0);

  
  const handlePaste = async () => {
    try {
      const text = await ClipboardAPI.getStringAsync();
      if (text) {
        setInputText(text);
      } else {
        Alert.alert('Clipboard Empty', 'No text found in clipboard.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not read from clipboard.');
    }
  };

  
  const handleOpenSmsPicker = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert("Notice", "SMS inbox scanning is only supported on Android devices.");
      return;
    }

    setIsSmsModalVisible(true);
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
      console.error("Failed to load SMS inbox", e);
      Alert.alert("Error", "Could not load device inbox messages.");
    } finally {
      setIsLoadingInbox(false);
    }
  };

  
  const analyzeWithRetry = async (sender, text, retries = 3, delay = 1000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await analyzeMessageWithGemini(sender, text);
        return result;
      } catch (error) {
        console.warn(`[Scanner] Attempt ${attempt} failed:`, error.message);
        if (attempt === retries) throw error;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; 
      }
    }
  };

  const handleInspect = async () => {
    const trimmedInput = inputText.trim();
    if (!trimmedInput) {
      Alert.alert('Empty Input', 'Please paste a link or Amharic SMS message to inspect.');
      return;
    }

    
    const wordCount = trimmedInput.split(/\s+/).filter(Boolean).length;
    if (wordCount < 3) {
      Alert.alert('Input Too Short', 'Please enter at least 3 words for a meaningful security analysis.');
      return;
    }
    if (wordCount > 300) {
      Alert.alert('Input Too Long', 'Please limit your text to a maximum of 300 words.');
      return;
    }

    
    const now = Date.now();
    const timeElapsed = now - lastScanTimeRef.current;

    try {
      
      const cacheJson = await AsyncStorage.getItem(SCAN_CACHE_KEY);
      const cacheMap = cacheJson ? JSON.parse(cacheJson) : {};

      if (cacheMap[trimmedInput]) {
        console.log('[Scanner Cache] HIT! Loading cached scan result.');
        setScannedText(trimmedInput);
        setScanResult(cacheMap[trimmedInput]);
        setIsFromCache(true);
        return;
      }

      
      if (timeElapsed < SCAN_COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((SCAN_COOLDOWN_MS - timeElapsed) / 1000);
        Alert.alert(
          'Please Wait', 
          `Rate limit active. You can scan again in ${remainingSeconds} second(s).`
        );
        return;
      }

      
      lastScanTimeRef.current = now;
      setIsLoading(true);
      setScanResult(null);
      setIsFromCache(false);

      
      console.log('[Scanner AI] MISS. Calling Gemini with retry support...');
      const result = await analyzeWithRetry("MANUAL_SCAN", trimmedInput);

      if (result) {
        
        cacheMap[trimmedInput] = result;
        await AsyncStorage.setItem(SCAN_CACHE_KEY, JSON.stringify(cacheMap));

        setScannedText(trimmedInput);
        setScanResult(result);
      } else {
        throw new Error("Invalid response received from AI service.");
      }
    } catch (error) {
      console.error("Scan error after retries:", error);
      Alert.alert('Connection Error', 'Gemini service is busy or rate-limited. Please try again shortly.');
    } finally {
      setIsLoading(false);
    }
  };

  
  const isHighRisk = scanResult && scanResult.scam_probability >= 50;

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      
      {}
      <View className="flex-row items-center px-6 py-4 bg-white border-b border-slate-100">
        <View className="bg-blue-600 p-2 rounded-xl mr-3 shadow-sm">
          <ShieldCheck size={22} color="#ffffff" />
        </View>
        <Text className="text-xl font-bold text-slate-900 tracking-tight">DejenSecurity</Text>
      </View>

      <ScrollView 
        className="flex-1 px-6 pt-6" 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 90, 110) }}
      >
        
        {}
        <View className="mb-6">
          <Text className="text-2xl font-extrabold text-slate-900 mb-1">AI Threat Scanner</Text>
          <Text className="text-slate-500 text-xs leading-relaxed">
            Paste any suspicious link, Telebirr notification, or Amharic SMS to analyze instantly.
          </Text>
        </View>

        {}
        <View className="bg-white border border-slate-200/80 rounded-3xl p-4 mb-5 shadow-sm">
          <View className="flex-row justify-between items-center mb-2 px-1">
            <Text className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              INPUT MESSAGE OR URL
            </Text>
            
            <View className="flex-row space-x-2">
              {}
              <TouchableOpacity 
                onPress={handleOpenSmsPicker}
                className="flex-row items-center bg-emerald-50 border border-emerald-100 px-2.5 py-1.5 rounded-xl active:opacity-80 mr-1"
              >
                <MessageSquare size={13} color="#10b981" className="mr-1" />
                <Text className="text-emerald-700 text-xs font-bold">SMS</Text>
              </TouchableOpacity>

              {}
              <TouchableOpacity 
                onPress={handlePaste}
                className="flex-row items-center bg-blue-50 border border-blue-100 px-2.5 py-1.5 rounded-xl active:opacity-80"
              >
                <Clipboard size={13} color="#2563eb" className="mr-1" />
                <Text className="text-blue-600 text-xs font-bold">Paste</Text>
              </TouchableOpacity>
            </View>
          </View>

          {}
          <TextInput
            className="text-slate-900 text-sm min-h-[90px] px-2 pt-2 pb-2 font-medium"
            style={{ textAlignVertical: 'top' }}
            placeholder="Paste your message here (min. 3 words)"
            placeholderTextColor="#94a3b8"
            multiline={true}
            value={inputText}
            onChangeText={setInputText}
          />

          <View className="pt-3 border-t border-slate-100 mt-2 flex-row justify-between items-center px-1">
            <Text className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              MIN 3 WORDS • MAX 300 WORDS
            </Text>
            {inputText.length > 0 && (
              <TouchableOpacity onPress={() => setInputText('')}>
                <Text className="text-xs font-bold text-rose-500">Clear</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {}
        <TouchableOpacity 
          onPress={handleInspect}
          disabled={isLoading}
          className="bg-blue-600 py-4 rounded-2xl flex-row items-center justify-center shadow-md active:opacity-90 mb-6"
        >
          {isLoading ? (
            <View className="flex-row items-center">
              <ActivityIndicator color="#ffffff" className="mr-2" />
              <Text className="text-white font-bold text-sm uppercase tracking-wider">Analyzing with  AI...</Text>
            </View>
          ) : (
            <>
              <Search size={18} color="#ffffff" className="mr-2" />
              <Text className="text-white font-bold text-sm uppercase tracking-wider">Inspect with AI</Text>
            </>
          )}
        </TouchableOpacity>

        {}
        {scanResult && (
          <View className="mb-6">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center">
                <Text className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">AI Analysis Report</Text>
                {isFromCache ? (
                  <View className="ml-2 flex-row items-center bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    <Zap size={10} color="#d97706" className="mr-1" />
                    <Text className="text-[9px] font-bold text-amber-700 uppercase">Cached Result</Text>
                  </View>
                ) : (
                  <View className="ml-2 flex-row items-center bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                    <Clock size={10} color="#2563eb" className="mr-1" />
                    <Text className="text-[9px] font-bold text-blue-700 uppercase">Live AI Scan</Text>
                  </View>
                )}
              </View>
              <Text className="text-[10px] text-slate-400 font-bold">Just now</Text>
            </View>

            {}
            <View className={`bg-white border ${isHighRisk ? 'border-rose-200' : 'border-emerald-200'} rounded-3xl p-5 shadow-sm`}>
              
              {}
              <View className="flex-row items-center justify-between mb-3.5 pb-3 border-b border-slate-100">
                <View className="flex-row items-center">
                  <View className={`w-8 h-8 rounded-xl ${isHighRisk ? 'bg-rose-50 border border-rose-100' : 'bg-emerald-50 border border-emerald-100'} items-center justify-center mr-3`}>
                    {isHighRisk ? <AlertTriangle size={18} color="#e11d48" /> : <CheckCircle2 size={18} color="#10b981" />}
                  </View>
                  <View>
                    <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Verdict</Text>
                    <Text className={`${isHighRisk ? 'text-rose-600' : 'text-emerald-600'} font-extrabold text-sm`}>
                      {scanResult.category}
                    </Text>
                  </View>
                </View>

                <View className={`px-3 py-1.5 rounded-xl ${isHighRisk ? 'bg-rose-50 border border-rose-100' : 'bg-emerald-50 border border-emerald-100'}`}>
                  <Text className={`text-xs font-extrabold ${isHighRisk ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {scanResult.scam_probability}% Risk
                  </Text>
                </View>
              </View>

              {}
              <View className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 mb-4">
                <Text className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Inspected Content</Text>
                <Text className="text-slate-800 font-medium text-xs leading-relaxed" numberOfLines={3}>
                  "{scannedText}"
                </Text>
              </View>
              
              {}
              <View className="mb-5">
                <Text className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">AI Security Reasoning</Text>
                <Text className="text-slate-600 text-xs leading-relaxed">
                  {scanResult.reason}
                </Text>
              </View>

              {}
              <View className="flex-row space-x-3">
                <TouchableOpacity 
                  onPress={() => setScanResult(null)}
                  className="flex-1 bg-slate-100 py-3.5 items-center justify-center rounded-xl active:opacity-80"
                >
                  <Text className="text-slate-600 font-bold text-xs uppercase tracking-wider">Dismiss</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  onPress={() => {
                    setInputText('');
                    setScannedText('');
                    setScanResult(null);
                  }}
                  className="flex-1 bg-blue-600 py-3.5 items-center justify-center rounded-xl shadow-sm active:opacity-90"
                >
                  <Text className="text-white font-bold text-xs uppercase tracking-wider">Scan Another</Text>
                </TouchableOpacity>
              </View>

            </View>
          </View>
        )}

      </ScrollView>

      {}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isSmsModalVisible}
        onRequestClose={() => setIsSmsModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <View 
            className="bg-white rounded-t-[32px] p-6 max-h-[80%] shadow-2xl"
            style={{ paddingBottom: Math.max(insets.bottom + 16, 24) }}
          >
            
            <View className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4" />

            {}
            <View className="flex-row items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <View className="flex-row items-center">
                <View className="p-2.5 bg-emerald-50 rounded-2xl mr-3 border border-emerald-100">
                  <MessageSquare size={20} color="#10b981" />
                </View>
                <View>
                  <Text className="text-base font-extrabold text-slate-900">Select Message from SMS</Text>
                  <Text className="text-xs text-slate-500">Tap any text message to load it into the scanner</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setIsSmsModalVisible(false)} className="p-2 bg-slate-100 rounded-full">
                <X size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            {}
            {isLoadingInbox ? (
              <ActivityIndicator size="small" color="#2563eb" className="py-12" />
            ) : inboxMessages.length === 0 ? (
              <View className="py-12 items-center">
                <Text className="text-slate-400 text-xs text-center">No recent SMS messages found in your inbox.</Text>
              </View>
            ) : (
              <ScrollView className="max-h-80 mb-3" showsVerticalScrollIndicator={false}>
                {inboxMessages.map((msg, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => {
                      setInputText(msg.body);
                      setIsSmsModalVisible(false);
                    }}
                    className="bg-slate-50 border border-slate-200/70 rounded-2xl p-3.5 mb-2.5 active:opacity-70"
                  >
                    <Text className="text-xs font-bold text-slate-900 mb-1">From: {msg.sender}</Text>
                    <Text className="text-xs text-slate-600" numberOfLines={2}>"{msg.body}"</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
