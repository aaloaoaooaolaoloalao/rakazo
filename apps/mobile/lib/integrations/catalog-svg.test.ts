import type { XmlAST } from "react-native-svg";
import { expect, it } from "vitest";
import { catalogSvgStyles } from "./catalog-svg";

function node(style: Record<string, string>): XmlAST {
  return { tag: "svg", props: { style }, children: [], parent: null, Tag: () => null };
}

it("removes priority suffixes from native SVG lengths", () => {
  const root = node({ strokeWidth: "26.83px !important", opacity: "1!important" });
  catalogSvgStyles(root);
  expect(root.props.style).toEqual({ strokeWidth: "26.83px", opacity: "1" });
});

it("normalizes mixed-case suffixes on child nodes", () => {
  const root = node({});
  const child = node({ width: "32px !IMPORTANT  " });
  root.children.push(child);
  catalogSvgStyles(root);
  expect(child.props.style).toEqual({ width: "32px" });
});

it("removes priorities written with a space after the bang", () => {
  const root = node({ strokeWidth: "26.83px ! important", fill: "important" });
  catalogSvgStyles(root);
  expect(root.props.style).toEqual({ strokeWidth: "26.83px", fill: "important" });
});

it("preserves artwork text and unrelated attributes", () => {
  const root = node({});
  root.children.push(' style="!important"');
  root.props["data-style"] = "!important";
  catalogSvgStyles(root);
  expect(root.children).toEqual([' style="!important"']);
  expect(root.props["data-style"]).toBe("!important");
});

it("handles long whitespace values with no priority suffix", () => {
  const value = `26.83px${" ".repeat(200_000)}`;
  const root = node({ strokeWidth: value });
  catalogSvgStyles(root);
  expect(root.props.style).toEqual({ strokeWidth: value });
});

it("turns percentage gradient stop colors into ones the renderer accepts", () => {
  const root = node({ stopColor: "rgb(12.54902%,65.490196%,98.039216%)" });
  root.props.fill = "rgb(0%, 100%, 50%)";
  catalogSvgStyles(root);
  expect(root.props.style).toEqual({ stopColor: "rgb(32,167,250)" });
  expect(root.props.fill).toBe("rgb(0,255,127)");
});
