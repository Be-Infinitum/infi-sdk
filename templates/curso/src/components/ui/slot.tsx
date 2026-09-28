import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

/** The one-child "render as" of Radix Slot, without the dependency. */
export function Slot({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  const child = Children.only(children);
  if (!isValidElement(child)) return null;
  const el = child as ReactElement<Record<string, unknown>>;
  return cloneElement(el, { ...props, ...el.props, className: [props.className, el.props.className].filter(Boolean).join(" ") });
}
