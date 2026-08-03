import express, { Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument } from '../docs/swagger.js';

const router = express.Router();

router.use('/docs', swaggerUi.serve);
router.get(
  '/docs',
  swaggerUi.setup(undefined, {
    swaggerOptions: {
      url: '/openapi.json'
    }
  })
);

router.get('/openapi.json', (_req: Request, res: Response) => {
  res.json(buildOpenApiDocument());
});

export default router;
