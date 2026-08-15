import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  if (!fastify.config.DOCS_ENABLED) return;

  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'NaviPet API',
        description: 'Backend API for NaviPet indoor campus navigation.',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });
  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    staticCSP: true,
  });
};

export default fp(swaggerPlugin, {
  fastify: '5.x',
  name: 'app-swagger',
});
