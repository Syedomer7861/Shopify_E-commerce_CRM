// Self-serve signup is retired - workspaces are provisioned by the platform
// team and handed over with credentials (see /contact and /api/signup's
// 403). This route stays so an old bookmark/link still lands somewhere
// sensible instead of a 404.
import { redirect } from "next/navigation";

export default function SignupPage() {
  redirect("/contact");
}
