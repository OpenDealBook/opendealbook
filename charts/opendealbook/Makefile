# OpenDealbook Hybrid C / CUE chart.
#
# The workloads are authored in cue/ and generated into
# templates/workloads.yaml; never hand-edit that file. `make validate` runs the
# full gate: cue vet, drift check, helm lint, hole scan, and a rendered cue vet.

# The infra repo sources ci/scripts/lib/python.sh here; that path does not exist
# in the app repo, so pin the interpreter directly.
INFRA_PYTHON := python3

CUE  := cue
HELM := helm

CHART_DIR := $(CURDIR)
CUE_DIR   := $(CHART_DIR)/cue
WORKLOADS := $(CHART_DIR)/templates/workloads.yaml
RELEASE   := odb

.PHONY: all validate generate vet drift lint hole-scan rendered-vet

all: validate

## Regenerate templates/workloads.yaml from cue/.
generate:
	cd $(CUE_DIR) && $(CUE) export -e generated --out text > $(WORKLOADS)
	@echo "generate OK -> $(WORKLOADS)"

## Type-check the CUE (concrete).
vet:
	cd $(CUE_DIR) && $(CUE) vet -c ./...
	@echo "vet OK"

## Fail if the committed workloads.yaml differs from a fresh generation.
drift:
	@tmp=$$(mktemp); \
	cd $(CUE_DIR) && $(CUE) export -e generated --out text > $$tmp; \
	if ! diff -u $(WORKLOADS) $$tmp; then \
		echo "drift DETECTED: run 'make generate' and commit templates/workloads.yaml"; \
		rm -f $$tmp; exit 1; \
	fi; \
	rm -f $$tmp; \
	echo "drift OK: no diff"

## Helm chart lint.
lint:
	$(HELM) lint $(CHART_DIR)

## Only the allowed Helm holes may appear in the generated manifest.
hole-scan:
	$(INFRA_PYTHON) $(CHART_DIR)/hack/hole_scan.py $(WORKLOADS)

## Render the chart and cue-vet every emitted object against the k8s schemas.
rendered-vet:
	@tmp=$$(mktemp -d); \
	mkdir -p $$tmp/cue.mod; \
	printf 'module: "example.com/rendered@v0"\nlanguage: version: "v0.17.1"\n' > $$tmp/cue.mod/module.cue; \
	cp $(CUE_DIR)/k8s.cue $$tmp/; \
	printf 'package opendealbook\n\n#AnyResource: #Deployment | #Service | #ServiceAccount\n' > $$tmp/check.cue; \
	$(HELM) template $(RELEASE) $(CHART_DIR) > $$tmp/rendered.yaml; \
	( cd $$tmp && $(CUE) vet -c ./*.cue rendered.yaml -d '#AnyResource' ) && \
		echo "rendered-vet OK" || { rm -rf $$tmp; exit 1; }; \
	rm -rf $$tmp

validate: vet drift lint hole-scan rendered-vet
	@echo "validate OK"
