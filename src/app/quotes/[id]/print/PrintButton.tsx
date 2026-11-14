"use client";

export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white">
      Print or save as PDF
    </button>
  );
}
