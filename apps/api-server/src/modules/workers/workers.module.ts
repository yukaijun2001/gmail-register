import { Module } from '@nestjs/common';
import { WorkerGuard } from './worker-auth.guard';
import { AdminWorkersController, WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';

@Module({
  controllers: [WorkersController, AdminWorkersController],
  providers: [WorkersService, WorkerGuard],
  exports: [WorkerGuard],
})
export class WorkersModule {}
