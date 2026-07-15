// SDK OAuthClientProvider implementation backed by the token store (030 WP3).
// Server-side flow: redirectToAuthorization never opens a browser — it captures
// the authorization URL so the connect route can return it to the caller.
import { deleteTokenRecord, readTokenRecord, writeTokenRecord, type McpTokenRecord } from "./tokenStore.js";

export interface ServerOAuthProvider {
  readonly redirectUrl: string;
  readonly clientMetadata: Record<string, unknown>;
  state(): string;
  clientInformation(): Record<string, unknown> | undefined;
  saveClientInformation(info: Record<string, unknown>): void;
  tokens(): Record<string, unknown> | undefined;
  saveTokens(tokens: Record<string, unknown>): void;
  redirectToAuthorization(url: URL): void;
  saveCodeVerifier(verifier: string): void;
  codeVerifier(): string;
  /** Set by redirectToAuthorization; consumed by the connect route. */
  readonly lastAuthorizationUrl: string | null;
}

export function createServerOAuthProvider(options: {
  provider: string;
  tokenDir: string;
  origin: string;
  oauthState: string;
}): ServerOAuthProvider {
  const { provider, tokenDir, origin, oauthState } = options;
  const redirectUrl = `${origin}/api/mcp/oauth/callback`;
  let record: McpTokenRecord = readTokenRecord(tokenDir, provider) ?? {};
  if (record.origin && record.origin !== origin) {
    // Origin changed (port fallback / different host): the registered redirect
    // URI no longer matches — drop stale registration and force re-auth.
    deleteTokenRecord(tokenDir, provider);
    record = {};
  }
  const persist = () => writeTokenRecord(tokenDir, provider, { ...record, origin });
  let lastAuthorizationUrl: string | null = null;
  return {
    redirectUrl,
    clientMetadata: {
      client_name: "ima2-gen local studio",
      redirect_uris: [redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    state: () => oauthState,
    clientInformation: () => record.clientInformation,
    saveClientInformation(info) { record.clientInformation = info; persist(); },
    tokens: () => record.tokens,
    saveTokens(tokens) { record.tokens = tokens; persist(); },
    redirectToAuthorization(url) { lastAuthorizationUrl = url.toString(); },
    saveCodeVerifier(verifier) { record.codeVerifier = verifier; persist(); },
    codeVerifier() {
      if (!record.codeVerifier) throw new Error("MCP_OAUTH_VERIFIER_MISSING");
      return record.codeVerifier;
    },
    get lastAuthorizationUrl() { return lastAuthorizationUrl; },
  };
}
