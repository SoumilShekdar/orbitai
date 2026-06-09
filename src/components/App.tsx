"use client";

import dynamic from "next/dynamic";

const SceneRoot = dynamic(() => import("./scene/SceneRoot"), { ssr: false });

export default function App() {
  return (
    <main className="fixed inset-0 bg-black">
      <SceneRoot />
    </main>
  );
}
