import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentWorker } from '../workers/current-worker.decorator';
import { WorkerGuard } from '../workers/worker-auth.guard';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(WorkerGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post('claim')
  claim(@CurrentWorker() worker: { id: string }) {
    return this.tasks.claim(worker.id);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentWorker() worker: { id: string }) {
    return this.tasks.getAssigned(id, worker.id);
  }

  @Post(':id/renew')
  renew(@Param('id') id: string, @CurrentWorker() worker: { id: string }, @Body() body: unknown) {
    return this.tasks.renew(id, worker.id, body);
  }

  @Post(':id/username/regenerate')
  regenerateUsername(
    @Param('id') id: string,
    @CurrentWorker() worker: { id: string },
    @Body() body: unknown,
  ) {
    return this.tasks.regenerateUsername(id, worker.id, body);
  }

  @Post(':id/progress')
  progress(
    @Param('id') id: string,
    @CurrentWorker() worker: { id: string },
    @Body() body: unknown,
  ) {
    return this.tasks.progress(id, worker.id, body);
  }

  @Get(':id/credentials')
  credentials(
    @Param('id') id: string,
    @CurrentWorker() worker: { id: string },
    @Headers('x-lease-token') token: string,
    @Query('version', ParseIntPipe) version: number,
  ) {
    return this.tasks.credentials(id, worker.id, token, version);
  }

  @Post(':id/report-result')
  result(@Param('id') id: string, @CurrentWorker() worker: { id: string }, @Body() body: unknown) {
    return this.tasks.reportResult(id, worker.id, body);
  }
}

@ApiTags('admin/tasks')
@Controller('admin/tasks')
export class AdminTasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list() {
    return this.tasks.list();
  }

  @Get('stats')
  stats() {
    return this.tasks.stats();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.tasks.get(id);
  }

  @Post()
  create(@Body() body: unknown) {
    return this.tasks.create(body);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string) {
    return this.tasks.adminTransition(id, 'PAUSED');
  }

  @Post(':id/resume')
  resume(@Param('id') id: string) {
    return this.tasks.adminTransition(id, 'RUNNING');
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.tasks.adminTransition(id, 'CANCELLED');
  }
}
