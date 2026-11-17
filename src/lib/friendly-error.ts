/**
 * Turns database / network error text into a sentence a staff member can act
 * on. Unknown messages pass through unchanged, so nothing useful is hidden.
 * Applied to every error toast by AppToaster.
 */
const RULES: [RegExp, string][] = [
  [/row-level security|permission denied|insufficient_privilege|\b42501\b/i, "You don't have permission to do that. Ask an admin if you need access."],
  [/duplicate key value|\b23505\b|unique constraint/i, "This already exists. A record with the same details is already saved."],
  [/foreign key constraint|\b23503\b/i, "This is still linked to other records, so it can't be changed or removed yet."],
  [/check constraint|\b23514\b/i, "One of the values isn't allowed. Check the form and try again."],
  [/JWT expired|invalid JWT|refresh token|Auth session missing/i, "Your session has expired. Please sign in again."],
  [/Failed to fetch|NetworkError|Load failed|network request failed/i, "Can't reach the server. Check your internet connection and try again."],
  [/statement timeout|canceling statement|\b57014\b|timed? ?out/i, "That took too long. Please try again in a moment."],
  [/PGRST116|multiple \(or no\) rows|JSON object requested/i, "That record wasn't found. It may have been deleted."],
  [/too many requests|rate limit|\b429\b/i, "Too many attempts. Wait a moment and try again."],
  [/invalid input syntax for type uuid/i, "That link or record ID isn't valid."],
  [/invalid input syntax for type (numeric|integer|bigint|double)/i, "Please enter a valid number."],
  [/invalid input syntax for type (date|timestamp)/i, "Please enter a valid date."],
];

function humanColumn(col: string) {
  return col.replace(/_id$/, "").replace(/_/g, " ");
}

export function friendlyError(message: string): string {
  const notNull = message.match(/null value in column "([^"]+)"/i);
  const rule = RULES.find(([re]) => re.test(message));
  const friendly = notNull ? `Please fill in ${humanColumn(notNull[1])}.` : rule?.[1];
  if (!friendly) return message;
  // Keep a short caller prefix such as "Unmasking failed: ".
  const cut = message.indexOf(": ");
  const prefix = cut > 0 && cut <= 40 ? message.slice(0, cut) : "";
  return prefix && !RULES.some(([re]) => re.test(prefix)) ? `${prefix}: ${friendly}` : friendly;
}
