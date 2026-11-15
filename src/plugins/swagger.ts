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
  fastify.get('/docs/openapi.json', {
    schema: { hide: true },
  }, async (_request, reply) => reply
    .header('Content-Disposition', 'attachment; filename="openapi.json"')
    .type('application/json')
    .send(JSON.stringify(fastify.swagger(), null, 2)));

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    staticCSP: true,
    theme: {
      js: [{
        filename: 'download-openapi.js',
        content: `
          const section = document.createElement('section');
          section.className = 'openapi-download';
          const link = document.createElement('a');
          const path = window.location.pathname;
          link.href = (path.endsWith('/') ? path : path + '/') + 'openapi.json';
          link.className = 'openapi-download-button';
          link.textContent = '↓ Download OpenAPI JSON';
          section.appendChild(link);
          document.body.insertBefore(section, document.getElementById('swagger-ui'));
        `,
      }],
      css: [{
        filename: 'download-openapi.css',
        content: `
          .openapi-download { max-width: 1460px; margin: 24px auto 0; padding: 0 20px; }
          .openapi-download-button { display: inline-block; padding: 8px 14px; border: 1px solid #888; border-radius: 4px; color: #444; background: #fff; font: 600 14px sans-serif; text-decoration: none; }
          .openapi-download-button:hover { background: #f1f1f1; }
        `,
      }],
    },
  });
};

export default fp(swaggerPlugin, {
  fastify: '5.x',
  name: 'app-swagger',
});
