/**
 * OpenTelemetry trace export for the parent-facing web app.
 *
 * Loaded lazily from `instrumentation.ts` and ONLY when an OTLP endpoint is
 * configured, so an unconfigured environment (local dev, CI, a container whose
 * SSM parameters are missing) never pays the memory or startup cost of the
 * OpenTelemetry SDK, and never fails to render a page because telemetry is
 * misconfigured.
 *
 * Configuration comes entirely from the environment - see `instrumentation.ts`
 * for the variable list. Header precedence matches storytime_be's
 * `src/otel-setup.ts` `buildOtlpHeaders()` so every service authenticates to
 * Grafana Cloud the same way.
 */
import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPHttpProtoTraceExporter, registerOTel } from '@vercel/otel';

/**
 * Parse the standard `OTEL_EXPORTER_OTLP_HEADERS` format: comma-separated
 * `key=value` pairs, e.g. `Authorization=Basic xxx,X-Scope-OrgID=123`.
 *
 * Values are used verbatim. The OTLP specification defines them as W3C Baggage
 * (i.e. percent-encoded) and this does not decode them - a deliberate match for
 * storytime_be so both services read the variable identically, and lossless for
 * the `Basic <base64>` value we actually set.
 */
function parseOtlpHeaderString(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const idx = pair.indexOf('=');
    if (idx === -1) {
      continue;
    }
    const key = pair.slice(0, idx).trim();
    const rawValue = pair.slice(idx + 1).trim();
    if (!key) {
      continue;
    }
    // Values are W3C Baggage encoded per the OTLP spec, so `Basic%20<b64>`
    // means `Basic <b64>`. @vercel/otel merges these straight into fetch()
    // without decoding, so an encoded space would be sent literally and a
    // Basic-auth gateway would reject it. Malformed encoding is treated as an
    // invalid pair rather than silently forwarded.
    try {
      headers[key] = decodeURIComponent(rawValue);
    } catch {
      diag.warn(
        `OTEL_EXPORTER_OTLP_HEADERS entry "${key}" has malformed percent-encoding and was ignored`
      );
    }
  }
  return headers;
}

/**
 * Build OTLP request headers for the Grafana Cloud OTLP gateway.
 * Precedence:
 *   1. `OTEL_EXPORTER_OTLP_HEADERS` (OTel standard) - used verbatim.
 *   2. `GRAFANA_CLOUD_INSTANCE_ID` + `GRAFANA_CLOUD_API_TOKEN` (or legacy
 *      `GRAFANA_CLOUD_API_KEY`) - encoded as HTTP Basic auth.
 * With neither set this returns `{}`: the exporter still runs (which is what
 * makes a local collector work with no credentials), it just sends no auth.
 *
 * Unlike storytime_be, a set-but-unparseable `OTEL_EXPORTER_OTLP_HEADERS`
 * falls through to the Grafana pair rather than winning with an empty result:
 * a typo in one variable must not silently discard credentials supplied in
 * another.
 */
function buildOtlpHeaders(): Record<string, string> {
  const raw = process.env.OTEL_EXPORTER_OTLP_HEADERS;
  if (raw?.trim()) {
    const parsed = parseOtlpHeaderString(raw);
    if (Object.keys(parsed).length > 0) {
      return parsed;
    }
    diag.warn(
      'OTEL_EXPORTER_OTLP_HEADERS is set but no "key=value" pair could be parsed from it; falling back to GRAFANA_CLOUD_* credentials'
    );
  }

  const instanceId = process.env.GRAFANA_CLOUD_INSTANCE_ID;
  const token =
    process.env.GRAFANA_CLOUD_API_TOKEN || process.env.GRAFANA_CLOUD_API_KEY;
  if (instanceId && token) {
    const basic = Buffer.from(`${instanceId}:${token}`).toString('base64');
    return { Authorization: `Basic ${basic}` };
  }

  return {};
}

/**
 * The endpoint is echoed to the logs, and a URL may legitimately carry
 * credentials in its userinfo (`https://id:token@host/...`), which must never
 * reach container logs. Strip userinfo, and print a placeholder rather than the
 * raw value if it does not parse as a URL.
 */
function redactEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    const hadSecrets = Boolean(
      url.username || url.password || url.search || url.hash
    );
    // Userinfo is not the only place a credential hides: `?api_key=...` and
    // `#token=...` are both real OTLP gateway patterns, and url.toString()
    // preserves them. Drop all four.
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return hadSecrets
      ? `${url.toString()} (credentials redacted)`
      : url.toString();
  } catch {
    return '<unparseable OTLP endpoint>';
  }
}

