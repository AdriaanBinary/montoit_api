import express, { Request, Response } from 'express';

const router = express.Router();

const swaggerUiHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Montoit API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body { margin: 0; background: #f5f7fb; }
      #swagger-ui { max-width: 1400px; margin: 0 auto; padding: 20px; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => {
        SwaggerUIBundle({
          url: '/openapi.json',
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset]
        });
      };
    </script>
  </body>
</html>`;

const openApiSpec = {
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
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: {
          '200': {
            description: 'API is alive',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/db-test': {
      get: {
        tags: ['Health'],
        summary: 'Database connectivity check',
        responses: {
          '200': { description: 'Database connection succeeded' },
          '500': { description: 'Database connection failed' }
        }
      }
    },
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Registration successful' },
          '400': { description: 'Bad request' }
        }
      }
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in a user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Login successful' },
          '401': { description: 'Unauthorized' }
        }
      }
    },
    '/api/autocomplete': {
      get: {
        tags: ['Autocomplete'],
        summary: 'Get autocomplete suggestions',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string' }
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer' }
          }
        ],
        responses: {
          '200': { description: 'Autocomplete results' }
        }
      }
    },
    '/api/listings/public': {
      get: {
        tags: ['Listings'],
        summary: 'Get public listings',
        responses: {
          '200': { description: 'Public listings returned' }
        }
      }
    },
    '/api/listings/public/{id}': {
      get: {
        tags: ['Listings'],
        summary: 'Get a public listing by ID',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': { description: 'Listing found' },
          '404': { description: 'Listing not found' }
        }
      }
    },
    '/api/listings/private': {
      get: {
        tags: ['Listings'],
        summary: 'Get private listings for the authenticated user',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Private listings returned' },
          '401': { description: 'Unauthorized' }
        }
      }
    },
    '/api/listings': {
      post: {
        tags: ['Listings'],
        summary: 'Create a listing',
        security: [{ bearerAuth: [] }],
        responses: {
          '201': { description: 'Listing created' },
          '401': { description: 'Unauthorized' }
        }
      }
    },
    '/api/listings/{id}/publish': {
      post: {
        tags: ['Listings'],
        summary: 'Publish a listing',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': { description: 'Listing published' },
          '401': { description: 'Unauthorized' }
        }
      }
    },
    '/api/listings/{id}/images': {
      post: {
        tags: ['Listings'],
        summary: 'Upload listing images',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': { description: 'Images uploaded' },
          '401': { description: 'Unauthorized' }
        }
      }
    },
    '/api/listings/{id}': {
      get: {
        tags: ['Listings'],
        summary: 'Get a listing by ID',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': { description: 'Listing returned' },
          '401': { description: 'Unauthorized' }
        }
      }
    },
    '/api/agencies': {
      post: {
        tags: ['Agencies'],
        summary: 'Create an agency',
        security: [{ bearerAuth: [] }],
        responses: {
          '201': { description: 'Agency created' },
          '401': { description: 'Unauthorized' }
        }
      }
    },
    '/api/agencies/agents/convert': {
      post: {
        tags: ['Agencies'],
        summary: 'Convert a user to an agent',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Conversion successful' },
          '401': { description: 'Unauthorized' }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  }
};

router.get('/docs', (_req: Request, res: Response) => {
  res.type('html').send(swaggerUiHtml);
});

router.get('/openapi.json', (_req: Request, res: Response) => {
  res.json(openApiSpec);
});

export default router;
