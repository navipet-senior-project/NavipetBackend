import cors from '@fastify/cors';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

const corsPlugin: FastifyPluginAsync = async (fastify) => {
  const allowedOrigins = new Set(fastify.config.CORS_ORIGINS);

  await fastify.register(cors, {
    origin(origin, callback) {
      callback(null, origin === undefined || allowedOrigins.has(origin));
    },
  });
};

export default fp(corsPlugin, {
  fastify: '5.x',
  name: 'app-cors',
});
