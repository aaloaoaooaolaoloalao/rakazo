import { ph } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { GROUP_MEMBER_MAX, GROUP_MEMBER_MIN } from "@rakazo/contracts";
import { useState } from "react";
import type { MobileBot } from "../../lib/api/mobile-types";
import { NativeSwitch } from "../native/native-switch";
import { SettingsGroup, SettingsInputRow, SettingsRow } from "../settings/settings-group";
import { BotAvatar } from "./bot-avatar";

export function BotMemberPicker({
  bots,
  selected,
  onChange,
  onOpenBot,
  disabled = false,
  initiallyExpanded = false,
}: {
  bots: MobileBot[];
  selected: string[];
  onChange: (botIds: string[]) => void;
  /** Makes each bot's avatar and name open that bot; the switch still edits membership. */
  onOpenBot?: (bot: MobileBot) => void;
  disabled?: boolean;
  initiallyExpanded?: boolean;
}) {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [query, setQuery] = useState("");
  // Bots ever picked this session stay listed when collapsed so an unchecked
  // member remains re-checkable until the form is saved.
  const [everPicked, setEverPicked] = useState<ReadonlySet<string>>(() => new Set(selected));
  const needle = expanded ? query.trim().toLowerCase() : "";
  const base = expanded
    ? bots
    : bots.filter((bot) => everPicked.has(bot.id) || selected.includes(bot.id));
  const visible = needle ? base.filter((bot) => bot.name.toLowerCase().includes(needle)) : base;

  return (
    <SettingsGroup
      label={t`Members (${ph({ count: selected.length })})`}
      footer={
        expanded
          ? t`Pick ${ph({ min: GROUP_MEMBER_MIN })}–${ph({ max: GROUP_MEMBER_MAX })}`
          : undefined
      }
    >
      {expanded ? (
        <SettingsInputRow
          key="filter"
          value={query}
          onChangeText={setQuery}
          placeholder={t`Filter bots`}
          accessibilityLabel={t`Filter bots`}
          autoCorrect={false}
        />
      ) : null}
      {visible.map((bot) => {
        const checked = selected.includes(bot.id);
        return (
          <SettingsRow
            key={bot.id}
            title={bot.name}
            accessibilityLabel={bot.name}
            disabled={disabled}
            onPress={onOpenBot ? () => onOpenBot(bot) : undefined}
            leading={
              <BotAvatar
                color={bot.color}
                avatarSet={bot.avatarSet}
                identity={bot.id}
                size={30}
                status={bot.status}
              />
            }
            trailing={
              <NativeSwitch
                accessibilityLabel={bot.name}
                disabled={disabled || (!checked && selected.length >= GROUP_MEMBER_MAX)}
                onValueChange={(next) => {
                  if (next && selected.length >= GROUP_MEMBER_MAX) return;
                  setEverPicked((current) => new Set(current).add(bot.id));
                  onChange(next ? [...selected, bot.id] : selected.filter((id) => id !== bot.id));
                }}
                value={checked}
              />
            }
          />
        );
      })}
      {visible.length === 0 ? (
        <SettingsRow
          key="empty"
          dimmed
          title={expanded ? t`No matching bots` : t`No members yet`}
        />
      ) : null}
      <SettingsRow
        key="toggle"
        tinted
        title={expanded ? t`Show selected` : t`Show all`}
        onPress={() => setExpanded((value) => !value)}
      />
    </SettingsGroup>
  );
}
