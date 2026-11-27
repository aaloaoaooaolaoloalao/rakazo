import { t } from "@lingui/core/macro";
import { router } from "expo-router";
import { Alert } from "react-native";
import { showModelSettings } from "../spark/product";

export function openModelSettings(spaceId?: string) {
  if (!showModelSettings()) return;
  router.push(
    spaceId ? { pathname: "/(settings)/models", params: { spaceId } } : "/(settings)/models",
  );
}

export function askToAddModel(spaceId?: string) {
  if (!showModelSettings()) return;
  Alert.alert(t`Add an AI model to keep chatting`, undefined, [
    { text: t`Not Now`, style: "cancel" },
    { text: t`Add model`, onPress: () => openModelSettings(spaceId), isPreferred: true },
  ]);
}
