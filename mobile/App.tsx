import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SignalsScreen } from "./src/screens/SignalsScreen";
import { ChartScreen } from "./src/screens/ChartScreen";
import { AlertsScreen } from "./src/screens/AlertsScreen";
import { BacktestScreen } from "./src/screens/BacktestScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { fetchAlerts } from "./src/api/client";
import { colors } from "./src/theme/theme";

const Tab = createBottomTabNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

function tabIcon(emoji: string) {
  return ({ color }: { color: string }) => <Text style={{ fontSize: 18, color }}>{emoji}</Text>;
}

export default function App() {
  const [unseen, setUnseen] = useState(0);

  // Poll the backend for the unread alert count to drive the tab badge.
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetchAlerts();
        if (alive) setUnseen(res.unseen);
      } catch {
        /* backend may be unreachable; leave the badge as-is */
      }
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer theme={navTheme}>
        <Tab.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTitleStyle: { color: colors.text },
            tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
            tabBarActiveTintColor: colors.accent,
            tabBarInactiveTintColor: colors.textMuted,
          }}
        >
          <Tab.Screen
            name="Signals"
            component={SignalsScreen}
            options={{ tabBarIcon: tabIcon("📈"), title: "Signals" }}
          />
          <Tab.Screen
            name="Chart"
            component={ChartScreen}
            options={{ tabBarIcon: tabIcon("📊"), title: "Chart" }}
          />
          <Tab.Screen
            name="Alerts"
            component={AlertsScreen}
            options={{
              tabBarIcon: tabIcon("🔔"),
              title: "Alerts",
              tabBarBadge: unseen > 0 ? unseen : undefined,
            }}
          />
          <Tab.Screen
            name="Backtest"
            component={BacktestScreen}
            options={{ tabBarIcon: tabIcon("🧪"), title: "Backtest" }}
          />
          <Tab.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ tabBarIcon: tabIcon("⚙️"), title: "Settings" }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
