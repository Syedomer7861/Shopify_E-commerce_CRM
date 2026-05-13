"use client";
import { useState, useEffect } from "react";
import { Users, Phone, Mail, MapPin, Briefcase, Calendar, CheckCircle, Clock, Plus, Search, X, Edit3, UserPlus, UserMinus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui";
import toast from "react-hot-toast";

type EmpStatus = "Active" | "Notice Period" | "Offboarded";
interface Employee {
  id: string; name: string; email: string; phone: string; role: string; designation: string;
  department: string; joinDate: string; status: EmpStatus;
  salary: number; location: string; emergencyContact: string;
  onboarding: { task: string; done: boolean }[];
  offboarding: { task: string; done: boolean }[];
}

const ONBOARDING_TASKS = [
  "ID Verification", "Offer Letter Signed", "System Access Created",
  "CRM Training", "Leave Policy Briefed", "Bank Details Collected", "PF Enrollment"
];
const OFFBOARDING_TASKS = [
  "Resignation Accepted", "Notice Period Confirmed", "Knowledge Transfer",
  "System Access Revoked", "Final Settlement Calculated", "Experience Letter Issued", "Exit Interview Done"
];
const DEPARTMENTS = ["IT", "Sales", "Support", "Operations", "HR", "Marketing", "Finance", "Logistics"];
const DESIGNATIONS = [
  "Account Executive", "Accountant", "Admin", "Agent", "Backend Engineer", "CEO", 
  "Content Writer", "Customer Support Agent", "Delivery Manager", "Director", 
  "Finance Manager", "Frontend Engineer", "HR Executive", "HR Manager", 
  "IT Administrator", "Logistics Coordinator", "Manager", "Marketing Specialist", 
  "Operations Executive", "Operations Manager", "Recruiter", "Sales Executive", 
  "Sales Manager", "SEO Expert", "Senior Agent", "Senior Support Agent", 
  "Support Team Lead", "Team Lead", "Website Developer"
];
const INDIAN_STATES = [
  "Andaman & Nicobar", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", 
  "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu & Kashmir", "Jharkhand", "Karnataka", 
  "Kerala", "Ladakh", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", 
  "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", 
  "Uttar Pradesh", "Uttarakhand", "West Bengal"
];
const COUNTRIES = ["India", "USA", "UK", "Canada", "Australia", "UAE", "Singapore", "Malaysia"];
const STATE_MAP: Record<string, string[]> = {
  "India": INDIAN_STATES,
  "USA": ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"],
  "UK": ["England", "Scotland", "Wales", "Northern Ireland"],
  "Canada": ["Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Nova Scotia", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan"],
  "Australia": ["New South Wales", "Victoria", "Queensland", "Western Australia", "South Australia", "Tasmania", "Australian Capital Territory", "Northern Territory"],
  "UAE": ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al-Quwain", "Fujairah", "Ras Al Khaimah"],
  "Malaysia": ["Johor", "Kedah", "Kelantan", "Malacca", "Negeri Sembilan", "Pahang", "Penang", "Perak", "Perlis", "Sabah", "Sarawak", "Selangor", "Terengganu", "Kuala Lumpur", "Labuan", "Putrajaya"]
};
const CITY_MAP: Record<string, string[]> = {
  "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Nashik", "Thane", "Navi Mumbai", "Aurangabad"],
  "Delhi": ["New Delhi"],
  "Karnataka": ["Bengaluru", "Mysuru", "Hubballi", "Mangaluru"],
  "Telangana": ["Hyderabad", "Warangal", "Nizamabad"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Salem", "Tiruchirappalli"],
  "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Gandhinagar"],
  "West Bengal": ["Kolkata", "Howrah", "Darjeeling", "Siliguri"],
  "Uttar Pradesh": ["Lucknow", "Kanpur", "Agra", "Varanasi", "Noida", "Ghaziabad", "Prayagraj"],
  "Haryana": ["Gurugram", "Faridabad", "Panipat", "Ambala"],
  "Rajasthan": ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer"],
  "Kerala": ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur"],
  "Punjab": ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Mohali"],
  "California": ["Los Angeles", "San Francisco", "San Diego", "San Jose", "Sacramento"],
  "New York": ["New York City", "Buffalo", "Rochester", "Albany"],
  "Texas": ["Houston", "San Antonio", "Dallas", "Austin", "Fort Worth"],
  "Florida": ["Miami", "Orlando", "Tampa", "Jacksonville"],
  "Dubai": ["Dubai"],
  "Abu Dhabi": ["Abu Dhabi", "Al Ain"],
  "England": ["London", "Manchester", "Birmingham", "Leeds", "Liverpool"],
  "Scotland": ["Edinburgh", "Glasgow"],
  "New South Wales": ["Sydney", "Newcastle"],
  "Victoria": ["Melbourne", "Geelong"],
  "Ontario": ["Toronto", "Ottawa", "Mississauga"],
  "British Columbia": ["Vancouver", "Victoria"]
};

const DEMO_EMPLOYEES: Employee[] = [
  { id: "1", name: "Priya Sharma", email: "priya@cureforever.in", phone: "+91 98765 43210", role: "agent", designation: "Senior Agent", department: "Customer Support", joinDate: "2023-03-15", status: "Active", salary: 35000, location: "Mumbai", emergencyContact: "+91 98000 11111", onboarding: ONBOARDING_TASKS.map((t, i) => ({ task: t, done: i < 6 })), offboarding: OFFBOARDING_TASKS.map(t => ({ task: t, done: false })) },
  { id: "2", name: "Rahul Mehta", email: "rahul@cureforever.in", phone: "+91 87654 32109", role: "agent", designation: "Agent", department: "Customer Support", joinDate: "2023-08-01", status: "Active", salary: 28000, location: "Pune", emergencyContact: "+91 87000 22222", onboarding: ONBOARDING_TASKS.map(t => ({ task: t, done: true })), offboarding: OFFBOARDING_TASKS.map(t => ({ task: t, done: false })) },
  { id: "3", name: "Anjali Singh", email: "anjali@cureforever.in", phone: "+91 76543 21098", role: "manager", designation: "Team Lead", department: "Operations", joinDate: "2022-11-10", status: "Notice Period", salary: 45000, location: "Delhi", emergencyContact: "+91 76000 33333", onboarding: ONBOARDING_TASKS.map(t => ({ task: t, done: true })), offboarding: OFFBOARDING_TASKS.map((t, i) => ({ task: t, done: i < 3 })) },
];

interface Props { data: any[]; onRefresh: () => void; }

export default function EmployeeDirectory({ data, onRefresh }: Props) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | EmpStatus>("Active");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [activePanel, setActivePanel] = useState<"profile" | "onboarding" | "offboarding">("profile");
  const [showAdd, setShowAdd] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", role: "", designation: "", department: "", joinDate: "", salary: "", location: "", emergencyContact: "", city: "", state: "", country: "India" });
  const [newEmp, setNewEmp] = useState({ name: "", email: "", phone: "", role: "agent", designation: "", department: "IT", joinDate: "", salary: "", location: "", city: "", state: "", country: "India" });
  const [customDept, setCustomDept] = useState({ add: false, edit: false });
  const [customDeptValue, setCustomDeptValue] = useState({ add: "", edit: "" });
  const [customDesig, setCustomDesig] = useState({ add: false, edit: false });
  const [customDesigValue, setCustomDesigValue] = useState({ add: "", edit: "" });
  const [customCity, setCustomCity] = useState({ add: false, edit: false });
  const [customCityValue, setCustomCityValue] = useState({ add: "", edit: "" });

  useEffect(() => {
    const mapped: Employee[] = data.map(p => ({
      id: p.id,
      name: p.name || p.email.split("@")[0],
      email: p.email,
      phone: p.phone || "—",
      role: p.role || "agent",
      designation: p.designation || (p.role === "hr" ? "HR" : (p.role || "Agent").charAt(0).toUpperCase() + (p.role || "Agent").slice(1)),
      department: p.department || "General",
      joinDate: p.joining_date || "—",
      status: !p.is_active ? "Offboarded" : (p.notice_period ? "Notice Period" : "Active"),
      salary: Number(p.monthly_salary) || 0,
      location: p.location || "—",
      emergencyContact: p.emergency_contact || "—",
      onboarding: (p.onboarding_progress && p.onboarding_progress.length > 0) ? p.onboarding_progress : ONBOARDING_TASKS.map(t => ({ task: t, done: false })),
      offboarding: (p.offboarding_progress && p.offboarding_progress.length > 0) ? p.offboarding_progress : OFFBOARDING_TASKS.map(t => ({ task: t, done: false })),
    }));
    setEmployees(mapped);
    if (selected) {
      const updated = mapped.find(e => e.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [data]);

  const handleUpdate = async (id: string, updates: any) => {
    try {
      const res = await fetch("/api/hr/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "employee", action: "update", data: { id, ...updates } })
      });
      
      if (!res.ok) {
        const result = await res.json();
        toast.error(result.error || "Update failed");
        return;
      }

      toast.success("Employee updated successfully");
      onRefresh();
    } catch (err: any) {
      console.error(err);
      toast.error("A network error occurred. Please try again.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch("/api/hr/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "employee", action: "delete", data: { id } })
      });
      
      if (!res.ok) {
        const result = await res.json();
        toast.error(result.error || "Delete failed");
        return;
      }

      toast.success("Employee deleted successfully");
      setSelected(null);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      toast.error("A network error occurred. Please try again.");
    }
  };

  const filtered = employees.filter(e => {
    const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.role.toLowerCase().includes(search.toLowerCase()) ||
      e.department.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "All" || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleTask = (type: "onboarding" | "offboarding", idx: number) => {
    if (!selected) return;
    const tasks = [...selected[type]];
    tasks[idx] = { ...tasks[idx], done: !tasks[idx].done };
    handleUpdate(selected.id, { [`${type}_progress`]: tasks });
  };

  const addEmployee = async () => {
    if (!newEmp.name || !newEmp.email) {
      toast.error("Name and Email are required");
      return;
    }
    
    try {
      const locationStr = [newEmp.city, newEmp.state, newEmp.country].filter(Boolean).join(", ");
      const res = await fetch("/api/hr/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          type: "employee", 
          action: "insert", 
          data: {
            name: newEmp.name,
            email: newEmp.email,
            phone: newEmp.phone,
            role: newEmp.role,
            designation: newEmp.designation,
            department: newEmp.department,
            joining_date: newEmp.joinDate,
            monthly_salary: Number(newEmp.salary),
            location: locationStr
          }
        })
      });
      
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || "Failed to add employee");
        return;
      }

      // Optimistic update: immediately add to local list using API response
      const newProfile = Array.isArray(result) ? result[0] : result;
      const optimisticEmployee: Employee = {
        id: newProfile?.id || `temp-${Date.now()}`,
        name: newEmp.name,
        email: newEmp.email,
        phone: newEmp.phone || "—",
        role: newEmp.role,
        designation: newEmp.designation || newEmp.role,
        department: newEmp.department || "General",
        joinDate: newEmp.joinDate || "—",
        status: "Active",
        salary: Number(newEmp.salary) || 0,
        location: [newEmp.city, newEmp.state, newEmp.country].filter(Boolean).join(", "),
        emergencyContact: "—",
        onboarding: ONBOARDING_TASKS.map(t => ({ task: t, done: false })),
        offboarding: OFFBOARDING_TASKS.map(t => ({ task: t, done: false })),
      };
      setEmployees(prev => [optimisticEmployee, ...prev]);

      toast.success("Employee added successfully! Default password: Welcome@123");
      setShowAdd(false);
      setNewEmp({ name: "", email: "", phone: "", role: "agent", designation: "", department: "IT", joinDate: "", salary: "", location: "", city: "", state: "", country: "India" });
      setCustomDept({ add: false, edit: false });
      setCustomDeptValue({ add: "", edit: "" });
      setCustomDesig({ add: false, edit: false });
      setCustomDesigValue({ add: "", edit: "" });
      setCustomCity({ add: false, edit: false });
      setCustomCityValue({ add: "", edit: "" });

      // Background sync to get the canonical DB record
      onRefresh();
    } catch (err: any) {
      console.error(err);
      toast.error("A network error occurred. Please try again.");
    }
  };

  const statusColor: Record<EmpStatus, string> = {
    "Active": "bg-emerald-50 text-emerald-700",
    "Notice Period": "bg-amber-50 text-amber-700",
    "Offboarded": "bg-rose-50 text-rose-600",
  };

  const STATUS_FILTERS: ("All" | EmpStatus)[] = ["All", "Active", "Notice Period", "Offboarded"];
  const statusCounts = {
    All: employees.length,
    Active: employees.filter(e => e.status === "Active").length,
    "Notice Period": employees.filter(e => e.status === "Notice Period").length,
    Offboarded: employees.filter(e => e.status === "Offboarded").length,
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: Directory */}
      <div className="lg:col-span-5 space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input className="input w-full pl-9 text-sm" placeholder="Search by name, role, department..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={() => setShowAdd(true)} className="btn-primary gap-2 text-xs px-3 whitespace-nowrap">
            <UserPlus className="w-3.5 h-3.5" /> Add
          </button>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                "flex-1 py-1.5 text-[10px] font-black rounded-lg capitalize transition-all flex items-center justify-center gap-1",
                statusFilter === f ? "bg-[#1c1c1c] text-white shadow-sm" : "text-gray-500 hover:text-[#1c1c1c]"
              )}
            >
              {f === "Notice Period" ? "Notice" : f}
              <span className={cn(
                "text-[9px] px-1 rounded-full font-black",
                statusFilter === f ? "bg-white/20 text-white" : "bg-gray-200 text-gray-500"
              )}>{statusCounts[f]}</span>
            </button>
          ))}
        </div>

        {/* Employee List */}
        <div className="card overflow-hidden p-0">
          {filtered.filter(e => e.status !== "Offboarded").map(emp => (
            <div
              key={emp.id}
              onClick={() => { setSelected(emp); setActivePanel("profile"); }}
              className={cn(
                "flex items-center gap-4 px-5 py-4 cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors",
                selected?.id === emp.id && "bg-[#1c1c1c]/5 border-l-2 border-l-[#1c1c1c]"
              )}
            >
              <Avatar name={emp.name} size="md" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-black text-[#1c1c1c] truncate">{emp.name}</div>
                <div className="text-[10px] text-gray-400 font-bold">{emp.designation} · {emp.department}</div>
              </div>
              <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest", statusColor[emp.status])}>{emp.status}</span>
            </div>
          ))}

          {/* Offboarded section — grayed out */}
          {(statusFilter === "All" || statusFilter === "Offboarded") && filtered.filter(e => e.status === "Offboarded").length > 0 && (
            <>
              <div className="px-5 py-2 bg-gray-50 border-t border-gray-100">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Offboarded ({filtered.filter(e => e.status === "Offboarded").length})</span>
              </div>
              {filtered.filter(e => e.status === "Offboarded").map(emp => (
                <div
                  key={emp.id}
                  onClick={() => { setSelected(emp); setActivePanel("profile"); }}
                  className={cn(
                    "flex items-center gap-4 px-5 py-4 cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50/40 transition-colors opacity-50",
                    selected?.id === emp.id && "opacity-80 bg-[#1c1c1c]/5 border-l-2 border-l-[#1c1c1c]"
                  )}
                >
                  <Avatar name={emp.name} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black text-[#1c1c1c] truncate line-through">{emp.name}</div>
                    <div className="text-[10px] text-gray-400 font-bold">{emp.designation} · {emp.department}</div>
                  </div>
                  <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest", statusColor[emp.status])}>{emp.status}</span>
                </div>
              ))}
            </>
          )}

          {filtered.length === 0 && <p className="text-xs text-gray-400 italic text-center py-8">No employees found.</p>}
        </div>
      </div>

      {/* Right: Detail Panel */}
      <div className="lg:col-span-7">
        {!selected ? (
          <div className="card p-12 flex flex-col items-center text-center h-full justify-center">
            <Users className="w-12 h-12 text-gray-200 mb-4" />
            <p className="text-sm font-bold text-gray-400">Select an employee to view their profile, onboarding progress, and exit details.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Panel Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
              {(["profile", "onboarding", "offboarding"] as const).map(p => (
                <button key={p} onClick={() => setActivePanel(p)}
                  className={cn("px-4 py-1.5 text-xs font-bold rounded-lg capitalize transition-all", activePanel === p ? "bg-[#1c1c1c] text-white" : "text-gray-500 hover:text-[#1c1c1c]")}>
                  {p === "offboarding" ? "Exit / Offboard" : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>

            {activePanel === "profile" && (
              <div className="card p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-5">
                    <Avatar name={selected.name} size="lg" />
                    <div>
                      {isEditing ? (
                        <div className="space-y-2">
                           <input 
                             className="input py-1 text-lg font-black w-full" 
                             value={editForm.name} 
                             onChange={e => setEditForm({ ...editForm, name: e.target.value })} 
                           />
                           <div className="flex gap-2">
                              <select 
                                className="input py-1 text-[10px] font-bold w-1/2 bg-white" 
                                value={editForm.role} 
                                onChange={e => setEditForm({ ...editForm, role: e.target.value })} 
                              >
                                <option value="agent">Agent</option>
                                <option value="hr">HR</option>
                                <option value="manager">Manager</option>
                                <option value="admin">Admin</option>
                              </select>
                              {!customDesig.edit ? (
                                <select 
                                  className="input py-1 text-[10px] font-bold w-1/2 bg-white" 
                                  value={editForm.designation} 
                                  onChange={e => {
                                    if (e.target.value === "CUSTOM") {
                                      setCustomDesig({ ...customDesig, edit: true });
                                    } else {
                                      setEditForm({ ...editForm, designation: e.target.value });
                                    }
                                  }} 
                                >
                                  <option value="">Select Designation...</option>
                                  {Array.from(new Set([...DESIGNATIONS, editForm.designation].filter(Boolean))).map(d => <option key={d as string} value={d as string}>{d as string}</option>)}
                                  <option value="CUSTOM">+ Custom Designation...</option>
                                </select>
                              ) : (
                                <div className="flex gap-1 w-1/2">
                                  <input 
                                    className="input py-1 text-[10px] font-bold flex-1" 
                                    value={customDesigValue.edit} 
                                    onChange={e => {
                                      setCustomDesigValue({ ...customDesigValue, edit: e.target.value });
                                      setEditForm({ ...editForm, designation: e.target.value });
                                    }} 
                                    placeholder="Enter Designation"
                                    autoFocus
                                  />
                                  <button 
                                    className="p-1 hover:bg-gray-100 rounded text-gray-400"
                                    onClick={() => setCustomDesig({ ...customDesig, edit: false })}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                           </div>
                           <div className="mt-1">
                              {!customDept.edit ? (
                                <select 
                                  className="input py-1 text-[10px] font-bold w-full bg-white" 
                                  value={editForm.department} 
                                  onChange={e => {
                                    if (e.target.value === "CUSTOM") {
                                      setCustomDept({ ...customDept, edit: true });
                                    } else {
                                      setEditForm({ ...editForm, department: e.target.value });
                                    }
                                  }} 
                                >
                                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                                  <option value="CUSTOM">+ Custom Department...</option>
                                </select>
                              ) : (
                                <div className="flex gap-1">
                                  <input 
                                    className="input py-1 text-[10px] font-bold flex-1" 
                                    value={customDeptValue.edit} 
                                    onChange={e => {
                                      setCustomDeptValue({ ...customDeptValue, edit: e.target.value });
                                      setEditForm({ ...editForm, department: e.target.value });
                                    }} 
                                    placeholder="Enter Dept Name"
                                    autoFocus
                                  />
                                  <button 
                                    className="p-1 hover:bg-gray-100 rounded text-gray-400"
                                    onClick={() => setCustomDept({ ...customDept, edit: false })}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                           </div>
                        </div>
                      ) : (
                        <>
                          <h2 className="text-xl font-black text-[#1c1c1c]">{selected.name}</h2>
                          <p className="text-xs text-gray-400 font-bold">{selected.designation} · {selected.department}</p>
                          <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest mt-1 inline-block", statusColor[selected.status])}>{selected.status}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {!isEditing && (
                    <button 
                      onClick={() => {
                        setCustomDept({ ...customDept, edit: false });
                        setCustomDeptValue({ ...customDeptValue, edit: "" });
                        setCustomDesig({ ...customDesig, edit: false });
                        setCustomDesigValue({ ...customDesigValue, edit: "" });
                        setCustomCity({ ...customCity, edit: false });
                        setCustomCityValue({ ...customCityValue, edit: "" });
                        
                        const locParts = (selected.location || "").split(",").map(s => s.trim());
                        let pCity = "", pState = "", pCountry = "India";
                        if (locParts.length === 1 && locParts[0]) { pCity = locParts[0]; }
                        else if (locParts.length === 2) { pCity = locParts[0]; pState = locParts[1]; }
                        else if (locParts.length >= 3) { pCity = locParts[0]; pState = locParts[1]; pCountry = locParts[2]; }

                        setEditForm({
                          name: selected.name,
                          email: selected.email,
                          phone: selected.phone,
                          role: selected.role,
                          designation: selected.designation,
                          department: selected.department,
                          joinDate: selected.joinDate,
                          salary: String(selected.salary),
                          location: selected.location,
                          emergencyContact: selected.emergencyContact,
                          city: pCity,
                          state: pState,
                          country: pCountry
                        });
                        setIsEditing(true);
                      }}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-[#1c1c1c]"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { icon: Mail, label: "Email", key: "email", val: selected.email },
                    { icon: Phone, label: "Phone", key: "phone", val: selected.phone },
                    { icon: MapPin, label: "Location", key: "location", val: selected.location },
                    { icon: Calendar, label: "Join Date", key: "joinDate", val: selected.joinDate },
                    { icon: Briefcase, label: "Monthly Salary", key: "salary", val: `₹${selected.salary.toLocaleString("en-IN")}` },
                    { icon: Phone, label: "Emergency Contact", key: "emergencyContact", val: selected.emergencyContact || "—" },
                  ].map(({ icon: Icon, label, key, val }) => (
                    <div key={label} className="p-3 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="w-3 h-3 text-gray-400" />
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{label}</span>
                      </div>
                      {isEditing ? (
                        key === "location" ? (
                          <div className="flex flex-col gap-1 mt-1">
                            {!customCity.edit && CITY_MAP[editForm.state] ? (
                              <select className="input py-1 text-[10px] font-bold w-full bg-white" value={editForm.city} onChange={e => {
                                if (e.target.value === "CUSTOM") {
                                  setCustomCity({ ...customCity, edit: true });
                                  setEditForm({...editForm, city: ""});
                                } else {
                                  setEditForm({...editForm, city: e.target.value});
                                }
                              }}>
                                <option value="">City...</option>
                                {CITY_MAP[editForm.state].map(c => <option key={c} value={c}>{c}</option>)}
                                <option value="CUSTOM">+ Custom...</option>
                              </select>
                            ) : (
                              <div className="flex gap-1 w-full">
                                <input className="input py-1 text-[10px] font-bold flex-1 bg-white" placeholder="City" value={customCityValue.edit || editForm.city} onChange={e => {
                                  setCustomCityValue({ ...customCityValue, edit: e.target.value });
                                  setEditForm({...editForm, city: e.target.value});
                                }} />
                                {CITY_MAP[editForm.state] && (
                                  <button className="p-1 hover:bg-gray-100 rounded" onClick={() => setCustomCity({ ...customCity, edit: false })}><X className="w-4 h-4" /></button>
                                )}
                              </div>
                            )}
                            <div className="flex gap-1">
                              {STATE_MAP[editForm.country] ? (
                                <select className="input py-1 text-[10px] font-bold w-1/2 bg-white" value={editForm.state} onChange={e => setEditForm({...editForm, state: e.target.value})}>
                                  <option value="">State...</option>
                                  {STATE_MAP[editForm.country].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              ) : (
                                <input className="input py-1 text-[10px] font-bold w-1/2 bg-white" placeholder="State/Region" value={editForm.state} onChange={e => setEditForm({...editForm, state: e.target.value})} />
                              )}
                              <select className="input py-1 text-[10px] font-bold w-1/2 bg-white" value={editForm.country} onChange={e => setEditForm({...editForm, country: e.target.value, state: ""})}>
                                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                          </div>
                        ) : (
                          <input 
                            type={key === "joinDate" ? "date" : key === "salary" ? "number" : "text"}
                            className="input w-full py-1 text-xs font-bold bg-white" 
                            value={(editForm as any)[key]} 
                            onChange={e => setEditForm({ ...editForm, [key]: e.target.value })}
                          />
                        )
                      ) : (
                        <div className="text-xs font-bold text-[#1c1c1c]">{val}</div>
                      )}
                    </div>
                  ))}
                </div>

                {isEditing ? (
                  <div className="flex gap-2 pt-2">
                    <button 
                      onClick={async () => {
                        await handleUpdate(selected.id, {
                          name: editForm.name,
                          email: editForm.email,
                          phone: editForm.phone,
                          role: editForm.role,
                          designation: editForm.designation,
                          department: editForm.department,
                          joining_date: editForm.joinDate,
                          monthly_salary: Number(editForm.salary),
                          location: [editForm.city, editForm.state, editForm.country].filter(Boolean).join(", "),
                          emergency_contact: editForm.emergencyContact
                        });
                        setIsEditing(false);
                      }}
                      className="flex-1 btn-primary py-2 text-xs gap-1.5"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Save Changes
                    </button>
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="flex-1 btn-secondary py-2 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-2">
                    {selected.status === "Offboarded" ? (
                      // Reactivate offboarded employee
                      <button
                        onClick={() => handleUpdate(selected.id, { is_active: true, notice_period: false })}
                        className="flex-1 text-xs py-2 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors gap-1.5 flex items-center justify-center"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Reactivate Employee
                      </button>
                    ) : selected.status === "Notice Period" ? (
                      // Second step: Confirm full offboard
                      <button
                        onClick={() => {
                          if (confirm(`Confirm offboarding ${selected.name}? This will deactivate their CRM access.`)) {
                            handleUpdate(selected.id, { is_active: false, notice_period: false });
                          }
                        }}
                        className="flex-1 text-xs py-2 rounded-lg border border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors gap-1.5 flex items-center justify-center font-bold"
                      >
                        <UserMinus className="w-3.5 h-3.5" /> Confirm Offboard
                      </button>
                    ) : (
                      // First step: Move to Notice Period
                      <button
                        onClick={() => handleUpdate(selected.id, { notice_period: true })}
                        className="flex-1 text-xs py-2 rounded-lg border border-amber-200 text-amber-600 hover:bg-amber-50 transition-colors gap-1.5 flex items-center justify-center"
                      >
                        <Clock className="w-3.5 h-3.5" /> Start Notice Period
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        if (confirm("Are you sure you want to permanently delete this employee? This action cannot be undone.")) {
                          handleDelete(selected.id);
                        }
                      }} 
                      className="flex-1 text-xs py-2 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 transition-colors gap-1.5 flex items-center justify-center"
                    >
                      <X className="w-3.5 h-3.5" /> Delete Employee
                    </button>
                  </div>
                )}
              </div>
            )}

            {(activePanel === "onboarding" || activePanel === "offboarding") && (
              <div className="card p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-black text-[#1c1c1c] uppercase tracking-widest">
                    {activePanel === "onboarding" ? "Onboarding Checklist" : "Exit / Offboarding Checklist"}
                  </h3>
                  <span className="text-xs font-bold text-gray-400">
                    {(selected[activePanel as 'onboarding' | 'offboarding'] || []).filter((t: any) => t.done).length} / {(selected[activePanel as 'onboarding' | 'offboarding'] || []).length} done
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full h-2 bg-gray-100 rounded-full mb-5 overflow-hidden">
                  <div className="h-full bg-[#1c1c1c] rounded-full transition-all duration-500"
                    style={{ width: `${((selected[activePanel as 'onboarding' | 'offboarding'] || []).filter((t: any) => t.done).length / (selected[activePanel as 'onboarding' | 'offboarding'] || []).length) * 100}%` }} />
                </div>
                <div className="space-y-3">
                  {(selected[activePanel as 'onboarding' | 'offboarding'] || []).map((t: any, i: number) => (
                    <div key={i} onClick={() => toggleTask(activePanel as 'onboarding' | 'offboarding', i)}
                      className={cn("flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border",
                        t.done ? "bg-emerald-50 border-emerald-100" : "bg-gray-50 border-transparent hover:border-gray-200")}>
                      <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all",
                        t.done ? "bg-emerald-500 border-emerald-500" : "border-gray-300")}>
                        {t.done && <CheckCircle className="w-3 h-3 text-white" />}
                      </div>
                      <span className={cn("text-xs font-bold", t.done ? "text-emerald-700 line-through" : "text-[#1c1c1c]")}>{t.task}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Employee Modal (inline) */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h3 className="font-black text-[#1c1c1c] uppercase tracking-widest text-sm">Add New Employee</h3>
              <button onClick={() => setShowAdd(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Full Name</label>
                <input className="input w-full text-xs" placeholder="Priya Sharma" value={newEmp.name}
                  onChange={e => setNewEmp(prev => ({ ...prev, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Email</label>
                <input className="input w-full text-xs" placeholder="priya@company.com" value={newEmp.email}
                  onChange={e => setNewEmp(prev => ({ ...prev, email: e.target.value }))} />
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">System Role</label>
                <select className="input w-full text-xs" value={newEmp.role}
                  onChange={e => setNewEmp(prev => ({ ...prev, role: e.target.value }))}>
                  <option value="agent">Agent</option>
                  <option value="hr">HR</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Designation</label>
                {!customDesig.add ? (
                  <select className="input w-full text-xs bg-white" value={(newEmp as any).designation || ""}
                    onChange={e => {
                      if (e.target.value === "CUSTOM") {
                        setCustomDesig({ ...customDesig, add: true });
                      } else {
                        setNewEmp(prev => ({ ...prev, designation: e.target.value }));
                      }
                    }}>
                    <option value="">Select Designation...</option>
                    {DESIGNATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    <option value="CUSTOM">+ Custom...</option>
                  </select>
                ) : (
                  <div className="flex gap-1">
                    <input className="input flex-1 text-xs" placeholder="e.g. Website Developer" value={customDesigValue.add}
                      onChange={e => {
                        setCustomDesigValue({ ...customDesigValue, add: e.target.value });
                        setNewEmp(prev => ({ ...prev, designation: e.target.value }));
                      }} 
                      autoFocus
                    />
                    <button className="p-1 hover:bg-gray-100 rounded" onClick={() => setCustomDesig({ ...customDesig, add: false })}><X className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Department</label>
                {!customDept.add ? (
                  <select className="input w-full text-xs bg-white" value={newEmp.department}
                    onChange={e => {
                      if (e.target.value === "CUSTOM") {
                        setCustomDept({ ...customDept, add: true });
                      } else {
                        setNewEmp(prev => ({ ...prev, department: e.target.value }));
                      }
                    }}>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    <option value="CUSTOM">+ Custom...</option>
                  </select>
                ) : (
                  <div className="flex gap-1">
                    <input className="input flex-1 text-xs" placeholder="e.g. Research" value={customDeptValue.add}
                      onChange={e => {
                        setCustomDeptValue({ ...customDeptValue, add: e.target.value });
                        setNewEmp(prev => ({ ...prev, department: e.target.value }));
                      }} 
                      autoFocus
                    />
                    <button className="p-1 hover:bg-gray-100 rounded" onClick={() => setCustomDept({ ...customDept, add: false })}><X className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
              {[
                { key: "phone", label: "Phone", placeholder: "+91 98765 43210", type: "text" },
                { key: "joinDate", label: "Join Date", placeholder: "", type: "date" },
                { key: "salary", label: "Monthly Salary (₹)", placeholder: "30000", type: "number" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">{f.label}</label>
                  <input type={f.type} className="input w-full text-xs" placeholder={f.placeholder} value={(newEmp as any)[f.key]}
                    onChange={e => setNewEmp(prev => ({ ...prev, [f.key]: e.target.value }))} />
                </div>
              ))}
              <div className="col-span-2">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Location</label>
                <div className="flex gap-2">
                  {!customCity.add && CITY_MAP[newEmp.state] ? (
                    <select className="input w-1/3 text-xs bg-white" value={newEmp.city} onChange={e => {
                      if (e.target.value === "CUSTOM") {
                        setCustomCity({ ...customCity, add: true });
                        setNewEmp({...newEmp, city: ""});
                      } else {
                        setNewEmp({...newEmp, city: e.target.value});
                      }
                    }}>
                      <option value="">City...</option>
                      {CITY_MAP[newEmp.state].map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="CUSTOM">+ Custom...</option>
                    </select>
                  ) : (
                    <div className="flex gap-1 w-1/3">
                      <input className="input flex-1 text-xs" placeholder="City" value={customCityValue.add || newEmp.city} onChange={e => {
                        setCustomCityValue({ ...customCityValue, add: e.target.value });
                        setNewEmp({...newEmp, city: e.target.value});
                      }} />
                      {CITY_MAP[newEmp.state] && (
                        <button className="p-1 hover:bg-gray-100 rounded" onClick={() => setCustomCity({ ...customCity, add: false })}><X className="w-4 h-4" /></button>
                      )}
                    </div>
                  )}
                  {STATE_MAP[newEmp.country] ? (
                    <select className="input w-1/3 text-xs bg-white" value={newEmp.state} onChange={e => setNewEmp({...newEmp, state: e.target.value})}>
                      <option value="">State...</option>
                      {STATE_MAP[newEmp.country].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <input className="input w-1/3 text-xs bg-white" placeholder="State/Region" value={newEmp.state} onChange={e => setNewEmp({...newEmp, state: e.target.value})} />
                  )}
                  <select className="input w-1/3 text-xs bg-white" value={newEmp.country} onChange={e => setNewEmp({...newEmp, country: e.target.value, state: ""})}>
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <button onClick={addEmployee} className="btn-primary w-full py-2.5 text-xs gap-2">
              <UserPlus className="w-3.5 h-3.5" /> Add Employee
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
