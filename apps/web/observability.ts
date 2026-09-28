import { NodeSDK, logs, metrics } from '@opentelemetry/sdk-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { init as initPyroscope, start as startPyroscope } from '@pyroscope/nodejs';

export function setupOtel() {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;

  new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME,
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [
      new metrics.PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
      }),
    ],
    logRecordProcessors: [new logs.BatchLogRecordProcessor(new OTLPLogExporter())],
  }).start();
}

export function setupPyroscope() {
  const serverAddress = process.env.PYROSCOPE_SERVER_ADDRESS;
  if (!serverAddress) return;

  initPyroscope({ serverAddress, appName: process.env.OTEL_SERVICE_NAME });
  startPyroscope();
}
