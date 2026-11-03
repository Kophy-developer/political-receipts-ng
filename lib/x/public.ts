export const xProductionOrigin = "https://political-receipts-ng.vercel.app";

export const xCallbackUrl = `${xProductionOrigin}/api/auth/x/callback`;

export const xScopes = ["tweet.read", "tweet.write", "users.read", "offline.access"] as const;
