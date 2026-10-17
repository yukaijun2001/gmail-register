import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiErrorFilter } from './common/error.filter';
import { ResponseInterceptor } from './common/response.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  const allowedAdminOrigins = process.env.ADMIN_ORIGIN?.split(',') || [
    'http://localhost:4173',
    'http://localhost:1001',
  ];
  app.enableCors({
    origin: (
      requestOrigin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      const isExtension = requestOrigin?.startsWith('chrome-extension://') === true;
      const isAllowedAdmin = !requestOrigin || allowedAdminOrigins.includes(requestOrigin);
      callback(null, isExtension || isAllowedAdmin);
    },
  });
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new ApiErrorFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Gmail Registration Manager API')
    .setDescription('Authorized, fully automated Gmail registration pipeline')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(Number(process.env.APP_PORT || 3000), '0.0.0.0');
}

void bootstrap();
