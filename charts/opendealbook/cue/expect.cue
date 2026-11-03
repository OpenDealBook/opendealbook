package opendealbook

import "list"

_expectWorkerEnv: {
	"\(#holes.fullname)-workers": [{name: "WORKER_QUEUE", value: "main"}]
	"\(#holes.fullname)-workers-bulk": [
		{name: "WORKER_QUEUE", value: "bulk"},
		{name: "OTEL_SERVICE_NAME", value: "opendealbook-workers-bulk"},
	]
}

expectWorkerEnvHolds: {
	for name, wanted in _expectWorkerEnv {
		let found = [for r in _resources if r.kind == "Deployment" && r.metadata.name == name {r}] & [_]
		for e in wanted {
			"\(name) \(e.name)=\(e.value)": true & list.Contains(found[0].spec.template.spec.containers[0].env, e)
		}
	}
}
