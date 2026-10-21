package opendealbook

import "list"

// Workload definitions for OpenDealbook: the Next.js `web` Deployment + its
// Service, and the long-lived Temporal `workers` Deployment (no Service, no
// probes). web runs the web image, workers runs its own dedicated image
// (Dockerfile.worker); both load the ESO-synced secret via envFrom. Values
// come from fixture.cue; the runtime holes are sentinel values swapped in
// generate.cue (see holes.cue).

_labels: {(#holes.labels): ""}

_selectorWeb: {
	(#holes.selector): ""
	"app.kubernetes.io/component": "web"
}

_selectorWorkers: {
	(#holes.selector): ""
	"app.kubernetes.io/component": "workers"
}

_env: [for k, v in values.env {name: k, value: v}]

_envFrom: [{secretRef: name: values.secretName}]

_web: #Deployment & {
	metadata: {
		name:   "\(#holes.fullname)-web"
		labels: _labels
		annotations: "reloader.stakater.com/auto": "true"
	}
	spec: {
		replicas: #holes.replicasWeb
		selector: matchLabels: _selectorWeb
		template: {
			metadata: labels: _selectorWeb
			spec: {
				serviceAccountName: values.serviceAccountName
				securityContext: {
					runAsNonRoot: true
					runAsUser:    1000
					runAsGroup:   1000
					fsGroup:      1000
					seccompProfile: type: "RuntimeDefault"
				}
				containers: [{
					name:            "web"
					image:           #holes.image
					imagePullPolicy: values.image.pullPolicy
					ports: [{name: "http", containerPort: values.web.port, protocol: "TCP"}]
					env: list.Concat([_env, [
						{name: "ENABLE_MARKETING", value: #holes.marketing},
						{name: "ENABLE_BILLING", value: #holes.billing},
					]])
					envFrom: _envFrom
					resources: {
						requests: {cpu: values.web.resources.requests.cpu, memory: values.web.resources.requests.memory}
						limits: {cpu: values.web.resources.limits.cpu, memory: values.web.resources.limits.memory}
					}
					livenessProbe: {
						httpGet: {path: values.web.probePath, port: "http"}
						initialDelaySeconds: 15
						periodSeconds:       20
						timeoutSeconds:      3
						failureThreshold:    3
					}
					readinessProbe: {
						httpGet: {path: values.web.probePath, port: "http"}
						initialDelaySeconds: 5
						periodSeconds:       10
						timeoutSeconds:      3
						failureThreshold:    3
					}
					securityContext: {
						allowPrivilegeEscalation: false
						readOnlyRootFilesystem:   true
						capabilities: drop: ["ALL"]
						seccompProfile: type: "RuntimeDefault"
					}
				}]
			}
		}
	}
}

_webServiceName: [if values.service.name != "" {values.service.name}, "\(#holes.fullname)-web"][0]

_webService: #Service & {
	metadata: {
		name:   _webServiceName
		labels: _labels
		if len(values.service.annotations) > 0 {
			annotations: values.service.annotations
		}
	}
	spec: {
		type:     values.service.type
		selector: _selectorWeb
		ports: [{name: "http", port: values.service.port, targetPort: "http", protocol: "TCP"}]
	}
}

// Optional ingress for the web Service. generate.cue emits at most one of these
// (_ingress when type=ingress, _httpRoute when type=gateway), and only while
// ingress.enabled; otherwise the Service is the sole attach point.
_ingressAnnotations: {
	values.ingress.annotations
	if values.ingress.tls.clusterIssuer != "" {
		"cert-manager.io/cluster-issuer": values.ingress.tls.clusterIssuer
	}
}

_ingress: #Ingress & {
	metadata: {
		name:   _webServiceName
		labels: _labels
		if len(_ingressAnnotations) > 0 {
			annotations: _ingressAnnotations
		}
	}
	spec: {
		if values.ingress.className != "" {
			ingressClassName: values.ingress.className
		}
		if values.ingress.tls.secretName != "" {
			tls: [{hosts: [values.ingress.host], secretName: values.ingress.tls.secretName}]
		}
		rules: [{
			host: values.ingress.host
			http: paths: [{
				path:     "/"
				pathType: "Prefix"
				backend: service: {
					name: _webServiceName
					port: number: values.service.port
				}
			}]
		}]
	}
}

_httpRoute: #HTTPRoute & {
	metadata: {
		name:   _webServiceName
		labels: _labels
		if len(values.ingress.annotations) > 0 {
			annotations: values.ingress.annotations
		}
	}
	spec: {
		parentRefs: values.ingress.parentRefs
		hostnames: [values.ingress.host]
		rules: [{
			backendRefs: [{
				name: _webServiceName
				port: values.service.port
			}]
		}]
	}
}

_workers: #Deployment & {
	metadata: {
		name:   "\(#holes.fullname)-workers"
		labels: _labels
		annotations: "reloader.stakater.com/auto": "true"
	}
	spec: {
		replicas: #holes.replicasWorkers
		selector: matchLabels: _selectorWorkers
		template: {
			metadata: labels: _selectorWorkers
			spec: {
				serviceAccountName: values.serviceAccountName
				securityContext: {
					runAsNonRoot: true
					runAsUser:    1000
					runAsGroup:   1000
					fsGroup:      1000
					seccompProfile: type: "RuntimeDefault"
				}
				containers: [{
					name:            "workers"
					image:           #holes.workerImage
					imagePullPolicy: values.image.pullPolicy
					if len(values.workers.command) > 0 {
						command: values.workers.command
					}
					if len(values.workers.args) > 0 {
						args: values.workers.args
					}
					env:     _env
					envFrom: _envFrom
					resources: {
						requests: {cpu: values.workers.resources.requests.cpu, memory: values.workers.resources.requests.memory}
						limits: {cpu: values.workers.resources.limits.cpu, memory: values.workers.resources.limits.memory}
					}
					securityContext: {
						allowPrivilegeEscalation: false
						readOnlyRootFilesystem:   true
						capabilities: drop: ["ALL"]
						seccompProfile: type: "RuntimeDefault"
					}
				}]
			}
		}
	}
}

_novuSyncScript: """
	const { NOVU_API_KEY, NOVU_API_URL, NOVU_BRIDGE_URL } = process.env;

	if (!NOVU_API_KEY || !NOVU_API_URL) {
	  console.log('Novu is not configured; skipping the workflow sync');
	  process.exit(0);
	}

	async function novu(method, path, body) {
	  const response = await fetch(`${NOVU_API_URL}${path}`, {
	    method,
	    headers: {
	      authorization: `ApiKey ${NOVU_API_KEY}`,
	      'content-type': 'application/json',
	    },
	    body: JSON.stringify(body),
	  });

	  if (!response.ok) {
	    console.error(`Novu refused ${method} ${path}: ${response.status} ${await response.text()}`);
	    process.exit(1);
	  }

	  return response;
	}

	await novu('POST', '/v1/bridge/sync?source=cli', { bridgeUrl: NOVU_BRIDGE_URL });
	console.log('Synced the lender workflows with Novu');

	const missing = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_SENDER', 'EMAIL_SENDER_NAME']
	  .filter((key) => !process.env[key]);

	if (missing.length > 0) {
	  console.error(`Novu's email integration needs ${missing.join(', ')} in the app secret`);
	  process.exit(1);
	}

	const credentials = {
	  host: process.env.EMAIL_HOST,
	  port: process.env.EMAIL_PORT,
	  secure: process.env.EMAIL_TLS !== 'false',
	  user: process.env.EMAIL_USER,
	  password: process.env.EMAIL_PASSWORD,
	  from: process.env.EMAIL_SENDER,
	  senderName: process.env.EMAIL_SENDER_NAME,
	};
	const identifier = 'opendealbook-smtp';
	const { data: integrations } = await (await novu('GET', '/v1/integrations')).json();
	const existing = integrations.find((integration) => integration.identifier === identifier);

	if (existing) {
	  await novu('PUT', `/v1/integrations/${existing._id}`, { credentials });
	}

	const { _id } = existing
	  ?? (await (await novu('POST', '/v1/integrations', { identifier, providerId: 'nodemailer', channel: 'email', credentials })).json()).data;
	await novu('POST', `/v1/integrations/${_id}/set-primary`);
	console.log('Made the SMTP email integration the active primary in Novu');
	"""

// Novu fetches the lender workflow definitions from the web app's bridge and
// replaces what it holds, and the Job finds its SMTP integration by a fixed
// identifier, so a re-run converges. Deploy with --wait (or an
// Argo CD sync, which waits for health) so the bridge it reads is the new
// version.
_novuSync: #Job & {
	metadata: {
		name:   "\(#holes.fullname)-novu-sync"
		labels: _labels
		annotations: {
			"helm.sh/hook":               "post-install,post-upgrade"
			"helm.sh/hook-delete-policy": "before-hook-creation"
		}
	}
	spec: template: spec: {
		restartPolicy: "OnFailure"
		securityContext: {
			runAsNonRoot: true
			runAsUser:    1000
			runAsGroup:   1000
			fsGroup:      1000
			seccompProfile: type: "RuntimeDefault"
		}
		containers: [{
			name:            "novu-sync"
			image:           #holes.image
			imagePullPolicy: values.image.pullPolicy
			command: ["node", "--input-type=module", "--eval", _novuSyncScript]
			env: list.Concat([_env, [{name: "NOVU_BRIDGE_URL", value: "http://\(_webServiceName).\(#holes.namespace).svc.cluster.local:\(values.service.port)/api/novu"}]])
			envFrom: _envFrom
			resources: {
				requests: {cpu: "50m", memory: "128Mi"}
				limits: {cpu: "250m", memory: "256Mi"}
			}
			securityContext: {
				allowPrivilegeEscalation: false
				readOnlyRootFilesystem:   true
				capabilities: drop: ["ALL"]
				seccompProfile: type: "RuntimeDefault"
			}
		}]
	}
}
