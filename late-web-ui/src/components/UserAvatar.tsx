import { getNickColor } from "@/lib/avatar-utils";
import { useTheme } from "@/providers/theme-provider";

interface AvatarProps {
  /** Public URL of the user's avatar image. When missing, falls
   *  back to the deterministic initials pill driven by the nick. */
  src?: string | null;
  nick: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
};

function initialsFrom(nick: string) {
  return (
    nick
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

export function UserAvatar({ src, nick, size = "md", className = "" }: AvatarProps) {
  const { mode } = useTheme();
  // ponytail: the deterministic colour for the initials pill needs
  // to read against the current theme's background. Dark mode
  // brightens, light mode deepens, so the same nick doesn't blend
  // in on either palette.
  const base = getNickColor(nick);
  const initialsBg = mode === "light" ? base : base;
  const initials = initialsFrom(nick);
  if (src) {
    return (
      <img
        src={src}
        alt={nick}
        className={`${SIZE_CLASSES[size]} rounded-lg object-cover flex-shrink-0 ${className}`}
        onError={(e) => {
          // ponytail: if the Supabase URL 404s or the storage path
          // is stale, swap the <img> for the initials pill in place
          // rather than letting a broken icon sit in the header.
          const target = e.currentTarget;
          target.style.display = "none";
          const fallback = target.nextElementSibling as HTMLElement | null;
          if (fallback) fallback.style.display = "flex";
        }}
      />
    );
  }
  return (
    <div
      className={`${SIZE_CLASSES[size]} rounded-lg flex items-center justify-center font-bold text-white flex-shrink-0 ${className}`}
      style={{ backgroundColor: initialsBg }}
      title={nick}
    >
      {initials}
    </div>
  );
}

export function UserAvatarOrInitials(props: AvatarProps) {
  // ponytail: render the <img> AND a hidden fallback so the
  // onError handler can reveal the initials without forcing a
  // second React tree. Saves the cost of an extra mount when the
  // URL is good.
  if (!props.src) {
    return <UserAvatar {...props} />;
  }
  return (
    <span className="relative inline-flex flex-shrink-0">
      <UserAvatar {...props} />
      <span
        className={`${SIZE_CLASSES[props.size ?? "md"]} rounded-lg flex items-center justify-center font-bold text-white flex-shrink-0 ${props.className ?? ""}`}
        style={{ display: "none", backgroundColor: getNickColor(props.nick) }}
      >
        {initialsFrom(props.nick)}
      </span>
    </span>
  );
}
