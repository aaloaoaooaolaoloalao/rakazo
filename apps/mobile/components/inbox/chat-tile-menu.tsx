import type { Href } from "expo-router";
import type { ReactElement } from "react";
import type { InboxSwipeRowProps } from "./inbox-swipe-row";

export type ChatTileMenuProps = Omit<InboxSwipeRowProps, "rowKey"> & {
  /** The tile's width, which its native host is laid out at. */
  width: number | undefined;
  /** Where the tile's chat opens, which the iOS native list row's tile menu is attached to. */
  href: Href;
  children: ReactElement;
};

/** A pinned tile's context menu is iOS behaviour; other platforms organize with a long press. */
export function ChatTileMenu({ children }: ChatTileMenuProps) {
  return children;
}
