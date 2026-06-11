import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'NutriCoach API',
      version: '1.1.0',
      description:
        'REST API for the NutriCoach mobile app — Vietnamese nutrition & fitness coaching platform.',
      contact: {
        name: 'NutriCoach Team',
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}/api/v1`,
        description: 'Local development',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token',
        },
      },
      schemas: {
        // ── Generic envelope ────────────────────────────────
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string', example: 'Invalid request body' },
              },
            },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 100 },
            totalPages: { type: 'integer', example: 5 },
          },
        },

        // ── Auth ────────────────────────────────────────────
        RegisterBody: {
          type: 'object',
          required: ['fullName', 'email', 'password'],
          properties: {
            fullName: { type: 'string', minLength: 2, maxLength: 100, example: 'Nguyễn Văn A' },
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            password: { type: 'string', minLength: 8, example: 'StrongPass1' },
          },
        },
        LoginBody: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            password: { type: 'string', example: 'StrongPass1' },
          },
        },
        RefreshBody: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' },
          },
        },
        LogoutBody: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' },
          },
        },
        VerifyEmailBody: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' },
          },
        },
        ForgotPasswordBody: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
          },
        },
        ResetPasswordBody: {
          type: 'object',
          required: ['token', 'newPassword'],
          properties: {
            token: { type: 'string' },
            newPassword: { type: 'string', minLength: 8 },
          },
        },

        // ── Users ───────────────────────────────────────────
        UpdateMeBody: {
          type: 'object',
          properties: {
            fullName: { type: 'string', minLength: 2, maxLength: 100 },
            phone: { type: 'string', pattern: '^\\+84[0-9]{9}$', example: '+84912345678' },
            avatarUrl: { type: 'string', format: 'uri' },
            preferredLanguage: { type: 'string', enum: ['vi', 'en'] },
          },
        },
        OnboardingBody: {
          type: 'object',
          required: ['gender', 'dateOfBirth', 'heightCm', 'weightKg', 'activityLevel', 'goal'],
          properties: {
            gender: { type: 'string', enum: ['MALE', 'FEMALE'] },
            dateOfBirth: { type: 'string', format: 'date', example: '1995-06-15' },
            heightCm: { type: 'integer', minimum: 100, maximum: 250 },
            weightKg: { type: 'number', minimum: 30, maximum: 300 },
            activityLevel: {
              type: 'string',
              enum: ['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE'],
            },
            goal: {
              type: 'string',
              enum: ['LOSE_WEIGHT', 'MAINTAIN', 'GAIN_WEIGHT', 'GAIN_MUSCLE'],
            },
            targetWeightKg: { type: 'number', minimum: 30, maximum: 300 },
            dietaryRestrictions: { type: 'array', items: { type: 'string' } },
            allergies: { type: 'array', items: { type: 'string' } },
          },
        },
        ChangePasswordBody: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string' },
            newPassword: { type: 'string', minLength: 8 },
            refreshToken: { type: 'string' },
          },
        },
        DeleteMeBody: {
          type: 'object',
          required: ['password'],
          properties: {
            password: { type: 'string' },
            reason: { type: 'string', maxLength: 500 },
          },
        },

        // ── Nutrition ───────────────────────────────────────
        CreateFoodLogModeA: {
          type: 'object',
          required: ['foodItemId', 'portionGrams', 'mealType', 'consumedAt'],
          properties: {
            foodItemId: { type: 'string', format: 'uuid' },
            portionGrams: { type: 'integer', minimum: 1, maximum: 5000 },
            mealType: { type: 'string', enum: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] },
            consumedAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateFoodLogModeB: {
          type: 'object',
          required: ['customName', 'calories', 'macros', 'portion', 'mealType', 'consumedAt'],
          properties: {
            customName: { type: 'string', minLength: 1, maxLength: 200 },
            calories: { type: 'integer', minimum: 0, maximum: 10000 },
            macros: {
              type: 'object',
              required: ['proteinG', 'carbsG', 'fatG'],
              properties: {
                proteinG: { type: 'number', minimum: 0, maximum: 500 },
                carbsG: { type: 'number', minimum: 0, maximum: 2000 },
                fatG: { type: 'number', minimum: 0, maximum: 500 },
              },
            },
            portion: { type: 'number', minimum: 0.25, maximum: 10 },
            mealType: { type: 'string', enum: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] },
            consumedAt: { type: 'string', format: 'date-time' },
          },
        },
        UpdateFoodLogBody: {
          type: 'object',
          properties: {
            foodName: { type: 'string' },
            calories: { type: 'integer' },
            proteinG: { type: 'number' },
            carbsG: { type: 'number' },
            fatG: { type: 'number' },
            portion: { type: 'number' },
            mealType: { type: 'string', enum: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] },
            consumedAt: { type: 'string', format: 'date-time' },
          },
        },

        // ── Payment ─────────────────────────────────────────
        CheckoutBody: {
          type: 'object',
          required: ['productType'],
          properties: {
            productType: { type: 'string', enum: ['PRO_MONTHLY', 'PRO_YEARLY', 'PT_COURSE'] },
            productId: { type: 'string', format: 'uuid', description: 'Required when productType=PT_COURSE' },
            returnUrl: { type: 'string', format: 'uri' },
            cancelUrl: { type: 'string', format: 'uri' },
          },
        },

        // ── Workout ─────────────────────────────────────────
        SetLog: {
          type: 'object',
          required: ['exerciseId', 'orderIndex', 'setNumber'],
          properties: {
            exerciseId: { type: 'string', pattern: '^ex_[a-z0-9_]+$' },
            orderIndex: { type: 'integer', minimum: 0, maximum: 200 },
            setNumber: { type: 'integer', minimum: 1, maximum: 50 },
            reps: { type: 'integer', minimum: 1, maximum: 500 },
            weightKg: { type: 'number', minimum: 0, maximum: 500 },
            durationSec: { type: 'integer', minimum: 1, maximum: 7200 },
            restSec: { type: 'integer', minimum: 0, maximum: 900, default: 0 },
            rpe: { type: 'integer', minimum: 1, maximum: 10 },
            notes: { type: 'string', maxLength: 500 },
          },
        },
        CreateSessionBody: {
          type: 'object',
          required: ['performedAt', 'logs'],
          properties: {
            name: { type: 'string', maxLength: 200 },
            performedAt: { type: 'string', format: 'date-time' },
            durationSec: { type: 'integer', minimum: 0, maximum: 14400, default: 0 },
            caloriesBurned: { type: 'integer', minimum: 0, maximum: 5000 },
            notes: { type: 'string', maxLength: 2000 },
            logs: { type: 'array', items: { $ref: '#/components/schemas/SetLog' }, minItems: 1, maxItems: 200 },
          },
        },
        UpdateSessionBody: {
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 200 },
            notes: { type: 'string', maxLength: 2000 },
            durationSec: { type: 'integer', minimum: 0, maximum: 14400 },
            caloriesBurned: { type: 'integer', minimum: 0, maximum: 5000 },
          },
        },

        // ── PT ──────────────────────────────────────────────
        SubmitVerificationBody: {
          type: 'object',
          required: [
            'fullName', 'dateOfBirth', 'citizenIdNumber', 'citizenIdFrontKey',
            'citizenIdBackKey', 'certificates', 'specialties', 'yearsOfExperience',
            'bio', 'bankAccount',
          ],
          properties: {
            fullName: { type: 'string', minLength: 2, maxLength: 100 },
            dateOfBirth: { type: 'string', format: 'date' },
            citizenIdNumber: { type: 'string', pattern: '^[0-9]{9,12}$' },
            citizenIdFrontKey: { type: 'string' },
            citizenIdBackKey: { type: 'string' },
            certificates: {
              type: 'array',
              items: {
                type: 'object',
                required: ['name', 'issuedBy', 'issuedAt', 'fileKey'],
                properties: {
                  name: { type: 'string' },
                  issuedBy: { type: 'string' },
                  issuedAt: { type: 'string', format: 'date' },
                  fileKey: { type: 'string' },
                },
              },
            },
            specialties: {
              type: 'array',
              items: {
                type: 'string',
                enum: [
                  'WEIGHT_LOSS', 'MUSCLE_GAIN', 'STRENGTH_TRAINING', 'CARDIO',
                  'HIIT', 'YOGA', 'PILATES', 'REHABILITATION', 'NUTRITION_COACHING',
                  'POSTPARTUM', 'SENIOR_FITNESS', 'SPORTS_PERFORMANCE',
                ],
              },
            },
            yearsOfExperience: { type: 'integer', minimum: 0, maximum: 60 },
            bio: { type: 'string', minLength: 50, maxLength: 2000 },
            bankAccount: {
              type: 'object',
              required: ['bankCode', 'accountNumber', 'accountHolder'],
              properties: {
                bankCode: { type: 'string' },
                accountNumber: { type: 'string' },
                accountHolder: { type: 'string' },
              },
            },
          },
        },
        UpdatePtProfileBody: {
          type: 'object',
          properties: {
            bio: { type: 'string', minLength: 50, maxLength: 2000 },
            specialties: { type: 'array', items: { type: 'string' } },
            yearsOfExperience: { type: 'integer', minimum: 0, maximum: 60 },
            bankAccount: {
              type: 'object',
              properties: {
                bankCode: { type: 'string' },
                accountNumber: { type: 'string' },
                accountHolder: { type: 'string' },
              },
            },
          },
        },

        // ── Course ──────────────────────────────────────────
        CreateCourseBody: {
          type: 'object',
          required: ['title', 'description', 'priceVnd', 'durationDays', 'modules'],
          properties: {
            title: { type: 'string', minLength: 3, maxLength: 200 },
            description: { type: 'string', minLength: 20, maxLength: 5000 },
            thumbnailUrl: { type: 'string', nullable: true },
            priceVnd: { type: 'integer', minimum: 50000, maximum: 50000000 },
            durationDays: { type: 'integer', minimum: 1, maximum: 365 },
            tags: { type: 'array', items: { type: 'string' } },
            modules: {
              type: 'array',
              items: {
                type: 'object',
                required: ['title', 'displayOrder', 'lessons'],
                properties: {
                  title: { type: 'string' },
                  displayOrder: { type: 'integer' },
                  lessons: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['title', 'displayOrder'],
                      properties: {
                        title: { type: 'string' },
                        youtubeVideoId: { type: 'string', nullable: true },
                        durationMin: { type: 'integer' },
                        displayOrder: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        PatchCourseBody: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            thumbnailUrl: { type: 'string', nullable: true },
            priceVnd: { type: 'integer' },
            durationDays: { type: 'integer' },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
        CourseCurriculumBody: {
          type: 'object',
          required: ['modules'],
          properties: {
            modules: {
              type: 'array',
              minItems: 1,
              maxItems: 20,
              items: {
                type: 'object',
                required: ['title', 'displayOrder', 'lessons'],
                properties: {
                  title: { type: 'string', minLength: 3, maxLength: 200 },
                  displayOrder: { type: 'integer', minimum: 0 },
                  lessons: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 50,
                    items: {
                      type: 'object',
                      required: ['title', 'displayOrder'],
                      properties: {
                        title: { type: 'string', minLength: 3, maxLength: 200 },
                        youtubeVideoId: { type: 'string', nullable: true },
                        durationMin: { type: 'integer', minimum: 0, maximum: 600 },
                        displayOrder: { type: 'integer', minimum: 0 },
                      },
                    },
                  },
                },
              },
            },
          },
        },

        // ── PT Earnings / Withdrawals ───────────────────────
        CreateWithdrawalBody: {
          type: 'object',
          required: ['amountVnd'],
          properties: {
            amountVnd: { type: 'integer', minimum: 200000, maximum: 50000000 },
            note: { type: 'string', maxLength: 500 },
          },
        },
        ApproveWithdrawalBody: {
          type: 'object',
          required: ['transferReference'],
          properties: {
            transferReference: { type: 'string', minLength: 3, maxLength: 64 },
            note: { type: 'string', maxLength: 500 },
          },
        },
        RejectWithdrawalBody: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: { type: 'string', minLength: 10, maxLength: 500 },
          },
        },

        // ── PT Student Assignments ──────────────────────────
        PutMealPlanBody: {
          type: 'object',
          required: ['days'],
          properties: {
            days: {
              type: 'array',
              items: {
                type: 'object',
                required: ['dayIndex', 'meals'],
                properties: {
                  dayIndex: { type: 'integer', minimum: 0, maximum: 364 },
                  meals: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['mealType', 'name', 'calories', 'macros'],
                      properties: {
                        mealType: { type: 'string', enum: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] },
                        name: { type: 'string' },
                        calories: { type: 'integer' },
                        macros: {
                          type: 'object',
                          properties: {
                            proteinG: { type: 'number' },
                            carbsG: { type: 'number' },
                            fatG: { type: 'number' },
                          },
                        },
                        notes: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
            note: { type: 'string', maxLength: 2000 },
          },
        },
        PostExerciseAssignmentBody: {
          type: 'object',
          required: ['exerciseId'],
          properties: {
            exerciseId: { type: 'string', pattern: '^ex_[a-z0-9_]+$' },
            scheduledDate: { type: 'string', format: 'date-time' },
            sets: { type: 'integer', minimum: 1, maximum: 20 },
            reps: { type: 'integer', minimum: 1, maximum: 500 },
            weightKg: { type: 'number', minimum: 0, maximum: 500 },
            durationSec: { type: 'integer', minimum: 1, maximum: 7200 },
            restSec: { type: 'integer', minimum: 0, maximum: 900 },
            note: { type: 'string', maxLength: 1000 },
          },
        },

        // ── Admin ───────────────────────────────────────────
        ApproveVerificationBody: {
          type: 'object',
          properties: {
            note: { type: 'string', maxLength: 1000 },
          },
        },
        RejectVerificationBody: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: { type: 'string', minLength: 10, maxLength: 1000 },
            requireResubmit: { type: 'boolean', default: true },
          },
        },

        // ── Content (Articles) ──────────────────────────────
        CreateArticleBody: {
          type: 'object',
          required: ['title', 'excerpt', 'body', 'categoryId'],
          properties: {
            title: { type: 'string', minLength: 3, maxLength: 200 },
            excerpt: { type: 'string', minLength: 20, maxLength: 300 },
            body: { type: 'string', minLength: 50, description: 'Markdown' },
            categoryId: { type: 'string', format: 'uuid' },
            coverImageUrl: { type: 'string', maxLength: 512, nullable: true },
            tags: {
              type: 'array',
              maxItems: 10,
              items: { type: 'string', minLength: 1, maxLength: 40 },
            },
          },
        },
        PatchArticleBody: {
          type: 'object',
          description: 'At least one field required. Slug is immutable.',
          properties: {
            title: { type: 'string', minLength: 3, maxLength: 200 },
            excerpt: { type: 'string', minLength: 20, maxLength: 300 },
            body: { type: 'string', minLength: 50, description: 'Markdown' },
            categoryId: { type: 'string', format: 'uuid' },
            coverImageUrl: { type: 'string', maxLength: 512, nullable: true },
            tags: {
              type: 'array',
              maxItems: 10,
              items: { type: 'string', minLength: 1, maxLength: 40 },
            },
          },
        },
        CreateCategoryBody: {
          type: 'object',
          required: ['slug', 'name'],
          properties: {
            slug: { type: 'string', pattern: '^[a-z0-9-]{2,64}$' },
            name: { type: 'string', minLength: 2, maxLength: 100 },
            displayOrder: { type: 'integer', minimum: 0, maximum: 1000, default: 0 },
          },
        },

        // ── Quests ──────────────────────────────────────────
        TriggerQuestBody: {
          type: 'object',
          required: ['questId', 'date'],
          properties: {
            questId: {
              type: 'string',
              enum: ['AI_SCAN', 'WORKOUT_DONE', 'PT_VISIT', 'DAILY_SHARE'],
              description:
                'Client-triggerable quests only. DAILY_LOGIN, PERFECT_DIARY, and DISCIPLINE_MASTER are server-initiated and rejected here.',
            },
            date: { type: 'string', format: 'date', example: '2026-06-03' },
            referenceId: {
              type: 'string',
              maxLength: 64,
              description:
                'Workout session id (WORKOUT_DONE, verified) or scan/PT/share id (audit only).',
            },
          },
        },
        DiaryLockBody: {
          type: 'object',
          required: ['date'],
          properties: {
            date: { type: 'string', format: 'date', example: '2026-06-03' },
          },
        },
        CreateQuestBody: {
          type: 'object',
          required: ['id', 'title', 'description', 'pointsPerCompletion'],
          properties: {
            id: { type: 'string', pattern: '^[A-Z_]+$', example: 'TEST_QUEST' },
            title: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: 'string', minLength: 1 },
            pointsPerCompletion: { type: 'integer', minimum: 1 },
            maxCompletionsPerDay: { type: 'integer', minimum: 1, default: 1 },
            isActive: { type: 'boolean', default: true },
          },
        },
        UpdateQuestBody: {
          type: 'object',
          description: 'At least one field.',
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: 'string', minLength: 1 },
            pointsPerCompletion: { type: 'integer', minimum: 1 },
            maxCompletionsPerDay: { type: 'integer', minimum: 1 },
            isActive: { type: 'boolean' },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    tags: [
      { name: 'Health', description: 'Health check' },
      { name: 'Auth', description: 'Authentication & authorization' },
      { name: 'Users', description: 'User profile & onboarding' },
      { name: 'Nutrition', description: 'Food logging & daily summaries' },
      { name: 'Foods', description: 'Food catalog (search, categories)' },
      { name: 'Dashboard', description: 'User dashboard aggregate' },
      { name: 'Payment', description: 'Checkout, webhooks & transactions' },
      { name: 'Workout', description: 'Exercises & workout sessions' },
      { name: 'PT', description: 'Personal Trainer management' },
      { name: 'PT Courses', description: 'PT course CRUD & lifecycle' },
      { name: 'PT Students', description: 'PT student management & assignments' },
      { name: 'PT Earnings', description: 'Earnings & withdrawal management' },
      { name: 'Admin', description: 'Admin operations' },
      { name: 'Content', description: 'Public content discovery' },
      { name: 'Quests', description: 'Gamification: quests, points, leaderboard' },
      { name: 'Scan', description: 'AI food scanning' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/app.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
