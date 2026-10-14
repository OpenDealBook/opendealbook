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
{{ .Values.workerImage.repository }}
{{ .Values.workerImage.tag }}
{{ .Values.marketing.enabled }}
{{ include "opendealbook.fullname" . }}
{{ .Release.Namespace }}
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
`enabled == (mode == "internal")`). Per-instance host / TLS live in the
`ingress` block (see [Ingress](#ingress)); the two instances differ by values,
not by separate charts.

### App-side caveat (surfaced, not resolved here)

`apps/web` has **no** marketing-toggle env var today. `config/feature-flags.config.ts`
is a static object (`enableThemeToggle` / `enableTeamAccounts` /
`enablePersonalAccountBilling`); the only `NEXT_PUBLIC_*` vars are
`NEXT_PUBLIC_DEFAULT_LOCALE` and `NEXT_PUBLIC_SITE_URL`. This chart emits
`NEXT_PUBLIC_ENABLE_MARKETING` (chosen to match the existing `NEXT_PUBLIC_`
convention), but the app lane must wire `feature-flags.config.ts` (and the
`[locale]/(marketing)` route group / robots / sitemap) to read it. Until then
the toggle has no effect. Confirm the final var name with that lane.

## Ingress

The chart is ingress-agnostic. The web `Service` (default `ClusterIP`, port
`3000`, with configurable `type`, `annotations`, and `name`) is the stable
backend; what sits in front of it is a toggle, not a hardcoded controller.

| `ingress.enabled` | `ingress.type` | Rendered |
| --- | --- | --- |
| `true` (default) | `ingress` (default) | a classic `networking.k8s.io` `Ingress` |
| `true` | `gateway` | a `gateway.networking.k8s.io` `HTTPRoute` |
| `false` | — | nothing; bring your own ingress/gateway, attach it to the Service |

Both render from generic values, with no controller assumed:

- `host` — the Ingress rule host / HTTPRoute hostname.
- `className` — the `Ingress` `ingressClassName`. **Empty (default) selects the
  cluster's default `IngressClass`**; set it to pin a controller (nginx,
  traefik, cloudflare-tunnel, ...). Not used by the gateway type.
- `annotations` — extra annotations on the rendered resource.
- `tls.secretName` / `tls.clusterIssuer` — classic `Ingress` only; when
  `secretName` is set a `tls` block is emitted for `host`, and `clusterIssuer`
  (when set) becomes the controller-neutral `cert-manager.io/cluster-issuer`
  annotation.
- `parentRefs` — gateway type only; the parent `Gateway`(s) the `HTTPRoute`
  attaches to.

Because this is a CUE-baked chart, `ingress` is resolved at generate time: edit
`cue/fixture.cue` and run `make generate`. The two instances differ only by
these values (public uses its public host; internal uses the internal host).

## Deployment

The chart is deploy-tool-agnostic. Install it like any Helm chart:

```
helm install odb charts/opendealbook \
  --set mode=public --set image.tag=0.1.0
```

The platform attaches networking to the web `Service` (or lets the chart render
an `Ingress`/`HTTPRoute`; see [Ingress](#ingress)). How the platform publishes,
syncs, or promotes the chart — GitOps or otherwise — is out of scope for this
chart and lives in the platform repo, not here. This lane does not log in to or
push to any registry.

## Secrets (ESO / OpenBao)

Both workloads load secrets via `envFrom.secretRef` -> `opendealbook-secrets`;
the chart never inlines secret material. That Secret is synced by an ESO
`ExternalSecret` authored in `composites/<cluster>/externalsecrets.cue`
(`secretStoreRef: openbao-backend`), following the repo pattern. Expected keys:
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NANGO_SECRET_KEY`,
`NOVU_API_KEY`, `DOCUMENSO_API_KEY`, `DOCUMENSO_WEBHOOK_SECRET`, `LLM_ENDPOINT`,
`LLM_API_KEY`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`,
`EMAIL_TLS`, `EMAIL_SENDER`, `EMAIL_SENDER_NAME`. Seed
OpenBao (`bao kv put secret/<env>/opendealbook ...`) before the ExternalSecret
can sync.

## Hook Jobs and cross-namespace addresses

`<fullname>-novu-sync` runs after every install and upgrade and registers the
lender notification workflows with Novu, giving it the bridge address
`http://<fullname>-web.<release namespace>.svc.cluster.local:3000/api/novu`. The
full name matters because Novu runs in its own namespace. Novu's api and worker
must list that host in `NOVU_SAFE_OUTBOUND_ALLOW`.

The same Job keeps Novu's SMTP email integration (identifier
`opendealbook-smtp`) in step with the `EMAIL_*` keys and makes it the active
primary, so nothing is set up in the Novu dashboard. The keys it requires are in
[docs/configuration.md](../../docs/configuration.md#lender-room-workflows).
Novu's worker must also be allowed to reach `EMAIL_HOST` when it resolves to a
private address (`NOVU_SAFE_OUTBOUND_ALLOW`).

`DOCUMENSO_URL` is baked to `http://documenso.documenso.svc.cluster.local:3000`.
Three Documenso steps stay manual and are done once, because Documenso v2.18 lets
only a signed-in browser session, not an API token, manage API tokens and
webhooks:

1. Sign in to Documenso as the team that will own the documents, mint an API
   token, and store it in OpenBao `secret/home/opendealbook` as
   `DOCUMENSO_API_KEY`.
2. Generate a webhook secret (`openssl rand -hex 32`) and store it there as
   `DOCUMENSO_WEBHOOK_SECRET`.
3. In that team's Documenso settings create one enabled webhook to
   `http://<fullname>-web.<release namespace>.svc.cluster.local:3000/api/webhooks/documenso`
   with that secret and the events `DOCUMENT_SENT`, `DOCUMENT_COMPLETED`,
   `DOCUMENT_REJECTED`, `DOCUMENT_CANCELLED`, `RECIPIENT_EXPIRED`. Documenso must
   list that host in `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS`.

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
