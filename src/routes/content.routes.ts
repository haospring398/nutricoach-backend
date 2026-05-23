import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  discoverCoursesHandler,
  getPublicCourseDetailHandler,
} from '../controllers/course.controller';

const router: Router = Router();

router.use(authenticate);

router.get('/discover/pt-courses', discoverCoursesHandler);
router.get('/pt-courses/:id', getPublicCourseDetailHandler);

// Articles endpoints will be added in a later phase. Do not stub.

export default router;
