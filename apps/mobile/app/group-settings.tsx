import { useLingui } from "@lingui/react/macro";
import { GROUP_MEMBER_MAX, GROUP_MEMBER_MIN, GROUP_NAME_MAX_LENGTH } from "@rakazo/contracts";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useContext, useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { BotMemberPicker } from "../components/bots/bot-member-picker";
import { GroupAvatar } from "../components/bots/group-avatar";
import { glassHeaderOptions } from "../components/native/glass-title";
import {
  SettingsGroup,
  SettingsInputRow,
  SettingsRow,
} from "../components/settings/settings-group";
import { selectedSpaceId } from "../lib/api/api";
import type { MobileBot, MobileGroup } from "../lib/api/mobile-types";
import { errorText } from "../lib/api/user-error";
import { alertGroupNotDeleted, confirmDeleteGroup, deleteGroup } from "../lib/bots/bot-lifecycle";
import { CallKeyboardContext } from "../lib/calls/call-keyboard-context";
import {
  notifyArchivedChatsChanged,
  onArchivedChatsChanged,
} from "../lib/inbox/archived/archived-chats";
import { useSideInsets } from "../lib/layout/side-insets";
import { announceToScreenReader } from "../lib/native/announce";
import { useMobileTokens } from "../lib/native/native";
import { useScreenHeader } from "../lib/navigation/screen-header";
import { formRead, queryClient, rpcQuery, useSave } from "../lib/query/query";
import type { SettingsTarget } from "../lib/query/settings-target";

