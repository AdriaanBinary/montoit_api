import { z } from 'zod';
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi
} from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const apiRegistry = new OpenAPIRegistry();

type ApiMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface RouteRegistration {
  method: ApiMethod;
  path: string;
  summary: string;
  description?: string;
  tags: string[];
  security?: Array<Record<string, string[]>>;
  request?: {
    query?: z.ZodObject<z.ZodRawShape>;
    params?: z.ZodObject<z.ZodRawShape>;
    body?: z.ZodTypeAny;
  };
  responses: Record<number, { description: string; schema: z.ZodTypeAny }>;
}

export function registerApiRoute(route: RouteRegistration): void {
  const responses: Record<string, { description: string; content: { 'application/json': { schema: z.ZodTypeAny } } }> = {};

  for (const [status, value] of Object.entries(route.responses)) {
    responses[status] = {
      description: value.description,
      content: {
        'application/json': {
          schema: value.schema
        }
      }
    };
  }

  apiRegistry.registerPath({
    method: route.method,
    path: route.path,
    summary: route.summary,
    description: route.description,
    tags: route.tags,
    security: route.security,
    request: {
      query: route.request?.query,
      params: route.request?.params,
      body: route.request?.body
        ? {
            required: true,
            content: {
              'application/json': {
                schema: route.request.body
              }
            }
          }
        : undefined
    },
    responses
  });
}

export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(apiRegistry.definitions);

  const document = generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Montoit API',
      version: '1.0.0',
      description: 'API documentation for the Montoit listings and agency platform.'
    },
    servers: [{ url: 'http://localhost:3000' }],
    tags: [
      { name: 'Health', description: 'Server and database health checks' },
      { name: 'Auth', description: 'Authentication and user registration' },
      { name: 'Autocomplete', description: 'Location and keyword autocomplete' },
      { name: 'Listings', description: 'Public and private listing management' },
      { name: 'Agencies', description: 'Agency creation and agent conversion' }
    ]
  });

  document.components = {
    ...(document.components ?? {}),
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  };

  return document;
}
