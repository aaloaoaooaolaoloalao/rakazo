import { useLingui } from "@lingui/react/macro";
import { Link } from "expo-router";
import type { ReactElement } from "react";
import { useContext } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";
import { native, useThemedStyles } from "../../lib/native/native";
import { NativeListRowContext } from "../native/native-list-row";
import { NativeRow } from "../native/native-row";
import { useChatLinkMenu } from "./chat-menu-items.ios";
import type { ChatTileMenuProps } from "./chat-tile-menu";
import type { InboxChatPreviewProps } from "./inbox-chat-preview";

/** The tile opens its chat itself, the way the inbox opens chats; the link only holds the menu. */
const keepTilePress = (event: { preventDefault: () => void }) => event.preventDefault();

/**
 * Lays out the pinned tiles, each a `ChatTileMenu`. A native list row takes only one SwiftUI
 * context menu and lifts the whole row for it, so there each tile carries a UIKit menu of its
 * own, which lifts that tile alone.
 */
export function PinnedTileGrid({
  style,
  onWidth,
  tiles,
}: {
  style: StyleProp<ViewStyle>;
  onWidth: (width: number) => void;
  tiles: ReactElement<ChatTileMenuProps>[];
}) {
  const row = useContext(NativeListRowContext);
  const chatLinkMenu = useChatLinkMenu();
  if (!row) {
    return (
      <View style={style} onLayout={(event) => onWidth(event.nativeEvent.layout.width)}>
        {tiles}
      </View>
    );
  }
  return (
    <NativeRow>
      <View style={style}>
        {tiles.map((tile) => {
          const { width: _width, href, preview, children, ...menu } = tile.props;
          return (
            <Link key={tile.key} href={href} asChild onPress={keepTilePress}>
              <Link.Trigger>{children}</Link.Trigger>
              <Link.Preview style={{ width: PREVIEW_WIDTH, height: previewHeight(preview) }}>
                <PinnedChatPreview {...preview} />
              </Link.Preview>
              {chatLinkMenu(menu)}
            </Link>
          );
        })}
      </View>
    </NativeRow>
  );
}

const PREVIEW_WIDTH = 320;
const PREVIEW_LINES = 4;
/** About how many characters of a message fill one line of the preview's bubble. */
const CHARACTERS_PER_LINE = 34;

/** The preview's height for its message, which the native preview needs before it renders. */
function previewHeight({ message }: InboxChatPreviewProps) {
  const text = message?.trim() ?? "";
  if (!text) return 110;
  const lines = Math.min(PREVIEW_LINES, Math.ceil(text.length / CHARACTERS_PER_LINE));
  return 106 + lines * 20;
}

/** The card a pinned tile lifts with, as a chat row's menu shows: the chat and its last message. */
function PinnedChatPreview({ title, message, avatar }: InboxChatPreviewProps) {
  const { t } = useLingui();
  const styles = useThemedStyles(createPreviewStyles);
  const text = message?.trim() ?? "";
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {avatar}
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      </View>
      <View style={styles.divider} />
      {text ? (
        <Text numberOfLines={PREVIEW_LINES} style={styles.bubble}>
          {text}
        </Text>
      ) : (
        <Text style={styles.empty}>{t`No messages yet`}</Text>
      )}
    </View>
  );
}

function createPreviewStyles() {
  return StyleSheet.create({
    card: { flex: 1, backgroundColor: native.page },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    title: { flex: 1, color: native.label, fontSize: 17, fontWeight: "600" },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: native.separator },
    bubble: {
      margin: 16,
      alignSelf: "flex-start",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 18,
      overflow: "hidden",
      backgroundColor: native.fill,
      color: native.label,
      fontSize: 17,
      lineHeight: 20,
    },
    empty: { padding: 16, color: native.tertiaryLabel, fontSize: 17 },
  });
}
