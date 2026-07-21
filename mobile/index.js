import { registerRootComponent } from "expo";
import App from "./App";

// registerRootComponent calls AppRegistry.registerComponent('main', () => App)
// and sets up the environment for Expo Go and native/web builds. Using an
// explicit entry (instead of expo/AppEntry.js) resolves reliably in this
// monorepo where `expo` is hoisted to the repo-root node_modules.
registerRootComponent(App);
