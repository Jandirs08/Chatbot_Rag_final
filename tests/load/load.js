// k6 load test parametrizado.
// Run: docker run --rm -i --network=chatbot-network -v "C:/path/tests/load:/scripts" \
//   -e VUS=50 -e DURATION=3m -e BASE_URL=http://chatbot-backend:8000 \
//   grafana/k6 run /scripts/load.js
//
// Vars:
//   VUS         - constant VUs (default 50)
//   DURATION    - hold duration (default 3m)
//   RAMP        - ramp-up duration (default 30s)
//   BASE_URL    - backend (default http://chatbot-backend:8000)
//   ERROR_BUDGET - threshold http_req_failed rate (default 0.02)
//   P95_BUDGET  - threshold http_req_duration p95 ms (default 30000)

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://chatbot-backend:8000';
const VUS = parseInt(__ENV.VUS || '50');
const DURATION = __ENV.DURATION || '3m';
const RAMP = __ENV.RAMP || '30s';
const ERROR_BUDGET = parseFloat(__ENV.ERROR_BUDGET || '0.02');
const P95_BUDGET = parseInt(__ENV.P95_BUDGET || '30000');

const chatErrors = new Counter('chat_errors');
const chatTimeouts = new Counter('chat_timeouts');
const chatLatency = new Trend('chat_latency_ms', true);
const chatSuccessRate = new Rate('chat_success_rate');

export const options = {
    stages: [
        { duration: RAMP, target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '15s', target: 0 },
    ],
    thresholds: {
        http_req_failed: [`rate<${ERROR_BUDGET}`],
        http_req_duration: [`p(95)<${P95_BUDGET}`],
        chat_success_rate: ['rate>0.95'],
    },
    discardResponseBodies: false,
};

const PROMPTS = [
    '¿Qué servicios ofrecen?',
    'Hola, necesito información',
    '¿Cuánto cuesta el plan?',
    'Tengo una duda sobre precios',
    'Buenos días, soy nuevo',
    '¿Atienden en mi ciudad?',
    'Necesito hablar con asesor',
    '¿Tienen catálogo?',
    'Información de contacto',
    'Horarios de atención',
];

export default function () {
    const prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)] +
                   ' [vu' + __VU + '-iter' + __ITER + ']';
    const conversationId = `load-${__VU}-${__ITER}-${Date.now()}`;
    const payload = JSON.stringify({
        input: prompt,
        conversation_id: conversationId,
        source: 'k6-load',
    });

    const start = Date.now();
    const res = http.post(`${BASE_URL}/api/v1/chat/`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: '60s',
        tags: { name: 'chat_stream' },
    });
    const elapsed = Date.now() - start;
    chatLatency.add(elapsed);

    const ok = check(res, {
        'status 200': (r) => r.status === 200,
        'body non-empty': (r) => r.body && r.body.length > 0,
    });

    chatSuccessRate.add(ok);

    if (!ok) {
        if (res.error_code === 1050 || res.timings.duration >= 60000) {
            chatTimeouts.add(1);
        }
        chatErrors.add(1);
        if (__ITER < 3 || (__ITER % 50 === 0)) {
            console.error(`VU=${__VU} iter=${__ITER} status=${res.status} err=${res.error_code || 'n/a'} body=${(res.body || '').slice(0, 120)}`);
        }
    }

    sleep(Math.random() * 2 + 1);
}
