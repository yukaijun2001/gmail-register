import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { HealthModule } from './modules/health/health.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { WorkersModule } from './modules/workers/workers.module';

@Module({
  imports: [InfrastructureModule, AccountsModule, HealthModule, WorkersModule, TasksModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
