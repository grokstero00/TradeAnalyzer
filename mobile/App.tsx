import React from "react";
import { Text } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SignalsScreen } from "./src/screens/SignalsScreen";
import { ChartScreen } from "./src/screens/ChartScreen";
import { BacktestScreen } from "./src/screens/BacktestScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
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
