/**
 * Next.js server instrumentation hook. `register()` runs once per server
 * process, before any request is handled.
 *
 * It wires the app into Grafana Cloud over OTLP so the web service reports
 * traces alongside storytime_be. Everything is configured from the
 * environment (supplied via SSM -> docker --env-file):
 *
 *   OTEL_EXPORTER_OTLP_ENDPOINT  full traces URL, e.g.
 *                                https://otlp-gateway-<zone>.grafana.net/otlp/v1/traces
 *                                (OTEL_EXPORTER_OTLP_TRACES_ENDPOINT wins if set)
 *   OTEL_SERVICE_NAME            storytime-web
 *   GRAFANA_CLOUD_INSTANCE_ID    \ combined into HTTP Basic auth
 *   GRAFANA_CLOUD_API_TOKEN      /
 *   OTEL_EXPORTER_OTLP_HEADERS   optional, takes precedence over the pair above
 *   DEPLOYMENT_ENV               optional telemetry environment label
 *
 * Telemetry is strictly best-effort: with no endpoint configured nothing is
 * imported at all, and any failure while registering is logged and swallowed.
 * A missing or wrong telemetry credential must never stop a page rendering.
 *
 * Only traces are exported. Logs and metrics are deliberately not wired up:
 * this app has no metric instruments and no log pipeline feeding the OTel
 * logs API, so those exporters would push empty payloads forever while
 * looking healthy.
 */
export async function register() {
  // The OTLP exporter and its SDK are Node-only; skip the edge runtime.
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }
  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim() ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) {
    return;
  }

  try {
    const { registerTelemetry } = await import('./lib/otel');
    registerTelemetry();
  } catch (error) {
    console.warn('[OpenTelemetry] disabled - failed to register:', error);
  }
}
