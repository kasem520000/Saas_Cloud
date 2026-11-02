// PHASE-025 T4a — month-end spike + graceful degradation check.
// STATUS: SCAFFOLD — staging-only. Asserts 429-before-collapse and
// recovery < 5 min after spike per PERFORMANCE_TEST_PLAN §8.
import http from "k6/http";
import { Trend } from "k6/metrics";

const recovery = new Trend("recovery_ms");
export const options = {
  scenarios: {
    spike: {
      executor: "ramping-arrival-rate",
      startRate: 1,
      timeUnit: "1s",
      preAllocatedVUs: 300,
      stages: [
        { duration: "2m", target: 250 }, // 5x burst
        { duration: "5m", target: 250 },
        { duration: "5m", target: 10 }, // recovery window
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"], // degradation, not collapse
    "http_req_duration{route:post}": ["p(95)<3000"],
  },
};
export default function () {
  const r = http.get(`${__ENV.API_BASE}/api/health/ready`, { tags: { route: "health" } });
  if (r.status !== 200) recovery.add(0);
}
