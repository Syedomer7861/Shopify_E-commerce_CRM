"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Delete, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type HistoryEntry = { expression: string; result: string };

export default function ManualCalculator() {
  const [display, setDisplay] = useState("0");
  const [expression, setExpression] = useState("");
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const inputDigit = useCallback((digit: string) => {
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === "0" ? digit : display + digit);
    }
  }, [display, waitingForOperand]);

  const inputDecimal = useCallback(() => {
    if (waitingForOperand) {
      setDisplay("0.");
      setWaitingForOperand(false);
      return;
    }
    if (!display.includes(".")) {
      setDisplay(display + ".");
    }
  }, [display, waitingForOperand]);

  const handleOperator = useCallback((op: string) => {
    setExpression(expression + display + " " + op + " ");
    setWaitingForOperand(true);
  }, [display, expression]);

  const calculate = useCallback(() => {
    if (!expression) return;
    const fullExpr = expression + display;
    try {
      // Safe eval via Function
      // eslint-disable-next-line no-new-func
      const result = Function('"use strict"; return (' + fullExpr + ')')();
      const rounded = parseFloat(result.toFixed(10)).toString();
      setHistory(prev => [{ expression: fullExpr + " =", result: rounded }, ...prev].slice(0, 8));
      setDisplay(rounded);
      setExpression("");
      setWaitingForOperand(true);
    } catch {
      setDisplay("Error");
      setExpression("");
      setWaitingForOperand(true);
    }
  }, [display, expression]);

  const toggleSign = useCallback(() => {
    setDisplay((parseFloat(display) * -1).toString());
  }, [display]);

  const percentage = useCallback(() => {
    setDisplay((parseFloat(display) / 100).toString());
  }, [display]);

  const clearAll = useCallback(() => {
    setDisplay("0");
    setExpression("");
    setWaitingForOperand(false);
  }, []);

  const backspace = useCallback(() => {
    if (waitingForOperand) return;
    setDisplay(display.length > 1 ? display.slice(0, -1) : "0");
  }, [display, waitingForOperand]);

  // Keyboard Support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in a real input/textarea elsewhere
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      // Only respond if the calculator is roughly in view or container is active
      // For simplicity, we respond if the key matches a calculator function
      const key = e.key;

      if (key >= "0" && key <= "9") inputDigit(key);
      else if (key === ".") inputDecimal();
      else if (key === "+" || key === "-" || key === "*" || key === "/") {
        e.preventDefault();
        handleOperator(key === "*" ? "*" : key);
      } else if (key === "Enter" || key === "=") {
        e.preventDefault();
        calculate();
      } else if (key === "Backspace") {
        e.preventDefault();
        backspace();
      } else if (key === "Escape" || key === "c" || key === "C") {
        clearAll();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inputDigit, inputDecimal, handleOperator, calculate, backspace, clearAll]);

  type BtnStyle = "operator" | "action" | "equals" | "digit";
  const buttons: { label: string; style: BtnStyle; action: () => void }[] = [
    { label: "AC", style: "action", action: clearAll },
    { label: "+/-", style: "action", action: toggleSign },
    { label: "%", style: "action", action: percentage },
    { label: "÷", style: "operator", action: () => handleOperator("/") },
    { label: "7", style: "digit", action: () => inputDigit("7") },
    { label: "8", style: "digit", action: () => inputDigit("8") },
    { label: "9", style: "digit", action: () => inputDigit("9") },
    { label: "×", style: "operator", action: () => handleOperator("*") },
    { label: "4", style: "digit", action: () => inputDigit("4") },
    { label: "5", style: "digit", action: () => inputDigit("5") },
    { label: "6", style: "digit", action: () => inputDigit("6") },
    { label: "−", style: "operator", action: () => handleOperator("-") },
    { label: "1", style: "digit", action: () => inputDigit("1") },
    { label: "2", style: "digit", action: () => inputDigit("2") },
    { label: "3", style: "digit", action: () => inputDigit("3") },
    { label: "+", style: "operator", action: () => handleOperator("+") },
    { label: "0", style: "digit", action: () => inputDigit("0") },
    { label: ".", style: "digit", action: inputDecimal },
    { label: "⌫", style: "digit", action: backspace },
    { label: "=", style: "equals", action: calculate },
  ];

  const styleMap: Record<BtnStyle, string> = {
    operator: "bg-amber-500 hover:bg-amber-400 text-white font-black",
    action: "bg-[#e0ddd6] hover:bg-[#d4d1ca] text-[#1c1c1c] font-bold",
    equals: "bg-emerald-500 hover:bg-emerald-400 text-white font-black",
    digit: "bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white font-semibold",
  };

  return (
    <div className="space-y-4" ref={containerRef}>
      <div className="card p-5 bg-[#1c1c1c] text-white focus-within:ring-2 ring-emerald-500/50 transition-all outline-none" tabIndex={0}>
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <RotateCcw className="w-3 h-3" /> Manual Calculator
        </h3>

        {/* Display */}
        <div className="bg-black/40 rounded-xl p-4 mb-4 text-right cursor-text" onClick={() => containerRef.current?.focus()}>
          <div className="text-xs text-gray-500 h-5 truncate">{expression || "\u00A0"}</div>
          <div className="text-4xl font-black tracking-tighter text-white truncate mt-1">
            {display}
          </div>
        </div>

        {/* Buttons Grid */}
        <div className="grid grid-cols-4 gap-2">
          {buttons.map((btn) => (
            <button
              key={btn.label}
              onClick={btn.action}
              className={cn(
                "h-14 rounded-xl text-lg transition-all duration-100 active:scale-95 shadow-sm",
                styleMap[btn.style]
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="card p-4">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Calculation History</h4>
            <button onClick={() => setHistory([])} className="text-[10px] text-rose-400 font-bold hover:text-rose-600 flex items-center gap-1">
              <Delete className="w-3 h-3" /> Clear
            </button>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {history.map((h, i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                <span className="text-xs text-gray-400 font-mono">{h.expression}</span>
                <button
                  onClick={() => { setDisplay(h.result); setWaitingForOperand(true); }}
                  className="text-sm font-black text-[#1c1c1c] hover:text-emerald-600 transition-colors"
                >
                  {h.result}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
