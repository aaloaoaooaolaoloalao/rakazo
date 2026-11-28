import { ph } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { GROUP_MEMBER_MAX, GROUP_MEMBER_MIN } from "@rakazo/contracts";
import { useState } from "react";
import { AccessibilityInfo, Pressable, Text, TextInput, View } from "react-native";
import type { MobileBot } from "../../lib/api/mobile-types";
import { native, useMobileTokens } from "../../lib/native/native";
import { BotAvatar } from "../bots/bot-avatar";
import { NativeSymbol } from "../native/native-symbol";
import { SettingsGroup, SettingsRow } from "../settings/settings-group";

// Lowercasing can create new composable sequences, so normalize again afterward.
function searchKey(value: string): string {
  return value.normalize("NFC").toLowerCase().normalize("NFC");
}

export function BotChipPicker({
  bots,
  selected,
  onChange,
}: {
  bots: MobileBot[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useLingui();
  const tokens = useMobileTokens();
  const [query, setQuery] = useState("");
  const needle = searchKey(query.trim());
  const remove = (id: string) => onChange(selected.filter((value) => value !== id));
  const available = bots.filter(
    (bot) =>
      !bot.archivedAt &&
      !selected.includes(bot.id) &&
      (!needle || searchKey(bot.name).includes(needle)),
  );
  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          minHeight: 52,
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 16,
          borderCurve: "continuous",
          backgroundColor: native.groupedCell,
        }}
      >
        <Text style={{ color: native.secondaryLabel, fontSize: 17 }}>{t`To:`}</Text>
        {selected.map((id) => {
          const bot = bots.find((item) => item.id === id);
          return bot ? (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={t`Remove ${ph({ name: bot.name })}`}
              onPress={() => remove(id)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                padding: 5,
                borderRadius: 16,
                backgroundColor: native.fillPressed,
                opacity: pressed ? 0.6 : 1,
                maxWidth: "100%",
              })}
            >
              <BotAvatar color={bot.color} avatarSet={bot.avatarSet} identity={id} size={20} />
              <Text numberOfLines={1} style={{ color: tokens.foreground, flexShrink: 1 }}>
                {bot.name}
              </Text>
              <NativeSymbol ios="xmark" android="close" size={12} color={tokens.mutedForeground} />
            </Pressable>
          ) : null;
        })}
        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder={selected.length ? t`Add another` : t`Search bots`}
          placeholderTextColor={tokens.mutedForeground}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          textContentType="none"
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === "Backspace" && !query) onChange(selected.slice(0, -1));
          }}
          style={{
            flexGrow: 1,
            minWidth: 100,
            minHeight: 32,
            color: tokens.foreground,
            fontSize: 17,
            padding: 0,
          }}
        />
      </View>
      <View style={{ marginTop: 24 }}>
        <SettingsGroup>
          {available.map((bot) => (
            <SettingsRow
              key={bot.id}
              accessibilityLabel={bot.name}
              title={bot.name}
              leading={
                <BotAvatar
                  color={bot.color}
                  avatarSet={bot.avatarSet}
                  identity={bot.id}
                  size={30}
                  status={bot.status}
                />
              }
              onPress={() => {
                if (selected.length >= GROUP_MEMBER_MAX) {
                  AccessibilityInfo.announceForAccessibility(
                    t`Pick ${ph({ min: GROUP_MEMBER_MIN })}–${ph({ max: GROUP_MEMBER_MAX })}`,
                  );
                  return;
                }
                onChange([...selected, bot.id]);
                setQuery("");
              }}
            />
          ))}
        </SettingsGroup>
      </View>
    </View>
  );
}
