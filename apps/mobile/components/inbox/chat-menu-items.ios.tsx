import { Button, Divider, Menu, Toggle } from "@expo/ui/swift-ui";
import { labelStyle, tint } from "@expo/ui/swift-ui/modifiers";
import { useLingui } from "@lingui/react/macro";
import { SNOOZE_PRESETS, snoozePresetTime } from "@rakazo/core";
import { Link } from "expo-router";
import { PlatformColor } from "react-native";
import type { InboxRowAction } from "../../lib/inbox/inbox-swipe";
import { INBOX_ROW_ACTIONS, inboxRowActions, SNOOZE_LABELS } from "../../lib/inbox/inbox-swipe";
import type { InboxSwipeRowProps } from "./inbox-swipe-row";

export type ChatMenuProps = Omit<InboxSwipeRowProps, "rowKey" | "preview" | "children">;

/** One chat action as a menu item, or as an icon-only swipe button. */
export function ChatActionButton({
  action,
  leading,
  swipe = false,
  onAction,
}: {
  action: InboxRowAction;
  /** The chat's leading swipe action, filled blue as a swipe button. */
  leading: InboxRowAction;
  swipe?: boolean;
  onAction: (action: InboxRowAction) => void;
}) {
  const { i18n } = useLingui();
  const { label, systemImage } = INBOX_ROW_ACTIONS[action];
  const fill = action === "archive" ? "systemRed" : action === leading ? "systemBlue" : null;
  return (
    <Button
      label={i18n._(label)}
      systemImage={systemImage}
      role={!swipe && action === "delete" ? "destructive" : undefined}
      modifiers={
        swipe ? [labelStyle("iconOnly"), ...(fill ? [tint(PlatformColor(fill))] : [])] : undefined
      }
      onPress={() => onAction(action)}
    />
  );
}

/** A chat's context menu items, the same for its inbox row and its pinned tile. */
export function ChatMenuItems({
  unread,
  pinned,
  notifyOnFinish,
  sectionId,
  sections,
  onAction,
  onOrganize,
  onEditSection,
  snoozed,
  onSnooze,
}: ChatMenuProps) {
  const { t, i18n } = useLingui();
  const { leading } = inboxRowActions({ unread, pinned });
  const button = (action: InboxRowAction) => (
    <ChatActionButton action={action} leading={leading} onAction={onAction} />
  );
  function moveTo(id: string | null) {
    if (id !== (sectionId ?? null)) onOrganize({ sectionId: id });
  }
  return (
    <>
      {button(leading)}
      {button(pinned ? "unpin" : "pin")}
      {notifyOnFinish === undefined ? null : (
        <Button
          label={notifyOnFinish ? t`Silence notifications` : t`Resume notifications`}
          systemImage={notifyOnFinish ? "bell.slash" : "bell"}
          onPress={() => onOrganize({ notifyOnFinish: !notifyOnFinish })}
        />
      )}
      {!onSnooze ? null : snoozed ? (
        <Button label={t`Unsnooze`} systemImage="moon.zzz" onPress={() => onSnooze(null)} />
      ) : (
        <Menu label={t`Snooze`} systemImage="moon.zzz">
          {SNOOZE_PRESETS.map((preset) => (
            <Button
              key={preset}
              label={i18n._(SNOOZE_LABELS[preset])}
              onPress={() => onSnooze(snoozePresetTime(preset, new Date()).toISOString())}
            />
          ))}
        </Menu>
      )}
      <Menu label={t`Move to`} systemImage="folder">
        {sections.map((section) => (
          <Toggle
            key={section.id}
            label={section.name}
            isOn={sectionId === section.id}
            onIsOnChange={() => moveTo(section.id)}
          />
        ))}
        <Toggle label={t`Unassigned`} isOn={sectionId == null} onIsOnChange={() => moveTo(null)} />
        <Divider />
        <Button
          label={t`New section`}
          systemImage="folder.badge.plus"
          onPress={() => onEditSection("create")}
        />
        {sections.some((section) => section.id === sectionId) ? (
          <Button
            label={t`Rename section`}
            systemImage="pencil"
            onPress={() => onEditSection("rename")}
          />
        ) : null}
      </Menu>
      {button("archive")}
      {button("delete")}
    </>
  );
}

/**
 * The same items as `ChatMenuItems`, as a link's UIKit menu: one that lifts only the view it is
 * on, as a pinned tile needs inside a native list row. The menu is called, not rendered, because
 * the link finds its menu among its direct children.
 */
export function useChatLinkMenu() {
  const { t, i18n } = useLingui();
  return ({
    unread,
    pinned,
    notifyOnFinish,
    sectionId,
    sections,
    onAction,
    onOrganize,
    onEditSection,
    snoozed,
    onSnooze,
  }: ChatMenuProps) => {
    const { leading } = inboxRowActions({ unread, pinned });
    const action = (name: InboxRowAction) => (
      <Link.MenuAction
        key={name}
        title={i18n._(INBOX_ROW_ACTIONS[name].label)}
        icon={INBOX_ROW_ACTIONS[name].systemImage}
        destructive={name === "delete"}
        onPress={() => onAction(name)}
      />
    );
    function moveTo(id: string | null) {
      if (id !== (sectionId ?? null)) onOrganize({ sectionId: id });
    }
    return (
      <Link.Menu>
        {action(leading)}
        {action(pinned ? "unpin" : "pin")}
        {notifyOnFinish === undefined ? null : (
          <Link.MenuAction
            title={notifyOnFinish ? t`Silence notifications` : t`Resume notifications`}
            icon={notifyOnFinish ? "bell.slash" : "bell"}
            onPress={() => onOrganize({ notifyOnFinish: !notifyOnFinish })}
          />
        )}
        {!onSnooze ? null : snoozed ? (
          <Link.MenuAction title={t`Unsnooze`} icon="moon.zzz" onPress={() => onSnooze(null)} />
        ) : (
          <Link.Menu title={t`Snooze`} icon="moon.zzz">
            {SNOOZE_PRESETS.map((preset) => (
              <Link.MenuAction
                key={preset}
                title={i18n._(SNOOZE_LABELS[preset])}
                onPress={() => onSnooze(snoozePresetTime(preset, new Date()).toISOString())}
              />
            ))}
          </Link.Menu>
        )}
        <Link.Menu title={t`Move to`} icon="folder">
          <Link.Menu inline>
            {sections.map((section) => (
              <Link.MenuAction
                key={section.id}
                title={section.name}
                isOn={sectionId === section.id}
                onPress={() => moveTo(section.id)}
              />
            ))}
            <Link.MenuAction
              title={t`Unassigned`}
              isOn={sectionId == null}
              onPress={() => moveTo(null)}
            />
          </Link.Menu>
          <Link.Menu inline>
            <Link.MenuAction
              title={t`New section`}
              icon="folder.badge.plus"
              onPress={() => onEditSection("create")}
            />
            {sections.some((section) => section.id === sectionId) ? (
              <Link.MenuAction
                title={t`Rename section`}
                icon="pencil"
                onPress={() => onEditSection("rename")}
              />
            ) : null}
          </Link.Menu>
        </Link.Menu>
        {action("archive")}
        {action("delete")}
      </Link.Menu>
    );
  };
}
