import { useTimeout } from "@rakazo/chat-ui/hooks";
import { useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import appMark from "../../assets/monochrome-icon.png";
import { hapticImpact } from "../../lib/native/haptics";
import { native, useMobileTokens, useThemedStyles } from "../../lib/native/native";
import { sparkProductEnabled } from "../../lib/spark/product";
import { SparkDotAvatar } from "../bots/spark-dot-avatar";

const MARK = 56;
// The face of the 1024 px monochrome icon: a 480 px circle inside the silhouette, eyes included.
const CROP = { x: 272, y: 303, size: 480 };
const SCALE = MARK / CROP.size;

export function AppMark() {
  return sparkProductEnabled() ? <SparkAppMark /> : <IconMark />;
}

function IconMark() {
  const styles = useThemedStyles(createAppMarkStyles);
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.circle}
    >
      <Image source={appMark} style={styles.image} />
    </View>
  );
}

type Trick = "jump" | "spin" | "wiggle";
const TRICKS: readonly Trick[] = ["jump", "spin", "wiggle"];
/** How long the character stays lively after a tap, in ms. */
const LIVELY = 1400;

/**
 * SparkAI's mark: the app icon's halftone character in ink. A tap plays one of its tricks in
 * turn (a jump, a spin, a squash and wiggle) while it blinks and its light sweeps round.
 */
function SparkAppMark() {
  const tokens = useMobileTokens();
  const reduce = useReducedMotion() === true;
  const motion = useRef(new Animated.Value(0)).current;
  const [trick, setTrick] = useState<Trick>("jump");
  const [plays, setPlays] = useState(0);
  const [lively, setLively] = useState(false);
  const [blink, setBlink] = useState(false);
  useTimeout(() => setLively(false), lively ? LIVELY : null, plays);
  useTimeout(() => setBlink(false), blink ? 160 : null, plays);

  function play() {
    hapticImpact();
    const next = TRICKS[plays % TRICKS.length]!;
    setTrick(next);
    setPlays((count) => count + 1);
    setLively(true);
    setBlink(true);
    if (reduce) return;
    motion.stopAnimation();
    motion.setValue(0);
    Animated.timing(motion, {
      toValue: 1,
      duration: next === "spin" ? 900 : 700,
      easing: next === "spin" ? Easing.inOut(Easing.cubic) : Easing.linear,
      useNativeDriver: true,
    }).start();
  }

  const transform =
    trick === "jump"
      ? [
          {
            translateY: motion.interpolate({
              inputRange: [0, 0.12, 0.45, 0.75, 0.88, 1],
              outputRange: [0, 4, -22, 0, -4, 0],
            }),
          },
          {
            scaleY: motion.interpolate({
              inputRange: [0, 0.12, 0.3, 0.75, 0.82, 1],
              outputRange: [1, 0.86, 1.08, 1, 0.92, 1],
            }),
          },
        ]
      : trick === "spin"
        ? [
            {
              rotate: motion.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }),
            },
          ]
        : [
            {
              rotate: motion.interpolate({
                inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1],
                outputRange: ["0deg", "-14deg", "12deg", "-8deg", "4deg", "0deg"],
              }),
            },
            {
              scaleX: motion.interpolate({
                inputRange: [0, 0.15, 0.35, 1],
                outputRange: [1, 1.12, 0.96, 1],
              }),
            },
          ];

  return (
    <Pressable
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onPress={play}
      hitSlop={12}
      style={{ alignSelf: "center" }}
    >
      <Animated.View style={{ transform }}>
        <SparkDotAvatar
          shape="blob"
          color={tokens.foreground}
          size={MARK + 8}
          mood={lively ? "working" : "idle"}
          seed="spark-app-mark"
          blink={blink}
        />
      </Animated.View>
    </Pressable>
  );
}

function createAppMarkStyles() {
  return StyleSheet.create({
    circle: {
      width: MARK,
      height: MARK,
      borderRadius: MARK / 2,
      overflow: "hidden",
      alignSelf: "center",
    },
    image: {
      position: "absolute",
      width: 1024 * SCALE,
      height: 1024 * SCALE,
      left: -CROP.x * SCALE,
      top: -CROP.y * SCALE,
      tintColor: native.label,
    },
  });
}
