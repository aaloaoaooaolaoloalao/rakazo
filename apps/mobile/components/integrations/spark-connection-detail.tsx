import { ph } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { Connection, ConnectionCatalogItem } from "@rakazo/contracts";
import { catalogItemKey } from "@rakazo/core";
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, View } from "react-native";
import { mobileTokens } from "../../lib/appearance/appearance";
import { native, useThemedStyles } from "../../lib/native/native";
import { NativeActionButton } from "../native/native-action-button";
import { NativeSymbol } from "../native/native-symbol";
import { SettingsGroup, SettingsRow } from "../settings/settings-group";
import { ConnectorIcon } from "./connector-icon";
import type { ConnectionTool } from "./integration-detail";

const HERO_LOGO_SIZE = 64;

/**
 * SparkAI's page for one app: what it is and whether it is connected, one button to connect it
 * (or add another account), its accounts, the tools it gives bots, and disconnecting it. An
 * account whose sign-in never finished stays listed until it is tried again or removed.
 */
export function SparkConnectionDetail({
  item,
  accounts,
  pending,
  failure,
  tools,
  toolsLoading,
  toolsFailed,
  onConnect,
  onRename,
  onRetry,
  onRevoke,
  onUninstall,
  onOpenChatApp,
  onOpenTools,
}: {
  item: ConnectionCatalogItem;
  accounts: Connection[];
  pending: string | null;
  failure: string | null;
  tools: ConnectionTool[];
  toolsLoading: boolean;
  toolsFailed: boolean;
  onConnect: () => void;
  onRename: (row: Connection, label: string) => void;
  onRetry: (row: Connection) => void;
  onRevoke: (row: Connection) => void;
  onUninstall: () => void;
  onOpenChatApp: () => void;
  onOpenTools: () => void;
}) {
  const { t } = useLingui();
  const styles = useThemedStyles(createStyles);
  const key = catalogItemKey(item);
  const connecting = pending === key;
  const uninstalling = pending === `uninstall:${key}`;
  const connectedCount = accounts.filter((row) => row.status === "connected").length;
  const connected = connectedCount > 0;
  const unfinished = accounts.some((row) => row.status !== "connected");
  const busy = (row: Connection) =>
    pending === row.id ||
    pending === `rename:${row.id}` ||
    (connecting && row.status === "pending");

  function manageAccount(row: Connection) {
    Alert.alert(row.displayName, undefined, [
      ...(Platform.OS === "ios"
        ? [
            {
              text: t`Rename`,
              onPress: () =>
                Alert.prompt(
                  t`Rename`,
                  undefined,
                  (label) => onRename(row, label),
                  "plain-text",
                  row.displayName,
                ),
            },
          ]
        : []),
      { text: t`Remove`, style: "destructive" as const, onPress: () => onRevoke(row) },
      { text: t`Cancel`, style: "cancel" as const },
    ]);
  }

  function finishAccount(row: Connection) {
    Alert.alert(row.displayName, undefined, [
      { text: t`Try again`, onPress: () => onRetry(row) },
      { text: t`Remove`, style: "destructive", onPress: () => onRevoke(row) },
      { text: t`Cancel`, style: "cancel" },
    ]);
  }

  function confirmDisconnect() {
    Alert.alert(t`Disconnect ${ph({ name: item.name })}?`, undefined, [
      { text: t`Cancel`, style: "cancel" },
      { text: t`Disconnect`, style: "destructive", onPress: onUninstall },
    ]);
  }

  return (
    <View style={styles.page}>
      <View style={styles.hero}>
        <ConnectorIcon logo={item.logo} name={item.name} size={HERO_LOGO_SIZE} />
        <Text style={styles.name}>{item.name}</Text>
        <Text
          style={styles.summary}
        >{t`Lets your bots use ${ph({ name: item.name })} for you.`}</Text>
        <View style={styles.status}>
          {connected ? (
            <NativeSymbol
              ios="checkmark.circle.fill"
              android="checkmark-circle"
              size={14}
              color={mobileTokens().success}
            />
          ) : null}
          <Text style={[styles.statusLabel, connected && { color: mobileTokens().success }]}>
            {connected ? t`Connected` : unfinished ? t`Needs attention` : t`Not connected`}
          </Text>
        </View>
      </View>

      <NativeActionButton
        accessibilityLabel={
          connected
            ? t`Add another ${ph({ name: item.name })}`
            : t`Connect ${ph({ name: item.name })}`
        }
        busy={connecting}
        disabled={uninstalling || accounts.some((row) => pending === row.id)}
        label={connecting ? t`Connecting…` : connected ? t`Add another` : t`Connect`}
        onPress={onConnect}
      />

      {failure ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {failure}
        </Text>
      ) : null}

      {accounts.length ? (
        <SettingsGroup label={t`Accounts`}>
          {accounts.map((row) => (
            <SettingsRow
              key={row.id}
              title={row.displayName}
              value={
                busy(row)
                  ? undefined
                  : row.status === "error"
                    ? t`Needs attention`
                    : row.status === "pending"
                      ? t`Pending`
                      : undefined
              }
              disabled={busy(row) || uninstalling || connecting}
              trailing={
                busy(row) ? (
                  <ActivityIndicator color={native.secondaryLabel} />
                ) : (
                  <NativeSymbol ios="ellipsis" android="ellipsis-horizontal" size={16} />
                )
              }
              onPress={() => (row.status === "connected" ? manageAccount(row) : finishAccount(row))}
            />
          ))}
        </SettingsGroup>
      ) : null}

      {connected ? (
        toolsFailed ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {t`Could not load permissions`}
          </Text>
        ) : toolsLoading ? (
          <ActivityIndicator
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t`Loading tool permissions…`}
            color={native.secondaryLabel}
          />
        ) : tools.length > 0 ? (
          <SettingsGroup>
            <SettingsRow
              title={t`Tool permissions`}
              value={String(tools.length)}
              chevron="right"
              onPress={onOpenTools}
            />
          </SettingsGroup>
        ) : null
      ) : null}

      {item.chatApp ? (
        <SettingsGroup>
          <SettingsRow
            title={t`Chat from ${ph({ name: item.name })}`}
            chevron="right"
            onPress={onOpenChatApp}
          />
        </SettingsGroup>
      ) : null}

      {accounts.length ? (
        <SettingsGroup>
          <SettingsRow
            title={uninstalling ? t`Working…` : t`Disconnect`}
            destructive
            disabled={uninstalling || connecting}
            onPress={confirmDisconnect}
          />
        </SettingsGroup>
      ) : null}
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    page: { gap: 20 },
    hero: { alignItems: "center", gap: 10, paddingTop: 4 },
    name: { color: native.label, fontSize: 24, fontWeight: "700", textAlign: "center" },
    summary: { color: native.secondaryLabel, fontSize: 15, textAlign: "center" },
    status: { flexDirection: "row", alignItems: "center", gap: 5 },
    statusLabel: { color: native.secondaryLabel, fontSize: 15 },
    error: { color: mobileTokens().destructive, fontSize: 14 },
  });
}
