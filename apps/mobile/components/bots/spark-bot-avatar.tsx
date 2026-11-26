import { useLingui } from "@lingui/react/macro";
import type { BotAvatarSet } from "@rakazo/contracts";
import type { LogoAvatarActivity } from "@rakazo/core";
import { isRunWorking } from "@rakazo/core";
import { memo, useSyncExternalStore } from "react";
import { Image, View } from "react-native";
import { mobileBotAvatarPresentation } from "../../lib/bots/bot-avatar";
import { mobileLogoAvatarActivity } from "../../lib/bots/logo-avatar-activity";
import { sparkMood, sparkShape } from "../../lib/bots/spark-dot-geometry";
import { useMobileTokens } from "../../lib/native/native";
import { NativeSymbol } from "../native/native-symbol";
import { SparkDotAvatar } from "./spark-dot-avatar";

/** SparkAI bot mark. Photos stay photos; every other stored avatar is the halftone character. */
export const SparkBotAvatar = memo(function SparkBotAvatar({
  color,
  identity,
  size = 54,
  status,
  activity,
  composing = false,
  muted = false,
}: {
  color: string;
  size?: number;
  status?: string;
  identity?: string;
  avatarSet?: BotAvatarSet;
  activity?: LogoAvatarActivity;
  muted?: boolean;
  composing?: boolean;
}) {
  const tokens = useMobileTokens();
  const parsed = mobileBotAvatarPresentation(color);
  const liveActivity = useSyncExternalStore(
    mobileLogoAvatarActivity.subscribe,
    () => mobileLogoAvatarActivity.getActivity(identity ?? "", status),
    (): LogoAvatarActivity => "idle",
  );
  const mood = sparkMood(
    activity ?? (composing ? "writing" : liveActivity),
    isRunWorking(status) && !composing,
  );
  const fill =
    parsed.kind === "color" || parsed.kind === "shape" ? parsed.color : tokens.foreground;
  const shape = sparkShape(
    parsed.kind === "shape" ? parsed.shapeIndex : undefined,
    identity || fill || "agent",
  );

  return (
    <View style={{ width: size, height: size }}>
      {parsed.kind === "image" && parsed.imageUrl ? (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            overflow: "hidden",
            backgroundColor: tokens.secondary,
          }}
        >
          <Image source={{ uri: parsed.imageUrl }} style={{ width: size, height: size }} />
        </View>
      ) : (
        <SparkDotAvatar
          shape={shape}
          color={fill}
          size={size}
          mood={mood}
          seed={identity || fill}
        />
      )}
      {muted ? <MutedBadge size={size} /> : null}
    </View>
  );
});

function MutedBadge({ size }: { size: number }) {
  const tokens = useMobileTokens();
  const { t } = useLingui();
  const badge = Math.max(14, Math.round(size * 0.34));
  return (
    <View
      accessible
      accessibilityLabel={t`Notifications silenced`}
      style={{
        position: "absolute",
        right: -2,
        bottom: -2,
        width: badge,
        height: badge,
        borderRadius: size,
        borderWidth: 2,
        borderColor: tokens.background,
        backgroundColor: tokens.secondary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <NativeSymbol
        ios="bell.slash.fill"
        android="notifications-off"
        size={Math.max(8, Math.round(size * 0.17))}
        color={tokens.foreground}
      />
    </View>
  );
}
