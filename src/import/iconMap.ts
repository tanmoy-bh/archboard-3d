import type { IconKey } from "../model/types";

/**
 * Maps what a draw.io shape is (its stencil names) and what it says (its label) to the closest component.
 * Cloud services map to an equivalent: SNS to Notifications, SQS or Pub/Sub to Queue, and so on.
 *
 * To teach the importer a new service, add a word to the right pattern below. Order matters: the first
 * rule that matches wins, so put specific rules before general ones. Patterns are case insensitive and
 * tested against lower case text.
 */
export const KEYWORDS: [IconKey, RegExp][] = [
  // a backend for frontend or a microservice is a service, whatever else its name says ("Web BFF", "Mobile BFF")
  ["svc", /\bbff\b|backend.?for.?front|micro.?service/],
  // AI first, so "Bedrock agent" is an agent and not a generic service
  ["mcp", /\bmcp\b|model.?context.?protocol/],
  ["guard", /guardrail|content.?(safety|moderation)|moderation/],
  ["rag", /\brag\b|retrieval.?augment|knowledge.?base/],
  ["retriever", /rerank|retriever/],
  ["embed", /embedding|\bembed\b/],
  ["llm", /bedrock|openai|\bgpt|\bllm\b|claude|gemini|anthropic|llama|mistral|large.?language|azure.?openai/],
  ["agent", /\bagents?\b|orchestrator|autogen|langgraph|crewai/],
  ["ai", /sagemaker|vertex.?ai|azure.?ml|machine.?learning|\bml\b|\bai\b|comprehend|rekognition|textract|forecast|personalize|tensorflow|pytorch|inference|cognitive.?services|watson|\bnlp\b/],
  // a queue wins over the store it is built on: "Delay Queue (Redis)" is a queue
  ["queue", /\bsqs\b|pub.?sub|service.?bus|event.?hubs?|kinesis|kafka|rabbit|activemq|\bmq\b|queue|message.?broker|\bnats\b|\bmsk\b|firehose|stream|\btopic\b/],
  // data stores
  ["vector", /pinecone|pgvector|milvus|weaviate|qdrant|chroma|faiss|vector/],
  ["graph", /neptune|neo4j|graph.?db|gremlin|janusgraph|\bgraph\b/],
  ["redis", /redis|memcache|elasticache|memorystore|\bcache\b|\bvalkey\b/],
  ["es", /elasticsearch|opensearch|\belk\b|\bsolr\b|algolia|kendra|cloudsearch|meilisearch|typesense|search.?(index|engine)/],
  ["warehouse", /redshift|bigquery|snowflake|synapse|databricks|data.?warehouse|athena|clickhouse|\bolap\b|data.?lake|lake.?formation/],
  ["files", /\befs\b|filestore|file.?(share|storage|system)|\bnfs\b|\bfsx\b|azure.?files|\bsmb\b|\bebs\b|persistent.?disk|\bvolume\b/],
  ["archive", /glacier|archive|backup|cold.?storage|snapshot/],
  ["blob", /\bs3\b|blob|\bgcs\b|cloud.?storage|object.?stor|bucket|minio|\br2\b|storage.?account/],
  ["db", /\brds\b|aurora|cloud.?sql|cosmos|dynamo|mysql|postgres|mariadb|oracle|sql.?server|mongo|\bdb\b|database|datastore|firestore|bigtable|spanner|cassandra|couchbase|\bsql\b|nosql|documentdb|datastore/],
  // security
  ["key", /\bkms\b|key.?vault|secrets?.?manager|\bsecrets?\b|\bhsm\b|cloudhsm|\bkeys?\b|certificate|\bacm\b/],
  ["identity", /\biam\b|cognito|identity|entra|active.?directory|\bad\b|okta|auth0|\bsso\b|oauth|oidc|keycloak|\bauth\b|authentication|authoriz|\bsaml\b|\bldap\b/],
  ["firewall", /\bwaf\b|firewall|shield|cloud.?armor|security.?group|\bnacl\b|\bddos\b/],
  ["lock", /\block\b|lease|mutex|zookeeper|\betcd\b|consul/],
  // networking and edge
  ["network", /\bvpc\b|vnet|virtual.?network|subnet|peering|transit.?gateway|nat.?gateway|internet.?gateway|\bvpn\b|direct.?connect|expressroute/],
  ["dns", /route.?53|cloud.?dns|\bdns\b|domain|nameserver/],
  ["cdn", /cloudfront|\bcdn\b|cloud.?cdn|akamai|fastly|front.?door|cloudflare/],
  ["card", /stripe|paypal|razorpay|braintree|adyen|payment.?(provider|processor)|credit.?card/],
  ["gateway", /api.?gateway|apigateway|\bapim\b|api.?management|\balb\b|\belb\b|\bnlb\b|load.?balanc|\blb\b|gateway|ingress|nginx|haproxy|envoy|reverse.?proxy/],
  ["websocket", /websocket|\bws\b|socket\.io/],
  ["sse", /\bsse\b|server.?sent/],
  ["webhook", /webhook/],
  ["rest", /\brest\b|restful/],
  ["http", /\bhttps?\b/],
  // messaging: SNS is a notification service, SQS and Pub/Sub are queues
  ["sms", /\bsms\b|twilio|text.?message|pinpoint|vonage|messagebird/],
  ["mail", /\bses\b|sendgrid|mailgun|postmark|e-?mail|smtp|\bmail\b|postfix/],
  ["bell", /\bsns\b|simple.?notification|notification|notify|push.?notif|\bfcm\b|\bapns\b|firebase.?cloud.?messaging|alerting/],
  ["trigger", /eventbridge|event.?grid|\btrigger\b|event.?source/],
  ["timer", /scheduler|\bcron\b|\btimer\b|schedule/],
  // compute
  ["lambda", /lambda|cloud.?functions?|azure.?functions?|function.?app|serverless|\bfaas\b|edge.?functions?/],
  ["cluster", /kubernetes|\bk8s\b|\beks\b|\bgke\b|\baks\b|openshift|\bhelm\b|cluster/],
  ["container", /docker|container|\becs\b|fargate|cloud.?run|\bpods?\b|podman|\becr\b|registry/],
  ["etl", /\bglue\b|dataflow|data.?factory|airflow|\betl\b|pipeline|\bnifi\b|fivetran|\bdbt\b|apache.?beam/],
  ["server", /\bec2\b|virtual.?machine|\bvms?\b|compute.?engine|droplet|bare.?metal|server|instance|\bhost\b|lightsail|app.?engine/],
  // observability
  ["chart", /grafana|dashboard|quicksight|looker|tableau|kibana|power.?bi|analytics|metabase|superset|report/],
  ["alarm", /cloudwatch|stackdriver|cloud.?monitoring|monitor|alarm|alert|prometheus|datadog|new.?relic|nagios|sentry|pagerduty|opsgenie|application.?insights|observab/],
  ["iot", /\biot\b|sensor|greengrass|device.?(hub|shadow)|raspberry|arduino|embedded|\bmqtt\b|\bplc\b/],
  ["doc", /\blogs?\b|document|\bdocs?\b|\bpdf\b|\bfile\b/],
  // people and clients
  ["phone", /mobile|\bios\b|android|iphone|\bphone\b/],
  ["laptop", /browser|\bclient\b|web.?client|front.?end|\bspa\b|desktop|laptop|web.?app|website/],
  ["person", /\buser\b|\busers\b|customer|\bperson\b|\bactor\b|admin|operator|engineer|developer|human|\bbuyer\b|\bseller\b/],
  ["apps", /\bsaas\b|salesforce|slack|jira|zendesk|office.?365|github|third.?party.?apps?/],
  ["globe", /internet|external|public|\bweb\b|\bwww\b|third.?party/],
  // flow chart logic
  ["decision", /decision|condition|\bif\b/],
  ["startend", /^(start|end|begin|stop|finish|terminator)$|flowchart\.terminator/],
  ["loop", /\bretry\b|\bloop\b|\brepeat\b/],
  ["fork", /\bfork\b|\bjoin\b|parallel/],
  ["process", /^(process|step)\b|flowchart\.process/],
  // plain building blocks
  ["svc", /microservice|service|\bapi\b|backend|\bbff\b|\bworker\b|handler|\bapp\b|\bjob\b|controller|manager|engine/],
];

