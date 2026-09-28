package opendealbook

// Minimal typed Kubernetes schemas.
//
// The doc's method unifies workloads against the official upstream types
// (apps.#Deployment, core.#Service). Those modules are not published on
// registry.cue.works under any of the paths tried (k8s.io/api/apps/v1,
// k8s.io/api, cue.dev/x/...), and the k8-infra platform itself hand-writes
// its k8s structs in libs/k8s rather than importing upstream. These schemas
// follow that same convention: typed on the fields this chart sets, open
// (...) elsewhere so a field addition fails vet only when mistyped.

#ObjectMeta: {
	name:         string
	namespace?:   string
	labels?:      {[string]: string}
	annotations?: {[string]: string}
	...
}

#EnvVar: {
	name:   string
	value?: string
	...
}

#EnvFromSource: {
	secretRef?:    {name: string, ...}
	configMapRef?: {name: string, ...}
	...
}

#ContainerPort: {
	name?:         string
	containerPort: int & >0 & <65536
	protocol?:     "TCP" | "UDP" | "SCTP"
	...
}

#Probe: {
	httpGet?: {
		path: string
		port: int | string
		...
	}
	initialDelaySeconds?: int & >=0
	periodSeconds?:       int & >0
	timeoutSeconds?:      int & >0
	failureThreshold?:    int & >0
	...
}

#ResourceRequirements: {
	requests?: {[string]: string}
	limits?: {[string]: string}
	...
}

#Container: {
	name:            string
	image:           string
	imagePullPolicy: "Always" | "IfNotPresent" | "Never"
	command?: [...string]
	args?: [...string]
	ports?: [...#ContainerPort]
	env?: [...#EnvVar]
	envFrom?: [...#EnvFromSource]
	resources?:      #ResourceRequirements
	livenessProbe?:  #Probe
	readinessProbe?: #Probe
	securityContext?: {...}
	...
}

#PodSpec: {
	serviceAccountName?: string
	securityContext?: {...}
	containers: [...#Container]
	nodeSelector?: {[string]: string}
	tolerations?: [...]
	affinity?: {...}
	imagePullSecrets?: [...{name: string}]
	...
}

#Deployment: {
	apiVersion: "apps/v1"
	kind:       "Deployment"
	metadata:   #ObjectMeta
	spec: {
		replicas: int
		selector: matchLabels: {[string]: string}
		template: {
			metadata: {
				labels: {[string]: string}
				annotations?: {[string]: string}
			}
			spec: #PodSpec
		}
		...
	}
}

#ServicePort: {
	name?:       string
	port:        int & >0 & <65536
	targetPort:  int | string
	protocol?:   "TCP" | "UDP" | "SCTP"
	...
}

#Service: {
	apiVersion: "v1"
	kind:       "Service"
	metadata:   #ObjectMeta
	spec: {
		type?:    string
		selector: {[string]: string}
		ports: [...#ServicePort]
		...
	}
}
