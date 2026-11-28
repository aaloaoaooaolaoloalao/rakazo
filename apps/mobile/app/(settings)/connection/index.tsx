import type { Connection, ConnectionCatalogItem } from "@rakazo/contracts";
import { catalogItemKey } from "@rakazo/core";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createIntegrationsStyles } from "../../../components/integrations/integrations-styles";
import { SparkConnectionDetail } from "../../../components/integrations/spark-connection-detail";
import { useConnectionActions } from "../../../components/integrations/use-connection-actions";
import { selectedSpaceId } from "../../../lib/api/api";
import { loadLastBotId } from "../../../lib/inbox/last-bot";
import { useSideInsets } from "../../../lib/layout/side-insets";
import { native, useThemedStyles } from "../../../lib/native/native";
import { useScreenHeader } from "../../../lib/navigation/screen-header";
import { queryClient, rpcQuery } from "../../../lib/query/query";
import { useScreenQuery } from "../../../lib/query/screen-query";

/** One catalog app pushed from Integrations: connect it, manage its accounts, disconnect it. */
export default function ConnectionRoute() {
  const { app } = useLocalSearchParams<{ app: string }>();
  // Another app opened in the same screen starts from its own state.
  return <ConnectionScreen key={app} appKey={app} spaceId={selectedSpaceId()} />;
}

function ConnectionScreen({ appKey, spaceId }: { appKey: string; spaceId: string | null }) {
  const router = useRouter();
  const sideInsets = useSideInsets();
  const styles = useThemedStyles(createIntegrationsStyles);
  const [lastBotId, setLastBotId] = useState("");
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});

  const catalogRead = rpcQuery("connections/catalog");
  const listRead = rpcQuery("connections/list");
  const connectionsRead = {
    ...listRead,
    queryFn: async (context: Parameters<typeof listRead.queryFn>[0]) => {
      // The catalog call reconciles connection rows, so they are listed after it answers.
      await queryClient.fetchQuery({ ...catalogRead, staleTime: 0 });
      return listRead.queryFn(context);
    },
  };
  const catalogQuery = useScreenQuery(catalogRead);
  const connectionsQuery = useScreenQuery(connectionsRead);
  const item = catalogQuery.data?.find((entry) => catalogItemKey(entry) === appKey) ?? null;
  const toolsRead = rpcQuery(
    "connections/tools",
    item
      ? { connectorId: item.connectorId, provider: item.slug }
      : { connectorId: "", provider: "" },
  );
  const toolsQuery = useScreenQuery(toolsRead, { enabled: Boolean(item) });
  const connections = connectionsQuery.data ?? [];
  const stale = [catalogRead.queryKey, listRead.queryKey, toolsRead.queryKey.slice(0, -1)];

  useScreenHeader({ title: item?.name ?? "" });

  // Counted per focus, so work started before the screen was left never acts on a later visit.
  const focus = useRef({ shown: false, visit: 0 });
  function captureFocus() {
    const visit = focus.current.visit;
    return () => focus.current.shown && focus.current.visit === visit;
  }

  const {
    connect,
    retryAccount,
    revokeAccount,
    renameAccount,
    uninstall,
    stopConnecting,
    pending,
    failure,
  } = useConnectionActions({
    catalogRead,
    connectionsRead,
    stale,
    connections,
    labelDrafts,
    setLabelDrafts,
    lastBotId,
    setLastBotId,
    // Disconnecting the app leaves its page for the list it came from.
    closeDetail: () => {
      if (selectedSpaceId() === spaceId && router.canGoBack()) router.back();
    },
    captureFocus,
    inAppSignIn: true,
  });

  useFocusEffect(
    useCallback(() => {
      focus.current = { shown: true, visit: focus.current.visit + 1 };
      let cancelled = false;
      void loadLastBotId().then((id) => {
        if (!cancelled) setLastBotId(id);
      });
      return () => {
        cancelled = true;
        focus.current = { ...focus.current, shown: false };
        stopConnecting();
      };
    }, [stopConnecting]),
  );

  return (
    <SafeAreaView edges={["bottom"]} style={styles.screen}>
      <ScrollView
        style={sideInsets}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        {item ? (
          <SparkConnectionDetail
            item={item}
            accounts={appAccounts(connections, item)}
            pending={pending}
            failure={failure}
            tools={toolsQuery.data ?? []}
            toolsLoading={toolsQuery.isLoading}
            toolsFailed={toolsQuery.isError}
            onConnect={() => connect(item)}
            onRename={renameAccount}
            onRetry={(row) => retryAccount(row, item)}
            onRevoke={revokeAccount}
            onUninstall={() => uninstall(item)}
            onOpenChatApp={() => router.push("/messaging")}
            onOpenTools={() =>
              router.push({
                pathname: "/connection/tools",
                params: { connectorId: item.connectorId, provider: item.slug },
              })
            }
          />
        ) : (
          <ActivityIndicator color={native.secondaryLabel} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** The app's accounts, with any that failed so they can be tried again or removed. */
function appAccounts(connections: Connection[], item: ConnectionCatalogItem) {
  return connections.filter(
    (row) =>
      row.connectorId === item.connectorId &&
      row.provider === item.slug &&
      row.status !== "revoked",
  );
}
