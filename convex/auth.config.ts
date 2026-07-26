/// <reference types="node" />

const clientId = process.env.WORKOS_CLIENT_ID;
const apiHostname = process.env.WORKOS_API_HOSTNAME ?? "api.workos.com";
const crossOriginIssuer =
	process.env.WORKOS_JWT_ISSUER ??
	`https://${apiHostname}/user_management/${clientId}`;

export default {
	providers: [
		{
			type: "customJwt" as const,
			issuer: `https://${apiHostname}/`,
			algorithm: "RS256" as const,
			jwks: `https://api.workos.com/sso/jwks/${clientId}`,
			applicationID: clientId,
		},
		{
			type: "customJwt" as const,
			issuer: crossOriginIssuer,
			algorithm: "RS256" as const,
			jwks: `https://api.workos.com/sso/jwks/${clientId}`,
		},
	],
};
