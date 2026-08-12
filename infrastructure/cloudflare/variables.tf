variable "cloudflare_api_token" {
  description = "Cloudflare API token scoped to Zone:Zone:Read and Zone:Cache Rules:Edit on the keeper.sh zone."
  type        = string
  sensitive   = true
}

variable "zone_id" {
  description = "Cloudflare zone ID for keeper.sh."
  type        = string
}

variable "cacheable_paths" {
  description = <<-EOT
    Exact request paths served as publicly cacheable marketing HTML. Must stay in
    sync with cacheableHtmlPaths in applications/web/src/server/http-handler.ts;
    a path listed here but not there will be cached at the edge while the origin
    sends private, no-store, and the rule will appear to do nothing.
  EOT
  type        = list(string)
  default     = ["/", "/blog", "/privacy", "/terms"]
}

variable "cacheable_path_prefixes" {
  description = "Request path prefixes served as publicly cacheable marketing HTML."
  type        = list(string)
  default     = ["/blog/"]
}
