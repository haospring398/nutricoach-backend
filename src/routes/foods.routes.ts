import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  categories,
  getById,
  search,
} from '../controllers/foods.controller';

const router: Router = Router();

router.use(authenticate);

router.get('/search', search);
router.get('/categories', categories);
router.get('/:id', getById);

export default router;
