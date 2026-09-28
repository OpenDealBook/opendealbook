package opendealbook

// The complete, closed set of Helm template holes this chart is allowed to
// emit into templates/workloads.yaml. `make validate` scans the rendered file
// and fails if it finds any `{{ ... }}` not in this set. Everything else is
// baked at generate time from fixture.cue.
//
// Allowed holes:
//   {{ .Values.web.replicaCount }}
//   {{ .Values.workers.replicaCount }}
//   {{ .Values.image.repository }}
//   {{ .Values.image.tag }}
//   {{ .Values.marketing.enabled }}      (public|internal instance toggle)
//   {{ include "opendealbook.fullname" . }}
//   {{- include "opendealbook.labels" . | nindent N }}
//   {{- include "opendealbook.selectorLabels" . | nindent N }}
//
// generate.cue plants sentinels in the structured objects and swaps them for
// these holes after marshaling, so the objects still vet as concrete data.

#holes: {
	// int sentinels (unquoted in YAML -> Helm substitutes an int)
	replicasWeb:     424201
	replicasWorkers: 424202

	// bare-string sentinels (marshal unquoted)
	image:    "0.0.0-ODBIMAGE"
	fullname: "ODBFULLNAME"

	// marketing toggle sentinel: the token is wrapped in quotes on swap so the
	// rendered env value is a quoted string ("true"/"false"), not a YAML bool.
	marketing: "ODBMARKETING"

	// map-key sentinels for the label includes
	labels:   "ODBLABELS"
	selector: "ODBSELECTOR"

	tokens: {
		"424201":        "{{ .Values.web.replicaCount }}"
		"424202":        "{{ .Values.workers.replicaCount }}"
		"0.0.0-ODBIMAGE": "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
		"ODBFULLNAME":   "{{ include \"opendealbook.fullname\" . }}"
		"ODBMARKETING":  "\"{{ .Values.marketing.enabled }}\""
	}
}
