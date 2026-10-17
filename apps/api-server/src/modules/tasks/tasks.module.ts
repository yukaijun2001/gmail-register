import { Module } from '@nestjs/common';
import { WorkersModule } from '../workers/workers.module';
import { AdminTasksController, TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [WorkersModule],
  controllers: [TasksController, AdminTasksController],
  providers: [TasksService],
})
export class TasksModule {}
