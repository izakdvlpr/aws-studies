/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "aws-studies",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: {
          profile: "barbearia-dev"
        }
      }
    };
  },
  async run() {
    await import("./src/infra/queue");
    
    const { api } = await import("./src/infra/api");

    return {
      api: api.url,
    };
  },
})
