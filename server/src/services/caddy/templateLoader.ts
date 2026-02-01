import { TEMPLATES, WEBSOCKET_HEADERS } from './templates';

/**
 * Available template names
 */
export type TemplateName =
  | 'main-caddyfile'
  | 'main-with-system'
  | 'system-domain'
  | 'project-static-domain'
  | 'project-dynamic-domain'
  | 'project-static-path'
  | 'project-dynamic-path';

/**
 * Template variables type - all values must be strings
 */
export type TemplateVariables = Record<string, string>;

/**
 * Interpolate variables into a template string
 * Replaces {{variableName}} with the corresponding value
 */
function interpolate(template: string, variables: TemplateVariables): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key in variables) {
      return variables[key];
    }
    // Leave unmatched placeholders as-is (useful for debugging)
    return match;
  });
}

/**
 * Load and render a Caddy template with variable interpolation
 * Automatically injects the websocket-headers snippet where {{WEBSOCKET_HEADERS}} appears
 * with proper indentation based on placeholder position
 */
export async function renderTemplate(
  name: TemplateName,
  variables: TemplateVariables = {}
): Promise<string> {
  // Get template from embedded constants
  let template = TEMPLATES[name];
  if (!template) {
    throw new Error(`Template not found: ${name}`);
  }

  // Get websocket headers lines
  const wsHeadersLines = WEBSOCKET_HEADERS.trim().split('\n');

  // Replace {{WEBSOCKET_HEADERS}} with proper indentation based on context
  // The indentation is determined by the whitespace before the placeholder
  template = template.replace(
    /^([ \t]*)(\{\{WEBSOCKET_HEADERS\}\})/gm,
    (_match, indent) => {
      // First line uses placeholder's indentation, subsequent lines get same indent
      return wsHeadersLines
        .map((line, i) => (i === 0 ? line : indent + line))
        .join('\n');
    }
  );

  // Interpolate remaining variables
  return interpolate(template, variables);
}

/**
 * Clear the template cache (no-op since we use embedded templates)
 */
export function clearTemplateCache(): void {
  // No-op - templates are embedded as constants
}
