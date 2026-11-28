import { useLingui } from "@lingui/react/macro";
import type { ConnectionCatalogItem, McpServer } from "@rakazo/contracts";
import { mcpServerConnection } from "@rakazo/contracts";
import { catalogItemKey } from "@rakazo/core";
import { useRouter } from "expo-router";
import { ActivityIndicator, Text } from "react-native";
import { mobileTokens } from "../../lib/appearance/appearance";
import { native, useThemedStyles } from "../../lib/native/native";
import { NativeActionButton } from "../native/native-action-button";
import { NativeSymbol } from "../native/native-symbol";
import { SettingsGroup, SettingsRow } from "../settings/settings-group";
import { ConnectionStatus } from "./connected-apps";
import { ConnectorIcon } from "./connector-icon";
import { createIntegrationsStyles } from "./integrations-styles";

const ROW_LOGO_SIZE = 36;

/**
 * SparkAI's connections list: grouped sections of apps, each row opening the app's page,
 * where its accounts connect and disconnect.
 */
export function SparkConnections({
  connected,
  featured,
  rest,
  restTotal,
  searching,
  mcpServers,
  pending,
  onOpen,
  onShowMore,
}: {
  connected: ConnectionCatalogItem[];
  featured: ConnectionCatalogItem[];
  rest: ConnectionCatalogItem[];
  restTotal: number;
  searching: boolean;
  mcpServers: McpServer[];
  pending: string | null;
  onOpen: (item: ConnectionCatalogItem) => void;
  onShowMore: () => void;
}) {
  const { t } = useLingui();
  const styles = useThemedStyles(createIntegrationsStyles);
  const router = useRouter();
  const success = mobileTokens().success;

  function row(item: ConnectionCatalogItem, isConnected: boolean) {
    const key = catalogItemKey(item);
    const connecting = pending === key;
    return (
      <SettingsRow
        key={key}
        title={item.name}
        leading={<ConnectorIcon logo={item.logo} name={item.name} size={ROW_LOGO_SIZE} />}
        trailing={
          connecting ? (
            <ActivityIndicator color={native.secondaryLabel} />
          ) : isConnected ? (
            <NativeSymbol ios="checkmark" android="checkmark" size={14} color={success} />
          ) : null
        }
        chevron={connecting || isConnected ? undefined : "right"}
        onPress={() => onOpen(item)}
      />
    );
  }

  if (searching) {
    return connected.length + rest.length === 0 ? (
      <Text style={styles.secondary}>{t`No apps match your search.`}</Text>
    ) : (
      <SettingsGroup>
        {[...connected.map((item) => row(item, true)), ...rest.map((item) => row(item, false))]}
      </SettingsGroup>
    );
  }

  return (
    <>
      <SettingsGroup label={t`Connected`}>{connected.map((item) => row(item, true))}</SettingsGroup>
      <SettingsGroup label={t`Recommended`}>
        {featured.map((item) => row(item, false))}
      </SettingsGroup>
      <SettingsGroup label={t`More apps`}>{rest.map((item) => row(item, false))}</SettingsGroup>
      {rest.length < restTotal ? (
        <NativeActionButton label={t`Show more`} onPress={onShowMore} prominence="secondary" />
      ) : null}
      <SettingsGroup label={t`MCP servers`}>
        {mcpServers.map((server) => (
          <SettingsRow
            key={server.id}
            title={server.name}
            leading={<ConnectorIcon name={server.name} size={ROW_LOGO_SIZE} />}
            trailing={<ConnectionStatus state={mcpServerConnection(server)} />}
            onPress={() => router.push({ pathname: "/mcp-server", params: { id: server.id } })}
          />
        ))}
      </SettingsGroup>
    </>
  );
}
