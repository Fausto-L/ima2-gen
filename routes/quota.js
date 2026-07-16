import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
function readCodexTokens() {
    const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
    try {
        const j = JSON.parse(readFileSync(join(codexHome, "auth.json"), "utf8"));
        if (j?.tokens?.access_token) {
            return { access_token: j.tokens.access_token, account_id: j.tokens.account_id ?? "" };
        }
    }
    catch { }
    return null;
}
async function fetchCodexUsage(tokens) {
    try {
        const resp = await fetch("https://chatgpt.com/backend-api/wham/usage", {
            headers: {
                Authorization: `Bearer ${tokens.access_token}`,
                "ChatGPT-Account-Id": tokens.account_id,
            },
            signal: AbortSignal.timeout(8000),
        });
        if (!resp.ok) {
            if (resp.status === 401 || resp.status === 403)
                return { provider: "codex", authenticated: false, windows: [] };
            return { provider: "codex", error: true, windows: [] };
        }
        const data = await resp.json();
        const account = { email: data.email ?? null, plan: data.plan_type ?? null };
        const windows = [];
        if (data.rate_limit?.primary_window) {
            windows.push({
                label: "5h",
                percent: Math.round(data.rate_limit.primary_window.used_percent ?? 0),
                resetsAt: data.rate_limit.primary_window.reset_at
                    ? new Date(data.rate_limit.primary_window.reset_at * 1000).toISOString()
                    : null,
            });
        }
        if (data.rate_limit?.secondary_window) {
            windows.push({
                label: "7d",
                percent: Math.round(data.rate_limit.secondary_window.used_percent ?? 0),
                resetsAt: data.rate_limit.secondary_window.reset_at
                    ? new Date(data.rate_limit.secondary_window.reset_at * 1000).toISOString()
                    : null,
            });
        }
        return { provider: "codex", account, windows };
    }
    catch {
        return { provider: "codex", error: true, windows: [] };
    }
}
function grokTierFromLimit(val) {
    if (val >= 150_000)
        return "SuperGrok Heavy";
    if (val >= 15_000)
        return "SuperGrok";
    return `SuperGrok (${val} val)`;
}
const GROK_BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing";
const GROK_CREDITS_URL = `${GROK_BILLING_URL}?format=credits`;
const GROK_USER_URL = "https://cli-chat-proxy.grok.com/v1/user";
function readGrokTokenCandidates(homeDir = homedir()) {
    const candidates = [];
    try {
        const auth = JSON.parse(readFileSync(join(homeDir, ".grok", "auth.json"), "utf8"));
        for (const [scope, entry] of Object.entries(auth)) {
            if (!entry || typeof entry !== "object")
                continue;
            const value = entry;
            if (typeof value.key !== "string" || !value.key.trim())
                continue;
            candidates.push({
                token: value.key,
                source: scope.startsWith("https://auth.x.ai::") ? "grok:auth-json-oidc" : "grok:auth-json",
                email: typeof value.email === "string" ? value.email : null,
                authMode: typeof value.auth_mode === "string" ? value.auth_mode : null,
                issuer: typeof value.oidc_issuer === "string" ? value.oidc_issuer : null,
                userId: typeof value.user_id === "string" ? value.user_id : null,
            });
        }
    }
    catch { }
    try {
        const auth = JSON.parse(readFileSync(join(homeDir, ".progrok", "auth.json"), "utf8"));
        if (typeof auth.accessToken === "string" && auth.accessToken.trim()) {
            candidates.push({
                token: auth.accessToken,
                source: "progrok:auth-json",
                email: null,
                authMode: null,
                issuer: null,
                userId: null,
            });
        }
    }
    catch { }
    const seen = new Set();
    return candidates.filter((candidate) => {
        if (seen.has(candidate.token))
            return false;
        seen.add(candidate.token);
        return true;
    });
}
function isWeeklyCandidate(candidate) {
    return (candidate.authMode === "oidc" || candidate.authMode === "external")
        && candidate.issuer === "https://auth.x.ai"
        && Boolean(candidate.userId?.trim());
}
function readGrokClientVersion(homeDir = homedir(), grokBinary = "grok") {
    for (const [file, field] of [["version.json", "version"], ["models_cache.json", "grok_version"]]) {
        try {
            const data = JSON.parse(readFileSync(join(homeDir, ".grok", file), "utf8"));
            if (typeof data[field] === "string" && data[field].trim())
                return data[field].trim();
        }
        catch { }
    }
    try {
        const output = execFileSync(grokBinary, ["version"], {
            encoding: "utf8",
            timeout: 3000,
            stdio: ["ignore", "pipe", "ignore"],
        });
        return output.match(/\b\d+\.\d+\.\d+\b/)?.[0] ?? null;
    }
    catch {
        return null;
    }
}
export function inspectGrokWeeklyEligibility(homeDir = homedir(), grokBinary = "grok") {
    const candidates = readGrokTokenCandidates(homeDir);
    const xaiCandidates = candidates.filter((candidate) => (candidate.authMode === "oidc" || candidate.authMode === "external")
        && candidate.issuer === "https://auth.x.ai");
    const eligibleCandidates = xaiCandidates.filter(isWeeklyCandidate);
    const clientVersion = readGrokClientVersion(homeDir, grokBinary);
    const reason = candidates.length === 0 ? "no-auth"
        : xaiCandidates.length === 0 ? "no-xai-auth"
            : eligibleCandidates.length === 0 ? "missing-user-id"
                : !clientVersion ? "no-version"
                    : "ok";
    return {
        eligible: reason === "ok",
        reason,
        candidateCount: eligibleCandidates.length,
        clientVersion,
    };
}
export function parseGrokCreditsResponse(value) {
    if (!value || typeof value !== "object")
        return null;
    const config = value.config;
    if (!config || typeof config !== "object")
        return null;
    const currentPeriod = config.currentPeriod;
    if (!currentPeriod || typeof currentPeriod !== "object")
        return null;
    const period = currentPeriod;
    if (period.type !== "USAGE_PERIOD_TYPE_WEEKLY" || typeof period.end !== "string" || !Number.isFinite(Date.parse(period.end)))
        return null;
    const rawPercent = config.creditUsagePercent;
    if (rawPercent !== undefined && (typeof rawPercent !== "number" || !Number.isFinite(rawPercent)))
        return null;
    return {
        percent: Math.round(Math.min(100, Math.max(0, rawPercent ?? 0))),
        periodEnd: period.end,
    };
}
async function fetchGrokWeeklyCredits(candidate, clientVersion) {
    try {
        const response = await fetch(GROK_CREDITS_URL, {
            headers: {
                Authorization: `Bearer ${candidate.token}`,
                "X-XAI-Token-Auth": "xai-grok-cli",
                "x-authenticateresponse": "authenticate-response",
                "x-userid": candidate.userId,
                "x-grok-client-version": clientVersion,
                "x-grok-client-mode": "headless",
            },
            signal: AbortSignal.timeout(8000),
        });
        if (!response.ok)
            return null;
        return parseGrokCreditsResponse(await response.json());
    }
    catch {
        return null;
    }
}
export async function fetchGrokBilling(homeDir = homedir(), grokBinary = "grok") {
    const candidates = readGrokTokenCandidates(homeDir);
    if (!candidates.length)
        return { provider: "grok", authenticated: false, windows: [] };
    const clientVersion = readGrokClientVersion(homeDir, grokBinary);
    if (clientVersion) {
        for (const candidate of candidates.filter(isWeeklyCandidate)) {
            const weekly = await fetchGrokWeeklyCredits(candidate, clientVersion);
            if (weekly) {
                return {
                    provider: "grok",
                    account: { email: candidate.email, plan: "SuperGrok" },
                    windows: [{ label: "weekly", percent: weekly.percent, resetsAt: weekly.periodEnd }],
                };
            }
        }
    }
    for (const candidate of candidates) {
        try {
            const headers = { Authorization: `Bearer ${candidate.token}` };
            const [billingRes, userRes] = await Promise.allSettled([
                fetch(GROK_BILLING_URL, { headers, signal: AbortSignal.timeout(8000) }),
                fetch(GROK_USER_URL, { headers, signal: AbortSignal.timeout(5000) }),
            ]);
            if (billingRes.status !== "fulfilled" || !billingRes.value.ok)
                continue;
            const billing = (await billingRes.value.json()).config;
            const limit = billing.monthlyLimit.val;
            const used = billing.used.val;
            let email = candidate.email;
            if (userRes.status === "fulfilled" && userRes.value.ok) {
                const user = await userRes.value.json();
                email = user.email ?? email;
            }
            return {
                provider: "grok",
                account: { email, plan: grokTierFromLimit(limit) },
                windows: [{
                        label: "monthly",
                        percent: limit > 0 ? Math.round((used / limit) * 100) : 0,
                        resetsAt: billing.billingPeriodEnd,
                    }],
                billing: { usedUsd: used / 100, limitUsd: limit / 100 },
            };
        }
        catch { }
    }
    return { provider: "grok", authenticated: true, windows: [] };
}
export function registerQuotaRoutes(app, _ctx) {
    app.get("/api/quota", async (_req, res) => {
        try {
            const tokens = readCodexTokens();
            const [codex, grok] = await Promise.all([
                tokens ? fetchCodexUsage(tokens) : Promise.resolve({ provider: "codex", authenticated: false, windows: [] }),
                fetchGrokBilling(),
            ]);
            res.json({ codex, grok });
        }
        catch (e) {
            res.status(500).json({ error: "Failed to fetch quota" });
        }
    });
}