/** Generic draw.io shapes with a clear meaning, used when neither the stencil name nor the label matched. */
const SHAPES: [RegExp, IconKey][] = [
  [/cylinder|flowchart\.(database|stored_data)/, "db"],
  [/\bcloud\b/, "cdn"],
  [/actor|umlactor/, "person"],
  [/rhombus|flowchart\.decision/, "decision"],
  [/hexagon|parallelogram|flowchart\.(process|predefined)|\bstep\b/, "process"],
  [/document|note|flowchart\.(document|multi)/, "doc"],
  [/flowchart\.(terminator|start)|terminator/, "startend"],
  [/\bdelay\b|flowchart\.delay|\btimer\b/, "timer"],
  [/triangle|flowchart\.(merge|extract)/, "fork"],
];

export interface IconGuess { icon: IconKey; /** True when nothing matched and the plain service icon was used. */ guessed: boolean }

/**
 * Pick the component for a shape. `shapeNames` are the stencil words from the style (shape, resIcon, image
 * names), `label` is the visible text.
 *
 * Order: 1. stencil names, 2. label keywords, 3. generic shapes, 4. Service (reported as a guess).
 */
export function mapIcon(shapeNames: string, label: string): IconGuess {
  const s = shapeNames.toLowerCase().replace(/_/g, " "), l = label.toLowerCase().replace(/_/g, " ").trim();
  for (const [icon, re] of KEYWORDS) if (s && re.test(s)) return { icon, guessed: false };
  for (const [icon, re] of KEYWORDS) if (l && re.test(l)) return { icon, guessed: false };
  for (const [re, icon] of SHAPES) if (s && re.test(s)) return { icon, guessed: false };
  return { icon: "svc", guessed: true };
}
