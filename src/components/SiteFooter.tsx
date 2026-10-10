import { ACCURACY_DISCLAIMER, AP_TRADEMARK_DISCLAIMER } from "@/config/site";

// Rendered on every page, which satisfies the College Board's placement rule.
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200 px-6 py-6 text-xs text-zinc-500">
      <p>{AP_TRADEMARK_DISCLAIMER}</p>
      <p className="mt-1">{ACCURACY_DISCLAIMER}</p>
    </footer>
  );
}
