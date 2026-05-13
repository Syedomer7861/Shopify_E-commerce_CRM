"use client";

import { useState } from "react";
import { Calculator, DollarSign, Globe, FileText, ArrowRight, Settings, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import ManualCalculator from "./ManualCalculator";

type Region = "India" | "US" | "UK" | "UAE";
type CalcType = "Net Salary" | "Full Salary Slip" | "PF" | "Gratuity" | "Overtime" | "Leave Encashment" | "Commission";

export default function PayrollCalculator() {
  const [region, setRegion] = useState<Region>("India");
  const [calcType, setCalcType] = useState<CalcType>("Net Salary");

  // Inputs
  const [basic, setBasic] = useState<number | "">("");
  const [gross, setGross] = useState<number | "">("");
  const [yearsOfService, setYearsOfService] = useState<number | "">("");
  const [plDays, setPlDays] = useState<number | "">("");
  const [otHours, setOtHours] = useState<number | "">("");
  const [otRate, setOtRate] = useState<number | "">("");
  
  // Advanced features inputs
  const [tasksCompleted, setTasksCompleted] = useState<number | "">("");
  const [baseTarget, setBaseTarget] = useState<number | "">("");
  const [ratePerTask, setRatePerTask] = useState<number | "">("");
  const [taxRegime, setTaxRegime] = useState<"New" | "Old">("New");

  // ─── Company Policy Settings (HR-Editable) ──────────────────────────────────
  const [showPolicy, setShowPolicy] = useState(false);
  const [policy, setPolicy] = useState({
    basicPct: 50,          // Basic as % of Gross
    hraPct: 40,            // HRA as % of Basic
    employeePfPct: 12,     // Employee PF %
    employerEpsPct: 8.33,  // Employer EPS % (capped)
    employerEpsCap: 1250,  // EPS monthly cap (₹)
    profTax: 200,          // Professional Tax per month
    workingDays: 26,       // Working days per month
    workingHrsPerDay: 8,   // Working hours per day
    otMultiplier: 2,       // OT pay multiplier (1.5 or 2)
    gratuityCapLakh: 20,   // Gratuity tax-free cap in Lakhs
    gratuityEligibleYrs: 5,// Min years for gratuity
  });

  const updatePolicy = (key: keyof typeof policy, val: number) =>
    setPolicy(prev => ({ ...prev, [key]: val }));
  const resetPolicy = () => setPolicy({
    basicPct: 50, hraPct: 40, employeePfPct: 12, employerEpsPct: 8.33,
    employerEpsCap: 1250, profTax: 200, workingDays: 26,
    workingHrsPerDay: 8, otMultiplier: 2, gratuityCapLakh: 20, gratuityEligibleYrs: 5,
  });

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat(
      region === 'India' ? 'en-IN' : region === 'US' ? 'en-US' : region === 'UK' ? 'en-GB' : 'en-AE',
      {
        style: 'currency',
        currency: region === 'India' ? 'INR' : region === 'US' ? 'USD' : region === 'UK' ? 'GBP' : 'AED',
        maximumFractionDigits: 0
      }
    ).format(val);
  };

  // ─── Accurate Indian TDS Calculator (FY 2024-25) ───────────────────────────
  const calcIndiaTDS = (annualGross: number, basic: number, regime: "New" | "Old"): number => {
    const stdDeduction = 50000;
    if (regime === "New") {
      // New Regime Slabs FY2024-25 (post-Budget 2024)
      const taxable = Math.max(0, annualGross - stdDeduction);
      if (taxable <= 300000) return 0;
      // Rebate u/s 87A: zero tax if taxable ≤ 7L
      let tax = 0;
      if (taxable <= 700000) { tax = (taxable - 300000) * 0.05; return tax <= 25000 ? 0 : tax / 12; }
      tax += (700000 - 300000) * 0.05; // ₹20,000
      if (taxable <= 1000000) { tax += (taxable - 700000) * 0.10; }
      else { tax += 300000 * 0.10; }
      if (taxable <= 1200000) { if (taxable > 1000000) tax += (taxable - 1000000) * 0.15; }
      else { tax += 200000 * 0.15; }
      if (taxable <= 1500000) { if (taxable > 1200000) tax += (taxable - 1200000) * 0.20; }
      else { tax += 300000 * 0.20; if (taxable > 1500000) tax += (taxable - 1500000) * 0.30; }
      return Math.round(tax / 12);
    } else {
      // Old Regime Slabs
      const pfAnnual = basic * 0.12 * 12;
      const taxable = Math.max(0, annualGross - stdDeduction - Math.min(pfAnnual, 150000)); // 80C
      if (taxable <= 250000) return 0;
      if (taxable <= 500000) {
        const tax = (taxable - 250000) * 0.05;
        return tax <= 12500 ? 0 : Math.round(tax / 12); // Rebate u/s 87A
      }
      let tax = 12500;
      if (taxable <= 1000000) tax += (taxable - 500000) * 0.20;
      else { tax += 500000 * 0.20; tax += (taxable - 1000000) * 0.30; }
      return Math.round(tax / 12);
    }
  };

  const calculateResults = () => {
    if (calcType === "PF") {
      // As per EPF Act 1952: Employee = 12% of Basic, Employer = 3.67% EPF + 8.33% EPS
      const basicVal = Number(basic) || 0;
      const employeeEPF = Math.round(basicVal * (policy.employeePfPct / 100));
      // EPS capped per policy
      const employerEPS = Math.min(Math.round(basicVal * (policy.employerEpsPct / 100)), policy.employerEpsCap);
      const employerEPF = employeeEPF - employerEPS;
      return {
        isPF: true,
        employeeEPF, employerEPF: Math.max(0, employerEPF), employerEPS,
        label1: `Employee EPF (${policy.employeePfPct}% of Basic)`, val1: employeeEPF,
        label2: `Employer EPS (${policy.employerEpsPct}%, max ₹${policy.employerEpsCap})`, val2: employerEPS,
        totalLabel: "Total Monthly PF Outflow", total: employeeEPF + Math.max(0, employerEPF) + employerEPS
      };
    }

    if (calcType === "Gratuity") {
      // Payment of Gratuity Act 1972: (Basic+DA) × 15 ÷ 26 × Years
      const basicVal = Number(basic) || 0;
      const years = Number(yearsOfService) || 0;
      const capAmount = policy.gratuityCapLakh * 100000;
      const raw = (basicVal * 15 * years) / policy.workingDays;
      const amount = Math.min(raw, capAmount);
      return {
        label1: "Years of Service", val1: years,
        label2: "Monthly Basic Pay", val2: basicVal,
        gratuityNote: years < policy.gratuityEligibleYrs
          ? `⚠️ Min. ${policy.gratuityEligibleYrs} yrs required for eligibility`
          : `✓ Eligible — capped at ₹${policy.gratuityCapLakh}L tax-free`,
        totalLabel: "Gratuity Payout (Estimated)", total: amount
      };
    }

    if (calcType === "Net Salary") {
      const grossVal = Number(gross) || 0;
      let tds = 0;
      let pfDeduction = 0;
      let pt = 0;

      if (region === "India") {
        const basicEst = grossVal * (policy.basicPct / 100);
        pfDeduction = Math.round(basicEst * (policy.employeePfPct / 100));
        pt = policy.profTax;
        tds = calcIndiaTDS(grossVal * 12, basicEst, taxRegime);
      } else if (region === "US") {
        tds = Math.round(grossVal * 0.22);
        pfDeduction = Math.round(grossVal * 0.06);
      } else if (region === "UK") {
        tds = grossVal > 1047 ? Math.round((grossVal - 1047) * 0.20) : 0;
      } else if (region === "UAE") {
        tds = 0;
      }

      const net = grossVal - tds - pfDeduction - pt;
      return {
        label1: region === "India" ? `TDS / Income Tax (${taxRegime} Regime)` : "Income Tax",
        val1: tds,
        label2: region === "India" ? `EPF (${policy.employeePfPct}%) + Prof. Tax` : region === "US" ? "401(k) Deduction" : "Other Deductions",
        val2: pfDeduction + (region === "India" ? pt : 0),
        totalLabel: "In-Hand Monthly Salary", total: net
      };
    }

    if (calcType === "Leave Encashment") {
      const basicVal = Number(basic) || 0;
      const days = Number(plDays) || 0;
      const perDay = Math.round(basicVal / policy.workingDays);
      return {
        label1: `Per Day Value (Basic ÷ ${policy.workingDays})`, val1: perDay,
        label2: "Privilege Leaves to Encash", val2: days,
        totalLabel: "Total Leave Encashment", total: perDay * days
      };
    }

    if (calcType === "Overtime") {
      const hours = Number(otHours) || 0;
      const rate = Number(otRate) || 0;
      const otPay = hours * rate * policy.otMultiplier;
      return {
        label1: "OT Hours Logged", val1: hours,
        label2: "Ordinary Hourly Rate", val2: rate,
        totalLabel: `OT Payout (${policy.otMultiplier}× Rate)`, total: otPay
      };
    }

    if (calcType === "Commission") {
      const tasks = Number(tasksCompleted) || 0;
      const target = Number(baseTarget) || 0;
      const rate = Number(ratePerTask) || 0;
      const excessTasks = Math.max(0, tasks - target);
      return {
        label1: "Excess Tasks (Above Target)", val1: excessTasks,
        label2: "Bonus Rate per Excess Task", val2: rate,
        totalLabel: "Performance Bonus Earned", total: excessTasks * rate
      };
    }

    if (calcType === "Full Salary Slip") {
      const grossVal = Number(gross) || 0;
      const basicPay = Math.round(grossVal * (policy.basicPct / 100));
      const hra = Math.round(basicPay * (policy.hraPct / 100));
      const special = grossVal - basicPay - hra;
      const pf = region === "India" ? Math.round(basicPay * (policy.employeePfPct / 100)) : Math.round(grossVal * 0.05);
      const pt = region === "India" ? policy.profTax : 0;
      const tds = region === "India" ? calcIndiaTDS(grossVal * 12, basicPay, taxRegime) : Math.round(grossVal * 0.20);
      const totalDeductions = pf + pt + tds;
      const netPay = grossVal - totalDeductions;
      return {
        isSlip: true,
        basic: basicPay, hra, special,
        pf, pt, tax: tds,
        gross: grossVal,
        totalLabel: "Final Net Payable", total: netPay
      };
    }

    return null;
  };

  const res = calculateResults();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Left Config Panel */}
      <div className="lg:col-span-4 space-y-6">
        <div className="card p-6">
          <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest mb-6 flex items-center gap-3">
             <Globe className="w-5 h-5 text-gray-400" /> Configuration
          </h3>
          
          <div className="space-y-5">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Operating Region</label>
              <div className="flex gap-2">
                 {(['India', 'US', 'UK', 'UAE'] as Region[]).map(r => (
                   <button
                     key={r}
                     onClick={() => setRegion(r)}
                     className={cn(
                       "flex-1 py-2 text-xs font-bold rounded-lg transition-all border",
                       region === r ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                     )}
                   >
                     {r}
                   </button>
                 ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Calculator Type</label>
              <select 
                className="input w-full"
                value={calcType}
                onChange={e => setCalcType(e.target.value as CalcType)}
              >
                <option value="Net Salary">Net Pay / Take-Home Estimator</option>
                <option value="Full Salary Slip">Full Salary Slip Generator</option>
                {region === 'India' && <option value="PF">Provident Fund (PF) Split</option>}
                <option value="Gratuity">End-of-Service Gratuity</option>
                <option value="Leave Encashment">PL / Leave Encashment</option>
                <option value="Overtime">Overtime (OT) Payout</option>
                <option value="Commission">Performance / Task Commission</option>
              </select>
              <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                {calcType === "Net Salary" && "Estimates monthly take-home after TDS, EPF & Professional Tax."}
                {calcType === "Full Salary Slip" && "Generates a complete CTC breakdown with earnings & deductions."}
                {calcType === "PF" && "Splits EPF contributions per EPF Act 1952 — Employee 12%, Employer 3.67% EPF + 8.33% EPS."}
                {calcType === "Gratuity" && "As per Payment of Gratuity Act 1972. Minimum 5 years required. Capped at ₹20L tax-free."}
                {calcType === "Leave Encashment" && "Cash value of unused Earned Leaves (EL/PL). Formula: Basic ÷ 26 × Days."}
                {calcType === "Overtime" && "Per Factories Act 1948, Sec 59 — OT is paid at 2× the ordinary hourly rate."}
                {calcType === "Commission" && "Calculates variable bonus for tasks completed above the monthly baseline target."}
              </p>
            </div>

            {(calcType === 'Full Salary Slip' || calcType === 'Net Salary') && region === 'India' && (
              <div>
                 <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Tax Regime</label>
                 <div className="flex gap-2">
                   {(['New', 'Old'] as const).map(r => (
                     <button
                       key={r}
                       onClick={() => setTaxRegime(r)}
                       className={cn(
                         "flex-1 py-2 text-xs font-bold rounded-lg transition-all border",
                         taxRegime === r ? "bg-[#1c1c1c] text-white border-[#1c1c1c]" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                       )}
                     >
                       {r} Regime
                     </button>
                   ))}
                 </div>
                 <p className="text-[10px] text-gray-400 mt-1.5">
                   {taxRegime === "New" ? "New: Lower slabs, no exemptions. Best if deductions < ₹1.5L." : "Old: Higher slabs but allows 80C, HRA, LTA exemptions."}
                 </p>
              </div>
            )}
          </div>
        </div>

        {/* ─── Company Policy Settings Card ─────────────────────────── */}
        <div className="card overflow-hidden">
          <button
            onClick={() => setShowPolicy(p => !p)}
            className="w-full flex items-center justify-between p-5 hover:bg-[rgba(28,28,28,0.03)] transition-colors"
          >
            <div className="flex items-center gap-3">
              <Settings className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest">Company Policy Settings</span>
              {JSON.stringify(policy) !== JSON.stringify({basicPct:50,hraPct:40,employeePfPct:12,employerEpsPct:8.33,employerEpsCap:1250,profTax:200,workingDays:26,workingHrsPerDay:8,otMultiplier:2,gratuityCapLakh:20,gratuityEligibleYrs:5}) && (
                <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">CUSTOM</span>
              )}
            </div>
            {showPolicy ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {showPolicy && (
            <div className="px-5 pb-5 border-t border-[#eceae4]">
              <div className="flex justify-between items-center py-3 mb-2">
                <p className="text-[10px] text-gray-400">Override defaults for your company policy. All calculations will reflect these values.</p>
                <button onClick={resetPolicy} className="flex items-center gap-1 text-[10px] font-bold text-rose-400 hover:text-rose-600">
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>

              <div className="space-y-3">
                {/* Earnings Structure */}
                <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest pt-1">Earnings Structure</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 block mb-1">Basic % of Gross</label>
                    <div className="flex items-center gap-1">
                      <input type="number" min={1} max={90} className="input w-full text-sm" value={policy.basicPct}
                        onChange={e => updatePolicy("basicPct", Number(e.target.value))} />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 block mb-1">HRA % of Basic</label>
                    <div className="flex items-center gap-1">
                      <input type="number" min={1} max={60} className="input w-full text-sm" value={policy.hraPct}
                        onChange={e => updatePolicy("hraPct", Number(e.target.value))} />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                  </div>
                </div>

                {/* PF Settings */}
                <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest pt-1">PF / EPF Settings</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 block mb-1">Employee PF %</label>
                    <div className="flex items-center gap-1">
                      <input type="number" min={1} max={20} className="input w-full text-sm" value={policy.employeePfPct}
                        onChange={e => updatePolicy("employeePfPct", Number(e.target.value))} />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 block mb-1">Employer EPS %</label>
                    <div className="flex items-center gap-1">
                      <input type="number" min={1} max={15} step={0.01} className="input w-full text-sm" value={policy.employerEpsPct}
                        onChange={e => updatePolicy("employerEpsPct", Number(e.target.value))} />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 block mb-1">EPS Monthly Cap (₹)</label>
                    <input type="number" className="input w-full text-sm" value={policy.employerEpsCap}
                      onChange={e => updatePolicy("employerEpsCap", Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 block mb-1">Prof. Tax / Month (₹)</label>
                    <input type="number" className="input w-full text-sm" value={policy.profTax}
                      onChange={e => updatePolicy("profTax", Number(e.target.value))} />
                  </div>
                </div>

                {/* Attendance & OT */}
                <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest pt-1">Attendance & Overtime</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 block mb-1">Working Days/Month</label>
                    <input type="number" min={20} max={31} className="input w-full text-sm" value={policy.workingDays}
                      onChange={e => updatePolicy("workingDays", Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 block mb-1">Working Hrs/Day</label>
                    <input type="number" min={4} max={12} className="input w-full text-sm" value={policy.workingHrsPerDay}
                      onChange={e => updatePolicy("workingHrsPerDay", Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 block mb-1">OT Pay Multiplier</label>
                    <select className="input w-full text-sm" value={policy.otMultiplier}
                      onChange={e => updatePolicy("otMultiplier", Number(e.target.value))}>
                      <option value={1}>1× (Single Rate)</option>
                      <option value={1.5}>1.5× (Time & Half)</option>
                      <option value={2}>2× (Double Rate — Factories Act)</option>
                    </select>
                  </div>
                </div>

                {/* Gratuity */}
                <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest pt-1">Gratuity Policy</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 block mb-1">Tax-Free Cap (₹ Lakh)</label>
                    <input type="number" className="input w-full text-sm" value={policy.gratuityCapLakh}
                      onChange={e => updatePolicy("gratuityCapLakh", Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 block mb-1">Min Eligibility (Yrs)</label>
                    <input type="number" min={1} max={10} className="input w-full text-sm" value={policy.gratuityEligibleYrs}
                      onChange={e => updatePolicy("gratuityEligibleYrs", Number(e.target.value))} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="card p-6">
          <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest mb-6 flex items-center gap-3">
             <Calculator className="w-5 h-5 text-gray-400" /> Input Parameters
          </h3>
          <div className="space-y-4">
             {(calcType === "Net Salary" || calcType === "Full Salary Slip") && (
               <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Monthly Gross Pay (CTC ÷ 12)</label>
                  <input type="number" className="input w-full" value={gross} onChange={e => setGross(Number(e.target.value))} placeholder="e.g., 50000" />
                  <p className="text-[10px] text-gray-400 mt-1">Total monthly salary before any deductions (Basic + HRA + Allowances).</p>
               </div>
             )}

             {["PF", "Gratuity", "Leave Encashment"].includes(calcType) && (
               <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Monthly Basic Pay</label>
                  <input type="number" className="input w-full" value={basic} onChange={e => setBasic(Number(e.target.value))} placeholder="e.g., 20000" />
                  <p className="text-[10px] text-gray-400 mt-1">
                    {calcType === "PF" && "PF is calculated on Basic Pay only. Typically 40–50% of Gross."}
                    {calcType === "Gratuity" && "Gratuity is calculated on last drawn Basic + DA. Enter current Basic."}
                    {calcType === "Leave Encashment" && "Encashment uses Basic Pay ÷ 26 working days to derive per-day value."}
                  </p>
               </div>
             )}

             {calcType === "Gratuity" && (
               <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Completed Years of Service</label>
                  <input type="number" className="input w-full" value={yearsOfService} onChange={e => setYearsOfService(Number(e.target.value))} placeholder="e.g., 7" />
                  <p className="text-[10px] text-gray-400 mt-1">Only full completed years count. Partial years are ignored per the Act.</p>
               </div>
             )}

             {calcType === "Leave Encashment" && (
               <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Unused Privilege / Earned Leaves</label>
                  <input type="number" className="input w-full" value={plDays} onChange={e => setPlDays(Number(e.target.value))} placeholder="e.g., 12" />
                  <p className="text-[10px] text-gray-400 mt-1">Enter balance of EL/PL leaves. CL & SL are typically not encashable.</p>
               </div>
             )}

             {calcType === "Overtime" && (
               <>
                 <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">OT Hours Logged</label>
                    <input type="number" className="input w-full" value={otHours} onChange={e => setOtHours(Number(e.target.value))} placeholder="e.g., 10" />
                    <p className="text-[10px] text-gray-400 mt-1">Hours worked beyond 9 hrs/day or 48 hrs/week qualify as overtime.</p>
                 </div>
                 <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Ordinary Hourly Rate (₹)</label>
                    <input type="number" className="input w-full" value={otRate} onChange={e => setOtRate(Number(e.target.value))} placeholder="e.g., 150" />
                    <p className="text-[10px] text-gray-400 mt-1">Tip: Monthly Salary ÷ (26 days × 8 hrs) = hourly rate. OT is paid at 2× this.</p>
                 </div>
               </>
             )}

             {calcType === "Commission" && (
               <>
                 <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Total Tasks Completed</label>
                    <input type="number" className="input w-full" value={tasksCompleted} onChange={e => setTasksCompleted(Number(e.target.value))} placeholder="e.g., 120" />
                 </div>
                 <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Monthly Baseline Target</label>
                    <input type="number" className="input w-full" value={baseTarget} onChange={e => setBaseTarget(Number(e.target.value))} placeholder="e.g., 100" />
                    <p className="text-[10px] text-gray-400 mt-1">Tasks at or below target earn no bonus. Bonus triggers only for excess.</p>
                 </div>
                 <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Bonus Rate per Excess Task (₹)</label>
                    <input type="number" className="input w-full" value={ratePerTask} onChange={e => setRatePerTask(Number(e.target.value))} placeholder="e.g., 50" />
                 </div>
               </>
             )}
          </div>
        </div>
      </div>

      {/* Right Output Panel */}
      <div className="lg:col-span-5">
        <div id="printable-card" className="card p-8 h-full bg-[#1c1c1c] text-white flex flex-col justify-between relative overflow-hidden">
           <div className="absolute top-0 right-0 p-8 opacity-10">
              <DollarSign size={150} />
           </div>
           
           <div>
             <div className="inline-block px-3 py-1 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-8">
               {region} • {calcType}
             </div>

             {res && !res.isSlip && !res.isPF && (
               <div className="space-y-5 relative z-10">
                  <div className="flex justify-between items-end border-b border-white/10 pb-4">
                     <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">{res.label1}</span>
                     <span className="text-lg font-black">
                       {['Gratuity','Overtime','Commission'].includes(calcType) && (res.label1?.includes('Years') || res.label1?.includes('Hours') || res.label1?.includes('Excess'))
                         ? res.val1 : formatCurrency(res.val1 as number)}
                     </span>
                  </div>
                  <div className="flex justify-between items-end border-b border-white/10 pb-4">
                     <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">{res.label2}</span>
                     <span className="text-lg font-black">{formatCurrency(res.val2 as number)}</span>
                  </div>
                  {res.gratuityNote && (
                    <div className={`text-xs font-bold px-3 py-2 rounded-lg ${res.gratuityNote.startsWith('⚠️') ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                      {res.gratuityNote}
                    </div>
                  )}
               </div>
             )}

             {res && res.isPF && (
               <div className="space-y-4 relative z-10">
                 <div className="flex justify-between items-center border-b border-white/10 pb-3">
                   <div><span className="text-xs text-gray-400 font-bold uppercase tracking-widest">Employee EPF (12%)</span><p className="text-[9px] text-gray-600 mt-0.5">Goes directly to EPF account</p></div>
                   <span className="text-lg font-black">{formatCurrency(res.employeeEPF as number)}</span>
                 </div>
                 <div className="flex justify-between items-center border-b border-white/10 pb-3">
                   <div><span className="text-xs text-gray-400 font-bold uppercase tracking-widest">Employer EPF (3.67%)</span><p className="text-[9px] text-gray-600 mt-0.5">Employer share to EPF</p></div>
                   <span className="text-lg font-black">{formatCurrency(res.employerEPF as number)}</span>
                 </div>
                 <div className="flex justify-between items-center border-b border-white/10 pb-3">
                   <div><span className="text-xs text-gray-400 font-bold uppercase tracking-widest">Employer EPS (8.33%, max ₹1,250)</span><p className="text-[9px] text-gray-600 mt-0.5">Employee Pension Scheme</p></div>
                   <span className="text-lg font-black">{formatCurrency(res.employerEPS as number)}</span>
                 </div>
               </div>
             )}

             {res && res.isSlip && (
               <div className="grid grid-cols-2 gap-6 relative z-10">
                 <div>
                   <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-3">Earnings</h4>
                   <div className="space-y-3">
                     <div className="flex justify-between text-sm"><span className="text-gray-400">Basic (50%)</span> <span className="font-bold">{formatCurrency(res.basic as number)}</span></div>
                     <div className="flex justify-between text-sm"><span className="text-gray-400">HRA (40% of Basic)</span> <span className="font-bold">{formatCurrency(res.hra as number)}</span></div>
                     <div className="flex justify-between text-sm"><span className="text-gray-400">Special Allowance</span> <span className="font-bold">{formatCurrency(res.special as number)}</span></div>
                   </div>
                 </div>
                 <div>
                   <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-3">Deductions</h4>
                   <div className="space-y-3">
                     <div className="flex justify-between text-sm"><span className="text-gray-400">EPF (12% of Basic)</span> <span className="font-bold">{formatCurrency(res.pf as number)}</span></div>
                     <div className="flex justify-between text-sm"><span className="text-gray-400">Prof. Tax (MH)</span> <span className="font-bold">{formatCurrency(res.pt as number)}</span></div>
                     <div className="flex justify-between text-sm"><span className="text-gray-400">TDS ({taxRegime} Regime)</span> <span className="font-bold">{formatCurrency(res.tax as number)}</span></div>
                   </div>
                 </div>
               </div>
             )}
           </div>

           <div className="mt-12 relative z-10">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">{res?.totalLabel}</p>
              <div className="text-6xl font-black tracking-tighter text-emerald-400">
                 {res ? formatCurrency(res.total as number) : formatCurrency(0)}
              </div>
              <button onClick={() => window.print()} className="no-print mt-8 flex items-center gap-2 text-xs font-bold text-white hover:text-emerald-400 transition-colors">
                <FileText className="w-4 h-4" /> Export as PDF Summary <ArrowRight className="w-3 h-3" />
              </button>
           </div>
        </div>
      </div>

      {/* Manual Calculator – third column */}
      <div className="lg:col-span-3">
        <ManualCalculator />
      </div>
    </div>
  );
}
