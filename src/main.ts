import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurePayments } from './payments/payment';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configurePayments(app.getHttpAdapter().getInstance());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
