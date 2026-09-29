package opendealbook

import "list"

// Workload definitions for OpenDealbook: the Next.js `web` Deployment + its
// Service, and the long-lived Temporal `workers` Deployment (no Service, no
// probes). Both run the one image and load the ESO-synced secret via envFrom.
// Values come from fixture.cue; the four runtime holes are sentinel values
// swapped in generate.cue (see holes.cue).

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
					env:     list.Concat([_env, [{name: "NEXT_PUBLIC_ENABLE_MARKETING", value: #holes.marketing}]])
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

_webService: #Service & {
	metadata: {
		name:   "\(#holes.fullname)-web"
		labels: _labels
	}
	spec: {
		type:     values.service.type
		selector: _selectorWeb
		ports: [{name: "http", port: values.service.port, targetPort: "http", protocol: "TCP"}]
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
					image:           #holes.image
					imagePullPolicy: values.image.pullPolicy
					if len(values.workers.command) > 0 {
						command: values.workers.command
					}
					if len(values.workers.args) > 0 {
						args: values.workers.args
					}
					env:     list.Concat([_env, [{name: "APP_TARGET", value: "worker"}]])
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
