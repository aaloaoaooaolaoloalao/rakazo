import type { ReactElement } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";
import type { ChatTileMenuProps } from "./chat-tile-menu";

/** Lays out the pinned tiles; iOS joins the native list row instead when it renders in one. */
export function PinnedTileGrid({
  style,
  onWidth,
  tiles,
}: {
  style: StyleProp<ViewStyle>;
  onWidth: (width: number) => void;
  tiles: ReactElement<ChatTileMenuProps>[];
}) {
  return (
    <View style={style} onLayout={(event) => onWidth(event.nativeEvent.layout.width)}>
      {tiles}
    </View>
  );
}
