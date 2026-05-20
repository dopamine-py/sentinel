import React, { useEffect, useRef } from 'react';
import { StatusBar, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Radar as RadarIcon, MapPin, Radio, Settings as SettingsIcon } from 'lucide-react-native';

import HomeScreen      from './src/screens/HomeScreen';
import DetailScreen    from './src/screens/DetailScreen';
import MapScreen       from './src/screens/MapScreen';
import LiveFeedScreen  from './src/screens/LiveFeedScreen';
import SettingsScreen  from './src/screens/SettingsScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { requestNotificationPermission, addNotificationListener } from './src/notifications';
import { loadApiBase } from './src/api';
import { colors, fonts, type as typeStyle } from './src/ui/theme';

const Tab   = createBottomTabNavigator();
const Stack = createStackNavigator();

const SentinelTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background:   colors.surface0,
    card:         colors.surface1,
    text:         colors.textPrimary,
    border:       colors.line,
    primary:      colors.accentCyan,
    notification: colors.accentCyan,
  },
};

const headerStyle = {
  headerStyle: {
    backgroundColor: colors.surface0,
    borderBottomWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
  },
  headerTintColor: colors.textPrimary,
  headerTitleStyle: { fontFamily: fonts.sansMedium, fontWeight: '600', color: colors.textPrimary, fontSize: 15 },
};

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ ...headerStyle, headerShown: false }}>
      <Stack.Screen name="Home"   component={HomeScreen} />
      <Stack.Screen name="Detail" component={DetailScreen} options={{ headerShown: true, title: 'Mission' }} />
    </Stack.Navigator>
  );
}

function MapStack() {
  return (
    <Stack.Navigator screenOptions={{ ...headerStyle, headerShown: false }}>
      <Stack.Screen name="MapMain" component={MapScreen} />
      <Stack.Screen name="Detail"  component={DetailScreen} options={{ headerShown: true, title: 'Mission' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface0,
          borderTopWidth: 1,
          borderTopColor: colors.line,
          paddingTop: 6,
          paddingBottom: 8,
          height: 64,
          elevation: 0,
        },
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: {
          fontFamily: fonts.sansMedium,
          fontSize: 10.5,
          fontWeight: '600',
          letterSpacing: 0.2,
        },
        tabBarIcon: ({ color, focused }) => {
          const size = 18;
          const Icon =
            route.name === 'Console' ? RadarIcon :
            route.name === 'Map'     ? MapPin     :
            route.name === 'Feed'    ? Radio      :
                                        SettingsIcon;
          return (
            <View style={{
              width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
              backgroundColor: focused ? colors.surface2 : 'transparent',
              borderRadius: 8,
            }}>
              <Icon size={size} color={color} strokeWidth={focused ? 2 : 1.5} />
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Console"  component={HomeStack} />
      <Tab.Screen name="Map"      component={MapStack} />
      <Tab.Screen name="Feed"     component={LiveFeedScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const navigationRef = useRef(null);
  const [isReady, setIsReady] = React.useState(false);
  const [initialRoute, setInitialRoute] = React.useState('Onboarding');

  useEffect(() => {
    async function init() {
      try {
        const seen = await AsyncStorage.getItem('hasSeenOnboarding');
        if (seen === 'true') {
          setInitialRoute('MainTabs');
        }
      } catch (e) {}
      setIsReady(true);
    }
    init();

    loadApiBase().catch(() => {});
    requestNotificationPermission().catch(() => {});
    const sub = addNotificationListener((data) => {
      if (data?.runId && navigationRef.current) {
        // Find the active route to know whether we're inside MainTabs
        navigationRef.current.navigate('MainTabs', {
          screen: 'Console',
          params: {
            screen: 'Detail',
            params: { runId: data.runId }
          }
        });
      }
    });
    return () => sub?.remove();
  }, []);

  if (!isReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface0 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={colors.surface0} />
        <NavigationContainer theme={SentinelTheme} ref={navigationRef}>
          <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="MainTabs" component={MainTabs} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

void Text;
void typeStyle;
