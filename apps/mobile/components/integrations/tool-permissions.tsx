import { useLingui } from "@lingui/react/macro";
import { APPROVAL_RULES_CHANGED } from "@rakazo/contracts";
import type { AppPermissionTool, AppToolPermissionChange } from "@rakazo/core";
import {
  appToolLabel,
  appToolPermissionChoices,
  appToolPermissionRequest,
  appToolRules,
  errorCode,
  groupAppPermissionTools,
} from "@rakazo/core";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { errorText } from "../../lib/api/user-error";
import { hapticSelection } from "../../lib/native/haptics";
import { useThemedStyles } from "../../lib/native/native";
import { rpcQuery, useSave } from "../../lib/query/query";
import { useScreenQuery } from "../../lib/query/screen-query";
import { MenuPicker } from "../ui/menu-picker";
import { Chevron } from "../ui/row-accessories";
import { createIntegrationsStyles } from "./integrations-styles";

/**
 * The approval rules for one app's tools: the choices each tool offers, the one in effect (the
 * one just picked while it saves), and changing it.
 */
export function useToolPermissions() {
  const { t } = useLingui();
  const permissionsRead = rpcQuery("approvalRules/effective", {});
  const permissions = useScreenQuery(permissionsRead);
  const snapshot = permissions.data;
  const rules = appToolRules(snapshot?.rules ?? []);
  const change = useSave({
    save: async (selection: AppToolPermissionChange, send) => {
      if (!snapshot) return;
      const request = appToolPermissionRequest(selection, rules, snapshot.target);
      if (request?.kind === "remove") await send("approvalRules/remove", request.input);
      if (request?.kind === "set") await send("approvalRules/set", request.input);
    },
    stale: [permissionsRead.queryKey, rpcQuery("approvalRules/list", {}).queryKey],
    onFailed: (error) => {
      if (errorCode(error) === APPROVAL_RULES_CHANGED) return permissions.refetch();
    },
  });
  const loadError = permissions.error;
  const mode = snapshot?.mode;
  const labels = {
    default: t`Default`,
    always_allow: t`Allow`,
    require_approval: t`Ask`,
    deny: t`Block`,
  };
  const choices = appToolPermissionChoices(mode).map(({ permission, disabled }) => ({
    key: permission,
    label: labels[permission],
    disabled,
  }));
  const failure = change.error ?? loadError;
  return {
    choices,
    mode,
    disabled: !snapshot || Boolean(loadError) || change.pending,
    /** The rule for `key`, showing the choice being saved at once. */
    ruleFor(key: string): string {
      if (change.pending && change.input?.key === key) return change.input.permission;
      return rules.get(key.toLowerCase())?.effect ?? "default";
    },
    choose(key: string, value: string) {
      const choice = choices.find((entry) => entry.key === value);
      if (!choice || choice.disabled) return;
      hapticSelection();
      change.run({ key, permission: choice.key });
    },
    failure: failure
      ? errorText(
          failure,
          change.error ? t`Could not save permission` : t`Could not load permissions`,
        )
      : null,
  };
}

export function ToolPermissions({ tools, slug }: { tools: AppPermissionTool[]; slug: string }) {
  const { t } = useLingui();
  const styles = useThemedStyles(createIntegrationsStyles);
  const [open, setOpen] = useState({ reads: false, other: false });
  const { choices, mode, disabled, ruleFor, choose, failure } = useToolPermissions();
  const grouped = groupAppPermissionTools(tools);
  const titles = { reads: t`Reads`, other: t`Other actions` };

  return (
    <View style={styles.card}>
      <Text style={styles.section}>{t`Tool permissions`}</Text>
      {open.reads || open.other ? (
        <Text style={styles.secondary}>{t`Other approval rules still apply.`}</Text>
      ) : null}
      {mode === "never" ? (
        <Text style={styles.secondary}>{t`Only Block rules apply in Never ask.`}</Text>
      ) : null}
      {(["reads", "other"] as const).map((group) => {
        if (!grouped[group].length) return null;
        return (
          <View key={group}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open[group] }}
              onPress={() => setOpen((current) => ({ ...current, [group]: !current[group] }))}
              style={styles.toolsToggle}
            >
              <Text style={styles.title}>{titles[group]}</Text>
              <Chevron expanded={open[group]} />
            </Pressable>
            {open[group] ? (
              <View style={styles.toolsBody}>
                {grouped[group].map((tool) => {
                  const key = tool.approvalKey;
                  const label = appToolLabel(tool.name, slug);
                  return (
                    <View key={key ?? tool.name} style={styles.toolsToggle}>
                      <View style={styles.toolSummary}>
                        <Text style={styles.toolName}>{label}</Text>
                        {tool.description !== tool.name && tool.description ? (
                          <Text numberOfLines={2} style={styles.secondary}>
                            {tool.description}
                          </Text>
                        ) : null}
                      </View>
                      {key ? (
                        <View style={styles.toolPicker}>
                          <MenuPicker
                            label={label}
                            choices={choices}
                            value={ruleFor(key)}
                            disabled={disabled}
                            plain
                            showLabel={false}
                            onChange={(value) => choose(key, value)}
                          />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
      {failure ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {failure}
        </Text>
      ) : null}
    </View>
  );
}
