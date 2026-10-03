// "Make something" — the drawing pad and the paper-folding guide.
//
// This is deliberately separate from Talia's Studio. Studio is for prompting a
// local image model, which is powerful but needs an engine installed first. A
// child who taps "Draw" should get a canvas, not an installation screen, so the
// two things a child actually wants to *do* live together here with no setup.

import { useState } from "react";
import { Modal } from "./ui";
import { SketchPad } from "./SketchPad";
import { PaperFolding } from "./PaperFolding";

type Tab = "draw" | "fold";

export function CreateStudio({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("draw");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "draw", label: "Draw", icon: <span>🎨</span> },
    { id: "fold", label: "Paper folding", icon: <span>📄</span> },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Make something ✂️" icon={<span className="text-xl">🖌️</span>} wide>
      <div className="mb-3 flex gap-1.5 rounded-full p-1" style={{ background: "var(--surface)" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-extrabold transition ${
              tab === t.id ? "glass-strong" : ""
            }`}
            style={{ color: tab === t.id ? "var(--text)" : "var(--text-faint)" }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "draw" ? <SketchPad /> : <PaperFolding />}
    </Modal>
  );
}