export default function GroupSettingsScreen() {
  const rootAvoidsKeyboard = useContext(CallKeyboardContext);
  const sideInsets = useSideInsets();
  const { t } = useLingui();
  const tokens = useMobileTokens();
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  // The group belongs to the Space it was opened in; its reads and saves stay there.
  const [spaceId] = useState(() => selectedSpaceId() ?? undefined);
  const target: SettingsTarget | undefined = spaceId ? { scope: "space", spaceId } : undefined;
  const groupsQuery = useQuery(formRead(rpcQuery("groups/list", undefined, spaceId)), queryClient);
  const botsQuery = useQuery(formRead(rpcQuery("bots/list", undefined, spaceId)), queryClient);
  const { refetch: refetchGroups } = groupsQuery;
  const { refetch: refetchBots } = botsQuery;
  const [group, setGroup] = useState<MobileGroup | null>(null);
  const [bots, setBots] = useState<MobileBot[]>([]);
  const [name, setName] = useState("");
  const deselected = useRef(new Set<string>());
  // The group as last read, which edits made since are kept over.
  const baseline = useRef<MobileGroup | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [missing, setMissing] = useState(false);
  const readError = groupsQuery.error ?? botsQuery.error;
  const loadError = readError
    ? errorText(readError, t`Could not load group`)
    : missing
      ? t`Group not found`
      : null;

  // A failed read is shown here and read out once, when it appears.
  useEffect(() => {
    if (loadError) announceToScreenReader(loadError);
  }, [loadError]);

  useEffect(
    () =>
      onArchivedChatsChanged(() => {
        // A change in another selected Space is not this group's.
        if ((selectedSpaceId() ?? undefined) !== spaceId) return;
        void refetchGroups();
        void refetchBots();
      }),
    [spaceId, refetchGroups, refetchBots],
  );

  useEffect(() => {
    // Only what this visit read: a copy an earlier one left is not the group as it is now.
    const groups = groupsQuery.isFetchedAfterMount ? groupsQuery.data : undefined;
    const nextBots = botsQuery.isFetchedAfterMount ? botsQuery.data : undefined;
    if (!groups || !nextBots) return;
    const nextGroup = groups.find((row) => row.id === groupId);
    setMissing(!nextGroup);
    if (!nextGroup) {
      baseline.current = null;
      setGroup(null);
      return;
    }
    const ids = new Set([
      ...nextBots.map((bot) => bot.id),
      ...nextGroup.members.map((member) => member.botId),
    ]);
    const previous = baseline.current;
    const previousMembers = new Set(previous?.members.map((member) => member.botId));
    // Another group opened in place starts from its own read, not the previous group's edits.
    const initial = previous?.id !== nextGroup.id;
    if (initial) deselected.current.clear();
    const previousName = previous?.name;
    baseline.current = nextGroup;
    setGroup(nextGroup);
    setName((current) => (initial || current === previousName ? nextGroup.name : current));
    setSelected((current) =>
      initial
        ? nextGroup.members.map((member) => member.botId)
        : [
            ...new Set([
              ...nextGroup.members
                .filter(
                  (member) =>
                    !deselected.current.has(member.botId) &&
                    (!previousMembers.has(member.botId) || current.includes(member.botId)),
                )
                .map((member) => member.botId),
              ...current.filter((id) => !previousMembers.has(id) && ids.has(id)),
            ]),
          ],
    );
    setBots(nextBots.filter((bot) => !bot.archivedAt));
  }, [
    groupsQuery.isFetchedAfterMount,
    groupsQuery.data,
    botsQuery.isFetchedAfterMount,
    botsQuery.data,
    groupId,
  ]);

  const saving = useSave({
    target,
    save: async (
      input: { groupId: string; name?: string; botIds?: string[]; expectedBotIds?: string[] },
      send,
    ) => {
      if (input.name || input.botIds) await send("groups/update", input);
    },
    onSaved: () => router.back(),
    // Each failed save is read out, so a repeat of the same failure is heard again.
    onFailed: (failure) => announceToScreenReader(errorText(failure, t`Could not save group`)),
    closesScreen: true,
  });
  const pending = saving.pending;
  const error = saving.error ? errorText(saving.error, t`Could not save group`) : null;
  const removal = useSave({
    target,
    save: async (removedId: string, send) => {
      await deleteGroup(removedId, send);
      notifyArchivedChatsChanged();
    },
    onSaved: () => router.replace("/"),
    onFailed: alertGroupNotDeleted,
    closesScreen: true,
  });

  function save() {
    if (!groupId || !group) return;
    const input: {
      groupId: string;
      name?: string;
      botIds?: string[];
      expectedBotIds?: string[];
    } = { groupId };
    if (name.trim() !== group.name) input.name = name.trim();
    const memberIds = group.members.map((member) => member.botId).join(",");
    if (selected.join(",") !== memberIds) {
      input.botIds = selected;
      input.expectedBotIds = group.members.map((member) => member.botId);
    }
    saving.run(input);
  }

  const memberIds = group?.members.map((member) => member.botId).join(",");
  const dirty = Boolean(group) && (name.trim() !== group?.name || selected.join(",") !== memberIds);
  // Save sits in the header, as on other settings screens, and only once something changed.
  useScreenHeader({
    action: dirty
      ? {
          label: t`Save`,
          onPress: save,
          busy: pending,
          disabled:
            !name.trim() ||
            selected.length < GROUP_MEMBER_MIN ||
            selected.length > GROUP_MEMBER_MAX,
        }
      : null,
  });

  function remove() {
    if (groupId && group) confirmDeleteGroup(group, () => removal.run(groupId));
  }

  return (
    <>
      <Stack.Screen options={glassHeaderOptions(t`Group settings`)} />
      <ScrollView
        style={[{ flex: 1, backgroundColor: tokens.background }, sideInsets]}
        contentContainerStyle={{ width: "100%", padding: 20, gap: 24, paddingBottom: 40 }}
        automaticallyAdjustKeyboardInsets={!rootAvoidsKeyboard}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {group ? (
          <View style={{ alignItems: "center", gap: 12 }}>
            <GroupAvatar
              size={72}
              members={selected.slice(0, 3).flatMap((id) => {
                const bot = bots.find((item) => item.id === id);
                return bot ? [{ botId: bot.id, color: bot.color, avatarSet: bot.avatarSet }] : [];
              })}
            />
            <Text
              numberOfLines={2}
              style={{
                color: tokens.foreground,
                fontSize: 22,
                fontWeight: "600",
                textAlign: "center",
              }}
            >
              {name.trim() || group.name}
            </Text>
          </View>
        ) : null}
        <SettingsGroup label={t`Name`}>
          <SettingsInputRow
            key="name"
            accessibilityLabel={t`Name`}
            value={name}
            onChangeText={setName}
            maxLength={GROUP_NAME_MAX_LENGTH}
            placeholder={t`Group name`}
            returnKeyType="done"
          />
        </SettingsGroup>
        {group ? (
          <BotMemberPicker
            key={group.id}
            bots={bots}
            selected={selected}
            onChange={(next) => {
              for (const id of selected) {
                if (!next.includes(id)) deselected.current.add(id);
              }
              for (const id of next) deselected.current.delete(id);
              setSelected(next);
            }}
            onOpenBot={(bot) =>
              router.push({ pathname: "/bot-profile", params: { botId: bot.id, name: bot.name } })
            }
            disabled={pending}
          />
        ) : null}
        {groupId ? (
          <SettingsGroup>
            <SettingsRow
              key="pages"
              title={t`Pages`}
              chevron="right"
              onPress={() => router.push({ pathname: "/pages", params: { groupId } })}
            />
          </SettingsGroup>
        ) : null}
        <SettingsGroup>
          <SettingsRow key="delete" destructive title={t`Delete group`} onPress={remove} />
        </SettingsGroup>
        {error || loadError ? (
          <Text accessibilityRole="alert" style={{ color: tokens.destructive }}>
            {error ?? loadError}
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}
