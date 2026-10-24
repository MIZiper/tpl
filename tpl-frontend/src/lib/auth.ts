import { writable, get } from "svelte/store";
import Keycloak from "keycloak-js";

export interface AuthState {
  enabled: boolean;
  authenticated: boolean;
  username: string | null;
  sub: string | null;
  token: string | null;
  roles: string[];
}

export const auth = writable<AuthState>({
  enabled: false,
  authenticated: false,
  username: null,
  sub: null,
  token: null,
  roles: [],
});

let kc: Keycloak | null = null;
let clientId = "";
let initPromise: Promise<void> | null = null;

export async function initAuth(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const resp = await fetch("/api/config");
      const cfg = await resp.json();
      if (!cfg.keycloak_enabled) return;

      clientId = cfg.keycloak_client_id;
      kc = new Keycloak({
        url: cfg.keycloak_url,
        realm: cfg.keycloak_realm,
        clientId: cfg.keycloak_client_id,
      });
      const authenticated = await kc.init({
        onLoad: "check-sso",
        silentCheckSsoRedirectUri:
          window.location.origin + "/silent-check-sso.html",
        checkLoginIframe: false,
      });
      sync(authenticated);
      kc.onTokenExpired = () => {
        kc?.updateToken(30).then(() => sync(true)).catch(() => sync(false));
      };
    } catch (e) {
      console.error("Keycloak init failed", e);
    }
  })();
  return initPromise;
}

function sync(authenticated: boolean) {
  if (!kc) return;
  const tp: any = kc.tokenParsed || {};
  const clientRoles: string[] = tp.resource_access?.[clientId]?.roles ?? [];
  const realmRoles: string[] = tp.realm_access?.roles ?? [];
  auth.set({
    enabled: true,
    authenticated,
    username: tp.name || tp.preferred_username || null,
    sub: tp.sub || null,
    token: kc.token || null,
    roles: [...new Set([...clientRoles, ...realmRoles])],
  });
}

export async function getToken(): Promise<string | null> {
  await initAuth();
  if (!kc?.authenticated) return get(auth).token;
  try {
    await kc.updateToken(30);
    sync(true);
    return kc.token || null;
  } catch {
    sync(false);
    return null;
  }
}

export async function login(): Promise<void> {
  await initAuth();
  await kc?.login({ redirectUri: window.location.href });
}

export async function logout(): Promise<void> {
  await kc?.logout({ redirectUri: window.location.href });
}
