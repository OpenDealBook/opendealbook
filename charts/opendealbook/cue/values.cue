package opendealbook

// #Values is the chart's parameter contract. It mirrors values.yaml and
// values.schema.json. Only a handful of these become Helm holes at render
// time (see holes.cue); the rest are baked into templates/workloads.yaml at
// generate time from fixture.cue, which is the Hybrid C tradeoff: config is
// compile-time CUE, not runtime Helm templating.

#Resources: {
	requests: {cpu: string, memory: string}
	limits: {cpu: string, memory: string}
}

#Values: {
	// Release instance selector. One shared chart serves both:
	//   public   = hosted OpenDealbook for the world; marketing site OFF
	//              (straight to auth/app, no robots/sitemap surface).
	//   internal = internal platform instance; marketing site ON.
	// mode drives marketing.enabled (below) plus the per-instance ingress
	// block that the XApp claim / composite consumes for domain and TLS.
	mode: "public" | "internal"

	// Marketing route-group toggle for apps/web. Derived from mode:
	// internal -> true, public -> false. Rendered into the web pod as the
	// NEXT_PUBLIC_ENABLE_MARKETING env var (a Helm hole so one chart serves
	// both instances). NOTE: apps/web does not yet read this var; the app
	// lane must wire feature-flags.config.ts to it (see README).
	marketing: enabled: bool & (mode == "internal")

	image: {
		repository: string
		tag:        string
		pullPolicy: "Always" | "IfNotPresent" | "Never"
	}

	// Per-instance HTTP exposure. Not rendered by the chart workloads; the
	// ingress/HTTPRoute + ClusterIssuer live in the platform composite, and
	// the XApp claim passes these through. Kept here so both instances are
	// described by one schema.
	ingress: {
		host:          string
		className:     string
		clusterIssuer: string
		tlsSecretName: string
	}

	// Secret synced into the namespace by an ESO ExternalSecret from OpenBao.
	// Loaded via envFrom.secretRef on both workloads; the chart never inlines
	// secret material. Empty string disables the secret envFrom.
	secretName: string

	serviceAccountName: string

	// Non-secret runtime endpoints, baked into the pod env at generate time.
	env: {[string]: string}

	web: {
		replicaCount: int & >0
		port:         int & >0 & <65536
		probePath:    string
		resources:    #Resources
	}

	workers: {
		replicaCount: int & >0
		command: [...string]
		args: [...string]
		resources: #Resources
	}

	service: {
		type: string
		port: int & >0 & <65536
	}
}
