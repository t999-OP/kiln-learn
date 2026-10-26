import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals, url }) => {
  if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
  // Guests only get the basic page (export / delete their progress); the rest needs an account.
  if (locals.user.guest && url.pathname !== "/settings") redirect(303, `/signup?next=${encodeURIComponent(url.pathname)}`);
};
