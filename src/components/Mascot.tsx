import { motion } from "framer-motion";
import mascotUrl from "/mascot.svg";

export function Mascot({
  size = 44,
  thinking = false,
  className = "",
}: {
  size?: number;
  thinking?: boolean;
  className?: string;
}) {
  return (
    <motion.div
      className={`inline-block select-none ${className}`}
      animate={thinking ? { y: [0, -4, 0] } : { y: 0 }}
      transition={
        thinking ? { repeat: Infinity, duration: 1.1, ease: "easeInOut" } : { duration: 0.2 }
      }
    >
      <motion.img
        src={mascotUrl}
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
