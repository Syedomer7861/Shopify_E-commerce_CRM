"use client";
import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, X, Download, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import { processImport, processAbandonedImport, ImportRow } from "@/lib/import-utils";
import { AccessDenied } from "@/components/ui";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { hasPermission } from "@/lib/permissions";

const MAX_ROWS = 5000;

const REQUIRED_COLS = ["Customer Name", "Phone Number", "Order Date", "Product Name"];
const OPTIONAL_COLS = ["Email", "Order ID", "Delivery Date", "Order Value", "Notes", "Source", "Status"];

const ABANDONED_REQUIRED = ["Customer Name", "Phone Number", "Total Value"];
const ABANDONED_OPTIONAL = ["Email", "Cart Token", "Product List", "Abandoned Date", "Source", "Checkout Stage", "SMS Sent Count", "Whatsapp Sent Count", "Status"];
const CUSTOMER_COLS = ["Alt Phone", "Address", "City", "State", "Zip", "Country"];

type Step = "upload" | "mapping" | "preview" | "done";
type ImportType = "orders" | "abandoned";

export default function ImportPage() {
  const { profile, loading: profileLoading } = useCurrentProfile();
  const [step, setStep] = useState<Step>("upload");
  const [importType, setImportType] = useState<ImportType>("orders");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rawData, setRawData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [data, setData] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState({ imported: 0, skipped: 0 });

  const [metaColumns, setMetaColumns] = useState<Set<string>>(new Set());

  const activeRequired = importType === "orders" ? REQUIRED_COLS : ABANDONED_REQUIRED;
  const activeOptional = importType === "orders" ? OPTIONAL_COLS : ABANDONED_OPTIONAL;
  const activeCustomer = CUSTOMER_COLS;
  const inputRef = useRef<HTMLInputElement>(null);

  const errors = data.filter(r => r._error);
  const valid = data.filter(r => !r._error);

  function handleFile(file: File) {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".csv")) {
      toast.error("Please upload a .xlsx or .csv file");
      return;
    }
    setFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result;
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const fileHeaders = (XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as string[]) || [];
      let rawRows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: "" });

      if (rawRows.length === 0 && fileHeaders.length === 0) {
        toast.error("File is empty");
        return;
      }

      if (rawRows.length > MAX_ROWS) {
        toast.error(`File has ${rawRows.length.toLocaleString()} rows. Only the first ${MAX_ROWS.toLocaleString()} will be imported — split larger files.`);
        rawRows = rawRows.slice(0, MAX_ROWS);
      }

      setHeaders(fileHeaders);
      setRawData(rawRows);
      
      // Auto-suggest mapping
      const mapping: Record<string, string> = {};
      [...activeRequired, ...activeOptional, ...activeCustomer].forEach(col => {
        const colNorm = col.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
        
        const match = fileHeaders.find(h => {
          const hNorm = h.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
          return (
            hNorm === colNorm ||
            hNorm === "cust" + colNorm ||
            hNorm === "customer" + colNorm ||
            hNorm === "order" + colNorm ||
            hNorm === colNorm + "name" ||
            hNorm === colNorm + "phone" ||
            hNorm === colNorm + "email" ||
            (colNorm === "phonenumber" && (hNorm === "phone" || hNorm === "custphone" || hNorm === "contact" || hNorm === "billingphone" || hNorm === "shippingphone" || hNorm === "customermobile" || hNorm === "mobile" || hNorm === "whatsappnumber")) ||
            (colNorm === "customername" && (hNorm === "name" || hNorm === "custname" || hNorm === "billingname" || hNorm === "shippingname" || hNorm === "customer")) ||
            (colNorm === "totalvalue" && (hNorm === "carttotal" || hNorm === "amount" || hNorm === "total" || hNorm === "totalprice" || hNorm === "subtotal" || hNorm === "ordertotal")) ||
            (colNorm === "abandoneddate" && (hNorm === "timeinitiated" || hNorm === "abandonedat" || hNorm === "date" || hNorm === "createdat" || hNorm === "orderabandoneddate")) ||
            (colNorm === "orderdate" && (hNorm === "createdat" || hNorm === "processedat" || hNorm === "date" || hNorm === "orderdate" || hNorm === "shiprocketcreatedat" || hNorm === "orderedat")) ||
            (colNorm === "productlist" && (hNorm === "productname" || hNorm === "items" || hNorm === "lineitemname")) ||
            (colNorm === "productname" && (hNorm === "lineitemname" || hNorm === "item" || hNorm === "product")) ||
            (colNorm === "carttoken" && (hNorm === "cartid" || hNorm === "token" || hNorm === "checkoutid")) ||
            (colNorm === "orderid" && (hNorm === "ordernumber" || hNorm === "name" || hNorm === "id" || hNorm === "orderno" || hNorm === "shopifyorderid")) ||
            (colNorm === "deliverydate" && (hNorm === "deliveredat" || hNorm === "fulfilledat" || hNorm === "deliverydate" || hNorm === "shippedat" || hNorm === "orderdelivereddate" || hNorm === "deliveredon")) ||
            (colNorm === "smssentcount" && (hNorm === "noofsmssent" || hNorm === "sms_sent" || hNorm === "sms")) ||
            (colNorm === "whatsappsentcount" && (hNorm === "noofwhatsappsent" || hNorm === "wa_sent" || hNorm === "whatsapp")) ||
            (colNorm === "source" && (hNorm === "couriercompany" || hNorm === "couriername" || hNorm === "shippingmethod" || hNorm === "channel")) ||
            (colNorm === "status" && (hNorm === "status" || hNorm === "orderstatus" || hNorm === "deliverystatus" || hNorm === "fulfillmentstatus"))
          );
        });
        
        if (match) mapping[col] = match;
        else mapping[col] = ""; // Default empty
      });
      setColumnMapping(mapping);
      setMetaColumns(new Set());
      setStep("mapping");
    };
    reader.readAsArrayBuffer(file);
  }

  function applyMapping() {
      // Check if all required fields are mapped
      const missing = activeRequired.filter(c => !columnMapping[c]);
      if (missing.length > 0) {
          toast.error(`Please map required fields: ${missing.join(", ")}`);
          return;
      }

      const mappedRows = rawData.map((r: any, idx) => {
          const rowData: any = {};
          let rowError = null;

          // Map each field using the specific column chosen by user
          [...activeRequired, ...activeOptional, ...activeCustomer].forEach(col => {
              const excelCol = columnMapping[col];
              if (excelCol) rowData[col] = r[excelCol];
          });

          // Add Custom Meta fields
          const customMeta: Record<string, any> = {};
          metaColumns.forEach(header => {
              // Only add if not already mapped to a core field
              const isMapped = Object.values(columnMapping).includes(header);
              if (!isMapped && r[header] !== undefined) {
                  customMeta[header] = r[header];
              }
          });
          if (Object.keys(customMeta).length > 0) {
              rowData["Custom Meta"] = customMeta;
          }

          // Validation
          activeRequired.forEach(col => {
              if (!rowData[col]) rowError = `Row ${idx + 1}: Missing ${col}`;
          });

          return { ...rowData, _n: idx + 1, _error: rowError };
      });

      setData(mappedRows);
      setStep("preview");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function confirmImport() {
    const isDemo = document.cookie.includes("crm-demo-mode=true");
    if (isDemo) {
      setImporting(true);
      setTimeout(() => {
        setResults({ imported: valid.length, skipped: 0 });
        setStep("done");
        setImporting(false);
        toast.success("Demo: Simulated import successful!");
      }, 1500);
      return;
    }

    setImporting(true);
    try {
      const result = importType === "orders" 
        ? await processImport(valid as any[])
        : await processAbandonedImport(valid as any[]);
        
      setResults({ imported: result.imported, skipped: data.length - result.imported });
      
      // Auto-trigger task generator to ensure tasks appear immediately
      if (result.imported > 0) {
        toast.promise(
          fetch("/api/cron/task-generator", { method: "POST" }),
          {
            loading: "Generating tasks...",
            success: "Tasks generated successfully!",
            error: "Imported, but task generation failed."
          }
        );
      }
      
      setStep("done");
    } catch (err) {
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setStep("upload");
    setFileName("");
    setData([]);
  }

  function downloadTemplate() {
    const headers = [...activeRequired, ...activeOptional].join(",");
    const blob = new Blob([headers], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = importType === "orders" ? "standard_orders_template.csv" : "abandoned_carts_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${importType === "orders" ? "Standard" : "Abandoned"} template downloaded`);
  }

  if (profileLoading) {
    return <div className="py-12 text-center text-gray-400">Loading permissions...</div>;
  }

  if (!hasPermission(profile, "can_import")) {
    return <AccessDenied title="Import Locked" desc="You need import permission to upload customer or order files." />;
  }

  return (
    <div className="animate-fade-in max-w-4xl">
      <PageHeader
        title="Excel Import"
        subtitle="Upload historical or offline customer and order data"
        actions={
          <button onClick={downloadTemplate} className="btn-secondary">
            <Download className="w-4 h-4" /> Download {importType === "orders" ? "Standard" : "Abandoned"} Template
          </button>
        }
      />

      {document.cookie.includes("crm-demo-mode=true") && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 animate-pulse">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <p className="text-xs font-black text-amber-900 uppercase tracking-widest">Presentation Mode Active</p>
            <p className="text-[11px] text-amber-700 font-medium">Imports will be simulated. No data will be written to the production database.</p>
          </div>
        </div>
      )}

      {/* Progress steps */}
      <div className="flex items-center gap-2 mb-6">
        {(["upload", "mapping", "preview", "done"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all",
              step === s ? "bg-[#1c1c1c] text-white" : (["mapping","preview","done"].includes(step) && i < ["upload","mapping","preview","done"].indexOf(step)) ? "bg-[#1c1c1c] text-white" : "bg-gray-100 text-gray-400"
            )}>
              {(["mapping","preview","done"].includes(step) && i < ["upload","mapping","preview","done"].indexOf(step)) ? "✓" : i + 1}
            </div>
            <span className={cn("text-xs font-medium capitalize", step === s ? "text-[#1c1c1c]" : "text-gray-400")}>{s}</span>
            {i < 3 && <div className={cn("w-8 h-0.5", (step !== "upload" && i === 0) || (["preview","done"].includes(step) && i <= 1) || (step === "done" && i === 2) ? "bg-[#1c1c1c]" : "bg-gray-200")} />}
          </div>
        ))}
      </div>

      {step === "upload" && (
        <div className="space-y-4">
          {/* Type Toggle */}
          <div className="flex p-1 bg-gray-100 rounded-xl w-fit">
            <button 
              onClick={() => { setImportType("orders"); reset(); }}
              className={cn("px-4 py-1.5 text-xs font-semibold rounded-lg transition-all", 
                importType === "orders" ? "bg-white text-[#1c1c1c] shadow-sm" : "text-gray-500 hover:text-gray-700")}
            > Standard Orders </button>
            <button 
              onClick={() => { setImportType("abandoned"); reset(); }}
              className={cn("px-4 py-1.5 text-xs font-semibold rounded-lg transition-all", 
                importType === "abandoned" ? "bg-white text-[#1c1c1c] shadow-sm" : "text-gray-500 hover:text-gray-700")}
            > Abandoned Carts </button>
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all",
              dragging ? "border-[#1c1c1c] bg-[#1c1c1c]/5 scale-[1.01]" : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
            )}
          >
            <input ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <div className="w-14 h-14 rounded-2xl bg-[#1c1c1c]/5 flex items-center justify-center mx-auto mb-4">
              <Upload className="w-7 h-7 text-[#1c1c1c]" />
            </div>
            <div className="text-base font-semibold text-[#1c1c1c] mb-1">Drop your Excel file here</div>
            <div className="text-sm text-gray-400 mb-4">or click to browse · .xlsx or .csv · up to 5,000 rows</div>
            <button className="btn-primary mx-auto">
              <FileSpreadsheet className="w-4 h-4" /> Choose File
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4">
              <div className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded bg-rose-100 text-rose-600 flex items-center justify-center text-[10px] font-bold">R</span>
                Required columns
              </div>
              <div className="space-y-1">
                {activeRequired.map(c => (
                  <div key={c} className="flex items-center gap-2 text-xs text-gray-600">
                    <CheckCircle className="w-3 h-3 text-[#1c1c1c] flex-shrink-0" /> {c}
                  </div>
                ))}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded bg-[#eceae4] text-[#1c1c1c] flex items-center justify-center text-[10px] font-bold">O</span>
                Optional columns
              </div>
              <div className="space-y-1">
                {activeOptional.map(c => (
                  <div key={c} className="flex items-center gap-2 text-xs text-gray-400">
                    <div className="w-3 h-3 rounded-full border border-gray-300 flex-shrink-0" /> {c}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card p-4 bg-amber-50 border-amber-200 text-xs text-amber-700">
            <div className="font-semibold mb-1 uppercase tracking-wider text-[10px]">Smart mapping enabled</div>
            <p>Our system automatically aligns your Excel columns even if headers don&apos;t match exactly. Numbers are cleaned and duplicates are merged by phone.</p>
          </div>
        </div>
      )}

      {step === "mapping" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <div>
              <h3 className="text-sm font-semibold text-[#1c1c1c]">Map Excel Columns</h3>
              <p className="text-xs text-gray-500">Align your file&apos;s headers with the CRM fields below.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={reset} className="btn-secondary text-xs">Cancel</button>
              <button onClick={applyMapping} className="btn-primary text-xs">Next: Preview Data</button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Required Field Mapping */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <span className="w-4 h-4 rounded bg-rose-100 text-rose-600 flex items-center justify-center text-[10px] font-bold">R</span>
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Required Fields</h4>
              </div>
              <div className="card divide-y divide-gray-50 overflow-hidden">
                {activeRequired.map(col => (
                  <div key={col} className="p-3 flex items-center justify-between gap-4">
                    <div className="min-w-[120px]">
                      <div className="text-xs font-semibold text-gray-700">{col}</div>
                      <div className="text-[10px] text-gray-400">Essential for import</div>
                    </div>
                    <select 
                      className="select flex-1 text-xs py-1.5" 
                      value={columnMapping[col] || ""} 
                      onChange={e => setColumnMapping(prev => ({ ...prev, [col]: e.target.value }))}
                    >
                      <option value="">Select column...</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Optional Field Mapping */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <span className="w-4 h-4 rounded bg-[#eceae4] text-[#1c1c1c] flex items-center justify-center text-[10px] font-bold">O</span>
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Optional Fields</h4>
              </div>
              <div className="card divide-y divide-gray-50 overflow-hidden">
                {activeOptional.map(col => (
                  <div key={col} className="p-3 flex items-center justify-between gap-4">
                    <div className="min-w-[120px]">
                      <div className="text-xs font-medium text-gray-600">{col}</div>
                      <div className="text-[10px] text-gray-400 italic">Optional data</div>
                    </div>
                    <select 
                      className="select flex-1 text-xs py-1.5 border-gray-100 text-gray-500" 
                      value={columnMapping[col] || ""} 
                      onChange={e => setColumnMapping(prev => ({ ...prev, [col]: e.target.value }))}
                    >
                      <option value="">Ignore this field</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Customer Details Mapping */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <span className="w-4 h-4 rounded bg-[#eceae4] text-[#1c1c1c] flex items-center justify-center text-[10px] font-bold">C</span>
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Customer Details</h4>
              </div>
              <div className="card divide-y divide-gray-50 overflow-hidden">
                {activeCustomer.map(col => (
                  <div key={col} className="p-3 flex items-center justify-between gap-4">
                    <div className="min-w-[120px]">
                      <div className="text-xs font-medium text-gray-600">{col}</div>
                      <div className="text-[10px] text-gray-400 italic">Saved to profile</div>
                    </div>
                    <select 
                      className="select flex-1 text-xs py-1.5 border-gray-100 text-gray-500" 
                      value={columnMapping[col] || ""} 
                      onChange={e => setColumnMapping(prev => ({ ...prev, [col]: e.target.value }))}
                    >
                      <option value="">Ignore this field</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Full Header Dynamic Mapping */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-purple-100 text-purple-600 flex items-center justify-center text-[10px] font-bold">M</span>
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Import Additional Columns</h4>
              </div>
              <button 
                onClick={() => {
                  const all = new Set(headers.filter(h => !Object.values(columnMapping).includes(h)));
                  setMetaColumns(all);
                }}
                className="text-[10px] font-bold text-[#1c1c1c] hover:underline"
              >
                Select All Unmapped
              </button>
            </div>
            <div className="card p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 bg-gray-50/10">
              {headers.map(header => {
                const isMapped = Object.values(columnMapping).includes(header);
                const isSelected = metaColumns.has(header);
                
                return (
                  <div 
                    key={header}
                    onClick={() => {
                      if (isMapped) return;
                      const next = new Set(metaColumns);
                      if (next.has(header)) next.delete(header);
                      else next.add(header);
                      setMetaColumns(next);
                    }}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all",
                      isMapped ? "bg-gray-100 border-gray-100 opacity-50 cursor-not-allowed" :
                      isSelected ? "bg-[#1c1c1c]/5 border-[#1c1c1c]/20 text-[#1c1c1c] font-medium" : "bg-white border-gray-100 hover:border-gray-200"
                    )}
                  >
                    <span className="truncate pr-2">{header}</span>
                    {!isMapped && (
                      <div className={cn("w-3.5 h-3.5 rounded-sm border flex items-center justify-center",
                        isSelected ? "bg-[#1c1c1c] border-[#1c1c1c] text-white" : "bg-white border-gray-300 shadow-inner"
                      )}>
                        {isSelected && <CheckCircle className="w-2.5 h-2.5" />}
                      </div>
                    )}
                    {isMapped && <span className="text-[9px] text-gray-400 font-bold uppercase">Mapped</span>}
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="card p-4 bg-[#1c1c1c]/5 border-[#1c1c1c]/10 flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#1c1c1c]/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-4 h-4 text-[#1c1c1c]" />
              </div>
              <div>
                  <div className="text-xs font-bold text-[#1c1c1c] mb-1">Smart Mapping Tips</div>
                  <p className="text-[11px] text-[#1c1c1c]/70 leading-relaxed">
                      We&apos;ve automatically suggested mappings based on your headers. 
                      You can manually change them if any are incorrect. 
                      Fields left as <strong>&ldquo;Select column...&rdquo;</strong> will be skipped.
                  </p>
              </div>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-[#1c1c1c] flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-gray-500" /> {fileName}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {data.length} rows found ·{" "}
                <span className="text-[#1c1c1c] font-medium">{valid.length} valid</span> ·{" "}
                <span className="text-rose-600 font-medium">{errors.length} errors</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button disabled={importing} onClick={reset} className="btn-secondary text-xs">
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              <button disabled={importing || valid.length === 0} onClick={confirmImport} className="btn-primary text-xs">
                {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                Confirm Import ({valid.length} rows)
              </button>
            </div>
          </div>

          {errors.length > 0 && (
            <div className="card p-3 bg-rose-50 border-rose-200">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 mb-2">
                <AlertCircle className="w-3.5 h-3.5" /> {errors.length} row{errors.length > 1 ? "s" : ""} will be skipped
              </div>
              <div className="max-h-[100px] overflow-y-auto space-y-1">
                {errors.slice(0, 5).map(e => (
                  <div key={e._n} className="text-[11px] text-rose-600">Row {e._n}: {e._error}</div>
                ))}
                {errors.length > 5 && <div className="text-[11px] text-rose-500">... and {errors.length - 5} more</div>}
              </div>
            </div>
          )}

          <div className="table-container overflow-x-auto max-h-[450px] shadow-inner bg-gray-50/20 rounded-xl border border-gray-100">
            <table className="w-full text-xs min-w-[1000px] border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-100/90 backdrop-blur-sm border-b border-gray-200">
                  <th className="text-left py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">#</th>
                  <th className="text-left py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="text-left py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Phone</th>
                  <th className="text-left py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider truncate max-w-[120px]">
                      {importType === "orders" ? "Product" : "Total Value"}
                  </th>
                  {CUSTOMER_COLS.map(c => columnMapping[c] ? (
                    <th key={c} className="text-left py-2.5 px-3 text-[10px] font-bold text-[#1c1c1c] uppercase tracking-wider">{c}</th>
                  ) : null)}
                  {metaColumns.size > 0 && (
                    <th className="text-left py-2.5 px-3 text-[10px] font-bold text-purple-500 uppercase tracking-wider">Custom Meta</th>
                  )}
                  <th className="text-left py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {data.slice(0, 50).map(r => (
                  <tr key={r._n} className={cn("transition-colors", r._error ? "bg-rose-50/30" : "hover:bg-gray-50/50")}>
                    <td className="py-2.5 px-3 text-gray-400 font-mono">{r._n}</td>
                    <td className="py-2.5 px-3 font-semibold text-[#1c1c1c] whitespace-nowrap">{r["Customer Name"] || "—"}</td>
                    <td className="py-2.5 px-3 text-gray-600 font-mono">{r["Phone Number"] || "—"}</td>
                    <td className="py-2.5 px-3 text-gray-600 truncate max-w-[120px]" title={importType === "orders" ? r["Product Name"] : r["Total Value"]}>
                        {importType === "orders" ? (r["Product Name"] || "—") : (r["Total Value"] || "—")}
                    </td>
                    {CUSTOMER_COLS.map(c => columnMapping[c] ? (
                      <td key={c} className="py-2.5 px-3 text-gray-500 italic whitespace-nowrap">{r[c] || "—"}</td>
                    ) : null)}
                    {metaColumns.size > 0 && (
                      <td className="py-2.5 px-3">
                        {r["Custom Meta"] ? (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(r["Custom Meta"]).slice(0, 2).map(([k, v]) => (
                                <span key={k} className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 text-[9px] font-bold border border-purple-100">
                                    {k}: {String(v)}
                                </span>
                            ))}
                            {Object.keys(r["Custom Meta"]).length > 2 && (
                                <span className="text-[9px] text-purple-400 font-medium">+{Object.keys(r["Custom Meta"]).length - 2} more</span>
                            )}
                          </div>
                        ) : "—"}
                      </td>
                    )}
                    <td className="py-2.5 px-3 font-semibold text-[#1c1c1c]">
                      {r._error ? (
                        <span className="text-rose-600 font-medium flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Error</span>
                      ) : (
                        <span className="text-[#1c1c1c] font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Valid</span>
                      )}
                    </td>
                  </tr>
                ))}
                {data.length > 50 && (
                  <tr><td colSpan={6 + CUSTOMER_COLS.filter(c => columnMapping[c]).length + (metaColumns.size > 0 ? 1 : 0)} className="py-4 text-center text-gray-400 italic">... and {data.length - 50} more rows</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="card p-12 text-center animate-scale-in">
          <div className="w-16 h-16 rounded-2xl bg-[#eceae4] flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-[#1c1c1c]" />
          </div>
          <h2 className="text-xl font-display text-[#1c1c1c] mb-2">Import Successful</h2>
          <p className="text-sm text-gray-500 mb-1">{results.imported} records processed successfully</p>
          <p className="text-xs text-gray-400 mb-6">{results.skipped} rows skipped (duplicates or data errors)</p>
          <div className="flex justify-center gap-3">
            <button onClick={reset} className="btn-secondary">Import Another File</button>
            <a href="/customers" className="btn-primary">View Customer List</a>
          </div>
        </div>
      )}
    </div>
  );
}
