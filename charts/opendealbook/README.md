# OpenDealbook chart (Hybrid C / CUE)

Two workloads from one image: the Next.js `web` Deployment (+ Service) and the
long-lived Temporal `workers` Deployment. Authored in CUE, not hand-written
Helm templates.

## How it is built

Deployment and Service fields live in `cue/`, unified against typed Kubernetes
schemas. `templates/workloads.yaml` is **generated** from CUE and must never be
hand-edited. Only a small, closed set of Helm holes survives generation; every
other value is baked in at generate time from `cue/fixture.cue`.

```
cue/
  cue.mod/module.cue   module: github.com/k8-infra/opendealbook-chart@v0
  k8s.cue              typed #Deployment / #Service schemas
  values.cue           #Values contract (mirrors values.yaml + values.schema.json)
  fixture.cue          concrete #Values instance used to generate + vet
  holes.cue            the closed set of allowed Helm holes (+ sentinel map)
  workload.cue         web Deployment + Service, workers Deployment
  generate.cue         marshals objects, swaps sentinels for holes -> `generated`
templates/
  _helpers.tpl         name / fullname / chart / labels / selectorLabels helpers
  workloads.yaml       GENERATED — do not edit; run `make generate`
  hooks.yaml           hand-written hooks slot (empty until migrations exist)
hack/hole_scan.py      enforces the allowed-hole set
Makefile               make generate | make validate
values.yaml            defaults; only the holes are live at render time
values.schema.json     XApp contract
```

### Allowed Helm holes (the only render-time substitutions)

```
{{ .Values.web.replicaCount }}
{{ .Values.workers.replicaCount }}
{{ .Values.image.repository }}
{{ .Values.image.tag }}
{{ .Values.marketing.enabled }}
{{ include "opendealbook.fullname" . }}
{{- include "opendealbook.labels" . | nindent N }}
{{- include "opendealbook.selectorLabels" . | nindent N }}
```

### Regenerate and validate

```
make generate    # cue export -> templates/workloads.yaml
make validate    # cue vet -c ; drift check ; helm lint ; hole scan ; rendered cue vet
```

`cue mod tidy` is run in `cue/`. Tooling used: cue v0.17.1, helm v4.2.3,
python3.

## Two instances from one chart

The same chart serves both instances; they differ only by values / claim, never
by separate charts.

| | `mode: public` | `mode: internal` |
| --- | --- | --- |
| Audience | hosted OpenDealbook for the world | internal platform |
| Marketing site | **OFF** | **ON** |
| `marketing.enabled` | `false` | `true` |
| Env var rendered | `NEXT_PUBLIC_ENABLE_MARKETING=false` | `NEXT_PUBLIC_ENABLE_MARKETING=true` |
| Domain / ingress / TLS | public (`opendealbook.com`) | internal host |

`mode` drives `marketing.enabled` (invariant enforced in `values.cue`:
`enabled == (mode == "internal")`) and selects the per-instance `ingress` block
that the platform composite / claim consumes for host, class, and issuer.

### App-side caveat (surfaced, not resolved here)

`apps/web` has **no** marketing-toggle env var today. `config/feature-flags.config.ts`
is a static object (`enableThemeToggle` / `enableTeamAccounts` /
`enablePersonalAccountBilling`); the only `NEXT_PUBLIC_*` vars are
`NEXT_PUBLIC_DEFAULT_LOCALE` and `NEXT_PUBLIC_SITE_URL`. This chart emits
`NEXT_PUBLIC_ENABLE_MARKETING` (chosen to match the existing `NEXT_PUBLIC_`
convention), but the app lane must wire `feature-flags.config.ts` (and the
`[locale]/(marketing)` route group / robots / sitemap) to read it. Until then
the toggle has no effect. Confirm the final var name with that lane.

## Deployment: XApp claim + OCI publish

This repo has **no** `XApp` XRD; the closest real construct is an ArgoCD
`Application` entry authored in CUE in `composites/<cluster>/argocd.cue`. The
"XApp claim" below is that entry, pinning chart name, chart version, image
repository, and image tag. Two claims, one chart:

```cue
// composites/<cluster>/argocd.cue — PUBLIC instance
opendealbookPublic: {
	repoURL:        "ghcr.io/bearbinary/charts"
	chart:          "opendealbook"
	targetRevision: "0.1.0" // chartVersion; pin by digest for prod
	helm: valuesObject: {
		mode: "public"
		marketing: enabled: false
		image: {repository: "ghcr.io/bearbinary/opendealbook", tag: "0.1.0"}
		web: replicaCount:     2
		workers: replicaCount: 1
		ingress: {
			host:          "app.opendealbook.com"
			className:     "cloudflare-tunnel"
			clusterIssuer: "letsencrypt-clifton-quest"
			tlsSecretName: "opendealbook-web-tls"
		}
	}
}

// composites/<cluster>/argocd.cue — INTERNAL instance
opendealbookInternal: {
	repoURL:        "ghcr.io/bearbinary/charts"
	chart:          "opendealbook"
	targetRevision: "0.1.0" // SAME chart + version as public
	helm: valuesObject: {
		mode: "internal"
		marketing: enabled: true
		image: {repository: "ghcr.io/bearbinary/opendealbook", tag: "0.1.0"}
		web: replicaCount:     1
		workers: replicaCount: 1
		ingress: {
			host:          "opendealbook.clifton.internal"
			className:     "traefik"
			clusterIssuer: "openbao-clifton-internal"
			tlsSecretName: "opendealbook-internal-web-tls"
		}
	}
}
```

OCI publish (run by the platform team with registry credentials — **do not run
here**, no login/push from this lane):

```
helm package charts/opendealbook               # -> opendealbook-0.1.0.tgz
helm push opendealbook-0.1.0.tgz oci://ghcr.io/bearbinary/charts
# prod promotion pins the resulting digest, per docs/helm-immutable-upgrades.md
```

## Secrets (ESO / OpenBao)

Both workloads load secrets via `envFrom.secretRef` -> `opendealbook-secrets`;
the chart never inlines secret material. That Secret is synced by an ESO
`ExternalSecret` authored in `composites/<cluster>/externalsecrets.cue`
(`secretStoreRef: openbao-backend`), following the repo pattern. Expected keys:
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NANGO_SECRET_KEY`,
`NOVU_API_KEY`, `DOCUMENSO_API_TOKEN`, `LLM_ENDPOINT`, `LLM_API_KEY`. Seed
OpenBao (`bao kv put secret/<env>/opendealbook ...`) before the ExternalSecret
can sync.

## Open decisions (carried from k8-infra infrastructure/opendealbook/DECISIONS.md)

1. Target cluster (no dedicated prod cluster; `home` vs new `composites/<prod>/`).
2. Supabase: managed (Supabase Cloud) vs self-hosted in-cluster on CNPG.
3. Container registry + image build/CI + Dockerfile (`apps/web`, `apps/workers`
   have no Dockerfile; single vs split image; private -> imagePullSecret).
4. Domain + TLS issuer (`opendealbook.com` covered by neither existing issuer).
5. Which dependencies run in-cluster vs managed (Temporal, Nango, Documenso,
   Gotenberg, Docling, Novu, observability — see DEPENDENCIES.md).
6. Observability: in-cluster LGTM vs Grafana Cloud forwarder.
7. Storage classes / PVC sizes if Postgres or object storage runs in-cluster.
8. Single vs multi-tenant cluster (NetworkPolicy, ResourceQuota, blast radius).
9. Workers entrypoint + web health route (`workers.command`; `web.probePath`).
