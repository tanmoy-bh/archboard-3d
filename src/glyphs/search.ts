import { ICON_NAMES, PALETTE_GROUPS } from "./catalog";
import type { IconKey } from "../model/types";

/**
 * Other names people use for a component, so "s3", "kafka" or "k8s" finds the closest one. These match
 * the cloud mapping in `src/import/iconMap.ts`. Search never changes a board; it only filters the palette.
 */
export const ICON_ALIASES: Partial<Record<IconKey, string>> = {
  lambda: "lambda serverless faas cloud functions azure functions",
  container: "docker ecs fargate cloud run task",
  cluster: "kubernetes k8s eks gke aks",
  dns: "route 53 route53 domain name",
  warehouse: "redshift bigquery snowflake synapse analytics",
  alarm: "cloudwatch stackdriver alert alerts siem observability",
  key: "kms secrets secret vault certificate",
  identity: "iam cognito sso entra idp oauth login",
  firewall: "waf shield cloud armor security group ddos",
  network: "vpc vnet subnet peering vpn private link",
  etl: "glue dataflow data factory airflow pipeline",
  iot: "sensor sensors device",
  archive: "glacier backup backups",
  files: "efs filestore nfs sftp file share ftp",
  queue: "sqs pub sub pubsub kafka service bus rabbitmq stream",
  bell: "sns notification notifications push alert",
  mail: "email ses smtp",
  blob: "s3 bucket object storage gcs",
  es: "opensearch elasticsearch elastic search",
  redis: "cache memcached elasticache",
  db: "database sql postgres postgresql mysql rds dynamodb",
  gateway: "alb elb load balancer nginx",
  apigw: "api gateway apigee apim kong management rate limit throttle routes endpoints",
  auth: "authentication authenticate login sign in signin oauth oidc jwt token sso auth0 okta cognito password mfa 2fa passkey",
  cdn: "cloudfront cloudflare edge cache",
  lock: "tls ssl auth encryption secure",
  server: "vm virtual machine ec2 host",
  svc: "service microservice api backend",
  person: "user users actor customer",
  globe: "internet web browser public",
  apps: "app application mobile web",
  phone: "mobile ios android",
  ai: "model ml machine learning",
  llm: "gpt claude language model chat",
  vector: "embeddings embedding pinecone pgvector",
  chart: "analytics dashboard metrics graph bi",
  // tools with their own logo
  slack: "chat channel", claude: "anthropic", gemini: "google model", openai: "gpt chatgpt model", codex: "openai coding agent",
  opencode: "open code coding agent", antigravity: "anti gravity google coding agent", copilot: "co pilot coding agent", meta: "llama",
  "mcp-logo": "mcp", atlassian: "rovo", onepassword: "1password one password secrets vault", postgresql: "postgres pgvector sql",
  kubernetes: "k8s", "github-actions": "ci cd pipeline", "aws-open-search": "elasticsearch", "aws-elb": "alb nlb load balancer",
  "aws-route53": "route 53 dns", "aws-msk": "kafka", microsoft: "365 entra", "redis-logo": "cache",
};

/** Lower case, letters and digits only, one space between words. */
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Everything a component can be found by: its name, its key, its group and its other names. */
function haystack(icon: IconKey, group: string): string {
  return norm([ICON_NAMES[icon], icon, group, ICON_ALIASES[icon] ?? ""].join(" "));
}

/**
 * The components that match a search. Every word the user typed must start a word somewhere in the
 * component's name, key, group or other names, so "ku" finds Kubernetes and "queue msg" narrows further.
 * An empty search matches everything.
 */
export function searchComponents(query: string): Set<IconKey> {
  const words = norm(query).split(" ").filter(Boolean);
  const out = new Set<IconKey>();
  for (const g of PALETTE_GROUPS) {
    for (const icon of g.icons) {
      const hay = " " + haystack(icon, g.title);
      if (words.every((w) => hay.includes(" " + w))) out.add(icon);
    }
  }
  return out;
}
