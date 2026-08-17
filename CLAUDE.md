# AWS Guidance

## Profiles

Account `913447902335`, Region `us-east-1`, IAM Identity Center portal
`https://d-90667b0df8.awsapps.com/start`.

- `keeper-agent` (the `default` profile) — read-only: resource inventory,
  CloudWatch metrics, and log contents. No object or table data, no secrets,
  no mutations. Use this profile for all agent work.
- `keeper-admin` — `AdministratorAccess`, for Rida. Do not use it. If a task
  appears to need it, stop and say which action was denied and why, and let
  the human run it.

Never use root credentials.

- Prefer the AWS MCP Server for AWS interactions — it provides sandboxed
  execution, observability, and audit logging. If unavailable, use the
  AWS CLI directly.
- Before starting a task, check whether a relevant AWS skill is available.
  Load the skill with `retrieve_skill` and prefer its guidance over
  general knowledge.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework
  principles.
- Do not use em dashes in AWS resource names or descriptions. Use
  hyphens instead.

## Secret Safety

- MUST load the `aws-secrets-manager` skill first for any secret,
  credential, API key, token, or password task. MUST NOT call
  `secretsmanager get-secret-value` or `batch-get-secret-value`, and MUST
  NOT hit the Secrets Manager Agent daemon directly. MUST use
  `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with
  `asm-exec` so the secret resolves at runtime without entering context.
