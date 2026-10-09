package opendealbook

// Concrete instance of #Values used to generate templates/workloads.yaml and
// to give `cue vet` real data to check. The three runtime-overridable holes
// (image.repository, image.tag, replica counts) carry defaults here that match
// values.yaml; every other field is baked into the rendered manifest.
values: #Values & {
	// Generation is mode-agnostic: marketing.enabled is a Helm hole, so the
	// same workloads.yaml serves both instances. This mode is only the value
	// `cue vet` checks against; per-instance values live in the XApp claims.
	mode: "public"

	ingress: {
		host: "app.opendealbook.com"
		annotations: {}
		tls: {
			secretName:    "opendealbook-web-tls"
			clusterIssuer: "letsencrypt-clifton-quest"
		}
		parentRefs: []
	}

	image: {
		repository: "ghcr.io/bearbinary/opendealbook"
		tag:        "0.1.0"
		pullPolicy: "IfNotPresent"
	}

	workerImage: {
		repository: "ghcr.io/bearbinary/opendealbook-worker"
		tag:        "0.1.0"
	}

	secretName:         "opendealbook-secrets"
	serviceAccountName: "opendealbook"

	env: {
		NODE_ENV:                    "production"
		SUPABASE_URL:                "http://supabase-kong.supabase.svc.cluster.local:8000"
		OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector.observability.svc.cluster.local:4318"
		OTEL_SERVICE_NAME:           "opendealbook-web"
		PYROSCOPE_SERVER_ADDRESS:    "http://pyroscope.observability.svc.cluster.local:4040"
		TEMPORAL_ADDRESS:            "temporal-frontend.temporal.svc.cluster.local:7233"
		GOTENBERG_URL:               "http://gotenberg.gotenberg.svc.cluster.local:3000"
		DOCLING_URL:                 "http://docling-serve.docling.svc.cluster.local:5001"
		NOVU_API_URL:                "http://novu-api.novu.svc.cluster.local:3000"
		NANGO_SERVER_URL:            "http://nango-server.nango.svc.cluster.local:3003"
	}

	web: {
		replicaCount: 2
		port:         3000
		probePath:    "/api/healthcheck"
		resources: {
			requests: {cpu: "250m", memory: "512Mi"}
			limits: {cpu: "1", memory: "1Gi"}
		}
	}

	workers: {
		replicaCount: 1
		command: []
		args: []
		resources: {
			requests: {cpu: "250m", memory: "512Mi"}
			limits: {cpu: "1", memory: "1Gi"}
		}
	}

	service: {
		type: "ClusterIP"
		port: 3000
		annotations: {}
		name: ""
	}
}
