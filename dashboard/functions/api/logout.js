// POST /api/logout -- clears the dashboard session cookie. No body in,
// no body out.

import { clearSessionCookieHeader } from "../_lib/auth.js";

export async function onRequestPost() {
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": clearSessionCookieHeader(),
    },
  });
}
