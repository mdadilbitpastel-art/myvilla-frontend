"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { TicketPercent, Pencil, Trash2, Plus, X, CalendarClock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/lib/confirm";
import { useVillaCount, setCouponCount } from "@/lib/useProperty";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import DateField from "@/components/ui/DateField";
import {
  fetchMyCoupons,
  fetchMyVillas,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  type Coupon,
  type CouponInput,
  type CouponDiscountType,
  type CouponStatus,
  type Villa,
} from "@/lib/api";

// Same rule the backend enforces (see _COUPON_CODE_RE): 3–32 chars, starts
// alphanumeric, then letters/numbers/dash/underscore.
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

/* ---------- validity helpers ---------- */

// Local YYYY-MM-DD. toISOString() would shift the day in western time zones.
function iso(d: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y) return date;
  return iso(new Date(y, m - 1, d + n));
}

function prettyDate(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y) return value;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// The shortcuts hosts reach for. Each is a run length in days counted
// INCLUSIVELY from the start date, so "7 days" ends on the 7th day, not the
// 8th — the resolved date is always spelled out under the fields so there is
// nothing to guess. `days: 0` clears the expiry entirely.
const VALIDITY_PRESETS = [
  { label: "No expiry", days: 0 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "3 months", days: 90 },
] as const;

/** How the host's list badges a coupon — wording and colour per state. */
const STATUS_STYLE: Record<CouponStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-50 text-green-700" },
  scheduled: { label: "Scheduled", className: "bg-blue-50 text-blue-700" },
  expired: { label: "Expired", className: "bg-red-50 text-red-600" },
  inactive: { label: "Inactive", className: "bg-page text-muted" },
};

type FormState = {
  id: string | null; // null = creating, else editing
  code: string;
  villaId: string; // "" = all villas
  discountType: CouponDiscountType;
  discountValue: string;
  active: boolean;
  // Validity period — both optional, both inclusive. "" = starts now / never
  // expires, which is what a coupon with no dates at all does.
  validFrom: string;
  validUntil: string;
};

const EMPTY_FORM: FormState = {
  id: null,
  code: "",
  villaId: "",
  discountType: "percent",
  discountValue: "",
  active: true,
  validFrom: "",
  validUntil: "",
};

