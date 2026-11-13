"use client";
import { useCallback, useEffect, useState } from "react";
import { Trash2, Loader2, Crown, UserPlus } from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { MktSpace, MktSpaceMember, Profile } from "@/types";
import { marketingApi } from "@/lib/marketing-client";

type Tab = "general" | "members";

type Props = {
  open: boolean;
  space?: MktSpace;
  members: Profile[]; // all active staff, for the add picker
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
  onArchived: () => void;
};

export default function SpaceSettingsModal({ open, space, members, canManage, onClose, onSaved, onArchived }: Props) {
  const [tab, setTab] = useState<Tab>("general");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [saving, setSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [spaceMembers, setSpaceMembers] = useState<MktSpaceMember[]>([]);
  const [addPick, setAddPick] = useState("");

  useEffect(() => {
    if (open && space) {
      setName(space.name);
      setColor(space.color || "#3b82f6");
      setTab("general");
      setConfirmArchive(false);
    }
  }, [open, space]);

  const loadMembers = useCallback(async () => {
    if (!space) return;
    try {
      setSpaceMembers(await marketingApi.listSpaceMembers(space.id));
    } catch (e: any) {
      toast.error(e.message || "Could not load members");
    }
  }, [space]);

  useEffect(() => {
    if (open && space && tab === "members") loadMembers();
  }, [open, space, tab, loadMembers]);

  const memberIds = new Set(spaceMembers.map((m) => m.user_id));
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name || members.find((m) => m.id === id)?.email || id;

  async function saveGeneral() {
    if (!space) return;
    const n = name.trim();
    if (!n) return toast.error("Name required");
    setSaving(true);
    try {
      await marketingApi.updateSpace(space.id, { name: n, color });
      onSaved();
      toast.success("Space updated");
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!space) return;
    try {
      await marketingApi.updateSpace(space.id, { archived: true });
      onArchived();
      onClose();
      toast.success("Space archived");
    } catch (e: any) {
      toast.error(e.message || "Archive failed");
    }
  }

  async function addMember() {
    if (!space || !addPick) return;
    try {
      await marketingApi.addSpaceMember(space.id, addPick);
      setAddPick("");
      loadMembers();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function removeMember(uid: string) {
    if (!space) return;
    try {
      await marketingApi.removeSpaceMember(space.id, uid);
      setSpaceMembers((prev) => prev.filter((m) => m.user_id !== uid));
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function toggleOwner(m: MktSpaceMember) {
    if (!space) return;
    try {
      await marketingApi.addSpaceMember(space.id, m.user_id, m.role === "owner" ? "member" : "owner");
      loadMembers();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Space settings" maxWidth="max-w-md">
      <div className="flex gap-1 mb-4 bg-[#f2efe8] rounded-lg p-0.5 w-fit">
        {(["general", "members"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest",
              tab === t ? "bg-white text-[#1c1c1c] shadow-sm" : "text-[#5f5f5d]"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "general" ? (
        <div className="space-y-5">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-black text-[#5f5f5d]/60 uppercase tracking-widest block mb-1.5">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canManage}
                className="w-full text-sm font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-3 py-2 disabled:opacity-60"
              />
            </div>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              disabled={!canManage}
              className="w-10 h-9 rounded-lg border border-[#eceae4] bg-white p-0.5"
            />
          </div>

          {canManage && (
            <div className="flex items-center justify-between border-t border-[#eceae4] pt-4">
              {confirmArchive ? (
                <button onClick={archive} className="px-3 py-2 rounded-lg bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest">
                  Archive — sure?
                </button>
              ) : (
                <button
                  onClick={() => setConfirmArchive(true)}
                  className="px-3 py-2 rounded-lg border border-[#eceae4] text-rose-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Archive Space
                </button>
              )}
              <button
                onClick={saveGeneral}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-[#1c1c1c] text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {spaceMembers.map((m) => (
            <div key={m.user_id} className="flex items-center gap-2 p-2 rounded-xl border border-[#eceae4]">
              <span className="w-6 h-6 rounded-full bg-[#1c1c1c] text-white text-[9px] font-black flex items-center justify-center flex-shrink-0">
                {(nameOf(m.user_id).slice(0, 2)).toUpperCase()}
              </span>
              <span className="text-[13px] font-semibold text-[#1c1c1c] flex-1 truncate">
                {m.user?.name || m.user?.email || nameOf(m.user_id)}
              </span>
              {m.role === "owner" && <Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
              {canManage && (
                <>
                  <button
                    onClick={() => toggleOwner(m)}
                    className="text-[9px] font-black uppercase tracking-widest text-[#5f5f5d] hover:text-[#1c1c1c]"
                  >
                    {m.role === "owner" ? "Demote" : "Make owner"}
                  </button>
                  <button aria-label="Delete" onClick={() => removeMember(m.user_id)} className="text-[#5f5f5d] hover:text-rose-500 flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}

          {canManage && (
            <div className="flex items-center gap-2 pt-2">
              <select
                value={addPick}
                onChange={(e) => setAddPick(e.target.value)}
                className="flex-1 text-xs font-medium bg-[#f7f4ed] border border-[#eceae4] rounded-lg px-2 py-2"
              >
                <option value="">Add someone…</option>
                {members
                  .filter((p) => !memberIds.has(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.name || p.email}</option>
                  ))}
              </select>
              <button
                onClick={addMember}
                aria-label="Add member"
                disabled={!addPick}
                className="w-9 h-9 rounded-lg bg-[#1c1c1c] text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40"
              >
                <UserPlus className="w-4 h-4" />
              </button>
            </div>
          )}
          {!canManage && (
            <p className="text-[10px] font-medium text-[#5f5f5d]/60 pt-1">Only a Space owner or admin can change membership.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
