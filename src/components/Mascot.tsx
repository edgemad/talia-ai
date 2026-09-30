import { motion } from "framer-motion";
import blobUrl from "/mascot.svg";
import dinoUrl from "/dino.svg";

export type MascotKind = "blob" | "dino" | "cat";

/** Which mascot each theme shows. */
export const THEME_MASCOT: Record<string, MascotKind> = {
  sakura: "blob",
  ocean: "blob",
  matcha: "blob",
  midnight: "blob",
  dino: "dino",
};

const URLS: Record<MascotKind, string> = {
  blob: blobUrl,
  dino: dinoUrl,
  cat: "",
};

export function Mascot({
  size = 44,
  thinking = false,
  theme = "sakura",
  className = "",
}: {
  size?: number;
  thinking?: boolean;
  theme?: string;
  className?: string;
}) {
  const kind = THEME_MASCOT[theme] ?? "blob";
  const src = URLS[kind] || blobUrl;

  return (
    <motion.div
      className={`inline-block select-none ${theme === "dino" ? "dino-bob" : ""} ${className}`}
      animate={thinking ? { y: [0, -4, 0] } : { y: 0 }}
      transition={
        thinking ? { repeat: Infinity, duration: 1.1, ease: "easeInOut" } : { duration: 0.2 }
      }
    >
      <motion.img
        src={src}
        alt="Talia mascot"
        width={size}
        height={size}
        draggable={false}
        whileHover={{ rotate: [0, -6, 6, 0], scale: 1.06 }}
        transition={{ duration: 0.45 }}
      />
    </motion.div>
  );
}
