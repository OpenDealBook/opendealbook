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
	// mode drives marketing.enabled (below). Per-instance host/TLS live in the
	// ingress block, which this chart renders directly (see below).
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

	// HTTP exposure the chart renders for the web Service. Ingress-agnostic and
	// BYO-friendly: the Service is the stable attach point, and this block is an
	// optional, type-selectable ingress rendered from generic values (no
	// controller hardcoded). One resource at most is rendered.
	//   enabled: false  -> render nothing; attach your own ingress/gateway to
	//                      the web Service.
	//   type: "ingress" -> a classic networking.k8s.io Ingress (default).
	//   type: "gateway" -> a gateway.networking.k8s.io HTTPRoute instead.
	ingress: {
		enabled: bool | *true
		type:    *"ingress" | "gateway"

		// Hostname matched by the Ingress rule / HTTPRoute hostname.
		host: string

		// Ingress only: spec.ingressClassName. Empty selects the cluster's
		// default IngressClass; set it to pin a controller (nginx, traefik, ...).
		className: string | *""

		// Extra annotations on the rendered resource. tls.clusterIssuer, when
		// set, is added as the cert-manager.io/cluster-issuer annotation.
		annotations: {[string]: string}

		// Ingress only. secretName empty -> no tls block.
		tls: {
			secretName:    string | *""
			clusterIssuer: string | *""
		}

		// Gateway only: the parent Gateway(s) the HTTPRoute attaches to.
		parentRefs: [...{name: string, namespace?: string, sectionName?: string}]
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

	// The web Service: the stable backend any ingress/gateway points at.
	service: {
		type:        string | *"ClusterIP"
		port:        int & >0 & <65536
		annotations: {[string]: string}
		name:        string | *""
	}
}
