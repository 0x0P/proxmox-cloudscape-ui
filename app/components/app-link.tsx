"use client";

import { useRouter } from "next/navigation";
import CloudscapeLink, { type LinkProps } from "@cloudscape-design/components/link";

export default function AppLink(props: LinkProps) {
  const router = useRouter();

  const handleFollow: LinkProps["onFollow"] = (e) => {
    if (props.external || !props.href) {
      props.onFollow?.(e);
      return;
    }
    e.preventDefault();
    router.push(props.href);
    props.onFollow?.(e);
  };

  return <CloudscapeLink {...props} onFollow={handleFollow} />;
}
