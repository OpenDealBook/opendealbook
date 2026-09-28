import { afterEach, describe, expect, it, vi } from 'vitest';

const { nodeSdkStart } = vi.hoisted(() => ({ nodeSdkStart: vi.fn() }));

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: vi.fn(function () {
    return { start: nodeSdkStart };
  }),
  metrics: { PeriodicExportingMetricReader: vi.fn() },
  logs: { BatchLogRecordProcessor: vi.fn() },
}));
vi.mock('@opentelemetry/exporter-trace-otlp-proto', () => ({ OTLPTraceExporter: vi.fn() }));
vi.mock('@opentelemetry/exporter-metrics-otlp-proto', () => ({ OTLPMetricExporter: vi.fn() }));
vi.mock('@opentelemetry/exporter-logs-otlp-proto', () => ({ OTLPLogExporter: vi.fn() }));

import { setupOtel } from './observability';

afterEach(() => {
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  vi.clearAllMocks();
});

describe('setupOtel', () => {
  it('starts the OTLP-backed SDK when the endpoint is configured', () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';

    setupOtel();

    expect(nodeSdkStart).toHaveBeenCalledOnce();
  });

  it('is a no-op when no OTLP endpoint is configured', () => {
    setupOtel();

    expect(nodeSdkStart).not.toHaveBeenCalled();
  });
});
