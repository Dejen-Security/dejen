
import React, { useEffect, useRef } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, Pressable, Animated, StyleSheet, Alert, BackHandler, Platform } from 'react-native';
import { Shield, Scan, Bell, Bookmark } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { requestSmsPermissions } from '../../services/smsListener';

const TabBarItem = ({ isFocused, label, routeName, onPress }) => {
  const focusAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const scaleAnim = useRef(new Animated.Value(isFocused ? 1 : 0.92)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(focusAnim, {
        toValue: isFocused ? 1 : 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: isFocused ? 1 : 0.92,
        tension: 160,
        friction: 12,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isFocused]);

  const handlePress = () => {
    if (!isFocused) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  const getIcon = (name) => {
    const color = isFocused ? '#2563eb' : '#64748b';
    const stroke = isFocused ? 2.4 : 1.8;
    const size = 20;

    switch (name) {
      case 'index': return <Shield size={size} color={color} strokeWidth={stroke} />;
      case 'scanner': return <Scan size={size} color={color} strokeWidth={stroke} />;
      case 'threats': return <Bell size={size} color={color} strokeWidth={stroke} />;
      case 'registry': return <Bookmark size={size} color={color} strokeWidth={stroke} />;
      default: return <Shield size={size} color={color} strokeWidth={stroke} />;
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      className="flex-1 items-center justify-center py-2"
      android_ripple={{ color: 'transparent' }}
    >
      <Animated.View 
        style={{ transform: [{ scale: scaleAnim }], width: '100%' }}
        className="items-center justify-center relative"
      >
        {}
        <Animated.View
          style={{
            opacity: focusAnim,
          }}
          className="absolute inset-x-2 h-10 bg-blue-50/90 rounded-2xl border border-blue-100/50"
        />

        {}
        <View className="h-7 items-center justify-center">
          {getIcon(routeName)}
        </View>

        {}
        <Animated.Text
          style={{
            opacity: focusAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.7, 1],
            }),
          }}
          className={`text-[10px] tracking-tight mt-0.5 ${
            isFocused ? 'font-bold text-blue-600' : 'font-medium text-slate-500'
          }`}
          numberOfLines={1}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
};

function CustomTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  
  const bottomPadding = Math.max(insets.bottom + 12, 24);

  return (
    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'transparent', paddingBottom: bottomPadding, paddingHorizontal: 16, pointerEvents: 'box-none' }}>
      <View 
        style={[styles.dockContainer, styles.androidElevation]} 
        className="bg-white border border-slate-200/90"
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel ?? options.title ?? route.name;
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, { merge: true });
            }
          };

          return (
            <TabBarItem
              key={route.key}
              isFocused={isFocused}
              label={label}
              routeName={route.name}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dockContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 30,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  androidElevation: {
    elevation: 8,
    shadowColor: '#64748b',
  },
});

export default function TabLayout() {
  
  useEffect(() => {
    async function verifyPermissions() {
      const granted = await requestSmsPermissions();
      if (!granted) {
        Alert.alert(
          'Permission Required',
          'DejenSecurity requires SMS permissions to protect you from phishing scams. Please grant SMS access in your device settings to continue using the app.',
          [
            {
              text: 'OK',
              onPress: () => {
                if (Platform.OS === 'android') {
                  BackHandler.exitApp();
                }
              },
            },
          ],
          { cancelable: false }
        );
      }
    }

    verifyPermissions();
  }, []);

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ 
        headerShown: false,
        sceneStyle: { backgroundColor: '#f8fafc' },
        
        tabBarStyle: { position: 'absolute' }
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Shield' }} />
      <Tabs.Screen name="scanner" options={{ title: 'Scanner' }} />
      <Tabs.Screen name="threats" options={{ title: 'Threats' }} />
      <Tabs.Screen name="registry" options={{ title: 'Registry' }} />
    </Tabs>
  );
}
