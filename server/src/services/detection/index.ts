// Detection module exports
// Per Analysis Responsibility Guidelines: Only generic build detection, no framework detection
export * from './types';
export { BuildOutputDetector } from './buildOutputDetector';
export { StaticSiteDetector } from './staticSiteDetector';