export function registerTelemetry(): void {
  // `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is the OTLP-spec variable for a full
  // signal URL and wins when present; `OTEL_EXPORTER_OTLP_ENDPOINT` is what
  // this estate's SSM parameters actually set, and is read the same way (see
  // the note on the exporter below).
  const tracesEndpoint = (
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || ''
  ).trim();
  const genericEndpoint = (
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || ''
  ).trim();
  const usingGenericEndpoint = !tracesEndpoint && Boolean(genericEndpoint);
  const endpoint = tracesEndpoint || genericEndpoint;
  if (!endpoint) {
    return;
  }

  // Without a diagnostic logger the SDK swallows export failures completely: a
  // wrong token, a malformed URL and an unreachable gateway all look exactly
  // like success. ERROR level keeps this to real failures so it never becomes
  // a log source of its own on a healthy service.
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

  // Deployment environment, decoupled from NODE_ENV exactly as storytime_be
  // does it: a container can declare itself `staging`/`production` for
  // telemetry without changing application behaviour.
  const deploymentEnvironment =
    process.env.DEPLOYMENT_ENV ||
    process.env.DEPLOYMENT_ENVIRONMENT ||
    process.env.NODE_ENV ||
    'development';

  // A GENERIC endpoint is a base URL and needs the signal path appended;
  // OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is already a full signal URL and must
  // be used as given. @vercel/otel appends /v1/traces only when it configures
  // the exporter from the environment itself — an explicit `url` is passed
  // through untouched, so a base URL would POST to the collector root and the
  // spans would be dropped.
  const tracesUrl = usingGenericEndpoint
    ? `${endpoint.replace(/\/+$/, '')}/v1/traces`
    : endpoint;

  const headers = buildOtlpHeaders();

  // Never send credentials in cleartext. Unauthenticated http:// is left
  // working on purpose — that is how a local collector is used, including the
  // ones these changes were verified against — but an authenticated http://
  // endpoint would put a Grafana token on the wire in the clear.
  if (Object.keys(headers).length > 0 && tracesUrl.startsWith('http://')) {
    diag.error(
      'Refusing to export: OTLP credentials are configured but the endpoint is plaintext http://. Use https://, or remove the credentials for a local collector.'
    );
    return;
  }

  const spanProcessor = new BatchSpanProcessor(
    new OTLPHttpProtoTraceExporter({
      url: tracesUrl,
      headers,
    }),
    // Shorter than the 5000ms default, to narrow the window described in the
    // shutdown note below. Spans are exported on this timer or as soon as
    // `maxExportBatchSize` (512 by default) spans are buffered, whichever
    // comes first.
    { scheduledDelayMillis: 2000 }
  );

  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME || 'storytime-web',
    attributes: {
      'deployment.environment': deploymentEnvironment,
      // Legacy custom attribute kept aligned with storytime_be.
      environment: deploymentEnvironment,
    },
    // A single EXPLICIT span processor, deliberately not `traceExporter` and
    // not "auto". Two reasons, both verified against @vercel/otel 2.1.3:
    //
    // 1. Its default ("auto") span processors add an exporter derived from
    //    OTEL_EXPORTER_OTLP_ENDPOINT *in addition to* any `traceExporter` the
    //    caller passes, so every span would be exported twice.
    // 2. That env-derived exporter appends "/v1/traces" to the endpoint and
    //    reads auth only from OTEL_EXPORTER_OTLP_HEADERS /
    //    OTEL_EXPORTER_OTLP_TRACES_HEADERS. Our endpoint is already a full
    //    signal URL and our credentials arrive as the GRAFANA_CLOUD_* pair, so
    //    those extra requests would go to ".../otlp/v1/traces/v1/traces" with
    //    no Authorization header.
    //
    // Passing `spanProcessors` replaces the "auto" set outright, which is what
    // keeps this to exactly one authenticated exporter pointed at `endpoint`.
    spanProcessors: [spanProcessor],
  });

  // NO shutdown flush hook here, deliberately. Next's standalone server
  // installs its own SIGINT/SIGTERM handler
  // (next/dist/server/lib/start-server.js: `cleanup` -> `process.exit(143)`),
  // and on this build the process was gone within tens of milliseconds of the
  // signal - far less than a round trip to Grafana Cloud - so a flush hook
  // registered alongside it loses the race and would be insurance in name
  // only. Taking shutdown over is possible (Next honours
  // NEXT_MANUAL_SIG_HANDLE, which disables its handlers and hands the whole
  // lifecycle, including closing the HTTP server, to the app) but that is a
  // bigger change to shutdown semantics than telemetry warrants.
  //
  // The exposure is whatever is still buffered when the process dies: normally
  // at most the 2s batch window, but longer if exports are slow or failing,
  // since the queue holds up to 2048 spans and an in-flight export has 30s to
  // time out before the timer resumes.
  console.info(
    `[OpenTelemetry] tracing configured; exporting to ${redactEndpoint(
      endpoint
    )}. Export failures surface through the OTel diagnostic logger - this line does not mean any span has arrived.`
  );
}
