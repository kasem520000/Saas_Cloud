// PHASE-025 T5 — 12h soak at steady mid-load + nightly job noise.
// STATUS: SCAFFOLD — staging-only. Pass criteria: no memory drift, queue
// depths stable, error budget intact (PERFORMANCE_TEST_PLAN §2).
import http from "k6/http";

export const options = {
  scenarios: {
    steady: {
      executor: "constant-arrival-rate",
      rate: 60, // steady mid-load
      timeUnit: "1s",
      duration: "12h",
      preAllocatedVUs: 120,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.001"],
    "http_req_duration{route:doclist}": ["p(95)<500"],
  },
};

export default function () {
  http.get(`${__ENV.API_BASE}/api/health/ready`, { tags: { route: "health" } });
}
