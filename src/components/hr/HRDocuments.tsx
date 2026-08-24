"use client";
import { useState, useEffect, useRef } from "react";
import { FileText, Shield, BookOpen, Download, Search, Plus, ChevronRight, Upload, Printer, Book, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

type DocType = "Offer Letter" | "Appointment Letter" | "Relieving Letter" | "Experience Letter" | "Warning Letter" | "Salary Certificate";
interface PolicyDoc { id: string; name: string; category: string; uploadedOn: string; size: string; fileUrl: string | null; }
const ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const CAT_COLOR: Record<string, string> = {
  Compliance: "bg-blue-50 text-blue-600",
  Leave: "bg-emerald-50 text-emerald-600",
  Operations: "bg-amber-50 text-amber-600",
  General: "bg-gray-50 text-gray-600",
};

const TEMPLATES: Record<DocType, (data: any) => string> = {
  "Offer Letter": (d) => `OFFER LETTER\n\nDate: ${d.date}\nTo: ${d.name}\n\nDear ${d.name},\n\nWe are pleased to offer you the position of ${d.role} at ${d.company}.\n\nYour monthly CTC will be ₹${d.salary}.\nYour joining date is ${d.joiningDate}.\n\nBest Regards,\nHR Team`,
  "Appointment Letter": (d) => `APPOINTMENT LETTER\n\nDate: ${d.date}\nEmployee: ${d.name}\n\nDear ${d.name},\n\nFollowing your acceptance, we hereby appoint you as ${d.role} effective ${d.joiningDate}.\n\nMonthly Salary: ₹${d.salary}\n\nYours Sincerely,\nManagement`,
  "Relieving Letter": (d) => `RELIEVING LETTER\n\nDate: ${d.date}\nTo: ${d.name}\n\nThis is to certify that ${d.name} has been relieved from the services of ${d.company} on ${d.endDate}.\n\nWe wish you the best for your future.\n\nHR Department`,
  "Experience Letter": (d) => `EXPERIENCE CERTIFICATE\n\nTo Whom It May Concern,\n\nThis is to certify that ${d.name} worked with us as ${d.role} from ${d.joiningDate} to ${d.endDate}.\n\nDuring this tenure, their conduct was found to be professional.\n\nFor ${d.company}`,
  "Warning Letter": (d) => `WARNING LETTER\n\nDate: ${d.date}\nTo: ${d.name}\n\nSubject: Formal Warning\n\nDear ${d.name},\n\nThis letter serves as a formal warning regarding ${d.reason}.\nFailure to improve will lead to disciplinary action.\n\nManagement`,
  "Salary Certificate": (d) => `SALARY CERTIFICATE\n\nDate: ${d.date}\n\nThis is to certify that ${d.name} is employed as ${d.role} and draws a monthly salary of ₹${d.salary}.\n\nFor ${d.company}`,
};

interface Props { policies: any[]; onRefresh: () => void; }

export default function HRDocuments({ policies: dbPolicies, onRefresh }: Props) {
  const [tab, setTab] = useState<"generator" | "library" | "manuals">("generator");
  const [docType, setDocType] = useState<DocType>("Offer Letter");
  const [formData, setFormData] = useState({ name: "", role: "", salary: "", joiningDate: "", endDate: "", reason: "", company: "CureForever Wellness Pvt. Ltd.", date: new Date().toLocaleDateString("en-IN") });
  const [preview, setPreview] = useState("");
  const [policies, setPolicies] = useState<PolicyDoc[]>([]);
  const [newPolicy, setNewPolicy] = useState({ name: "", category: "General" });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPolicies(dbPolicies.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      // Demo data has been missing created_at before (TypeError: Cannot
      // read properties of undefined (reading 'split')); a bad row here
      // must not take down the whole Documents tab.
      uploadedOn: p.created_at ? p.created_at.split("T")[0] : "—",
      size: p.file_size || "—",
      fileUrl: p.file_url || null
    })));
  }, [dbPolicies]);

  const pickFile = (file: File | null) => {
    if (!file) { setUploadFile(null); return; }
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
      toast.error("Only PDF, DOC, and DOCX files are supported");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("File exceeds the 10MB limit");
      return;
    }
    setUploadFile(file);
    if (!newPolicy.name) setNewPolicy(p => ({ ...p, name: file.name.replace(/\.[^.]+$/, "") }));
  };

  const generateDoc = () => setPreview(TEMPLATES[docType](formData));

  const handleAddPolicy = async () => {
    if (!newPolicy.name) return;
    if (document.cookie.includes("crm-demo-mode=true")) {
      toast.success(uploadFile ? "Demo: file uploaded (local only)" : "Demo: policy added (local only)");
      setPolicies(pl => [{ id: `demo-${Date.now()}`, name: newPolicy.name, category: newPolicy.category, uploadedOn: new Date().toISOString().split("T")[0], size: uploadFile ? `${Math.round(uploadFile.size / 1024)} KB` : "—", fileUrl: null }, ...pl]);
      setNewPolicy({ name: "", category: "General" });
      setUploadFile(null);
      return;
    }
    setUploading(true);
    try {
      if (uploadFile) {
        // Real upload: was previously impossible - the dropzone had no
        // file input or handler at all, so nothing ever actually uploaded
        // despite the UI claiming "PDF, DOCX supported".
        const body = new FormData();
        body.append("file", uploadFile);
        body.append("name", newPolicy.name);
        body.append("category", newPolicy.category);
        const res = await fetch("/api/hr/policies/upload", { method: "POST", body });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Upload failed");
      } else {
        const res = await fetch("/api/hr/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "policy", data: { name: newPolicy.name, category: newPolicy.category } })
        });
        if (!res.ok) throw new Error("Failed to add policy");
      }
      toast.success("Policy added");
      setNewPolicy({ name: "", category: "General" });
      setUploadFile(null);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to add policy");
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePolicy = async (id: string) => {
    if (document.cookie.includes("crm-demo-mode=true")) {
      toast.success("Demo: policy removed (local only)");
      setPolicies(pl => pl.filter(x => x.id !== id));
      return;
    }
    // Was local-state-only before - filtering the row out of `policies`
    // with no backend call at all, so a "deleted" policy came right back
    // on the next refresh.
    setPolicies(pl => pl.filter(x => x.id !== id));
    try {
      const res = await fetch("/api/hr/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "policy", action: "delete", data: { id } })
      });
      if (!res.ok) throw new Error("Delete failed");
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete policy");
      onRefresh(); // resync - the optimistic removal above may be wrong now
    }
  };

  const printDoc = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><body><pre style="font-family:Arial;font-size:13px;line-height:1.8;padding:40px;max-width:700px;margin:auto">${preview}</pre></body></html>`);
    w.document.close();
    w.print();
  };

  const needsReason = docType === "Warning Letter";
  const needsEndDate = ["Experience Letter", "Relieving Letter"].includes(docType);
  const needsSalary = ["Offer Letter", "Appointment Letter", "Salary Certificate"].includes(docType);

  return (
    <div className="space-y-5">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(["generator", "library"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-1.5 text-xs font-bold rounded-lg capitalize transition-all",
              tab === t ? "bg-[#1c1c1c] text-white" : "text-gray-500 hover:text-[#1c1c1c]")}>
            {t === "generator" ? "Document Generator" : "Policy Library"}
          </button>
        ))}
      </div>

      {/* ── Document Generator ── */}
      {tab === "generator" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6 space-y-5">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Document Type</label>
              <select className="input w-full text-sm" value={docType} onChange={e => { setDocType(e.target.value as DocType); setPreview(""); }}>
                {Object.keys(TEMPLATES).map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Employee Full Name</label>
                <input className="input w-full text-sm" placeholder="Priya Sharma" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Designation</label>
                <input className="input w-full text-sm" placeholder="Senior Agent" value={formData.role} onChange={e => setFormData(p => ({ ...p, role: e.target.value }))} />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Company Name</label>
                <input className="input w-full text-sm" value={formData.company} onChange={e => setFormData(p => ({ ...p, company: e.target.value }))} />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                  {needsEndDate ? "Join Date" : "Joining / Effective Date"}
                </label>
                <input type="date" className="input w-full text-sm" value={formData.joiningDate} onChange={e => setFormData(p => ({ ...p, joiningDate: e.target.value }))} />
              </div>
              {needsSalary && (
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Monthly Gross (₹)</label>
                  <input className="input w-full text-sm" placeholder="35000" value={formData.salary} onChange={e => setFormData(p => ({ ...p, salary: e.target.value }))} />
                </div>
              )}
              {needsEndDate && (
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Last Working Date</label>
                  <input type="date" className="input w-full text-sm" value={formData.endDate} onChange={e => setFormData(p => ({ ...p, endDate: e.target.value }))} />
                </div>
              )}
              {needsReason && (
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Reason / Misconduct</label>
                  <textarea className="input w-full text-sm min-h-[60px]" placeholder="Describe the issue..." value={formData.reason} onChange={e => setFormData(p => ({ ...p, reason: e.target.value }))} />
                </div>
              )}
            </div>

            <button onClick={generateDoc} className="btn-primary w-full text-xs py-2.5 gap-2">
              <FileText className="w-3.5 h-3.5" /> Generate Document
            </button>
          </div>

          <div className="card p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-black text-[#1c1c1c] uppercase tracking-widest">Preview</h3>
              {preview && (
                <button onClick={printDoc} className="flex items-center gap-1.5 text-xs font-bold text-[#1c1c1c] hover:underline">
                  <Printer className="w-3.5 h-3.5" /> Print / Save PDF
                </button>
              )}
            </div>
            {preview ? (
              <pre className="flex-1 text-[11px] text-gray-700 whitespace-pre-wrap leading-relaxed font-mono bg-gray-50 rounded-xl p-4 overflow-y-auto max-h-[480px]">
                {preview}
              </pre>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <FileText className="w-10 h-10 text-gray-200 mb-3" />
                <p className="text-xs text-gray-400">Fill in the details and click Generate to preview the document here.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Policy Library ── */}
      {tab === "library" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card p-6">
            <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest mb-5 flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> Policy Documents
            </h3>
            <div className="space-y-3">
              {policies.map(p => (
                <div key={p.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#1c1c1c] flex items-center justify-center">
                      <Shield className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-[#1c1c1c]">{p.name}</div>
                      <div className="text-[10px] text-gray-400">{p.size} · Uploaded {p.uploadedOn}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full", CAT_COLOR[p.category] || CAT_COLOR.General)}>{p.category}</span>
                    {p.fileUrl && (
                      <a href={p.fileUrl} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-[#1c1c1c] transition-colors" title="Download">
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button onClick={() => handleDeletePolicy(p.id)} className="text-gray-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest flex items-center gap-2">
              <Upload className="w-4 h-4" /> Add Policy
            </h3>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Document Name</label>
              <input className="input w-full text-sm" placeholder="e.g., POSH Policy 2025" value={newPolicy.name}
                onChange={e => setNewPolicy(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Category</label>
              <select className="input w-full text-sm" value={newPolicy.category} onChange={e => setNewPolicy(p => ({ ...p, category: e.target.value }))}>
                {["Compliance", "Leave", "Operations", "General"].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={e => pickFile(e.target.files?.[0] || null)}
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0] || null); }}
              className={cn(
                "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
                dragOver ? "border-[#1c1c1c] bg-gray-50" : "border-gray-200 hover:border-[#1c1c1c]"
              )}
            >
              <Upload className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              {uploadFile ? (
                <>
                  <p className="text-xs text-[#1c1c1c] font-bold truncate">{uploadFile.name}</p>
                  <button onClick={e => { e.stopPropagation(); setUploadFile(null); }} className="text-[9px] text-rose-500 font-bold mt-1 hover:underline">
                    Remove
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-400">Click or drag file to upload</p>
                  <p className="text-[9px] text-gray-300 mt-1">PDF, DOCX supported</p>
                </>
              )}
            </div>
            <button onClick={handleAddPolicy} disabled={uploading} className="btn-primary w-full text-xs py-2.5 gap-2 disabled:opacity-60">
              <Plus className="w-3.5 h-3.5" /> {uploading ? "Adding..." : "Add to Library"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
