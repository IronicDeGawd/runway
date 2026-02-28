/**
 * Caddy configuration templates as TypeScript constants
 * This approach ensures templates are bundled with the compiled code
 */

export const WEBSOCKET_HEADERS = `header_up Upgrade {http.request.header.Upgrade}
header_up Connection {http.request.header.Connection}
header_up Host {http.request.header.Host}
header_up X-Real-IP {http.request.header.X-Real-IP}
header_up X-Forwarded-For {http.request.header.X-Forwarded-For}
header_up X-Forwarded-Proto {http.request.header.X-Forwarded-Proto}`;

export const MAIN_CADDYFILE = `# runway:global-start
{
  admin localhost:2019
  auto_https off
}
# runway:global-end

# runway:main-start
:80 {
  # WebSocket support for realtime updates
  @websocket_realtime {
    path /api/realtime*
  }
  handle @websocket_realtime {
    reverse_proxy 127.0.0.1:{{API_PORT}} {
      {{WEBSOCKET_HEADERS}}
    }
  }

  # WebSocket support for project logs
  @websocket_logs {
    path /api/logs/*
  }
  handle @websocket_logs {
    reverse_proxy 127.0.0.1:{{API_PORT}} {
      {{WEBSOCKET_HEADERS}}
    }
  }

  # Regular API requests
  handle /api/* {
    request_body {
      max_size 512MB
    }
    reverse_proxy 127.0.0.1:{{API_PORT}} {
      transport http {
        read_timeout 10m
        write_timeout 10m
      }
    }
  }

  # Deployed projects - Import all site configs
  import {{SITES_DIR}}/*.caddy

  # Admin panel UI (fallback - must be last)
  handle {
    root * /opt/runway/ui/dist
    try_files {path} /index.html
    file_server
    encode gzip
  }
}
# runway:main-end
`;

export const MAIN_WITH_SYSTEM = `# runway:global-start
{
  admin localhost:2019
}
# runway:global-end

# Import system domain configuration (HTTPS)
import {{SYSTEM_CADDY_PATH}}

# runway:main-start
# Fallback HTTP access (IP-based)
:80 {
  # WebSocket support for realtime updates
  @websocket_realtime {
    path /api/realtime*
  }
  handle @websocket_realtime {
    reverse_proxy 127.0.0.1:{{API_PORT}} {
      {{WEBSOCKET_HEADERS}}
    }
  }

  # WebSocket support for project logs
  @websocket_logs {
    path /api/logs/*
  }
  handle @websocket_logs {
    reverse_proxy 127.0.0.1:{{API_PORT}} {
      {{WEBSOCKET_HEADERS}}
    }
  }

  # Regular API requests
  handle /api/* {
    request_body {
      max_size 512MB
    }
    reverse_proxy 127.0.0.1:{{API_PORT}} {
      transport http {
        read_timeout 10m
        write_timeout 10m
      }
    }
  }

  # Deployed projects - Import all site configs
  import {{SITES_DIR}}/*.caddy

  # Admin panel UI (fallback - must be last)
  handle {
    root * /opt/runway/ui/dist
    try_files {path} /index.html
    file_server
    encode gzip
  }
}
# runway:main-end
`;

export const SYSTEM_DOMAIN = `# System Control Panel - {{domain}}
# Auto-generated - Do not edit manually

{{domain}} {
  # WebSocket support for realtime updates
  @websocket_realtime {
    path /api/realtime*
  }
  handle @websocket_realtime {
    reverse_proxy 127.0.0.1:{{API_PORT}} {
      {{WEBSOCKET_HEADERS}}
    }
  }

  # WebSocket support for project logs
  @websocket_logs {
    path /api/logs/*
  }
  handle @websocket_logs {
    reverse_proxy 127.0.0.1:{{API_PORT}} {
      {{WEBSOCKET_HEADERS}}
    }
  }

  # API requests
  handle /api/* {
    request_body {
      max_size 512MB
    }
    reverse_proxy 127.0.0.1:{{API_PORT}} {
      transport http {
        read_timeout 10m
        write_timeout 10m
      }
    }
  }

  # Deployed projects - Import all site configs
  import {{SITES_DIR}}/*.caddy

  # Control Panel UI
  handle {
    root * /opt/runway/ui/dist
    file_server
    try_files {path} /index.html
  }

  # Automatic HTTPS via Let's Encrypt
  # Caddy will automatically obtain and renew certificates
}
`;

export const PROJECT_STATIC_DOMAIN = `# Domain: {{domain}}
{{domain}} {
  root * {{buildPath}}
  file_server
  try_files {path} /index.html

  # Enable compression
  encode gzip

  # Auto HTTPS (use 'tls internal' for local dev)
  tls internal
}
`;

export const PROJECT_DYNAMIC_DOMAIN = `# Domain: {{domain}}
{{domain}} {
  reverse_proxy 127.0.0.1:{{port}} {
    # WebSocket support
    {{WEBSOCKET_HEADERS}}
  }

  # Enable compression
  encode gzip

  # Auto HTTPS
  tls internal
}
`;

export const PROJECT_STATIC_PATH = `handle_path {{projectPath}}* {
    root * {{buildPath}}
    try_files {path} /index.html
    file_server
    encode gzip
  }`;

export const PROJECT_DYNAMIC_PATH = `handle_path {{projectPath}}* {
    reverse_proxy 127.0.0.1:{{port}} {
      # WebSocket support
      {{WEBSOCKET_HEADERS}}
      # Pass original path info to backend
      header_up X-Forwarded-Prefix {{projectPath}}
      header_up X-Original-URI {uri}
    }
    encode gzip
  }`;

/**
 * Template name to template string mapping
 */
export const TEMPLATES: Record<string, string> = {
  'main-caddyfile': MAIN_CADDYFILE,
  'main-with-system': MAIN_WITH_SYSTEM,
  'system-domain': SYSTEM_DOMAIN,
  'project-static-domain': PROJECT_STATIC_DOMAIN,
  'project-dynamic-domain': PROJECT_DYNAMIC_DOMAIN,
  'project-static-path': PROJECT_STATIC_PATH,
  'project-dynamic-path': PROJECT_DYNAMIC_PATH,
};
