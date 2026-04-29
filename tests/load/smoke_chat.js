// k6 smoke test: 1 VU during 1 min.
// Goal: validate happy path no broken after fixes (B2, H1, H3, H4, H5).
// Run: docker run --rm -i --network=chatbot-network -v "$PWD/tests/load:/scripts" grafana/k6 run /scripts/smoke_chat.js
// Override base URL: -e BASE_URL=http://chatbot-backend:8000

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://chatbot-backend:8000';

const chatErrors = new Counter('chat_errors');
const chatBodyChars = new Trend('chat_body_chars');

export const options = {
    vus: 1,
    duration: '1m',
    thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<30000'],
        chat_errors: ['count<3'],
    },
};

const PROMPTS = [
    '¿Qué servicios ofrecen?',
    'Hola, necesito información',
    '¿Cuánto cuesta?',
    'Tengo una duda',
    'Buenos días',
];

export default function () {
    // 1. Health check
    const healthRes = http.get(`${BASE_URL}/api/v1/health`, {
        tags: { name: 'health' },
    });
    check(healthRes, {
        'health status 200': (r) => r.status === 200,
        'health body has status': (r) => r.body && r.body.indexOf('status') >= 0,
    });

    sleep(1);

    // 2. Chat call (consumes full SSE stream)
    const prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
    const conversationId = `smoke-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const payload = JSON.stringify({
        input: prompt,
        conversation_id: conversationId,
        source: 'k6-smoke',
    });

    const chatRes = http.post(`${BASE_URL}/api/v1/chat/`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: '60s',
        tags: { name: 'chat_stream' },
    });

    const ok = check(chatRes, {
        'chat status 200': (r) => r.status === 200,
        'chat body non-empty': (r) => r.body && r.body.length > 0,
    });

    if (!ok) {
        chatErrors.add(1);
        console.error(`Chat failed | status=${chatRes.status} body_prefix=${(chatRes.body || '').slice(0, 200)}`);
    } else {
        chatBodyChars.add((chatRes.body || '').length);
    }

    sleep(2);
}
