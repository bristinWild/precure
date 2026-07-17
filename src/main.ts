import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureProxyTrust } from './http/proxy';
import { configurePayments } from './payments/payment';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const express = app.getHttpAdapter().getInstance();
  configureProxyTrust(express);
  configurePayments(express);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
