/** Matches the leaves.leave_type CHECK constraint (migration 20261117k). NULL = not specified. */
export const LEAVE_TYPES = [
  { value: "casual", label: "Casual" },
  { value: "sick", label: "Sick" },
  { value: "annual", label: "Annual / privilege" },
  { value: "unpaid", label: "Unpaid" },
  { value: "other", label: "Other" },
] as const;

export const leaveTypeLabel = (v: string | null | undefined) => LEAVE_TYPES.find(t => t.value === v)?.label ?? null;
