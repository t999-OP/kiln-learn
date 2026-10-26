import { config, widgetOriginFor } from "#lib/server/config.ts";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals, url }) => ({
  user: locals.user && {
    id: locals.user.id,
    name: locals.user.name,
    email: locals.user.email,
    role: locals.user.role,
    xp: locals.user.xp,
    streak: locals.user.streak,
    guest: locals.user.guest,
  },
  widgetOrigin: widgetOriginFor(url),
  instanceName: config.instanceName,
  registration: config.registration,
  legal: { imprint: config.imprintUrl, privacy: config.privacyUrl },
  sourceUrl: config.sourceUrl,
});
