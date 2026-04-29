/**
 * Build-time constants injected by Taro defineConstants (see config/{dev,prod}.ts).
 * Declared here so request.ts can read them without pulling in @types/node.
 */
declare const process: {
  env: {
    NODE_ENV?: string;
    XG_API_BASE_URL?: string;
    XG_AI_BASE_URL?: string;
  };
};
