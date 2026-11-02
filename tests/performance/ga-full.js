// PHASE-025 T2 — GA full-load scenario (k6). STATUS: SCAFFOLD — requires the
// production-class hardware profile + staging seeded via seed-load-model.ts;
// NOT runnable in the dev sandbox. Targets T-01..T-08 per PERFORMANCE_TEST_PLAN §2/§3.
// Run: k6 run --env API_BASE=https://staging.example tests/performance/ga-full.js
import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: {
    business_hours: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30m", target: 560 }, // 10x projected, 1.5x peak curve applied by feeder
        { duration: "2h", target: 560 },
        { duration: "30m", target: 0 },
      ],
    },
    month_end_spike: {
      executor: "ramping-arrival-rate",
      startTime: "2h45m",
      startRate: 5,
      timeUnit: "2m", // 5x in 2 minutes
      preAllocatedVUs: 200,
      stages: [{ duration: "10m", target: 25 }],
    },
  },
  thresholds: {
    // T-01..T-08 machine-checked (PERFORMANCE_TEST_PLAN §3)
    "http_req_duration{route:doclist}": ["p(95)<500"],
    "http_req_duration{route:post}": ["p(95)<300"],
    "http_req_duration{route:posscan}": ["p(95)<2000"],
    "http_req_duration{route:sync}": ["p(95)<3000"],
    "http_req_duration{route:login}": ["p(95)<1500"],
    http_req_failed: ["rate<0.001"], // 5xx < 0.1%
  },
};

export default function () {
  // tenant mix from seed-load-model.ts is fed via --env TENANT_FILE (JSON)
  const base = __ENV.API_BASE;
  const tenant = JSON.parse(open(__ENV.TENANT_FILE || "./tenant.json"));
  const login = http.post(`${base}/api/auth/login`, JSON.stringify({ tenant: tenant.tenantId }), {
    headers: { "Content-Type": "application/json" },
    tags: { route: "login" },
  });
  check(login, { "login ok": (r) => r.status === 200 });
}
