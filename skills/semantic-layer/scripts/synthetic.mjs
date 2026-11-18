const dataset = '11111111-1111-4111-8111-111111111111';
const column = (id, name, type, description) => ({ id, name: { en: name }, type, kind: 'column', resource: 'column', dataset_id: dataset, description: { en: description }, ai_context: null, expression: null });
export const syntheticCapture = {
  schema_version: 1,
  captured_at: '2026-10-28T10:00:00.000Z',
  host: 'https://api.example.invalid',
  selection: [dataset],
  complete: true,
  issues: [],
  dashboards: [],
  resources: [
    { id: dataset, name: { en: 'Fictional order lines' }, kind: 'dataset', resource: 'securable', dataset_id: dataset, type: 'dataset', description: { en: 'One row per order line. For sales and refund analysis.' }, ai_context: 'Synthetic fixture contract: net line amounts are EUR excluding tax; negative values are refunds.' },
    column('22222222-2222-4222-8222-222222222222', 'tenant_id', 'hierarchy', 'Tenant identifier.'),
    column('33333333-3333-4333-8333-333333333333', 'order_date', 'datetime', 'Order creation timestamp.'),
    column('44444444-4444-4444-8444-444444444444', 'net_revenue', 'numeric', 'Net line revenue. Negative values represent refunds.'),
    column('55555555-5555-4555-8555-555555555555', 'line_id', 'hierarchy', 'Order-line identifier.'),
    column('66666666-6666-4666-8666-666666666666', 'status', 'hierarchy', 'Recorded order status.')
  ]
};
export const syntheticKnowledgeCapture = {
  schema_version: 1, host: 'https://api.example.invalid', selection: ['11111111-1111-4111-8111-111111111111'], captured_at: '2026-10-28T12:00:00Z', complete: true, issues: [],
  resources: [
    { id: '77777777-7777-4777-8777-777777777777', resource: 'airule', kind: 'rule', name: 'Answer style', organization_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', latest_version: { id: '99999999-9999-4999-8999-999999999999', name: 'Answer style', content: 'Prefer concise answers.' }, published_version: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Answer style', content: 'Use concise answers.' }, linked_agent_ids: ['88888888-8888-4888-8888-888888888888'] },
    { id: '88888888-8888-4888-8888-888888888888', resource: 'agent', kind: 'agent', name: { en: 'Sales analyst' }, description: { en: 'Answers sales questions.' }, capabilities: ['data_analysis'], theme_id: null, dataset_ids: ['11111111-1111-4111-8111-111111111111'], rule_refs: ['77777777-7777-4777-8777-777777777777'] },
  ],
};