export default function CouponsPage() {
  const { user, ready } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { count, hasProperty } = useVillaCount();

  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [villas, setVillas] = useState<Villa[]>([]);
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([fetchMyCoupons(), fetchMyVillas()])
      .then(([cs, vs]) => {
        setCoupons(cs);
        setVillas(vs);
      })
      .catch((e) =>
        setLoadError(e instanceof Error ? e.message : "Could not load your coupons.")
      );
  }, []);

  useEffect(() => {
    if (ready && user) load();
  }, [ready, user, load]);

  // Keep the sidebar's "0 coupons" mark honest. Watched rather than set inside
  // `load`, so creating the first coupon or deleting the last one moves the
  // mark straight away instead of at the next visit.
  useEffect(() => {
    if (coupons && user) setCouponCount(user.id, coupons.length);
  }, [coupons, user]);

  function startCreate() {
    setForm(EMPTY_FORM);
    setFormError("");
    setShowForm(true);
  }

  function startEdit(c: Coupon) {
    setForm({
      id: c.id,
      code: c.code,
      villaId: c.villaId,
      discountType: c.discountType,
      discountValue: String(c.discountValue),
      active: c.active,
      validFrom: c.validFrom,
      validUntil: c.validUntil,
    });
    setFormError("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setFormError("");
  }

  function clientValidate(): string {
    const code = form.code.trim().toUpperCase();
    if (!CODE_RE.test(code))
      return "Use 3–32 letters or numbers for the code (dashes and underscores allowed).";
    const value = Number(form.discountValue);
    if (!Number.isFinite(value) || value <= 0)
      return "Enter a discount amount greater than zero.";
    if (form.discountType === "percent" && value > 100)
      return "A percentage discount must be between 1 and 100.";
    // Same two rules the server applies to the validity period. It re-checks
    // both against ITS own date, which is the one that counts.
    if (form.validUntil && form.validUntil < iso(new Date()))
      return "The expiry date has already passed. Pick today or a later date.";
    if (form.validFrom && form.validUntil && form.validUntil < form.validFrom)
      return "The expiry date must be on or after the start date.";
    return "";
  }

  async function submit() {
    const err = clientValidate();
    if (err) {
      setFormError(err);
      return;
    }
    setSaving(true);
    setFormError("");
    const input: CouponInput = {
      villaId: form.villaId,
      code: form.code.trim().toUpperCase(),
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      active: form.active,
      validFrom: form.validFrom,
      validUntil: form.validUntil,
    };
    try {
      if (form.id) {
        const updated = await updateCoupon(form.id, input);
        setCoupons((prev) => (prev ?? []).map((c) => (c.id === updated.id ? updated : c)));
        toast.success("Coupon updated.");
      } else {
        const created = await createCoupon(input);
        setCoupons((prev) => [created, ...(prev ?? [])]);
        toast.success("Coupon created.");
      }
      closeForm();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not save the coupon.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: Coupon) {
    try {
      // Every field goes back, not just `active`: the mutation replaces the
      // whole coupon, so omitting the validity period would quietly clear it.
      const updated = await updateCoupon(c.id, {
        villaId: c.villaId,
        code: c.code,
        discountType: c.discountType,
        discountValue: c.discountValue,
        active: !c.active,
        validFrom: c.validFrom,
        validUntil: c.validUntil,
      });
      setCoupons((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the coupon.");
    }
  }

  async function remove(c: Coupon) {
    const ok = await confirm({
      title: "Delete this coupon?",
      message: `"${c.code}" will stop working immediately. This can't be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    setDeletingId(c.id);
    try {
      await deleteCoupon(c.id);
      setCoupons((prev) => (prev ?? []).filter((x) => x.id !== c.id));
      toast.success("Coupon deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the coupon.");
    } finally {
      setDeletingId(null);
    }
  }

  const villaName = useMemo(() => {
    const map = new Map(villas.map((v) => [v.id, v.title]));
    return (id: string) => map.get(id) || "This villa";
  }, [villas]);

  // Guard: signed out.
  if (!ready) return <div className="min-h-[60vh]" />;

  if (!user) {
    return (
      <Guard
        title="You're signed out"
        note="Please sign in to manage your coupons."
      />
    );
  }

  // Guard: no property yet — coupons need a villa to apply to. (The sidebar
  // hides this section too, but a direct link could still land here.)
  if (count !== null && !hasProperty) {
    return (
      <Guard
        title="List a property first"
        note="Coupons apply to your villas, so add a property before creating one."
        actionHref="/settings/property/add"
        actionLabel="Add Property"
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-body px-5 pb-16 pt-4 lg:px-7">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[200px_1fr]">
        <aside>
          <SettingsSidebar />
        </aside>

        <div className="w-full rounded-2xl border border-line bg-white p-6 sm:p-8">
          {/* Header band */}
          <div className="-mx-6 -mt-6 flex items-center justify-between border-b border-line px-6 py-4 sm:-mx-8 sm:-mt-8 sm:px-8">
            <h2 className="text-[16px] font-bold text-ink">Coupons</h2>
            {!showForm && (
              <button
                type="button"
                onClick={startCreate}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
              >
                <Plus size={15} aria-hidden />
                Create Coupon
              </button>
            )}
          </div>

          {/* Create / edit form — opens as a popup modal */}
          {showForm && (
            <CouponModal
              form={form}
              setForm={setForm}
              villas={villas}
              error={formError}
              saving={saving}
              onSubmit={submit}
              onCancel={closeForm}
            />
          )}

          {/* List */}
          {loadError ? (
            <EmptyBox
              title="Couldn't load your coupons"
              note={loadError}
              onRetry={() => {
                setLoadError("");
                setCoupons(null);
                load();
              }}
            />
          ) : coupons === null ? (
            <div className="mt-6 space-y-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="skeleton h-[68px] rounded-xl" />
              ))}
            </div>
          ) : coupons.length === 0 ? (
            <div className="mt-6 flex flex-col items-center rounded-xl border border-dashed border-line px-4 py-14 text-center">
              <TicketPercent size={30} className="text-[#e3ab2e]" aria-hidden />
              <p className="mt-3 text-[15px] font-semibold text-ink">No coupons yet</p>
              <p className="mt-1 max-w-[340px] text-[13px] text-muted">
                Create your first discount code — it&apos;ll show up here and as an
                offer on the home page.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {coupons.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-3 rounded-xl border border-line bg-white p-3.5 transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] sm:gap-4 sm:p-4 ${
                    // Dimmed once it can't be redeemed. A scheduled coupon is
                    // fine — it just hasn't started — so it stays full strength.
                    c.status === "expired" || c.status === "inactive" ? "opacity-75" : ""
                  }`}
                >
                  {/* Coupon icon tile — a golden discount voucher. */}
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#f7d774] to-[#e3ab2e] text-white shadow-sm">
                    <TicketPercent size={22} aria-hidden />
                  </span>

                  {/* Code + value */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[15px] font-bold tracking-wide text-ink">
                      {c.code}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-muted">
                      <span className="font-semibold text-[#ff2d2d]">{c.label}</span>
                      {" · "}
                      {c.scope === "all" ? "All villas" : villaName(c.villaId)}
                    </p>
                    {/* Validity, when the host set any — plus a nudge in the
                        last week, which is when it's worth noticing. */}
                    {c.validityLabel && (
                      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 truncate text-[11.5px]">
                        <span className="flex items-center gap-1 text-muted">
                          <CalendarClock size={12} aria-hidden />
                          {c.validityLabel}
                        </span>
                        {c.status === "active" && c.daysLeft > 0 && c.daysLeft <= 7 && (
                          <span className="font-semibold text-amber-600">
                            · {c.daysLeft === 1 ? "last day" : `${c.daysLeft} days left`}
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Status + toggle */}
                  <div className="flex shrink-0 items-center gap-2.5">
                    <span
                      className={`hidden rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide sm:inline ${
                        STATUS_STYLE[c.status].className
                      }`}
                    >
                      {STATUS_STYLE[c.status].label}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={c.active}
                      aria-label={c.active ? `Deactivate ${c.code}` : `Activate ${c.code}`}
                      onClick={() => toggleActive(c)}
                      className={`relative inline-flex h-[22px] w-10 items-center rounded-full transition-colors duration-200 ${
                        c.active ? "bg-green-500" : "bg-[#d3d6dd]"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          c.active ? "translate-x-[21px]" : "translate-x-[3px]"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Divider */}
                  <span className="hidden h-8 w-px bg-line sm:block" aria-hidden />

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      aria-label={`Edit ${c.code}`}
                      title="Edit"
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-body transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
                    >
                      <Pencil size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(c)}
                      disabled={deletingId === c.id}
                      aria-label={`Delete ${c.code}`}
                      title="Delete"
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-body transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                    >
                      {deletingId === c.id ? (
                        <span className="spinner block" aria-hidden />
                      ) : (
                        <Trash2 size={16} aria-hidden />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- form (popup modal) ---------- */

function CouponModal({
  form,
  setForm,
  villas,
  error,
  saving,
  onSubmit,
  onCancel,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  villas: Villa[];
  error: string;
  saving: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const isPercent = form.discountType === "percent";
  const hasValidity = !!form.validFrom || !!form.validUntil;

  // "Today" is read once per open rather than during render, so the modal can't
  // hydrate against a different date than it renders with. The server re-checks
  // both dates against its own clock anyway — this only bounds the pickers.
  const [today, setToday] = useState("");
  useEffect(() => setToday(iso(new Date())), []);

  /** The expiry a "run for N days" shortcut lands on, counted inclusively. */
  const expiryFor = (days: number) => addDays(form.validFrom || today, days - 1);

  // Lock body scroll while open and close on Escape — standard modal behaviour.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [saving, onCancel]);

  // Portal to <body>: the settings header uses backdrop-blur, which would
  // otherwise trap a fixed overlay inside its containing block.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={form.id ? "Edit coupon" : "New coupon"}
      onMouseDown={(e) => {
        // Backdrop click closes; clicks inside the panel don't bubble here.
        if (e.target === e.currentTarget && !saving) onCancel();
      }}
    >
      <div className="my-auto w-full max-w-[560px] rounded-2xl border border-line bg-white p-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)] sm:p-7">
      <div className="flex items-center justify-between">
        <h3 className="text-[17px] font-bold text-ink">
          {form.id ? "Edit coupon" : "New coupon"}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-page hover:text-ink"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Code */}
        <label className="block">
          <span className="text-[12px] font-medium text-body">Coupon code</span>
          <input
            value={form.code}
            onChange={(e) =>
              setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
            }
            placeholder="SUMMER20"
            autoCapitalize="characters"
            maxLength={32}
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 font-mono text-[14px] tracking-wide text-ink outline-none focus:border-primary"
          />
        </label>

        {/* Applies to */}
        <label className="block">
          <span className="text-[12px] font-medium text-body">Applies to</span>
          <select
            value={form.villaId}
            onChange={(e) => setForm((f) => ({ ...f, villaId: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[14px] text-ink outline-none focus:border-primary"
          >
            <option value="">All my villas (common)</option>
            {villas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
        </label>

        {/* Discount type */}
        <div>
          <span className="text-[12px] font-medium text-body">Discount type</span>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(["percent", "fixed"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm((f) => ({ ...f, discountType: t }))}
                className={`rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-colors ${
                  form.discountType === t
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-line text-body hover:border-primary/40"
                }`}
              >
                {t === "percent" ? "Percentage" : "Fixed amount"}
              </button>
            ))}
          </div>
        </div>

        {/* Value */}
        <label className="block">
          <span className="text-[12px] font-medium text-body">
            {isPercent ? "Percentage off" : "Amount off (USD)"}
          </span>
          <div className="mt-1 flex items-center rounded-lg border border-line bg-white focus-within:border-primary">
            {!isPercent && <span className="pl-3 text-[14px] text-muted">$</span>}
            <input
              value={form.discountValue}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  discountValue: e.target.value.replace(/[^\d.]/g, ""),
                }))
              }
              inputMode="decimal"
              placeholder={isPercent ? "20" : "50"}
              className="w-full bg-transparent px-3 py-2.5 text-[14px] text-ink outline-none"
            />
            {isPercent && <span className="pr-3 text-[14px] text-muted">%</span>}
          </div>
        </label>
      </div>

      {/* Validity — optional at both ends. */}
      <div className="mt-5 rounded-xl border border-line bg-page/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <CalendarClock size={15} className="text-primary" aria-hidden />
            Validity
            <span className="font-normal text-muted">(optional)</span>
          </span>
          {hasValidity && (
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, validFrom: "", validUntil: "" }))}
              className="text-[12px] font-medium text-primary underline underline-offset-2"
            >
              Clear
            </button>
          )}
        </div>

        {/* Shortcuts — each sets the expiry, counted from the start date. */}
        <div className="mt-3 flex flex-wrap gap-2">
          {VALIDITY_PRESETS.map((p) => {
            const selected =
              p.days === 0 ? !form.validUntil : form.validUntil === expiryFor(p.days);
            return (
              <button
                key={p.label}
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, validUntil: p.days === 0 ? "" : expiryFor(p.days) }))
                }
                className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                  selected
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-line bg-white text-body hover:border-primary/40"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <span className="text-[12px] font-medium text-body">Starts</span>
            <DateField
              variant="field"
              label="Coupon start date"
              value={form.validFrom}
              min={today}
              max={form.validUntil || undefined}
              placeholder="Right away"
              onChange={(v) => setForm((f) => ({ ...f, validFrom: v }))}
              className="mt-1"
            />
          </div>
          <div>
            <span className="text-[12px] font-medium text-body">Expires</span>
            <DateField
              variant="field"
              label="Coupon expiry date"
              value={form.validUntil}
              min={form.validFrom || today}
              placeholder="Never"
              onChange={(v) => setForm((f) => ({ ...f, validUntil: v }))}
              className="mt-1"
            />
          </div>
        </div>

        {/* Says back exactly what was set — no counting days in your head. */}
        <p className="mt-2.5 text-[12px] leading-5 text-muted">
          {form.validFrom && form.validUntil
            ? `Guests can use this code from ${prettyDate(form.validFrom)} through ${prettyDate(form.validUntil)} — the last day included.`
            : form.validUntil
              ? `Guests can use this code until the end of ${prettyDate(form.validUntil)}.`
              : form.validFrom
                ? `Guests can use this code from ${prettyDate(form.validFrom)} onwards, with no end date.`
                : "Leave both empty and the code works right away and never expires."}
        </p>
      </div>

      {/* Active */}
      <label className="mt-4 flex items-center gap-2.5">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
          className="h-4 w-4 accent-primary"
        />
        <span className="text-[13px] text-body">
          Active — your on/off switch, separate from the dates above. A coupon
          has to be on <em>and</em> inside its dates for guests to use it.
        </span>
      </label>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-[13px] text-red-600">
          {error}
        </p>
      )}

      <div className="mt-6">
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          className="w-full rounded-lg bg-primary px-5 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
        >
          {saving ? "Saving…" : form.id ? "Save changes" : "Create coupon"}
        </button>
      </div>
      </div>
    </div>,
    document.body
  );
}

/* ---------- small pieces ---------- */

function Guard({
  title,
  note,
  actionHref = "/",
  actionLabel = "Back to home",
}: {
  title: string;
  note: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-body flex-col items-center justify-center px-5 text-center">
      <h1 className="text-[22px] font-bold text-ink">{title}</h1>
      <p className="mt-2 text-[14px] text-body">{note}</p>
      <Link
        href={actionHref}
        className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-dark"
      >
        {actionLabel}
      </Link>
    </div>
  );
}

function EmptyBox({
  title,
  note,
  onRetry,
}: {
  title: string;
  note: string;
  onRetry: () => void;
}) {
  return (
    <div className="mt-6 flex flex-col items-center rounded-xl border border-dashed border-line px-4 py-14 text-center">
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-[320px] text-[13px] text-muted">{note}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
      >
        Try again
      </button>
    </div>
  );
}
