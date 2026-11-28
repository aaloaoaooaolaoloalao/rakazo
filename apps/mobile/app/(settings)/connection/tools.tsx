import { useLingui } from "@lingui/react/macro";
import { appToolLabel, groupAppPermissionTools } from "@rakazo/core";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { createIntegrationsStyles } from "../../../components/integrations/integrations-styles";
import { useToolPermissions } from "../../../components/integrations/tool-permissions";
import { NativeSymbol } from "../../../components/native/native-symbol";
import { SettingsGroup, SettingsRow } from "../../../components/settings/settings-group";
import { MenuPickerMenu } from "../../../components/ui/menu-picker";
import { useSideInsets } from "../../../lib/layout/side-insets";
import { native, useThemedStyles } from "../../../lib/native/native";
import { useScreenHeader } from "../../../lib/navigation/screen-header";
import { rpcQuery } from "../../../lib/query/query";
import { useScreenQuery } from "../../../lib/query/screen-query";

/** One connected app's tools, each with the approval rule a bot follows when it uses it. */
export default function ConnectionToolsScreen() {
  const { t } = useLingui();
  const { connectorId, provider } = useLocalSearchParams<{
    connectorId: string;
    provider: string;
  }>();
  const styles = useThemedStyles(createIntegrationsStyles);
  const sideInsets = useSideInsets();
  // The app's page read these already, so they show at once.
  const tools = useScreenQuery(rpcQuery("connections/tools", { connectorId, provider }));
  const { choices, mode, disabled, ruleFor, choose, failure } = useToolPermissions();
  const grouped = groupAppPermissionTools(tools.data ?? []);
  const titles = { reads: t`Reads`, other: t`Other actions` };

  useScreenHeader({ title: t`Tool permissions` });

  return (
    <SafeAreaView edges={["bottom"]} style={styles.screen}>
      <ScrollView
        style={sideInsets}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        {tools.isLoading ? <ActivityIndicator color={native.secondaryLabel} /> : null}
        {failure ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {failure}
          </Text>
        ) : null}
        {(["reads", "other"] as const).map((group, index) =>
          grouped[group].length ? (
            <Animated.View key={group} entering={FadeIn.duration(180).delay(index * 60)}>
              <SettingsGroup
                label={titles[group]}
                footer={
                  index === 0
                    ? mode === "never"
                      ? t`Only Block rules apply in Never ask.`
                      : t`Other approval rules still apply.`
                    : undefined
                }
              >
                {grouped[group].map((tool) => {
                  const key = tool.approvalKey;
                  const label = appToolLabel(tool.name, provider);
                  const row = (
                    <SettingsRow
                      title={label}
                      detail={
                        tool.description && tool.description !== tool.name
                          ? tool.description
                          : undefined
                      }
                      value={
                        key
                          ? choices.find((choice) => choice.key === ruleFor(key))?.label
                          : undefined
                      }
                      trailing={
                        key ? (
                          <NativeSymbol
                            ios="chevron.up.chevron.down"
                            android="chevron-expand"
                            size={13}
                            color={native.tertiaryLabel}
                          />
                        ) : undefined
                      }
                    />
                  );
                  return (
                    <View key={key ?? tool.name}>
                      {key ? (
                        // The whole row opens the choices, not only its small value.
                        <MenuPickerMenu
                          label={label}
                          choices={choices}
                          value={ruleFor(key)}
                          disabled={disabled}
                          onChange={(value) => choose(key, value)}
                        >
                          {row}
                        </MenuPickerMenu>
                      ) : (
                        row
                      )}
                    </View>
                  );
                })}
              </SettingsGroup>
            </Animated.View>
          ) : null,
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
