
export const getProjectUrl = (project: { name: string; domain?: string; domains?: string[] }) => {
  // If project has explicit custom domains, use the first one
  if (project.domains && project.domains.length > 0) {
    return `http://${project.domains[0]}`;
  }
  
  // Legacy support for single domain property
  if (project.domain && project.domain !== 'localhost') {
     return `http://${project.domain}`;
  }

  // Fallback to path-based routing on current host
  const safeName = (project.name || '').toLowerCase().replace(/[^a-z0-9]/g, '-');
  return `${window.location.protocol}//${window.location.host}/app/${safeName}`;
};
